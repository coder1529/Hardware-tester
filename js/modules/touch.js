/*
 * 08 Touch & pen
 *
 * Two modes:
 *   draw     every pointer gets its own colour and ID, with pressure/tilt
 *   coverage the area is split into cells; drag over all of them and any
 *            cell that stays empty is a dead spot on the digitiser
 */
(function () {
  'use strict';
  const { h } = Bench;

  // fixed palette so finger #1 is always the same colour
  const INKS = ['#d4470f', '#2a6fdb', '#2e7d4f', '#9b3fb5', '#b8860b', '#c0362c', '#147a80', '#6b5b3e', '#d6337a', '#3e4ea8'];

  Bench.register({
    id: 'touch',
    num: '08',
    title: 'Touch & pen',
    blurb: 'Put down as many fingers as the screen will take, then switch to coverage mode and drag across every cell. A cell that won\'t fill is a dead spot. Pens show pressure and tilt too. With a mouse you can only check the drawing itself.',
    notePlaceholder: 'e.g. 10-point OK, dead strip along right edge',

    mount(root, s) {
      let mode = 'draw';
      const active = new Map(); // pointerId -> {x, y, color, slot, path: []}
      const strokes = []; // finished strokes, kept so the drawing persists
      let maxPoints = 0;
      const COLS = 12, ROWS = 8;
      let cells = new Uint8Array(COLS * ROWS);

      const canvas = h('canvas');
      const tl = h('span', { class: 'corner tl' }, '');
      const br = h('span', { class: 'corner br' }, '');
      const area = h('div', { class: 'canvas-wrap touch-area' }, canvas, tl, br);

      const stats = Bench.stats([['now', 'Touching now'], ['max', 'Most at once'], ['dev', 'Device says'], ['cov', 'Coverage']]);
      const last = Bench.readout([['type', 'pointer type'], ['pressure', 'pressure'], ['tilt', 'tilt x / y'], ['twist', 'twist'], ['size', 'contact size'], ['btn', 'buttons']]);

      const modeSeg = Bench.seg([['draw', 'Draw'], ['coverage', 'Coverage grid']], mode, (v) => {
        mode = v;
        tl.textContent = v === 'draw' ? 'touch / pen / mouse' : `drag over all ${COLS * ROWS} cells`;
      });
      const clear = () => {
        strokes.length = 0;
        cells = new Uint8Array(COLS * ROWS);
        maxPoints = 0;
        paintStats();
      };

      root.append(h('div', { class: 'grid cols-main' },
        h('div', { class: 'stack' },
          h('div', { class: 'row' }, modeSeg, h('span', { class: 'spacer' }),
            h('button', { class: 'btn small', type: 'button', onclick: clear }, 'Clear')),
          area,
          stats.el),
        h('div', { class: 'stack' },
          Bench.panel('Last contact', { live: true }, last.el),
          Bench.panel('What to expect',
            h('ul', { style: 'margin:0;padding-left:18px;font-size:13.5px;color:var(--ink-2)' },
              h('li', null, 'Phones and tablets: usually 5 or 10 points.'),
              h('li', null, 'Windows touch laptops: 10.'),
              h('li', null, 'Pressure is 0.5 for anything without a real sensor. Fingers usually report 0.5 or 1.'),
              h('li', null, 'Tilt only comes from pens that support it (Apple Pencil, Surface Pen, Wacom).'))))));
      tl.textContent = 'touch / pen / mouse';

      function paintStats() {
        stats.set('now', active.size);
        stats.set('max', maxPoints);
        stats.set('dev', navigator.maxTouchPoints || 0, ' pts');
        const filled = cells.reduce((a, b) => a + b, 0);
        stats.set('cov', Math.round((filled / cells.length) * 100), '%', filled === cells.length ? 'good' : '');
      }

      function pos(e) {
        const r = area.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      }

      function mark(p) {
        const cx = Math.floor((p.x / p.w) * COLS);
        const cy = Math.floor((p.y / p.h) * ROWS);
        if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) cells[cy * COLS + cx] = 1;
      }

      function describe(e) {
        last.set('type', e.pointerType || 'unknown');
        last.set('pressure', e.pressure != null ? e.pressure.toFixed(3) : '');
        last.set('tilt', `${e.tiltX || 0}° / ${e.tiltY || 0}°`);
        last.set('twist', (e.twist || 0) + '°');
        last.set('size', e.width && e.height ? `${e.width.toFixed(1)} × ${e.height.toFixed(1)} px` : '');
        last.set('btn', e.buttons);
      }

      s.on(area, 'pointerdown', (e) => {
        e.preventDefault();
        try { area.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
        const p = pos(e);
        // lowest free number, so lifting finger 2 and putting it back gives #2 again
        const used = new Set(Array.from(active.values(), (a) => a.slot));
        let slot = 0;
        while (used.has(slot)) slot++;
        active.set(e.pointerId, { x: p.x, y: p.y, color: INKS[slot % INKS.length], slot, path: [[p.x, p.y, e.pressure || 0.5]], type: e.pointerType });
        maxPoints = Math.max(maxPoints, active.size);
        if (mode === 'coverage') mark(p);
        describe(e);
        paintStats();
      });

      s.on(area, 'pointermove', (e) => {
        const a = active.get(e.pointerId);
        br.textContent = `${Math.round(pos(e).x)}, ${Math.round(pos(e).y)}`;
        if (!a) return;
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        for (const ev of evs.length ? evs : [e]) {
          const p = pos(ev);
          a.x = p.x;
          a.y = p.y;
          a.path.push([p.x, p.y, ev.pressure || 0.5]);
          if (mode === 'coverage') mark(p);
        }
        describe(e);
        if (mode === 'coverage') paintStats();
      });

      const end = (e) => {
        const a = active.get(e.pointerId);
        if (!a) return;
        if (a.path.length > 1) strokes.push(a);
        if (strokes.length > 200) strokes.shift();
        active.delete(e.pointerId);
        paintStats();
      };
      s.on(area, 'pointerup', end);
      s.on(area, 'pointercancel', end);
      s.on(area, 'lostpointercapture', end);
      s.on(area, 'contextmenu', (e) => e.preventDefault());
      // iOS: stop the page from rubber-banding while you draw
      s.on(area, 'touchmove', (e) => e.preventDefault(), { passive: false });

      function drawPath(ctx, a, alpha) {
        const pts = a.path;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = a.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 1; i < pts.length; i++) {
          ctx.lineWidth = a.type === 'pen' ? 0.5 + pts[i][2] * 6 : 3;
          ctx.beginPath();
          ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
          ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      s.loop(() => {
        const { ctx, w, h: ht } = Bench.fitCanvas(canvas);
        const C = Bench.colors();
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, w, ht);

        if (mode === 'coverage') {
          const cw = w / COLS, ch = ht / ROWS;
          for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
              if (cells[y * COLS + x]) {
                ctx.fillStyle = C.ink;
                ctx.globalAlpha = 0.85;
                ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
                ctx.globalAlpha = 1;
              }
            }
          }
          ctx.strokeStyle = C.rule;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 1; x < COLS; x++) { ctx.moveTo(Math.round(x * cw) + 0.5, 0); ctx.lineTo(Math.round(x * cw) + 0.5, ht); }
          for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, Math.round(y * ch) + 0.5); ctx.lineTo(w, Math.round(y * ch) + 0.5); }
          ctx.stroke();
        } else {
          strokes.forEach((a) => drawPath(ctx, a, 0.35));
        }

        active.forEach((a, id) => {
          if (mode === 'draw') drawPath(ctx, a, 1);
          // big ring + ID label under each finger
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(a.x, a.y, 34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(a.x, 0); ctx.lineTo(a.x, ht);
          ctx.moveTo(0, a.y); ctx.lineTo(w, a.y);
          ctx.globalAlpha = 0.4;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.setLineDash([]);
          ctx.fillStyle = a.color;
          ctx.font = '600 12px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('#' + (a.slot + 1), a.x, a.y - 42);
        });
      });

      paintStats();
    },
  });
})();
