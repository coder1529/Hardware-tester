/*
 * 03 Display
 *
 * Patterns are drawn on a canvas sized to *device* pixels (no DPR
 * scaling), so the 1px checker really is one physical pixel and not a
 * blurry upscaled mess. Worth knowing if you ever touch this.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const solid = (c) => (ctx, W, H) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, W, H);
  };

  const PATTERNS = [
    { id: 'white', name: 'White', note: 'Dead pixels, dust under the panel', thumb: '#fff', draw: solid('#fff') },
    { id: 'black', name: 'Black', note: 'Stuck pixels, backlight bleed', thumb: '#000', draw: solid('#000') },
    { id: 'red', name: 'Red', note: 'Stuck sub-pixels', thumb: '#f00', draw: solid('#f00') },
    { id: 'green', name: 'Green', note: 'Stuck sub-pixels', thumb: '#0f0', draw: solid('#0f0') },
    { id: 'blue', name: 'Blue', note: 'Stuck sub-pixels', thumb: '#00f', draw: solid('#00f') },
    { id: 'grey', name: 'Mid grey', note: 'Uniformity, dirty-screen blotches', thumb: '#7f7f7f', draw: solid('#7f7f7f') },
    { id: 'dark', name: 'Near black', note: 'Clouding and IPS glow in a dark room', thumb: '#0d0d0d', draw: solid('#0d0d0d') },
    {
      id: 'ramp', name: 'Gradients', note: 'Banding, crushed blacks',
      thumb: 'linear-gradient(90deg,#000,#fff) 0 0/100% 25% no-repeat, linear-gradient(90deg,#000,#f00) 0 33%/100% 25% no-repeat, linear-gradient(90deg,#000,#0f0) 0 66%/100% 25% no-repeat, linear-gradient(90deg,#000,#00f) 0 100%/100% 25% no-repeat, #000',
      draw(ctx, W, H) {
        const bands = [[255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255]];
        const bh = H / bands.length;
        bands.forEach((c, i) => {
          const y = Math.round(i * bh);
          const half = Math.round(bh / 2);
          const g = ctx.createLinearGradient(0, 0, W, 0);
          g.addColorStop(0, '#000');
          g.addColorStop(1, `rgb(${c})`);
          ctx.fillStyle = g;
          ctx.fillRect(0, y, W, half);
          // 32 hard steps underneath, so you can count where they merge
          const steps = 32;
          for (let s = 0; s < steps; s++) {
            const k = s / (steps - 1);
            ctx.fillStyle = `rgb(${c.map((v) => Math.round(v * k))})`;
            const x0 = Math.round((s / steps) * W);
            const x1 = Math.round(((s + 1) / steps) * W);
            ctx.fillRect(x0, y + half, x1 - x0, Math.round(bh) - half);
          }
        });
      },
    },
    {
      id: 'checker', name: '1px checker', note: 'Scaling blur, inversion flicker',
      thumb: 'repeating-conic-gradient(#000 0 25%, #fff 0 50%) 0 0/4px 4px',
      draw(ctx, W, H) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = 2;
        const t = tile.getContext('2d');
        t.fillStyle = '#fff';
        t.fillRect(0, 0, 2, 2);
        t.fillStyle = '#000';
        t.fillRect(0, 0, 1, 1);
        t.fillRect(1, 1, 1, 1);
        ctx.fillStyle = ctx.createPattern(tile, 'repeat');
        ctx.fillRect(0, 0, W, H);
      },
    },
    {
      id: 'grid', name: 'Geometry', note: 'Overscan, stretched aspect ratio',
      thumb: 'radial-gradient(circle at 50% 50%, transparent 30%, #fff 31%, #fff 33%, transparent 34%), linear-gradient(#fff 1px, transparent 1px) 0 0/12px 12px, linear-gradient(90deg, #fff 1px, transparent 1px) 0 0/12px 12px, #111',
      draw(ctx, W, H, t, dpr) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, W, H);
        const cell = Math.round(Math.min(W, H) / 12);
        const ox = Math.round((W / 2) % cell), oy = Math.round((H / 2) % cell);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = ox; x < W; x += cell) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
        for (let y = oy; y < H; y += cell) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
        ctx.stroke();
        // a true circle: if this looks like an egg, something is stretching the image
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.4, 0, Math.PI * 2);
        ctx.moveTo(W / 2 - 20 * dpr, H / 2); ctx.lineTo(W / 2 + 20 * dpr, H / 2);
        ctx.moveTo(W / 2, H / 2 - 20 * dpr); ctx.lineTo(W / 2, H / 2 + 20 * dpr);
        ctx.stroke();
        // single-pixel frame at the very edge: every side should be visible
        ctx.strokeStyle = '#ff5a1f';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
        ctx.fillStyle = '#ff5a1f';
        const m = 24 * dpr;
        [[0, 0], [W - m, 0], [0, H - m], [W - m, H - m]].forEach(([x, y]) => ctx.fillRect(x, y, m, m));
        ctx.fillStyle = '#bbb';
        ctx.font = `${13 * dpr}px "IBM Plex Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${W} × ${H} device px`, W / 2, H / 2 + Math.min(W, H) * 0.4 + 28 * dpr);
      },
    },
    {
      id: 'motion', name: 'Motion', note: 'Ghosting and smearing', animated: true,
      thumb: 'linear-gradient(90deg, transparent 20%, #ddd 20% 34%, transparent 34%) 0 25%/100% 20% no-repeat, linear-gradient(90deg, transparent 50%, #ddd 50% 64%, transparent 64%) 0 75%/100% 20% no-repeat, #333',
      draw(ctx, W, H, t, dpr) {
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(0, 0, W, H);
        const speeds = [240, 480, 960]; // CSS px per second
        const lane = H / speeds.length;
        const size = Math.min(lane * 0.5, 120 * dpr);
        ctx.font = `${12 * dpr}px "IBM Plex Mono", monospace`;
        ctx.textBaseline = 'top';
        speeds.forEach((v, i) => {
          const y = i * lane + (lane - size) / 2;
          const travel = W + size;
          const x = ((t / 1000) * v * dpr) % travel - size;
          ctx.fillStyle = '#e8e8e8';
          ctx.fillRect(Math.round(x), Math.round(y), Math.round(size), Math.round(size));
          ctx.fillStyle = '#ff6a2b';
          ctx.fillRect(Math.round(x + size * 0.42), Math.round(y + size * 0.2), Math.round(size * 0.16), Math.round(size * 0.6));
          ctx.fillStyle = '#9a9a9a';
          ctx.fillText(`${v} px/s`, 14 * dpr, i * lane + 12 * dpr);
          if (i) {
            ctx.fillStyle = '#2c2c2c';
            ctx.fillRect(0, Math.round(i * lane), W, Math.max(1, dpr));
          }
        });
      },
    },
  ];

  /* ---------- fullscreen viewer ---------- */
  function openViewer(startIndex, s) {
    let i = startIndex;
    const canvas = h('canvas');
    const hud = h('div', { class: 'pattern-hud' });
    const stageEl = h('div', { class: 'pattern-stage', tabindex: '-1' }, canvas, hud);
    document.body.append(stageEl);
    stageEl.focus();

    let hudTimer;
    const showHud = () => {
      const p = PATTERNS[i];
      hud.innerHTML = `<b>${i + 1}/${PATTERNS.length}</b>&nbsp; ${p.name} · ${p.note} &nbsp;·&nbsp; ← → or click &nbsp;·&nbsp; esc`;
      hud.classList.remove('hide');
      clearTimeout(hudTimer);
      hudTimer = setTimeout(() => hud.classList.add('hide'), 1800);
    };

    let raf = 0;
    let closed = false;
    const draw = (t) => {
      if (closed) return;
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(stageEl.clientWidth * dpr);
      const H = Math.round(stageEl.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // patterns share one context; don't let one's textAlign leak into the next
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      PATTERNS[i].draw(ctx, W, H, t || performance.now(), dpr);
      ctx.restore();
      if (PATTERNS[i].animated) raf = requestAnimationFrame(draw);
    };
    const show = (n) => {
      i = (n + PATTERNS.length) % PATTERNS.length;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
      showHud();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown') { e.preventDefault(); show(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'Backspace' || e.key === 'PageUp') { e.preventDefault(); show(i - 1); }
      else if (/^[1-9]$/.test(e.key)) show(+e.key - 1);
      else if (e.key === '0') show(9);
      else showHud();
    };
    const onClick = (e) => show(e.clientX < window.innerWidth * 0.2 ? i - 1 : i + 1);
    const onMove = () => showHud();
    const onFs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) close(); };
    const onResize = () => { raf = requestAnimationFrame(draw); };

    window.addEventListener('keydown', onKey, true);
    stageEl.addEventListener('click', onClick);
    stageEl.addEventListener('mousemove', onMove);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);

    function close() {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      clearTimeout(hudTimer);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      stageEl.remove();
    }
    s.add(close);

    const req = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(stageEl);
        if (p && p.catch) p.catch(() => {}); // fine, it still fills the window
      } catch (e) { /* iOS Safari: no fullscreen for divs */ }
    }
    show(i);
  }

  Bench.register({
    id: 'display',
    num: '03',
    title: 'Display',
    blurb: 'Run the patterns full screen and look closely, ideally in a dim room. Click or press → to step through. Stuck pixels show up best on black and on the three primaries.',
    notePlaceholder: 'e.g. one stuck green pixel, lower left quadrant',

    mount(root, s) {
      const swatches = h('div', { class: 'swatches' });
      PATTERNS.forEach((p, idx) => {
        swatches.append(h('button', { class: 'swatch', type: 'button', onclick: () => openViewer(idx, s) },
          h('i', { style: `background:${p.thumb}` }),
          h('span', null, `${idx + 1}. ${p.name}`),
          h('small', null, p.note)));
      });

      /* refresh rate: rolling, from rAF timestamps */
      const hz = h('div', { class: 'hz-readout', html: '··<small>Hz</small>' });
      const strip = h('canvas');
      const stripWrap = h('div', { class: 'canvas-wrap frame-strip' }, strip);
      const fr = Bench.readout([
        ['ft', 'frame time'],
        ['jit', 'jitter (σ)'],
        ['drop', 'late frames'],
      ]);

      const info = Bench.readout([
        'Size',
        ['vp', 'window'],
        ['scr', 'screen'],
        ['dpr', 'pixel ratio'],
        ['phys', 'approx. panel'],
        'Colour',
        ['depth', 'colour depth'],
        ['gamut', 'gamut'],
        ['hdr', 'HDR'],
        ['scheme', 'OS theme'],
      ]);

      root.append(h('div', { class: 'stack' },
        Bench.panel('Test patterns',
          h('div', { class: 'row', style: 'margin-bottom:16px' },
            h('button', { class: 'btn primary', type: 'button', onclick: () => openViewer(0, s) }, 'Run all full screen →'),
            h('span', { class: 'hint', style: 'margin:0' }, 'Number keys jump straight to a pattern. Esc gets you out.')),
          swatches),
        h('div', { class: 'grid cols-2' },
          Bench.panel('Refresh rate', { live: true },
            hz,
            stripWrap,
            h('div', { style: 'margin-top:12px' }, fr.el),
            h('p', { class: 'hint' }, 'Measured from the browser\'s frame timing. On a 144 Hz screen set to 60 in the OS, this says 60. Low-power mode on laptops often halves it.')),
          Bench.panel('Reported by the browser', info.el))));

      const deltas = [];
      let prev = 0;
      s.loop((t) => {
        if (prev) {
          const d = t - prev;
          if (d < 250) deltas.push(d); // tab was hidden, ignore
          if (deltas.length > 120) deltas.shift();
        }
        prev = t;
        if (deltas.length < 10) return;

        const recent = deltas.slice(-60);
        const med = Bench.median(recent);
        const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
        const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
        const late = deltas.filter((d) => d > med * 1.5).length;
        const rate = 1000 / med;
        // snap to the usual suspects if we're within a hair of one
        const common = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 200, 240, 280, 360, 480, 500];
        const near = common.find((c) => Math.abs(c - rate) / c < 0.025);
        const shown = near || Math.round(rate);
        hz.innerHTML = `${shown}<small>Hz</small>`;
        fr.set('ft', med.toFixed(2) + ' ms');
        fr.set('jit', sd.toFixed(2) + ' ms', sd > med * 0.25 ? 'bad' : '');
        fr.set('drop', `${late} of last ${deltas.length}`, late > 4 ? 'bad' : '');

        const { ctx, w, h: ht } = Bench.fitCanvas(strip);
        const C = Bench.colors();
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, w, ht);
        const bw = w / 120;
        const scale = ht / (med * 3);
        ctx.strokeStyle = C.rule;
        ctx.beginPath();
        ctx.moveTo(0, ht - med * scale + 0.5);
        ctx.lineTo(w, ht - med * scale + 0.5);
        ctx.stroke();
        deltas.forEach((d, i) => {
          const bh = Math.min(ht, d * scale);
          ctx.fillStyle = d > med * 1.5 ? C.accent : C.ink;
          ctx.fillRect(i * bw, ht - bh, Math.max(1, bw - 1), bh);
        });
      });

      const mq = (q) => {
        try { return matchMedia(q).matches; } catch (e) { return false; }
      };
      const fillInfo = () => {
        const d = window.devicePixelRatio || 1;
        info.set('vp', `${innerWidth} × ${innerHeight} css px`);
        info.set('scr', `${screen.width} × ${screen.height} css px`);
        info.set('dpr', d.toFixed(2).replace(/\.?0+$/, '') + '×');
        info.set('phys', `${Math.round(screen.width * d)} × ${Math.round(screen.height * d)}`);
        info.set('depth', screen.colorDepth + '-bit');
        info.set('gamut', mq('(color-gamut: rec2020)') ? 'Rec. 2020' : mq('(color-gamut: p3)') ? 'Display P3' : mq('(color-gamut: srgb)') ? 'sRGB' : 'unknown');
        info.set('hdr', mq('(dynamic-range: high)') ? 'yes' : 'no');
        info.set('scheme', mq('(prefers-color-scheme: dark)') ? 'dark' : 'light');
      };
      fillInfo();
      s.on(window, 'resize', fillInfo);
    },
  });
})();
