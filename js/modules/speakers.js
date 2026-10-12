/*
 * 04 Speakers
 *
 * One graph for everything:
 *   source → env → (gL, gR) → merger → master → destination
 *                                              ↘ analyser
 * Driving gL/gR directly (not a StereoPanner) means the polarity test can
 * just set gR to -1.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const SPEAKER = (side) => `
<svg viewBox="0 0 100 100" aria-hidden="true">
  <rect x="14" y="4" width="72" height="92" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle class="cone" cx="50" cy="60" r="26"/>
  <circle class="cone" cx="50" cy="60" r="17"/>
  <circle class="dust" cx="50" cy="60" r="7"/>
  <circle class="cone" cx="50" cy="20" r="8"/>
  <text x="50" y="92" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" fill="currentColor" opacity=".55">${side}</text>
</svg>`;

  const fmin = 20, fmax = 20000;
  const toFreq = (v) => fmin * Math.pow(fmax / fmin, v / 1000);
  const toSlider = (f) => (Math.log(f / fmin) / Math.log(fmax / fmin)) * 1000;

  Bench.register({
    id: 'speakers',
    num: '04',
    title: 'Speakers & headphones',
    blurb: 'Start with the volume low. Check that left comes out of the left, right out of the right, then run the sweep and listen for rattles or a frequency where it suddenly goes quiet.',
    notePlaceholder: 'e.g. right driver buzzes around 180 Hz',

    mount(root, s) {
      let ac = null, master, gL, gR, analyser, noiseBuf = null;
      let current = null; // { stop() }
      let vol = Bench.store.get('spk.vol', 0.25);
      let signal = Bench.store.get('spk.signal', 'noise');
      let wave = 'sine';
      let freq = 440;
      let sweepInfo = null;

      function ensure() {
        if (ac) {
          if (ac.state === 'suspended') ac.resume();
          return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        ac = new AC();
        master = ac.createGain();
        master.gain.value = vol;
        const merger = ac.createChannelMerger(2);
        gL = ac.createGain();
        gR = ac.createGain();
        gL.connect(merger, 0, 0);
        gR.connect(merger, 0, 1);
        merger.connect(master);
        analyser = ac.createAnalyser();
        analyser.fftSize = 2048;
        master.connect(analyser);
        master.connect(ac.destination);
        readout.set('sr', ac.sampleRate + ' Hz');
        readout.set('ch', ac.destination.maxChannelCount);
        readout.set('lat', ac.baseLatency ? (ac.baseLatency * 1000).toFixed(1) + ' ms' : 'n/a');
      }

      // pink-ish noise (Paul Kellet's filter). Easier to localise than a sine.
      function pinkNoise() {
        if (noiseBuf) return noiseBuf;
        const len = ac.sampleRate * 3;
        noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
        const d = noiseBuf.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
        return noiseBuf;
      }

      function stopAll() {
        if (current) {
          current.stop();
          current = null;
        }
        sweepInfo = null;
        spkL.classList.remove('live');
        spkR.classList.remove('live');
        btnTone.textContent = 'Play tone';
        btnTone.classList.remove('on');
        btnSweep.textContent = 'Start sweep';
        btnSweep.classList.remove('on');
        polBtns.forEach((b) => b.classList.remove('on'));
        [btnL, btnC, btnR, btnWalk].forEach((b) => b.classList.remove('on'));
      }

      // make a source + envelope; returns a handle with .osc (if tone) and stop()
      function makeSource(kind, opts) {
        const env = ac.createGain();
        env.gain.value = 0;
        env.connect(gL);
        env.connect(gR);
        let src;
        if (kind === 'noise') {
          src = ac.createBufferSource();
          src.buffer = pinkNoise();
          src.loop = true;
        } else {
          src = ac.createOscillator();
          src.type = (opts && opts.type) || 'sine';
          src.frequency.value = (opts && opts.freq) || 440;
        }
        src.connect(env);
        src.start();
        let stopped = false;
        return {
          src,
          env,
          stop() {
            if (stopped) return;
            stopped = true;
            const t = ac.currentTime;
            env.gain.cancelScheduledValues(t);
            env.gain.setValueAtTime(env.gain.value, t);
            env.gain.linearRampToValueAtTime(0, t + 0.04);
            src.stop(t + 0.06);
            setTimeout(() => env.disconnect(), 200);
          },
        };
      }

      function setLR(l, r) {
        const t = ac.currentTime;
        gL.gain.cancelScheduledValues(t);
        gR.gain.cancelScheduledValues(t);
        gL.gain.setValueAtTime(l, t);
        gR.gain.setValueAtTime(r, t);
      }

      /* --- channel bursts: three short blips, so it's obvious which side --- */
      function burst(side, btn) {
        ensure();
        stopAll();
        btn.classList.add('on');
        setLR(side === 'R' ? 0 : 1, side === 'L' ? 0 : 1);
        const src = makeSource(signal === 'noise' ? 'noise' : 'tone', { freq: 660, type: 'sine' });
        const t0 = ac.currentTime + 0.02;
        for (let i = 0; i < 3; i++) {
          const a = t0 + i * 0.32;
          src.env.gain.setValueAtTime(0, a);
          src.env.gain.linearRampToValueAtTime(signal === 'noise' ? 0.9 : 0.5, a + 0.015);
          src.env.gain.setValueAtTime(signal === 'noise' ? 0.9 : 0.5, a + 0.2);
          src.env.gain.linearRampToValueAtTime(0, a + 0.23);
        }
        current = src;
        if (side !== 'R') spkL.classList.add('live');
        if (side !== 'L') spkR.classList.add('live');
        s.later(1000, () => {
          if (current === src) stopAll();
        });
      }

      /* --- walk: equal-power pan left → right → left over 6s --- */
      function walk() {
        ensure();
        stopAll();
        btnWalk.classList.add('on');
        const src = makeSource('noise');
        const t0 = ac.currentTime + 0.02;
        src.env.gain.setValueAtTime(0, t0);
        src.env.gain.linearRampToValueAtTime(0.8, t0 + 0.05);
        const n = 240, dur = 6;
        const curveL = new Float32Array(n), curveR = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const p = (1 - Math.cos((i / (n - 1)) * Math.PI * 2)) / 2; // 0→1→0
          curveL[i] = Math.cos((p * Math.PI) / 2);
          curveR[i] = Math.sin((p * Math.PI) / 2);
        }
        gL.gain.cancelScheduledValues(t0);
        gR.gain.cancelScheduledValues(t0);
        gL.gain.setValueCurveAtTime(curveL, t0, dur);
        gR.gain.setValueCurveAtTime(curveR, t0, dur);
        current = src;
        sweepInfo = { kind: 'walk', t0, dur, curveL, curveR };
        s.later(dur * 1000 + 60, () => {
          if (current === src) stopAll();
        });
      }

      /* --- tone generator --- */
      function toggleTone() {
        ensure();
        if (current && current.kind === 'tone') {
          stopAll();
          return;
        }
        stopAll();
        setLR(1, 1);
        const src = makeSource('tone', { freq, type: wave });
        src.kind = 'tone';
        src.env.gain.linearRampToValueAtTime(wave === 'sine' ? 0.6 : 0.3, ac.currentTime + 0.05);
        current = src;
        btnTone.textContent = 'Stop';
        btnTone.classList.add('on');
        spkL.classList.add('live');
        spkR.classList.add('live');
      }
      function setFreq(f, fromSlider) {
        freq = Bench.clamp(f, fmin, fmax);
        freqOut.innerHTML = Bench.fmt.hz(freq).replace(/ (k?Hz)/, '<small>$1</small>');
        if (!fromSlider) slider.value = toSlider(freq);
        if (current && current.kind === 'tone') current.src.frequency.setTargetAtTime(freq, ac.currentTime, 0.015);
      }

      /* --- sweep: exponential 20 Hz → 20 kHz --- */
      function toggleSweep() {
        ensure();
        if (current && current.kind === 'sweep') {
          stopAll();
          return;
        }
        stopAll();
        setLR(1, 1);
        const dur = 16;
        const src = makeSource('tone', { freq: 20, type: 'sine' });
        src.kind = 'sweep';
        const t0 = ac.currentTime + 0.03;
        src.src.frequency.setValueAtTime(20, t0);
        src.src.frequency.exponentialRampToValueAtTime(20000, t0 + dur);
        src.env.gain.setValueAtTime(0, t0);
        src.env.gain.linearRampToValueAtTime(0.5, t0 + 0.1);
        src.env.gain.setValueAtTime(0.5, t0 + dur - 0.1);
        src.env.gain.linearRampToValueAtTime(0, t0 + dur);
        current = src;
        sweepInfo = { kind: 'sweep', t0, dur };
        btnSweep.textContent = 'Stop sweep';
        btnSweep.classList.add('on');
        spkL.classList.add('live');
        spkR.classList.add('live');
        s.later(dur * 1000 + 100, () => {
          if (current === src) stopAll();
        });
      }

      /* --- polarity --- */
      function polarity(inverted, btn) {
        ensure();
        stopAll();
        btn.classList.add('on');
        setLR(1, inverted ? -1 : 1);
        const src = makeSource('noise');
        src.env.gain.linearRampToValueAtTime(0.8, ac.currentTime + 0.05);
        current = src;
        spkL.classList.add('live');
        spkR.classList.add('live');
        s.later(3000, () => {
          if (current === src) stopAll();
        });
      }

      /* ---------- UI ---------- */
      const spkL = h('div', { class: 'spk', html: SPEAKER('L') });
      const spkR = h('div', { class: 'spk', html: SPEAKER('R') });
      const btnL = h('button', { class: 'btn', type: 'button', onclick: () => burst('L', btnL) }, '◀ Left');
      const btnC = h('button', { class: 'btn', type: 'button', onclick: () => burst('C', btnC) }, 'Both');
      const btnR = h('button', { class: 'btn', type: 'button', onclick: () => burst('R', btnR) }, 'Right ▶');
      const btnWalk = h('button', { class: 'btn', type: 'button', onclick: walk }, 'Pan L ↔ R');
      spkL.append(btnL);
      spkR.append(btnR);

      const sigSeg = Bench.seg([['noise', 'Noise'], ['tone', 'Beep']], signal, (v) => {
        signal = v;
        Bench.store.set('spk.signal', v);
      });

      const volLabel = h('span', { class: 'mono' }, Math.round(vol * 100) + '%');
      const volSlider = h('input', { type: 'range', min: 0, max: 100, value: Math.round(vol * 100), 'aria-label': 'Volume' });
      volSlider.addEventListener('input', () => {
        vol = volSlider.value / 100;
        volLabel.textContent = volSlider.value + '%';
        Bench.store.set('spk.vol', vol);
        if (master) master.gain.setTargetAtTime(vol, ac.currentTime, 0.02);
      });

      const freqOut = h('div', { class: 'freq-readout' });
      const slider = h('input', { type: 'range', min: 0, max: 1000, step: 1, value: toSlider(freq), 'aria-label': 'Frequency' });
      slider.addEventListener('input', () => setFreq(toFreq(+slider.value), true));
      const btnTone = h('button', { class: 'btn primary', type: 'button', onclick: toggleTone }, 'Play tone');
      const waveSeg = Bench.seg([['sine', 'sine'], ['square', 'square'], ['sawtooth', 'saw'], ['triangle', 'tri']], wave, (v) => {
        wave = v;
        if (current && current.kind === 'tone') current.src.type = v;
      });
      const presets = h('div', { class: 'row tight' },
        [50, 100, 440, 1000, 5000, 10000, 15000].map((f) =>
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => setFreq(f) }, Bench.fmt.hz(f))));

      const btnSweep = h('button', { class: 'btn primary', type: 'button', onclick: toggleSweep }, 'Start sweep');
      const sweepNow = h('div', { class: 'freq-readout', html: '20<small>Hz</small>' });
      const sweepMark = h('i');
      const sweepTrack = h('div', { class: 'sweep-track' }, sweepMark);

      const polBtns = [
        h('button', { class: 'btn', type: 'button' }, 'A · in phase'),
        h('button', { class: 'btn', type: 'button' }, 'B · right inverted'),
      ];
      polBtns[0].addEventListener('click', () => polarity(false, polBtns[0]));
      polBtns[1].addEventListener('click', () => polarity(true, polBtns[1]));

      const scope = h('canvas');
      const readout = Bench.readout([['sr', 'sample rate'], ['ch', 'max channels'], ['lat', 'base latency']]);

      root.append(h('div', { class: 'stack' },
        Bench.panel('Channels',
          h('div', { class: 'lr' },
            spkL,
            h('div', { class: 'spk-mid' }, btnC, btnWalk,
              h('div', { class: 'field', style: 'margin-top:6px;align-items:center' }, 'Signal', sigSeg)),
            spkR),
          h('div', { style: 'margin-top:18px;max-width:420px' },
            h('div', { class: 'row', style: 'justify-content:space-between' }, h('span', { class: 'field' }, 'Output level'), volLabel),
            volSlider)),
        h('div', { class: 'grid cols-2' },
          Bench.panel('Sweep · 20 Hz to 20 kHz',
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end' }, sweepNow, btnSweep),
            sweepTrack,
            h('div', { class: 'sweep-ticks' }, ['20', '100', '1k', '10k', '20k'].map((t) => h('span', null, t))),
            h('p', { class: 'hint' }, 'Takes 16 seconds. Small laptop speakers usually don\'t make much sound below 150 Hz, which is normal. Most adults stop hearing somewhere between 14 and 17 kHz.')),
          Bench.panel('Tone generator',
            h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-end' }, freqOut, btnTone),
            h('div', { style: 'margin:10px 0 6px' }, slider),
            h('div', { class: 'row', style: 'margin-bottom:10px' }, waveSeg),
            presets)),
        h('div', { class: 'grid cols-2' },
          Bench.panel('Polarity check',
            h('p', { class: 'hint top' }, 'Play A, then B. A should sound solid and centred. B should sound hollow, like it comes from everywhere. If A is the hollow one, one speaker is wired backwards.'),
            h('div', { class: 'row' }, polBtns)),
          Bench.panel('Output', h('div', { class: 'canvas-wrap', style: 'height:110px' }, scope),
            h('div', { style: 'margin-top:12px' }, readout.el)))));

      setFreq(freq);

      s.loop(() => {
        // sweep position
        if (ac && sweepInfo && sweepInfo.kind === 'sweep') {
          const p = Bench.clamp((ac.currentTime - sweepInfo.t0) / sweepInfo.dur, 0, 1);
          const f = 20 * Math.pow(1000, p);
          sweepNow.innerHTML = Bench.fmt.hz(f).replace(/ (k?Hz)/, '<small>$1</small>');
          sweepMark.style.left = `calc(${p * 100}% - 1px)`;
        }
        if (ac && sweepInfo && sweepInfo.kind === 'walk') {
          const p = Bench.clamp((ac.currentTime - sweepInfo.t0) / sweepInfo.dur, 0, 0.999);
          const i = Math.floor(p * sweepInfo.curveL.length);
          spkL.style.opacity = 0.35 + 0.65 * sweepInfo.curveL[i];
          spkR.style.opacity = 0.35 + 0.65 * sweepInfo.curveR[i];
        } else {
          spkL.style.opacity = spkR.style.opacity = '';
        }

        const { ctx, w, h: ht } = Bench.fitCanvas(scope);
        const C = Bench.colors();
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, w, ht);
        ctx.strokeStyle = C.rule;
        ctx.beginPath();
        ctx.moveTo(0, ht / 2 + 0.5);
        ctx.lineTo(w, ht / 2 + 0.5);
        ctx.stroke();
        if (!analyser) return;
        const buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        // crude trigger on rising zero crossing so a steady tone stands still
        let start = 0;
        for (let i = 1; i < buf.length / 2; i++) {
          if (buf[i - 1] < 0 && buf[i] >= 0) { start = i; break; }
        }
        const n = buf.length / 2;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / n) * w;
          const y = ht / 2 - buf[start + i] * (ht / 2) * 0.9 / Math.max(vol, 0.05);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      });

      s.add(() => {
        stopAll();
        if (ac) ac.close();
      });
    },
  });
})();
