/*
 * app.js: rail, routing, the verdict bar under each test, theme switch.
 * Routing is just location.hash so links/bookmarks to a test work.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const pages = Bench.modules.slice().sort((a, b) => a.num.localeCompare(b.num));
  const tests = pages.filter((p) => p.verdict !== false);

  const railList = document.getElementById('rail-list');
  const railCount = document.getElementById('rail-count');
  const railFill = document.getElementById('rail-fill');
  const stage = document.getElementById('stage');

  /* ---------- rail ---------- */
  const railItems = {};
  pages.forEach((p) => {
    if (p.verdict === false) railList.append(h('li', { class: 'rail-sep', 'aria-hidden': 'true' }));
    const pip = h('span', { class: 'pip', 'aria-hidden': 'true' });
    const a = h('a', { class: 'rail-item', href: '#' + p.id },
      h('span', { class: 'n' }, p.num),
      h('span', { class: 't' }, p.title),
      p.verdict === false ? h('span') : pip);
    railItems[p.id] = { a, pip };
    railList.append(h('li', null, a));
  });

  function refreshRail() {
    const res = Bench.results.all();
    let done = 0;
    tests.forEach((t) => {
      const st = (res[t.id] && res[t.id].status) || 'untested';
      if (st !== 'untested') done++;
      railItems[t.id].pip.className = 'pip ' + st;
      railItems[t.id].pip.title = st;
    });
    railCount.textContent = `${done} / ${tests.length}`;
    railFill.style.width = (done / tests.length) * 100 + '%';
  }
  document.addEventListener('bench:results', refreshRail);
  refreshRail();

  /* ---------- verdict bar ---------- */
  function verdictBar(mod) {
    const r = Bench.results.get(mod.id);
    const when = h('span', { class: 'verdict-when' });
    const setWhen = () => {
      const cur = Bench.results.get(mod.id);
      when.textContent = cur.at && cur.status !== 'untested' ? 'marked ' + Bench.fmt.time(cur.at) : 'not marked yet';
    };
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Verdict' });
    const btns = [['pass', 'Pass'], ['fail', 'Fail'], ['skip', 'Skip']].map(([s, label]) => {
      const b = h('button', { type: 'button', 'data-s': s }, label);
      b.addEventListener('click', () => {
        const cur = Bench.results.get(mod.id).status;
        const next = cur === s ? 'untested' : s; // click again to un-mark
        Bench.results.set(mod.id, { status: next });
        paint();
        if (next === 'pass') Bench.toast(`${mod.title}: marked as passing`);
      });
      seg.append(b);
      return b;
    });
    const paint = () => {
      const cur = Bench.results.get(mod.id).status;
      btns.forEach((b) => b.classList.toggle('on', b.dataset.s === cur));
      setWhen();
    };

    const note = h('input', {
      type: 'text',
      placeholder: mod.notePlaceholder || 'notes for the test sheet',
      value: r.note || '',
      'aria-label': 'Notes',
    });
    let t;
    note.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => Bench.results.set(mod.id, { note: note.value }), 300);
    });

    paint();
    return h('div', { class: 'verdict' }, h('span', { class: 'verdict-label' }, 'Verdict'), seg, note, when);
  }

  /* ---------- routing ---------- */
  let current = null;
  let scope = null;

  function go() {
    const id = decodeURIComponent(location.hash.slice(1)) || pages[0].id;
    const mod = pages.find((p) => p.id === id) || pages[0];
    if (mod === current) return;

    if (scope) scope.dispose();
    stage.textContent = '';
    current = mod;
    scope = Bench.scope();

    const body = h('div', { class: 'mod-body' });
    const page = h('article', { class: 'page', 'data-mod': mod.id },
      h('header', { class: 'mod-head' },
        h('div', { class: 'mod-num', 'aria-hidden': 'true' }, mod.num),
        h('h1', { class: 'mod-title' }, mod.title),
        h('p', { class: 'mod-blurb' }, mod.blurb)),
      body,
      mod.verdict === false ? null : verdictBar(mod));
    stage.append(page);

    try {
      mod.mount(body, scope);
    } catch (err) {
      console.error(err);
      body.append(h('p', { class: 'note bad' }, `This test crashed while starting: ${err.message}. Your browser might not support something it needs.`));
    }

    Object.entries(railItems).forEach(([k, v]) => {
      v.a.classList.toggle('active', k === mod.id);
      if (k === mod.id) v.a.setAttribute('aria-current', 'page');
      else v.a.removeAttribute('aria-current');
    });
    if (window.innerWidth <= 860) railItems[mod.id].a.scrollIntoView({ inline: 'center', block: 'nearest' });

    document.title = `${mod.title} · Bench`;
    window.scrollTo(0, 0);
    stage.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', go);
  go();

  // [ and ] to step through. The keyboard test eats keys itself so skip it there.
  window.addEventListener('keydown', (e) => {
    if (!current || current.id === 'keyboard') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key !== '[' && e.key !== ']') return;
    const i = pages.indexOf(current);
    const next = pages[(i + (e.key === ']' ? 1 : -1) + pages.length) % pages.length];
    location.hash = next.id;
  });

  /* ---------- theme ---------- */
  const themeBtn = document.getElementById('theme-btn');
  const order = ['auto', 'light', 'dark'];
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = 'theme: ' + t;
    Bench.invalidateColors();
  }
  applyTheme(Bench.store.get('theme', 'auto'));
  themeBtn.addEventListener('click', () => {
    const cur = Bench.store.get('theme', 'auto');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    Bench.store.set('theme', next);
    applyTheme(next);
  });

  /* ---------- clock (because every bench has one) ---------- */
  const clock = document.getElementById('clock');
  const tick = () => {
    const d = new Date();
    clock.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };
  tick();
  setInterval(tick, 1000);
})();
