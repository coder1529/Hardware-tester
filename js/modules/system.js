/*
 * 09 System
 *
 * What the browser is willing to say about the machine. Some of it is
 * deliberately vague (deviceMemory rounds to a power of two and caps at 8)
 * because exact numbers make fingerprinting too easy.
 *
 * The CPU test is xorshift in a Web Worker. It isn't Geekbench. It's
 * useful for "is this laptop throttling" or "is core 5 of 8 asleep",
 * compared on the same browser.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const WORKER_SRC = `
    onmessage = function (e) {
      var ms = e.data, end = performance.now() + ms, x = 2463534242 | 0, n = 0;
      while (performance.now() < end) {
        for (var i = 0; i < 200000; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; }
        n++;
      }
      postMessage({ n: n, x: x });
    };`;

  function gpuInfo() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return null;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const out = {
        vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      };
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return out;
    } catch (e) {
      return null;
    }
  }

  // Chrome's renderer strings are wordy: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)"
  function tidyRenderer(r) {
    if (!r) return '';
    const m = r.match(/ANGLE \((.+)\)$/);
    if (!m) return r;
    const parts = m[1].split(', ');
    const core = parts[1] || parts[0];
    return core.replace(/ANGLE \w+ Renderer: /, '').replace(/ Direct3D.*$/, '').replace(/\s*\(0x[0-9A-F]+\)/i, '');
  }

  let gpuCache;
  Bench.deviceSummary = function () {
    if (gpuCache === undefined) gpuCache = gpuInfo();
    const d = window.devicePixelRatio || 1;
    const uad = navigator.userAgentData;
    let browser = '';
    if (uad && uad.brands) {
      // brands includes a deliberate junk entry ("Not?A_Brand") to stop sniffing; skip it
      const real = uad.brands.filter((x) => !/not.a.brand/i.test(x.brand));
      const b = real.find((x) => x.brand !== 'Chromium') || real[0];
      if (b) browser = `${b.brand} ${b.version}`;
    }
    if (!browser) {
      const ua = navigator.userAgent;
      const m = ua.match(/(Firefox|Edg|OPR|Chrome|Version)\/([\d.]+)/);
      browser = m ? `${m[1] === 'Version' ? 'Safari' : m[1] === 'Edg' ? 'Edge' : m[1]} ${m[2].split('.')[0]}` : 'unknown';
    }
    return [
      ['Platform', (uad && uad.platform) || navigator.platform || 'unknown'],
      ['Browser', browser],
      ['CPU threads', navigator.hardwareConcurrency || '—'],
      ['Memory', navigator.deviceMemory ? `≥ ${navigator.deviceMemory} GB (browser-rounded)` : 'not reported'],
      ['GPU', gpuCache ? tidyRenderer(gpuCache.renderer) : 'not reported'],
      ['Screen', `${Math.round(screen.width * d)} × ${Math.round(screen.height * d)} @ ${d}x`],
      ['Touch points', navigator.maxTouchPoints || 0],
    ];
  };

  function runWorkers(count, ms) {
    return new Promise((resolve, reject) => {
      let url;
      try {
        url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      } catch (e) {
        reject(e);
        return;
      }
      const ws = [];
      let done = 0, total = 0;
      for (let i = 0; i < count; i++) {
        let w;
        try {
          w = new Worker(url);
        } catch (e) {
          ws.forEach((x) => x.terminate());
          URL.revokeObjectURL(url);
          reject(e);
          return;
        }
        w.onmessage = (e) => {
          total += e.data.n;
          w.terminate();
          if (++done === count) {
            URL.revokeObjectURL(url);
            resolve(total);
          }
        };
        w.onerror = (e) => {
          ws.forEach((x) => x.terminate());
          URL.revokeObjectURL(url);
          reject(e);
        };
        ws.push(w);
      }
      ws.forEach((w) => w.postMessage(ms));
    });
  }

  // millions of xorshift rounds per second
  const score = (n, ms) => (n * 200000) / (ms / 1000) / 1e6;

  Bench.register({
    id: 'system',
    num: '09',
    title: 'System',
    blurb: 'What the browser will tell us about this machine, plus a quick CPU check. Useful for confirming a second-hand laptop matches its listing, as far as a browser can.',
    notePlaceholder: 'e.g. listing said 16 GB, matches. GPU is the iGPU, not the 3050',

    mount(root, s) {
      const left = Bench.readout([
        'Processor',
        ['cores', 'logical threads'],
        ['arch', 'architecture'],
        'Memory',
        ['mem', 'device memory'],
        ['heap', 'JS heap limit'],
        'Graphics',
        ['gpu', 'renderer'],
        ['gvendor', 'vendor'],
        ['gl', 'WebGL'],
        ['tex', 'max texture'],
        ['webgpu', 'WebGPU'],
      ]);
      const right = Bench.readout([
        'Platform',
        ['os', 'OS'],
        ['model', 'model'],
        ['browser', 'browser'],
        'Power',
        ['bat', 'battery'],
        ['charging', 'charging'],
        ['btime', 'time estimate'],
        'Other',
        ['net', 'network'],
        ['storage', 'storage quota'],
        ['input', 'primary input'],
        ['locale', 'locale / tz'],
      ]);

      const singleOut = h('div', { class: 'stat' }, h('b', null, '—'), h('span', null, 'Single thread · M ops/s'));
      const multiOut = h('div', { class: 'stat' }, h('b', null, '—'), h('span', null, 'All threads · M ops/s'));
      const scaleOut = h('div', { class: 'stat' }, h('b', null, '—'), h('span', null, 'Scaling'));
      const bar = h('i');
      const runBtn = h('button', { class: 'btn primary', type: 'button' }, 'Run CPU test (≈ 6 s)');
      const history = h('ol', { class: 'log', style: 'max-height:none' });
      const runs = Bench.store.get('sys.runs', []);

      root.append(h('div', { class: 'stack' },
        h('div', { class: 'grid cols-2' }, Bench.panel('Hardware', left.el), Bench.panel('Environment', right.el)),
        Bench.panel('CPU test',
          h('div', { class: 'row', style: 'margin-bottom:14px' }, runBtn,
            h('span', { class: 'hint', style: 'margin:0' }, 'Plug the laptop in for repeatable numbers. On battery many machines throttle.')),
          h('div', { class: 'stats' }, singleOut, multiOut, scaleOut),
          h('div', { class: 'bench-bar' }, bar),
          h('div', { style: 'margin-top:14px' },
            h('div', { class: 'field', style: 'margin-bottom:6px' }, 'Previous runs in this browser'),
            history))));

      function paintHistory() {
        history.textContent = '';
        if (!runs.length) {
          history.append(h('li', { style: 'display:block;color:var(--ink-3)' }, 'None yet.'));
          return;
        }
        runs.slice(-6).reverse().forEach((r) => {
          history.append(h('li', null, h('span', { class: 'arrow' }, '·'),
            h('span', null, `${r.single.toFixed(0)} single  ·  ${r.multi.toFixed(0)} multi  ·  ${r.threads} threads`),
            h('span', { class: 'dt' }, new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))));
        });
      }
      paintHistory();

      runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        const threads = navigator.hardwareConcurrency || 4;
        const set = (el, v) => (el.querySelector('b').textContent = v);
        set(singleOut, '…'); set(multiOut, '…'); set(scaleOut, '…');
        bar.style.transition = 'none';
        bar.style.width = '0';
        void bar.offsetWidth;
        bar.style.transition = 'width 6.2s linear';
        bar.style.width = '100%';
        try {
          await runWorkers(1, 300); // warm up the JIT, throw away
          const one = score(await runWorkers(1, 2500), 2500);
          if (!s.alive) return;
          set(singleOut, one.toFixed(0));
          const all = score(await runWorkers(threads, 3000), 3000);
          if (!s.alive) return;
          set(multiOut, all.toFixed(0));
          set(scaleOut, (all / one).toFixed(1) + '×');
          runs.push({ single: one, multi: all, threads, at: Date.now() });
          if (runs.length > 20) runs.shift();
          Bench.store.set('sys.runs', runs);
          paintHistory();
        } catch (e) {
          set(singleOut, 'n/a');
          Bench.toast('Workers are blocked here. Try serving the page from localhost.');
        }
        runBtn.disabled = false;
      });

      /* ---- fill in what we can, sync first ---- */
      const gpu = gpuCache !== undefined ? gpuCache : (gpuCache = gpuInfo());
      left.set('cores', navigator.hardwareConcurrency || 'not reported');
      left.set('mem', navigator.deviceMemory ? `≥ ${navigator.deviceMemory} GB` : 'not reported (Firefox/Safari hide it)');
      left.set('heap', performance.memory ? Bench.fmt.bytes(performance.memory.jsHeapSizeLimit) : 'not reported');
      if (gpu) {
        left.set('gpu', tidyRenderer(gpu.renderer));
        left.set('gvendor', gpu.vendor);
        left.set('gl', gpu.version);
        left.set('tex', gpu.maxTex + ' px');
      } else left.set('gpu', 'WebGL unavailable');

      const summary = Bench.deviceSummary();
      right.set('browser', summary[1][1]);
      right.set('os', summary[0][1]);
      right.set('model', 'not reported');
      left.set('arch', 'not reported');
      const fine = matchMedia('(pointer: fine)').matches, coarse = matchMedia('(pointer: coarse)').matches;
      right.set('input', fine ? 'mouse / trackpad' : coarse ? 'touch' : 'none');
      right.set('locale', `${navigator.language} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      const conn = navigator.connection;
      right.set('net', navigator.onLine ? (conn ? `online · ${conn.effectiveType || '?'}${conn.downlink ? ' · ~' + conn.downlink + ' Mb/s' : ''}` : 'online') : 'offline');

      /* ---- async bits ---- */
      if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
        navigator.userAgentData.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion']).then((v) => {
          if (!s.alive) return;
          if (v.architecture) left.set('arch', `${v.architecture}${v.bitness ? ' · ' + v.bitness + '-bit' : ''}`);
          if (v.model) right.set('model', v.model);
          if (v.platformVersion) right.set('os', `${v.platform} ${v.platformVersion}`);
        }).catch(() => {});
      }

      if (navigator.gpu && navigator.gpu.requestAdapter) {
        navigator.gpu.requestAdapter().then(async (ad) => {
          if (!s.alive) return;
          if (!ad) return left.set('webgpu', 'supported, no adapter');
          let info = ad.info;
          if (!info && ad.requestAdapterInfo) info = await ad.requestAdapterInfo().catch(() => null);
          const bits = info ? [info.vendor, info.architecture, info.description].filter(Boolean) : [];
          left.set('webgpu', bits.length ? bits.join(' · ') : 'yes');
        }).catch(() => left.set('webgpu', 'error'));
      } else left.set('webgpu', 'not supported');

      if (navigator.getBattery) {
        navigator.getBattery().then((b) => {
          const paint = () => {
            if (!s.alive) return;
            right.set('bat', Math.round(b.level * 100) + '%', b.level < 0.15 ? 'bad' : '');
            right.set('charging', b.charging ? 'yes' : 'no');
            const t = b.charging ? b.chargingTime : b.dischargingTime;
            right.set('btime', isFinite(t) && t > 0 ? `${b.charging ? 'full in' : 'empty in'} ${Math.floor(t / 3600)}h ${Math.round((t % 3600) / 60)}m` : 'unknown');
          };
          paint();
          ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach((ev) => s.on(b, ev, paint));
        }).catch(() => right.set('bat', 'not reported'));
      } else {
        right.set('bat', 'not reported (desktop, Firefox or Safari)');
      }

      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate().then((e) => {
          if (s.alive) right.set('storage', `${Bench.fmt.bytes(e.quota)} available to sites`);
        }).catch(() => {});
      }
    },
  });
})();
