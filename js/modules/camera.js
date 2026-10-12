/*
 * 06 Camera
 *
 * "Reported" fps is what the driver claims; "measured" fps counts frames
 * that actually arrive (requestVideoFrameCallback). In a dark room
 * many webcams quietly drop to 15 fps to get longer exposure, and that's where
 * the two numbers disagree.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const CAM_ICON = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="6.5" width="14" height="11" rx="2"/><path d="M16.5 10.5l5-3v9l-5-3"/><circle cx="9.5" cy="12" r="2.4"/></svg>';

  const RES = [
    ['max', 'Highest available', { width: { ideal: 4096 }, height: { ideal: 2160 } }],
    ['1080', '1080p', { width: { ideal: 1920 }, height: { ideal: 1080 } }],
    ['720', '720p', { width: { ideal: 1280 }, height: { ideal: 720 } }],
    ['480', '480p', { width: { ideal: 640 }, height: { ideal: 480 } }],
  ];

  Bench.register({
    id: 'camera',
    num: '06',
    title: 'Camera',
    blurb: 'Check focus, colour and exposure, and that the frame rate holds up when the room is dim. Snapshots stay on this page until you download them.',
    notePlaceholder: 'e.g. 720p only, purple tint under LED light',

    mount(root, s) {
      let stream = null;
      let deviceId = Bench.store.get('cam.device', '');
      let res = Bench.store.get('cam.res', '720');
      let mirror = Bench.store.get('cam.mirror', true);
      let grid = false;
      let frames = 0, lastFrameT = 0, measured = 0;

      const video = h('video', { playsinline: true, muted: true, autoplay: true });
      video.muted = true;
      const overlay = h('canvas', { class: 'overlay' });
      const recTag = h('span', { class: 'cam-rec', hidden: true }, 'LIVE');
      const btnStart = h('button', { class: 'btn accent', type: 'button', onclick: () => start() }, 'Allow camera');
      const gate = Bench.empty(CAM_ICON, 'Camera is off', 'Video stays on this page and is never sent anywhere. The camera light turns off as soon as you leave this test.', btnStart);
      const box = h('div', { class: 'cam-box' + (mirror ? ' mirror' : '') }, video, overlay, recTag, gate);
      const status = h('p', { class: 'note bad', hidden: true });

      const devSel = h('select', { 'aria-label': 'Camera' }, h('option', { value: '' }, 'Default camera'));
      devSel.addEventListener('change', () => {
        deviceId = devSel.value;
        Bench.store.set('cam.device', deviceId);
        if (stream) start();
      });
      const resSel = h('select', { 'aria-label': 'Resolution' }, RES.map(([v, l]) => h('option', { value: v }, l)));
      resSel.value = res;
      resSel.addEventListener('change', () => {
        res = resSel.value;
        Bench.store.set('cam.res', res);
        if (stream) start();
      });
      const mirrorCb = h('input', { type: 'checkbox', checked: mirror });
      mirrorCb.addEventListener('change', () => {
        mirror = mirrorCb.checked;
        Bench.store.set('cam.mirror', mirror);
        box.classList.toggle('mirror', mirror);
      });
      const gridCb = h('input', { type: 'checkbox' });
      gridCb.addEventListener('change', () => (grid = gridCb.checked));

      const btnSnap = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: snap }, 'Snapshot');
      const btnStop = h('button', { class: 'btn small', type: 'button', disabled: true, onclick: stop }, 'Stop');
      const shots = h('div', { class: 'shots' });

      const stats = Bench.stats([['res', 'Resolution'], ['fps', 'Measured fps'], ['rep', 'Reported fps']]);
      stats.el.style.gridTemplateColumns = '1fr 1fr';
      stats.el.firstChild.style.gridColumn = '1 / -1';
      const info = Bench.readout([['label', 'device'], ['facing', 'facing'], ['aspect', 'aspect'], ['zoom', 'zoom / focus'], ['vfc', 'frame timing']]);

      root.append(h('div', { class: 'grid cols-main' },
        h('div', { class: 'stack' },
          h('div', null, box, status),
          h('div', { class: 'row' }, btnSnap, btnStop,
            h('span', { class: 'spacer' }),
            h('label', { class: 'check' }, mirrorCb, 'mirror'),
            h('label', { class: 'check' }, gridCb, 'thirds grid')),
          shots),
        h('div', { class: 'stack' },
          Bench.panel('Source',
            h('div', { class: 'stack', style: 'gap:12px' },
              h('label', { class: 'field' }, 'Camera', devSel),
              h('label', { class: 'field' }, 'Resolution', resSel))),
          Bench.panel('Readout', { live: true }, stats.el, h('div', { style: 'margin-top:14px' }, info.el)))));

      async function listDevices() {
        try {
          const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
          devSel.textContent = '';
          devSel.append(h('option', { value: '' }, 'Default camera'));
          devs.forEach((d, i) => d.deviceId && devSel.append(h('option', { value: d.deviceId }, d.label || `Camera ${i + 1}`)));
          devSel.value = deviceId;
          if (devSel.value !== deviceId) devSel.value = '';
        } catch (e) { /* ignore */ }
      }

      async function start() {
        status.hidden = true;
        Bench.stopStream(stream);
        stream = null;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          status.textContent = Bench.mediaError(null);
          status.hidden = false;
          return;
        }
        const v = Object.assign({}, RES.find((r) => r[0] === res)[2]);
        if (deviceId) v.deviceId = { exact: deviceId };
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
        } catch (err) {
          status.textContent = Bench.mediaError(err);
          status.hidden = false;
          return;
        }
        if (!s.alive) { Bench.stopStream(stream); return; }
        video.srcObject = stream;
        try { await video.play(); } catch (e) { /* autoplay muted should be fine */ }
        gate.hidden = true;
        recTag.hidden = false;
        btnSnap.disabled = btnStop.disabled = false;
        frames = 0;
        measured = 0;
        armFrameCounter();
        listDevices();
        describe();
      }

      function describe() {
        if (!stream) return;
        const tr = stream.getVideoTracks()[0];
        const st = tr.getSettings ? tr.getSettings() : {};
        const caps = tr.getCapabilities ? tr.getCapabilities() : {};
        const w = st.width || video.videoWidth, ht = st.height || video.videoHeight;
        stats.set('res', w && ht ? `${w}×${ht}` : '—');
        stats.set('rep', st.frameRate ? Math.round(st.frameRate) : '—');
        info.set('label', tr.label || 'unnamed');
        info.set('facing', st.facingMode || 'n/a');
        info.set('aspect', w && ht ? (w / ht).toFixed(3) + (Math.abs(w / ht - 16 / 9) < 0.01 ? ' (16:9)' : Math.abs(w / ht - 4 / 3) < 0.01 ? ' (4:3)' : '') : '—');
        const bits = [];
        if (caps.zoom) bits.push(`zoom ${caps.zoom.min}–${caps.zoom.max}`);
        if (caps.focusMode) bits.push('focus: ' + caps.focusMode.join('/'));
        info.set('zoom', bits.join(', ') || 'not exposed');
        info.set('vfc', 'requestVideoFrameCallback' in HTMLVideoElement.prototype ? 'per-frame' : 'not supported here');
      }

      function stop() {
        Bench.stopStream(stream);
        stream = null;
        video.srcObject = null;
        gate.hidden = false;
        recTag.hidden = true;
        btnSnap.disabled = btnStop.disabled = true;
        stats.set('fps', '—');
      }

      function snap() {
        if (!video.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (mirror) {
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        c.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
          const a = h('a', { href: url, download: `bench-snapshot-${stamp}.png`, title: 'Click to download' },
            h('img', { src: url, alt: 'Snapshot' }), h('span', null, `${c.width}×${c.height}`));
          shots.prepend(a);
          while (shots.children.length > 4) {
            const old = shots.lastChild;
            URL.revokeObjectURL(old.href);
            old.remove();
          }
        }, 'image/png');
        // little shutter flash
        box.animate([{ filter: 'brightness(2.2)' }, { filter: 'none' }], { duration: 220 });
      }

      // count frames as they really arrive
      let vfcArmed = false;
      const onFrame = () => {
        if (!s.alive || !stream) { vfcArmed = false; return; }
        frames++;
        video.requestVideoFrameCallback(onFrame);
      };
      function armFrameCounter() {
        if (vfcArmed || !('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return;
        vfcArmed = true;
        video.requestVideoFrameCallback(onFrame);
      }
      s.every(1000, () => {
        if (!stream) return;
        const now = performance.now();
        if (lastFrameT) {
          measured = (frames * 1000) / (now - lastFrameT);
          stats.set('fps', frames ? measured.toFixed(1) : '—', null, frames && measured < 20 ? 'alert' : '');
        }
        frames = 0;
        lastFrameT = now;
        describe();
      });

      s.loop(() => {
        const { ctx, w, h: ht } = Bench.fitCanvas(overlay);
        ctx.clearRect(0, 0, w, ht);
        if (!grid || !video.videoWidth) return;
        // fit the grid to the letterboxed video, not the box
        const ar = video.videoWidth / video.videoHeight;
        let vw = w, vh = w / ar;
        if (vh > ht) { vh = ht; vw = ht * ar; }
        const x0 = (w - vw) / 2, y0 = (ht - vh) / 2;
        ctx.strokeStyle = 'rgba(255,255,255,.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x0 + (vw * i) / 3, y0); ctx.lineTo(x0 + (vw * i) / 3, y0 + vh);
          ctx.moveTo(x0, y0 + (vh * i) / 3); ctx.lineTo(x0 + vw, y0 + (vh * i) / 3);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,106,43,.9)';
        ctx.beginPath();
        ctx.moveTo(w / 2 - 10, ht / 2); ctx.lineTo(w / 2 + 10, ht / 2);
        ctx.moveTo(w / 2, ht / 2 - 10); ctx.lineTo(w / 2, ht / 2 + 10);
        ctx.stroke();
      });

      s.add(() => {
        Bench.stopStream(stream);
        shots.querySelectorAll('a').forEach((a) => URL.revokeObjectURL(a.href));
      });
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) listDevices();
    },
  });
})();
