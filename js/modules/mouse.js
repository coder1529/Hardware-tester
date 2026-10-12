/*
 * 02 Mouse
 *
 * Buttons use mousedown/mouseup rather than pointer events: with pointer
 * events the 2nd button pressed while the 1st is held only shows up as a
 * pointermove, which is useless for counting clicks.
 *
 * Polling rate uses pointerrawupdate where Chrome has it (true device
 * rate), else coalesced pointermove events. Either way it's an estimate.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const BUTTONS = [
    { id: 0, name: 'Left' },
    { id: 1, name: 'Middle' },
    { id: 2, name: 'Right' },
    { id: 3, name: 'Back' },
    { id: 4, name: 'Forward' },
  ];

  const MOUSE_SVG = `
<svg class="mouse-svg" viewBox="0 0 124 206" aria-hidden="true">
  <path class="body" d="M62 8 C100 8 114 42 114 82 L114 142 C114 180 92 198 62 198 C32 198 10 180 10 142 L10 82 C10 42 24 8 62 8 Z"/>
  <path class="part" data-b="0" d="M59 11 C31 13 13 38 12 82 L59 82 Z"/>
  <path class="part" data-b="2" d="M65 11 C93 13 111 38 112 82 L65 82 Z"/>
  <rect class="part" data-b="1" x="55" y="26" width="14" height="34" rx="7"/>
  <rect class="part" data-b="4" x="4" y="96" width="10" height="22" rx="3"/>
  <rect class="part" data-b="3" x="4" y="122" width="10" height="22" rx="3"/>
  <text class="lbl" x="22" y="112">fwd</text>
  <text class="lbl" x="22" y="138">back</text>
  <g class="wheel-ind" transform="translate(62 43)">
    <path class="part" data-w="up" d="M-4 -24 L4 -24 L0 -30 Z"/>
    <path class="part" data-w="down" d="M-4 24 L4 24 L0 30 Z"/>
  </g>
</svg>`;

  Bench.register({
    id: 'mouse',
    num: '02',
    title: 'Mouse',
    blurb: 'Click every button on the pad, scroll both ways, then move the mouse in quick circles to read the polling rate. A button that registers a double-click from one click will light up red.',
    notePlaceholder: 'e.g. left click double-fires ~1 in 20',

    mount(root, s) {
      let threshold = Bench.store.get('mouse.threshold', 60);
      const counts = BUTTONS.map(() => ({ down: 0, dbl: 0, lastUp: -1e9, minGap: Infinity }));
      const wheel = { up: 0, down: 0, left: 0, right: 0, mode: 0, lastDelta: 0 };
      const marks = []; // click markers drawn on the pad

      /* --- pad --- */
      const canvas = h('canvas');
      const cTL = h('span', { class: 'corner tl' }, 'click / scroll / move here');
      const cTR = h('span', { class: 'corner tr' }, '');
      const cBL = h('span', { class: 'corner bl' }, '');
      const cBR = h('span', { class: 'corner br' }, '');
      const pad = h('div', { class: 'canvas-wrap pad' }, canvas, cTL, cTR, cBL, cBR);

      /* --- diagram + table --- */
      const diagram = h('div', { html: MOUSE_SVG });
      const parts = {};
      diagram.querySelectorAll('[data-b]').forEach((el) => (parts[el.dataset.b] = el));
      const wUp = diagram.querySelector('[data-w="up"]');
      const wDown = diagram.querySelector('[data-w="down"]');

      const tbody = h('tbody');
      const rows = BUTTONS.map((b) => {
        const tds = { down: h('td', null, '0'), dbl: h('td', null, '0'), gap: h('td', null, '—') };
        const tr = h('tr', null, h('td', null, b.name), tds.down, tds.dbl, tds.gap);
        tbody.append(tr);
        return { tr, tds };
      });
      const table = h('table', { class: 'btn-table' },
        h('thead', null, h('tr', null, h('th', null, 'Button'), h('th', null, 'Clicks'), h('th', null, 'Doubles'), h('th', null, 'Min gap'))),
        tbody);

      const thrLabel = h('span', { class: 'mono' }, threshold + ' ms');
      const thr = h('input', { type: 'range', min: 20, max: 150, step: 5, value: threshold, 'aria-label': 'Double click threshold' });
      thr.addEventListener('input', () => {
        threshold = +thr.value;
        thrLabel.textContent = threshold + ' ms';
        Bench.store.set('mouse.threshold', threshold);
      });

      const stats = Bench.stats([
        ['rate', 'Polling (now)'],
        ['peak', 'Polling (peak)'],
        ['wheel', 'Wheel ticks'],
        ['dist', 'Travel'],
      ]);
      const wheelInfo = Bench.readout([
        ['up', 'scroll up'],
        ['down', 'scroll down'],
        ['lr', 'tilt left / right'],
        ['delta', 'last deltaY'],
        ['mode', 'delta mode'],
      ]);

      function reset() {
        counts.forEach((c) => Object.assign(c, { down: 0, dbl: 0, lastUp: -1e9, minGap: Infinity }));
        Object.assign(wheel, { up: 0, down: 0, left: 0, right: 0, lastDelta: 0 });
        Object.values(parts).forEach((p) => p.classList.remove('seen', 'down', 'flag'));
        [wUp, wDown].forEach((p) => p.classList.remove('seen'));
        marks.length = 0;
        trail.length = 0;
        travel = 0;
        peak = 0;
        stamps.length = 0;
        paintTable();
        paintWheel();
      }

      root.append(h('div', { class: 'grid cols-main-wide' },
        h('div', { class: 'stack' },
          Bench.panel('Pad', { live: true }, pad, h('div', { style: 'margin-top:14px' }, stats.el)),
          h('p', { class: 'hint', style: 'margin:0' },
            'Polling only updates while you move. Most office mice sit around 125 Hz, gaming mice 500–1000 Hz, and some newer ones go higher. ',
            'Safari and Firefox cap it to the screen refresh rate, so the number here reads low.')),
        h('div', { class: 'stack' },
          Bench.panel('Buttons', diagram, h('div', { style: 'margin-top:12px' }, table),
            h('div', { style: 'margin-top:14px' },
              h('div', { class: 'row', style: 'justify-content:space-between' },
                h('span', { class: 'field' }, 'Double-click if gap under'), thrLabel),
              thr,
              h('p', { class: 'hint', style: 'margin-top:4px' }, 'Measured from release to the next press. A deliberate double-click is rarely under ~80 ms.'))),
          Bench.panel('Wheel', wheelInfo.el),
          h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: reset }, 'Reset counts')))));

      function paintTable() {
        counts.forEach((c, i) => {
          const r = rows[i].tds;
          r.down.textContent = c.down;
          r.dbl.textContent = c.dbl;
          r.dbl.className = c.dbl ? 'bad' : '';
          r.gap.textContent = isFinite(c.minGap) ? Math.round(c.minGap) + ' ms' : '—';
        });
      }
      function paintWheel() {
        wheelInfo.set('up', wheel.up);
        wheelInfo.set('down', wheel.down);
        wheelInfo.set('lr', wheel.left + ' / ' + wheel.right);
        wheelInfo.set('delta', wheel.lastDelta ? wheel.lastDelta.toFixed(1) : '');
        wheelInfo.set('mode', ['pixels', 'lines', 'pages'][wheel.mode]);
        stats.set('wheel', wheel.up + wheel.down + wheel.left + wheel.right);
      }

      /* --- button events --- */
      const inPad = (e) => pad.contains(e.target);

      s.on(pad, 'mousedown', (e) => {
        e.preventDefault();
        const b = e.button;
        const c = counts[b];
        if (!c) return;
        const now = performance.now();
        const gap = now - c.lastUp;
        c.down++;
        if (gap < 1000) c.minGap = Math.min(c.minGap, gap);
        let flagged = false;
        if (gap < threshold) {
          c.dbl++;
          flagged = true;
          rows[b].tr.classList.remove('flash');
          void rows[b].tr.offsetWidth;
          rows[b].tr.classList.add('flash');
          Bench.toast(`${BUTTONS[b].name} button: second press ${Math.round(gap)} ms after release`);
        }
        const p = parts[b];
        if (p) {
          p.classList.add('down', 'seen');
          p.classList.toggle('flag', flagged);
        }
        const r = pad.getBoundingClientRect();
        marks.push({ x: e.clientX - r.left, y: e.clientY - r.top, b, t: now, flagged });
        if (marks.length > 60) marks.shift();
        paintTable();
      });

      s.on(window, 'mouseup', (e) => {
        const c = counts[e.button];
        if (!c) return;
        const p = parts[e.button];
        if (p) p.classList.remove('down');
        if (p && p.classList.contains('flag')) setTimeout(() => p.classList.remove('flag'), 500);
        if (inPad(e) || c.down) c.lastUp = performance.now();
        // stop back/forward from leaving the page
        if (e.button === 3 || e.button === 4) e.preventDefault();
      });

      // back/forward buttons would otherwise change the hash and leave this test
      const blockNav = (e) => {
        if (e.button === 3 || e.button === 4) e.preventDefault();
      };
      s.on(window, 'mousedown', blockNav, true);
      s.on(window, 'auxclick', blockNav, true);
      s.on(pad, 'contextmenu', (e) => e.preventDefault());

      s.on(pad, 'wheel', (e) => {
        e.preventDefault();
        wheel.mode = e.deltaMode;
        if (e.deltaY < 0) { wheel.up++; flashW(wUp); }
        else if (e.deltaY > 0) { wheel.down++; flashW(wDown); }
        if (e.deltaX < 0) wheel.left++;
        else if (e.deltaX > 0) wheel.right++;
        if (e.deltaY) wheel.lastDelta = e.deltaY;
        paintWheel();
      }, { passive: false });

      function flashW(el) {
        el.classList.add('seen', 'down');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('down'), 110);
      }

      /* --- movement + polling --- */
      const trail = [];
      const stamps = [];
      let travel = 0, peak = 0, lastPt = null, lastMoveAt = 0;
      const useRaw = 'onpointerrawupdate' in window;

      function feed(e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const list = evs.length ? evs : [e];
        for (const ev of list) stamps.push(ev.timeStamp);
        while (stamps.length > 160) stamps.shift();
        lastMoveAt = performance.now();
      }
      s.on(pad, useRaw ? 'pointerrawupdate' : 'pointermove', feed);

      s.on(pad, 'pointermove', (e) => {
        const r = pad.getBoundingClientRect();
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const list = evs.length ? evs : [e];
        for (const ev of list) {
          const pt = { x: ev.clientX - r.left, y: ev.clientY - r.top, t: performance.now() };
          if (lastPt) travel += Math.hypot(pt.x - lastPt.x, pt.y - lastPt.y);
          lastPt = pt;
          trail.push(pt);
        }
        if (trail.length > 400) trail.splice(0, trail.length - 400);
        cBL.textContent = `x ${Math.round(lastPt.x)}  y ${Math.round(lastPt.y)}`;
      });
      s.on(pad, 'pointerleave', () => (lastPt = null));

      function pollingRate() {
        // median of recent intervals, ignoring pauses
        const gaps = [];
        for (let i = 1; i < stamps.length; i++) {
          const d = stamps[i] - stamps[i - 1];
          if (d > 0 && d < 50) gaps.push(d);
        }
        if (gaps.length < 20) return 0;
        return 1000 / Bench.median(gaps);
      }

      s.every(250, () => {
        const moving = performance.now() - lastMoveAt < 300;
        const rate = moving ? pollingRate() : 0;
        if (rate) peak = Math.max(peak, rate);
        stats.set('rate', rate ? Math.round(rate) : '—', rate ? 'Hz' : '');
        stats.set('peak', peak ? Math.round(peak) : '—', peak ? 'Hz' : '');
        // travel is in CSS px; 96 css px ≈ 1 inch by spec
        stats.set('dist', (travel / 96 * 2.54 / 100).toFixed(2), 'm');
        cTR.textContent = useRaw ? 'source: rawupdate' : 'source: coalesced';
      });

      s.loop(() => {
        const { ctx, w, h: ht } = Bench.fitCanvas(canvas);
        const C = Bench.colors();
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, w, ht);

        // faint centre cross
        ctx.strokeStyle = C.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, ht);
        ctx.moveTo(0, ht / 2 + 0.5); ctx.lineTo(w, ht / 2 + 0.5);
        ctx.stroke();

        const now = performance.now();
        // trail fades over ~700ms; each sample gets a dot so you can see spacing = polling
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i];
          const age = now - b.t;
          if (age > 700) continue;
          const alpha = 1 - age / 700;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.fillStyle = C.accent;
          ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;

        ctx.font = '600 10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const m of marks) {
          const age = now - m.t;
          if (age > 4000) continue;
          const a = 1 - age / 4000;
          const rad = 9 + Math.min(age / 25, 10);
          ctx.globalAlpha = a;
          ctx.strokeStyle = m.flagged ? C.bad : C.ink;
          ctx.lineWidth = m.flagged ? 2 : 1.2;
          ctx.beginPath();
          ctx.arc(m.x, m.y, rad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = m.flagged ? C.bad : C.ink2;
          ctx.fillText('LMRBF'[m.b], m.x, m.y);
        }
        ctx.globalAlpha = 1;
      });

      paintTable();
      paintWheel();
    },
  });
})();
