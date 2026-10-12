/*
 * 05 Microphone
 *
 * Processing (echo cancel, noise suppression, AGC) defaults to OFF so you
 * hear what the mic actually picks up, not what the call app would make
 * of it. Flip them on to compare.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const MIC_ICON = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';

  Bench.register({
    id: 'microphone',
    num: '05',
    title: 'Microphone',
    blurb: 'Talk normally at your usual distance. The bar should sit around the middle and never touch the red zone. Then record five seconds and play it back. Hum, hiss or crackle are much easier to hear than to see.',
    notePlaceholder: 'e.g. quiet, constant hiss at 50 Hz',

    mount(root, s) {
      let stream = null, ac = null, analyser = null, recorder = null, recUrl = null;
      const proc = Object.assign({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }, Bench.store.get('mic.proc', {}));
      let deviceId = Bench.store.get('mic.device', '');
      let peakHold = -100, peakHoldAt = 0, clipped = false;

      const devSel = h('select', { 'aria-label': 'Input device' }, h('option', { value: '' }, 'Default input'));
      devSel.addEventListener('change', () => {
        deviceId = devSel.value;
        Bench.store.set('mic.device', deviceId);
        if (stream) start();
      });
      const checks = Object.keys(proc).map((k) => {
        const label = { echoCancellation: 'echo cancel', noiseSuppression: 'noise suppression', autoGainControl: 'auto gain' }[k];
        const cb = h('input', { type: 'checkbox', checked: proc[k] });
        cb.addEventListener('change', () => {
          proc[k] = cb.checked;
          Bench.store.set('mic.proc', proc);
          if (stream) start();
        });
        return h('label', { class: 'check' }, cb, label);
      });

      const btnStart = h('button', { class: 'btn primary', type: 'button', onclick: () => start() }, 'Allow microphone');
      const btnStop = h('button', { class: 'btn small', type: 'button', onclick: stop, hidden: true }, 'Stop');
      const status = h('p', { class: 'note', hidden: true });

      const rms = h('div', { class: 'rms' });
      const pk = h('div', { class: 'pk' });
      const meter = h('div', { class: 'meter' }, h('div', { class: 'hot' }), rms, pk);
      const dbOut = h('span', { class: 'mono', style: 'font-size:13px;font-variant-numeric:tabular-nums' }, '— dBFS');
      const clipBtn = h('button', { class: 'clip', type: 'button', title: 'Click to reset' }, 'CLIP');
      clipBtn.addEventListener('click', () => {
        clipped = false;
        clipBtn.classList.remove('hit');
      });

      const scopeC = h('canvas');
      const specC = h('canvas');

      const info = Bench.readout([['label', 'device'], ['sr', 'sample rate'], ['ch', 'channels'], ['proc', 'processing'], ['floor', 'noise floor']]);

      const recBtn = h('button', { class: 'btn', type: 'button', disabled: true }, 'Record 5 s');
      const player = h('audio', { controls: true, style: 'width:100%;margin-top:12px;display:none' });
      recBtn.addEventListener('click', record);

      const main = h('div', { class: 'stack' });
      const live = h('div', { class: 'stack', hidden: true },
        Bench.panel('Level', { live: true },
          h('div', { class: 'row', style: 'margin-bottom:8px' }, dbOut, h('span', { class: 'spacer' }), clipBtn),
          meter,
          h('div', { class: 'meter-scale' }, ['-60', '-48', '-36', '-24', '-12', '-6', '0'].map((t) => h('span', null, t)))),
        h('div', { class: 'grid cols-2' },
          Bench.panel('Waveform', h('div', { class: 'canvas-wrap', style: 'height:180px' }, scopeC)),
          Bench.panel('Spectrum', h('div', { class: 'canvas-wrap', style: 'height:180px' }, specC))),
        h('div', { class: 'grid cols-2' },
          Bench.panel('Record & play back',
            h('p', { class: 'hint top' }, 'Say something like "one, two, three, testing". Then play it back on headphones if you have them.'),
            recBtn, player),
          Bench.panel('Device', info.el)));

      const gate = Bench.empty(MIC_ICON, 'Microphone is off',
        'Your browser will ask for permission. Audio stays on this page and is never sent anywhere.', btnStart);

      main.append(
        Bench.panel('Input',
          h('div', { class: 'row' },
            h('label', { class: 'field', style: 'flex:1;min-width:200px' }, 'Device', devSel),
            h('div', { class: 'field' }, 'Processing', h('div', { class: 'row', style: 'gap:14px;padding:7px 0' }, checks)),
            btnStop),
          status),
        h('div', { class: 'panel', style: 'padding:0' }, gate),
        live);
      root.append(main);

      async function listDevices() {
        try {
          const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
          devSel.textContent = '';
          devSel.append(h('option', { value: '' }, 'Default input'));
          devs.forEach((d, i) => {
            if (d.deviceId === 'default' || d.deviceId === '') return;
            devSel.append(h('option', { value: d.deviceId }, d.label || `Microphone ${i + 1}`));
          });
          devSel.value = deviceId;
          if (devSel.value !== deviceId) devSel.value = '';
        } catch (e) { /* not fatal */ }
      }

      async function start() {
        status.hidden = true;
        teardown();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          status.textContent = Bench.mediaError(null);
          status.hidden = false;
          return;
        }
        try {
          const audio = Object.assign({}, proc);
          if (deviceId) audio.deviceId = { exact: deviceId };
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        } catch (err) {
          status.textContent = Bench.mediaError(err);
          status.className = 'note bad';
          status.hidden = false;
          return;
        }
        if (!s.alive) { Bench.stopStream(stream); return; }

        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        const src = ac.createMediaStreamSource(stream);
        analyser = ac.createAnalyser();
        analyser.fftSize = 4096;
        analyser.smoothingTimeConstant = 0.55;
        src.connect(analyser); // deliberately not to the speakers: feedback howl

        const track = stream.getAudioTracks()[0];
        const st = track.getSettings ? track.getSettings() : {};
        info.set('label', track.label || 'unnamed');
        info.set('sr', (st.sampleRate || ac.sampleRate) + ' Hz');
        info.set('ch', st.channelCount || '—');
        const on = ['echoCancellation', 'noiseSuppression', 'autoGainControl'].filter((k) => st[k]);
        info.set('proc', on.length ? on.map((k) => k.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ') : 'off');
        floorSamples.length = 0;
        info.set('floor', 'measuring…');

        gate.parentNode.hidden = true;
        live.hidden = false;
        btnStop.hidden = false;
        recBtn.disabled = !window.MediaRecorder;
        listDevices();
      }

      function teardown() {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        Bench.stopStream(stream);
        stream = null;
        if (ac) ac.close();
        ac = null;
        analyser = null;
      }

      function stop() {
        teardown();
        gate.parentNode.hidden = false;
        live.hidden = true;
        btnStop.hidden = true;
      }

      function record() {
        if (!stream || !window.MediaRecorder) return;
        const chunks = [];
        try {
          recorder = new MediaRecorder(stream);
        } catch (e) {
          Bench.toast('This browser can\'t record audio.');
          return;
        }
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        recorder.onstop = () => {
          if (recUrl) URL.revokeObjectURL(recUrl);
          recUrl = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
          player.src = recUrl;
          player.style.display = 'block';
          recBtn.disabled = false;
          recBtn.textContent = 'Record again';
          recBtn.classList.remove('on');
          player.play().catch(() => {});
        };
        recorder.start();
        recBtn.disabled = true;
        recBtn.classList.add('on');
        let left = 5;
        recBtn.textContent = `Recording… ${left}`;
        const iv = setInterval(() => {
          left--;
          if (left > 0) recBtn.textContent = `Recording… ${left}`;
          else {
            clearInterval(iv);
            if (recorder && recorder.state === 'recording') recorder.stop();
          }
        }, 1000);
        s.add(() => clearInterval(iv));
      }

      const floorSamples = [];
      const dbToX = (db) => Bench.clamp((db + 60) / 60, 0, 1);
      let timeBuf = null, freqBuf = null;

      s.loop(() => {
        if (!analyser) return;
        if (!timeBuf || timeBuf.length !== analyser.fftSize) {
          timeBuf = new Float32Array(analyser.fftSize);
          freqBuf = new Float32Array(analyser.frequencyBinCount);
        }
        analyser.getFloatTimeDomainData(timeBuf);
        let sum = 0, peak = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = timeBuf[i];
          sum += v * v;
          const a = Math.abs(v);
          if (a > peak) peak = a;
        }
        const rmsDb = 20 * Math.log10(Math.sqrt(sum / timeBuf.length) || 1e-6);
        const peakDb = 20 * Math.log10(peak || 1e-6);
        const now = performance.now();
        if (peakDb > peakHold || now - peakHoldAt > 1500) {
          peakHold = peakDb;
          peakHoldAt = now;
        }
        if (peak > 0.985 && !clipped) {
          clipped = true;
          clipBtn.classList.add('hit');
        }
        rms.style.width = dbToX(rmsDb) * 100 + '%';
        pk.style.left = `calc(${dbToX(peakHold) * 100}% - 2px)`;
        dbOut.textContent = `${rmsDb.toFixed(1).padStart(6, ' ')} dBFS rms · peak ${peakHold.toFixed(1)}`;

        // noise floor: quietest 10% of the first ~4 seconds of frames
        if (floorSamples.length < 240) {
          floorSamples.push(rmsDb);
          if (floorSamples.length === 240) {
            const sorted = floorSamples.slice().sort((a, b) => a - b);
            const fl = sorted[Math.floor(sorted.length * 0.1)];
            info.set('floor', fl.toFixed(1) + ' dBFS', fl > -45 ? 'bad' : fl < -60 ? 'good' : '');
          }
        }

        const C = Bench.colors();

        // waveform
        {
          const { ctx, w, h: ht } = Bench.fitCanvas(scopeC);
          ctx.fillStyle = C.paper;
          ctx.fillRect(0, 0, w, ht);
          ctx.strokeStyle = C.rule;
          ctx.lineWidth = 1;
          ctx.beginPath();
          [0.25, 0.5, 0.75].forEach((f) => { ctx.moveTo(0, ht * f + 0.5); ctx.lineTo(w, ht * f + 0.5); });
          ctx.stroke();
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const n = timeBuf.length;
          const step = Math.max(1, Math.floor(n / w));
          for (let x = 0; x < w; x++) {
            // min/max per column so spikes don't vanish between samples
            let mn = 1, mx = -1;
            const i0 = Math.floor((x / w) * n);
            for (let i = i0; i < i0 + step && i < n; i++) {
              if (timeBuf[i] < mn) mn = timeBuf[i];
              if (timeBuf[i] > mx) mx = timeBuf[i];
            }
            ctx.moveTo(x + 0.5, ht / 2 - mx * ht * 0.48);
            ctx.lineTo(x + 0.5, ht / 2 - mn * ht * 0.48 + 1);
          }
          ctx.stroke();
        }

        // spectrum, log frequency axis
        {
          analyser.getFloatFrequencyData(freqBuf);
          const { ctx, w, h: ht } = Bench.fitCanvas(specC);
          ctx.fillStyle = C.paper;
          ctx.fillRect(0, 0, w, ht);
          const nyq = ac.sampleRate / 2;
          const lo = 40, hi = Math.min(20000, nyq);
          const fx = (f) => (Math.log(f / lo) / Math.log(hi / lo)) * w;
          ctx.font = '10px "IBM Plex Mono", monospace';
          ctx.fillStyle = C.ink3;
          ctx.strokeStyle = C.rule2;
          ctx.beginPath();
          [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach((f) => {
            const x = Math.round(fx(f)) + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, ht);
            ctx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, ht - 5);
          });
          ctx.stroke();
          const minDb = -110, maxDb = -15;
          const y = (db) => ht - Bench.clamp((db - minDb) / (maxDb - minDb), 0, 1) * (ht - 14) - 14;
          ctx.beginPath();
          ctx.moveTo(0, ht - 14);
          for (let x = 0; x <= w; x += 2) {
            const f = lo * Math.pow(hi / lo, x / w);
            const bin = Math.round((f / nyq) * freqBuf.length);
            ctx.lineTo(x, y(freqBuf[Math.min(bin, freqBuf.length - 1)]));
          }
          ctx.lineTo(w, ht - 14);
          ctx.closePath();
          ctx.fillStyle = C.accent;
          ctx.globalAlpha = 0.18;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      });

      s.add(() => {
        teardown();
        if (recUrl) URL.revokeObjectURL(recUrl);
      });

      // if permission was granted before, labels are available straight away
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) listDevices();
    },
  });
})();
