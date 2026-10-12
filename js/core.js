/*
 * core.js: the bits every test module leans on.
 *
 * No framework on purpose. Each test is an object with mount(root, scope);
 * the scope collects listeners/loops/streams so the app can tear a page
 * down cleanly when you navigate away (camera light goes off, etc).
 */
(function () {
  'use strict';

  const Bench = (window.Bench = { modules: [] });

  Bench.register = function (mod) {
    Bench.modules.push(mod);
  };

  // tiny hyperscript. h('div', {class: 'x', onclick: fn}, 'text', child)
  Bench.h = function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k in node && k !== 'list' && typeof v !== 'string') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  };
  const h = Bench.h;

  /* ---------- storage ----------
     One JSON blob in localStorage. If storage is blocked (private mode,
     strict settings) we just keep things in memory and carry on. */
  const KEY = 'bench.rev-c';
  let mem = {};
  try {
    mem = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch (e) {
    mem = {};
  }
  Bench.store = {
    get(k, fallback) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : fallback;
    },
    set(k, v) {
      mem[k] = v;
      try {
        localStorage.setItem(KEY, JSON.stringify(mem));
      } catch (e) { /* fine, memory only */ }
    },
  };

  /* ---------- results (the test sheet) ---------- */
  Bench.results = {
    all() {
      return Bench.store.get('results', {});
    },
    get(id) {
      return Object.assign({ status: 'untested', note: '' }, this.all()[id]);
    },
    set(id, patch) {
      const all = Object.assign({}, this.all());
      all[id] = Object.assign({ status: 'untested', note: '' }, all[id], patch, { at: Date.now() });
      Bench.store.set('results', all);
      document.dispatchEvent(new CustomEvent('bench:results', { detail: { id } }));
    },
    clear() {
      Bench.store.set('results', {});
      document.dispatchEvent(new CustomEvent('bench:results', { detail: {} }));
    },
  };

  /* ---------- theme colours for canvas drawing ---------- */
  let colorCache = null;
  Bench.colors = function () {
    if (!colorCache) {
      const s = getComputedStyle(document.documentElement);
      const g = (n) => s.getPropertyValue(n).trim();
      colorCache = {
        paper: g('--paper'), sheet: g('--sheet'), ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
        rule: g('--rule'), rule2: g('--rule-2'), accent: g('--accent'), ok: g('--ok'), bad: g('--bad'), warn: g('--warn'),
      };
    }
    return colorCache;
  };
  Bench.invalidateColors = function () {
    colorCache = null;
  };
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => (colorCache = null));
  } catch (e) { /* old safari */ }

  /* ---------- canvas ----------
     Match the backing store to CSS size * DPR, every frame if needed.
     Returns ctx already scaled so you draw in CSS pixels. */
  Bench.fitCanvas = function (canvas) {
    const r = canvas.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * d));
    const hh = Math.max(1, Math.round(r.height * d));
    if (canvas.width !== w || canvas.height !== hh) {
      canvas.width = w;
      canvas.height = hh;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height, dpr: d };
  };

  /* ---------- lifecycle scope ---------- */
  Bench.scope = function () {
    const fns = [];
    const scope = {
      alive: true,
      on(target, type, fn, opts) {
        target.addEventListener(type, fn, opts);
        fns.push(() => target.removeEventListener(type, fn, opts));
      },
      add(fn) {
        fns.push(fn);
      },
      loop(fn) {
        let id;
        const tick = (t) => {
          if (!scope.alive) return;
          try {
            fn(t);
          } catch (e) {
            console.error(e);
          }
          id = requestAnimationFrame(tick);
        };
        id = requestAnimationFrame(tick);
        fns.push(() => cancelAnimationFrame(id));
      },
      every(ms, fn) {
        const id = setInterval(fn, ms);
        fns.push(() => clearInterval(id));
      },
      later(ms, fn) {
        const id = setTimeout(fn, ms);
        fns.push(() => clearTimeout(id));
      },
      dispose() {
        scope.alive = false;
        while (fns.length) {
          try {
            fns.pop()();
          } catch (e) {
            console.warn(e);
          }
        }
      },
    };
    return scope;
  };

  Bench.stopStream = function (stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  };

  /* ---------- little UI builders ---------- */

  Bench.panel = function (label, ...kids) {
    const opts = typeof kids[0] === 'object' && kids[0] && !kids[0].nodeType && !Array.isArray(kids[0]) ? kids.shift() : {};
    const lab = h('span', { class: 'panel-label' }, opts.live ? h('span', { class: 'live' }) : null, label);
    return h('section', { class: 'panel' + (opts.class ? ' ' + opts.class : '') }, lab, ...kids);
  };

  // a <dl> you can poke values into by key
  Bench.readout = function (rows) {
    const dl = h('dl', { class: 'kv' });
    const cells = {};
    rows.forEach((row) => {
      if (typeof row === 'string') {
        dl.append(h('div', { class: 'kv-head' }, row));
        return;
      }
      const [key, label] = row;
      const dd = h('dd', null, '—');
      cells[key] = dd;
      dl.append(h('dt', null, label), dd);
    });
    return {
      el: dl,
      set(k, v, tone) {
        const c = cells[k];
        if (!c) return;
        const s = v == null || v === '' ? '—' : String(v);
        if (c.textContent !== s) c.textContent = s;
        c.className = tone || '';
      },
    };
  };

  // stat tiles: Bench.stats([['tested','Keys tested'], ...])
  Bench.stats = function (rows) {
    const wrap = h('div', { class: 'stats' });
    const cells = {};
    rows.forEach(([key, label]) => {
      const b = h('b', null, '0');
      const tile = h('div', { class: 'stat' }, b, h('span', null, label));
      cells[key] = { b, tile };
      wrap.append(tile);
    });
    return {
      el: wrap,
      set(k, v, unit, tone) {
        const c = cells[k];
        if (!c) return;
        const html = unit ? `${v}<small>${unit}</small>` : String(v);
        if (c.b.innerHTML !== html) c.b.innerHTML = html;
        c.tile.className = 'stat' + (tone ? ' ' + tone : '');
      },
    };
  };

  Bench.seg = function (options, value, onChange) {
    const wrap = h('div', { class: 'seg', role: 'group' });
    const btns = options.map(([v, label]) => {
      const b = h('button', { type: 'button', 'data-v': v }, label);
      b.addEventListener('click', () => {
        set(v);
        onChange(v);
      });
      wrap.append(b);
      return b;
    });
    function set(v) {
      btns.forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
    }
    set(value);
    wrap.set = set;
    return wrap;
  };

  // the friendly "we need permission" placeholder
  Bench.empty = function (icon, title, text, button) {
    return h('div', { class: 'empty' },
      h('div', null,
        icon ? h('div', { class: 'big-icon', html: icon }) : null,
        h('strong', null, title),
        h('p', null, text),
        button || null));
  };

  Bench.mediaError = function (err) {
    const name = (err && err.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return 'Permission was denied. Click the lock/camera icon in the address bar to allow it, then try again.';
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      return 'No matching device found. Is it plugged in and not disabled in system settings?';
    if (name === 'NotReadableError')
      return 'The device exists but something else is holding it (Zoom, Teams, OBS…). Close that and retry.';
    if (!navigator.mediaDevices) return 'This page needs https:// or localhost for device access.';
    return (err && err.message) || String(err);
  };

  /* ---------- formatting ---------- */
  Bench.fmt = {
    bytes(n) {
      if (n == null || isNaN(n)) return '—';
      const u = ['B', 'KB', 'MB', 'GB', 'TB'];
      let i = 0;
      while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
      }
      return (n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
    },
    hz(f) {
      return f >= 1000 ? (f / 1000).toFixed(f >= 10000 ? 1 : 2) + ' kHz' : Math.round(f) + ' Hz';
    },
    time(ts) {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    pad(n, w) {
      return String(n).padStart(w, ' ');
    },
  };

  Bench.clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  Bench.median = function (arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  let toastTimer;
  Bench.toast = function (msg, ms) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
  };

  Bench.download = function (filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
})();
