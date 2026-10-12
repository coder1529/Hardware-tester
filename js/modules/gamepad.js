/*
 * 07 Gamepad
 *
 * Drawn for the "standard" mapping (Xbox-style layout, which is what
 * Chrome/Firefox normalise most pads to). Anything non-standard still gets
 * the raw button/axis grid underneath, which is the honest view anyway.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const PAD_ICON = '<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M7 8h10a4 4 0 0 1 4 4l.6 4.2a2 2 0 0 1-3.5 1.6L16 15.5H8l-2.1 2.3a2 2 0 0 1-3.5-1.6L3 12a4 4 0 0 1 4-4z"/><path d="M7 10.5v3M5.5 12h3"/><circle cx="16" cy="11" r=".6"/><circle cx="18" cy="13" r=".6"/></svg>';

  const NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '↑', '↓', '←', '→', 'Home'];

  // standard-mapping controller drawing; data-b = button index
  const PAD_SVG = `
<svg class="pad-svg" viewBox="0 0 420 270" aria-hidden="true">
  <rect class="trig-bg" x="78" y="6" width="64" height="18" rx="4"/><rect class="trig-fill" data-t="6" x="78" y="6" width="0" height="18" rx="4"/>
  <rect class="trig-bg" x="278" y="6" width="64" height="18" rx="4"/><rect class="trig-fill" data-t="7" x="278" y="6" width="0" height="18" rx="4"/>
  <text x="110" y="19" text-anchor="middle">LT</text><text x="310" y="19" text-anchor="middle">RT</text>
  <path class="b" data-b="4" d="M70 50 Q80 32 110 32 L148 32 Q156 32 156 40 L156 48 Z"/>
  <path class="b" data-b="5" d="M350 50 Q340 32 310 32 L272 32 Q264 32 264 40 L264 48 Z"/>
  <path class="body" d="M96 52 C62 52 44 74 34 116 L16 196 C9 230 31 254 58 246 C80 240 94 218 112 200 L308 200 C326 218 340 240 362 246 C389 254 411 230 404 196 L386 116 C376 74 358 52 324 52 Z"/>
  <circle class="well" cx="110" cy="112" r="30"/>
  <circle class="cap" data-b="10" data-s="0" cx="110" cy="112" r="17"/>
  <circle class="well" cx="262" cy="168" r="30"/>
  <circle class="cap" data-b="11" data-s="1" cx="262" cy="168" r="17"/>
  <g transform="translate(158 168)">
    <path class="b" data-b="12" d="M-9 -30 h18 v19 l-9 9 l-9 -9 z"/>
    <path class="b" data-b="13" d="M-9 30 h18 v-19 l-9 -9 l-9 9 z"/>
    <path class="b" data-b="14" d="M-30 -9 v18 h19 l9 -9 l-9 -9 z"/>
    <path class="b" data-b="15" d="M30 -9 v18 h-19 l-9 -9 l9 -9 z"/>
  </g>
  <circle class="b" data-b="0" cx="312" cy="136" r="13"/><text data-l="0" x="312" y="140" text-anchor="middle">A</text>
  <circle class="b" data-b="1" cx="340" cy="110" r="13"/><text data-l="1" x="340" y="114" text-anchor="middle">B</text>
  <circle class="b" data-b="2" cx="284" cy="110" r="13"/><text data-l="2" x="284" y="114" text-anchor="middle">X</text>
  <circle class="b" data-b="3" cx="312" cy="84" r="13"/><text data-l="3" x="312" y="88" text-anchor="middle">Y</text>
  <rect class="b" data-b="8" x="168" y="102" width="22" height="13" rx="6.5"/>
  <rect class="b" data-b="9" x="230" y="102" width="22" height="13" rx="6.5"/>
  <circle class="b" data-b="16" cx="210" cy="78" r="12"/>
</svg>`;

  function makePadView(index) {
    const svgWrap = h('div', { html: PAD_SVG });
    const btnEls = {};
    svgWrap.querySelectorAll('[data-b]').forEach((el) => (btnEls[el.dataset.b] = el));
    const lblEls = {};
    svgWrap.querySelectorAll('[data-l]').forEach((el) => (lblEls[el.dataset.l] = el));
    const trig = {};
    svgWrap.querySelectorAll('[data-t]').forEach((el) => (trig[el.dataset.t] = el));
    const caps = [svgWrap.querySelector('[data-s="0"]'), svgWrap.querySelector('[data-s="1"]')];

    const title = h('strong', { class: 'mono', style: 'font-size:13px;overflow-wrap:anywhere' });
    const meta = h('div', { class: 'dim mono', style: 'font-size:12px;margin-top:2px' });
    const rawBtns = h('div', { class: 'raw-grid' });
    const rawAxes = h('div', { class: 'raw-grid', style: 'margin-top:6px' });
    const plots = [h('canvas'), h('canvas')];
    const drift = Bench.readout([['l', 'left stick at rest'], ['r', 'right stick at rest'], ['circ', 'circularity error']]);
    const rumbleRow = h('div', { class: 'row' });
    const seenBtns = new Set();
    const stickPts = [[], []];
    let maxR = [0, 0];

    const rumble = (pad, strong, weak, ms) => {
      const act = pad && pad.vibrationActuator;
      if (!act || !act.playEffect) {
        Bench.toast('This controller (or browser) doesn\'t expose rumble.');
        return;
      }
      act.playEffect(act.type || 'dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
    };
    let padRef = null;
    rumbleRow.append(
      h('button', { class: 'btn small', type: 'button', onclick: () => rumble(padRef, 1, 0, 500) }, 'Rumble: strong motor'),
      h('button', { class: 'btn small', type: 'button', onclick: () => rumble(padRef, 0, 1, 500) }, 'weak motor'),
      h('button', { class: 'btn small', type: 'button', onclick: () => rumble(padRef, 1, 1, 1200) }, 'both'));

    const clearSticks = () => {
      stickPts[0].length = stickPts[1].length = 0;
      maxR = [0, 0];
    };

    const el = h('div', { class: 'stack' },
      Bench.panel('Controller ' + (index + 1), { live: true },
        h('div', { class: 'pad-card' },
          h('div', null, h('div', { style: 'margin-bottom:12px' }, title, meta), svgWrap),
          h('div', { class: 'stack', style: 'gap:14px' },
            h('div', { class: 'stick-plots' },
              h('div', { class: 'canvas-wrap stick-plot' }, plots[0], h('span', { class: 'corner tl' }, 'L')),
              h('div', { class: 'canvas-wrap stick-plot' }, plots[1], h('span', { class: 'corner tl' }, 'R'))),
            h('div', { class: 'row' },
              h('span', { class: 'hint', style: 'margin:0;flex:1' }, 'Roll each stick slowly around its edge.'),
              h('button', { class: 'btn ghost small', type: 'button', onclick: clearSticks }, 'clear')),
            drift.el,
            rumbleRow))),
      Bench.panel('Raw input', rawBtns, rawAxes));

    const rawBtnCells = [];
    const rawAxisCells = [];

    function ensureRaw(pad) {
      if (rawBtnCells.length !== pad.buttons.length) {
        rawBtns.textContent = '';
        rawBtnCells.length = 0;
        pad.buttons.forEach((_, i) => {
          const val = h('span', null, '0');
          const bar = h('i');
          const cell = h('div', { class: 'raw-cell' }, h('b', null, 'B' + i + (pad.mapping === 'standard' && NAMES[i] ? ' ' + NAMES[i] : '')), val, bar);
          rawBtnCells.push({ cell, val, bar });
          rawBtns.append(cell);
        });
      }
      if (rawAxisCells.length !== pad.axes.length) {
        rawAxes.textContent = '';
        rawAxisCells.length = 0;
        pad.axes.forEach((_, i) => {
          const val = h('span', null, '0');
          const cell = h('div', { class: 'raw-cell', style: 'grid-column:span 2' }, h('b', null, 'Axis ' + i), val);
          rawAxisCells.push({ cell, val });
          rawAxes.append(cell);
        });
      }
    }

    function drawStick(canvas, x, y, pts, maxRadius) {
      const { ctx, w, h: ht } = Bench.fitCanvas(canvas);
      const C = Bench.colors();
      const r = Math.min(w, ht) / 2 - 10;
      const cx = w / 2, cy = ht / 2;
      ctx.fillStyle = C.paper;
      ctx.fillRect(0, 0, w, ht);
      ctx.strokeStyle = C.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();
      // deadzone ring for reference (typical ~0.1)
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // trace of everywhere the stick has been
      ctx.fillStyle = C.ink3;
      for (const p of pts) ctx.fillRect(cx + p[0] * r - 0.75, cy + p[1] * r - 0.75, 1.5, 1.5);
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + x * r, cy + y * r);
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(cx + x * r, cy + y * r, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.fillStyle = C.ink3;
      ctx.textAlign = 'right';
      ctx.fillText(`${x.toFixed(2)}, ${y.toFixed(2)}`, w - 6, ht - 6);
    }

    // circularity: average |r - 1| over samples taken near the edge, in 36 sectors
    function circularity(pts) {
      const sectors = new Array(36).fill(0);
      for (const [x, y] of pts) {
        const r = Math.hypot(x, y);
        if (r < 0.5) continue;
        const a = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 36) % 36;
        sectors[a] = Math.max(sectors[a], r);
      }
      const filled = sectors.filter((v) => v > 0);
      if (filled.length < 30) return null;
      return filled.reduce((s, v) => s + Math.abs(v - 1), 0) / filled.length;
    }

    let idleSince = [0, 0];

    return {
      el,
      update(pad) {
        padRef = pad;
        title.textContent = pad.id;
        meta.textContent = `index ${pad.index} · mapping: ${pad.mapping || 'none'} · ${pad.buttons.length} buttons · ${pad.axes.length} axes`;
        ensureRaw(pad);

        pad.buttons.forEach((b, i) => {
          const pressed = b.pressed || b.value > 0.5;
          if (pressed) seenBtns.add(i);
          const e = btnEls[i];
          if (e) {
            e.classList.toggle('down', pressed);
            e.classList.toggle('seen', seenBtns.has(i));
          }
          if (lblEls[i]) lblEls[i].classList.toggle('on', pressed);
          if (trig[i]) trig[i].setAttribute('width', (64 * b.value).toFixed(1));
          const rc = rawBtnCells[i];
          rc.cell.classList.toggle('on', pressed);
          rc.val.textContent = b.value.toFixed(2);
          rc.bar.style.width = b.value * 100 + '%';
        });
        pad.axes.forEach((v, i) => {
          rawAxisCells[i].val.textContent = (v >= 0 ? '+' : '') + v.toFixed(4);
        });

        const now = performance.now();
        const sticks = [[pad.axes[0] || 0, pad.axes[1] || 0], [pad.axes[2] || 0, pad.axes[3] || 0]];
        sticks.forEach(([x, y], i) => {
          const mag = Math.hypot(x, y);
          const pts = stickPts[i];
          if (mag > 0.02) {
            pts.push([x, y]);
            if (pts.length > 1500) pts.shift();
          }
          maxR[i] = Math.max(maxR[i], mag);
          if (caps[i]) caps[i].setAttribute('transform', `translate(${(x * 11).toFixed(1)} ${(y * 11).toFixed(1)})`);
          drawStick(plots[i], x, y, pts, maxR[i]);
          // only call it "at rest" if it's been small for half a second
          if (mag < 0.3) {
            if (!idleSince[i]) idleSince[i] = now;
          } else idleSince[i] = 0;
          if (idleSince[i] && now - idleSince[i] > 500) {
            drift.set(i ? 'r' : 'l', mag.toFixed(3), mag > 0.1 ? 'bad' : mag < 0.05 ? 'good' : '');
          }
        });
        const ce = [circularity(stickPts[0]), circularity(stickPts[1])];
        drift.set('circ', ce.map((c, i) => (i ? 'R ' : 'L ') + (c == null ? '—' : (c * 100).toFixed(1) + '%')).join('   '));
      },
    };
  }

  Bench.register({
    id: 'gamepad',
    num: '07',
    title: 'Gamepad',
    blurb: 'Plug in or pair a controller and press any button so the browser can see it. Check every button, both triggers all the way, and let the sticks rest to see if they drift.',
    notePlaceholder: 'e.g. left stick drifts 0.14 up',

    mount(root, s) {
      const empty = h('div', { class: 'panel' }, Bench.empty(PAD_ICON, 'No controller yet',
        'Connect one by USB or Bluetooth, then press a button. Browsers keep gamepads hidden from pages until you do, so they can\'t be used to fingerprint you.'));
      const list = h('div', { class: 'stack' });
      root.append(empty, list);

      const views = new Map();
      const supported = !!navigator.getGamepads;
      if (!supported) {
        empty.textContent = '';
        empty.append(h('p', { class: 'note bad' }, 'This browser doesn\'t support the Gamepad API.'));
        return;
      }

      s.on(window, 'gamepadconnected', (e) => Bench.toast('Connected: ' + e.gamepad.id.slice(0, 60)));
      s.on(window, 'gamepaddisconnected', (e) => Bench.toast('Disconnected: controller ' + (e.gamepad.index + 1)));

      s.loop(() => {
        const pads = Array.from(navigator.getGamepads()).filter(Boolean);
        const live = new Set(pads.map((p) => p.index));
        views.forEach((v, idx) => {
          if (!live.has(idx)) {
            v.el.remove();
            views.delete(idx);
          }
        });
        pads.forEach((p) => {
          let v = views.get(p.index);
          if (!v) {
            v = makePadView(p.index);
            views.set(p.index, v);
            list.append(v.el);
          }
          v.update(p);
        });
        empty.hidden = pads.length > 0;
      });
    },
  });
})();
