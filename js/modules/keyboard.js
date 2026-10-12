/*
 * 01 Keyboard
 *
 * Positions are in key units (1u = one letter key). Three clusters:
 * main block from x=0, nav cluster from x=15.5, numpad from x=19.
 * The function row sits half a unit above the rest, like real boards.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const META = isMac ? '⌘' : 'Win';
  const ALT = isMac ? '⌥' : 'Alt';

  // A press that lands this soon after the same key was released is
  // almost certainly the switch bouncing, not a human.
  const CHATTER_MS = 40;

  const NAV = ['PrintScreen', 'ScrollLock', 'Pause', 'Insert', 'Home', 'PageUp', 'Delete', 'End', 'PageDown'];
  const isNumpad = (c) => c.startsWith('Numpad') || c === 'NumLock';

  function buildLayout() {
    const keys = [];
    const key = (code, label, x, y, w, ht) => keys.push({ code, label, x, y, w: w || 1, h: ht || 1 });
    const row = (y, x, items) => {
      for (const it of items) {
        if (typeof it === 'number') { x += it; continue; }
        const [code, label, w = 1] = it;
        key(code, label, x, y, w);
        x += w;
      }
    };
    const letters = (s) => s.split('').map((c) => ['Key' + c, c]);

    row(0, 0, [['Escape', 'Esc'], 1, ['F1', 'F1'], ['F2', 'F2'], ['F3', 'F3'], ['F4', 'F4'], 0.5,
      ['F5', 'F5'], ['F6', 'F6'], ['F7', 'F7'], ['F8', 'F8'], 0.5,
      ['F9', 'F9'], ['F10', 'F10'], ['F11', 'F11'], ['F12', 'F12']]);
    row(1.5, 0, [['Backquote', ['~', '`']], ['Digit1', ['!', '1']], ['Digit2', ['@', '2']], ['Digit3', ['#', '3']],
      ['Digit4', ['$', '4']], ['Digit5', ['%', '5']], ['Digit6', ['^', '6']], ['Digit7', ['&', '7']],
      ['Digit8', ['*', '8']], ['Digit9', ['(', '9']], ['Digit0', [')', '0']], ['Minus', ['_', '-']],
      ['Equal', ['+', '=']], ['Backspace', 'Backspace', 2]]);
    row(2.5, 0, [['Tab', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', ['{', '[']],
      ['BracketRight', ['}', ']']], ['Backslash', ['|', '\\'], 1.5]]);
    row(3.5, 0, [['CapsLock', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', [':', ';']],
      ['Quote', ['"', "'"]], ['Enter', 'Enter', 2.25]]);
    row(4.5, 0, [['ShiftLeft', 'Shift', 2.25], ...letters('ZXCVBNM'), ['Comma', ['<', ',']],
      ['Period', ['>', '.']], ['Slash', ['?', '/']], ['ShiftRight', 'Shift', 2.75]]);
    row(5.5, 0, [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', META, 1.25], ['AltLeft', ALT, 1.25], ['Space', '', 6.25],
      ['AltRight', ALT, 1.25], ['MetaRight', META, 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]]);

    row(0, 15.5, [['PrintScreen', 'PrtSc'], ['ScrollLock', 'ScrLk'], ['Pause', 'Pause']]);
    row(1.5, 15.5, [['Insert', 'Ins'], ['Home', 'Home'], ['PageUp', 'PgUp']]);
    row(2.5, 15.5, [['Delete', 'Del'], ['End', 'End'], ['PageDown', 'PgDn']]);
    row(4.5, 16.5, [['ArrowUp', '↑']]);
    row(5.5, 15.5, [['ArrowLeft', '←'], ['ArrowDown', '↓'], ['ArrowRight', '→']]);

    row(1.5, 19, [['NumLock', isMac ? 'Clr' : 'Num'], ['NumpadDivide', '/'], ['NumpadMultiply', '*'], ['NumpadSubtract', '−']]);
    row(2.5, 19, [['Numpad7', '7'], ['Numpad8', '8'], ['Numpad9', '9']]);
    key('NumpadAdd', '+', 22, 2.5, 1, 2);
    row(3.5, 19, [['Numpad4', '4'], ['Numpad5', '5'], ['Numpad6', '6']]);
    row(4.5, 19, [['Numpad1', '1'], ['Numpad2', '2'], ['Numpad3', '3']]);
    key('NumpadEnter', 'Ent', 22, 4.5, 1, 2);
    row(5.5, 19, [['Numpad0', '0', 2], ['NumpadDecimal', '.']]);
    return keys;
  }

  function inProfile(profile, code) {
    if (profile === 'full') return true;
    if (profile === 'tkl') return !isNumpad(code);
    // laptop: no numpad, no nav block, and the right-hand oddities vary too much to count
    return !(isNumpad(code) || NAV.includes(code) || code === 'ContextMenu' || (!isMac && code === 'MetaRight') || (isMac && code === 'ControlRight'));
  }

  const LOCATIONS = ['standard', 'left', 'right', 'numpad'];

  Bench.register({
    id: 'keyboard',
    num: '01',
    title: 'Keyboard',
    blurb: 'Press every key once. Held keys go solid, keys you have already hit keep an orange edge. If a key fires twice from one press, it shows up as chatter.',
    notePlaceholder: 'e.g. right shift sticky, F7 dead',

    mount(root, s) {
      const keys = buildLayout();
      const byCode = new Map(keys.map((k) => [k.code, k]));
      let profile = Bench.store.get('kb.profile', 'full');

      const seen = new Set();
      const held = new Set();
      const extras = new Map();
      const lastUp = new Map();
      const log = [];
      let maxRoll = 0, presses = 0, chatter = 0, lastDownAt = 0;

      /* --- board --- */
      const board = h('div', { class: 'kb', role: 'img', 'aria-label': 'Keyboard diagram' });
      keys.forEach((k) => {
        const el = h('div', { class: 'key', style: `--x:${k.x};--y:${k.y};--w:${k.w};--h:${k.h}` });
        if (Array.isArray(k.label)) el.append(h('span', { class: 'sub' }, k.label[0]), h('span', null, k.label[1]));
        else {
          el.append(h('span', null, k.label));
          if (k.label.length > 2) el.classList.add('word');
        }
        k.el = el;
        board.append(el);
      });
      const ro = new ResizeObserver(() => {
        board.style.setProperty('--u', board.clientWidth / 23 + 'px');
      });
      ro.observe(board);
      s.add(() => ro.disconnect());

      function applyProfile() {
        keys.forEach((k) => k.el.classList.toggle('off', !inProfile(profile, k.code)));
        render();
      }

      /* --- side panels --- */
      const stats = Bench.stats([
        ['tested', 'Keys tested'],
        ['roll', 'Max held at once'],
        ['presses', 'Presses'],
        ['chatter', 'Chatter'],
      ]);
      const heldLine = h('div', { class: 'mono', style: 'font-size:13px;min-height:20px;color:var(--ink-2)' }, 'Nothing held.');

      const last = Bench.readout([
        ['key', 'event.key'],
        ['code', 'event.code'],
        ['kc', 'keyCode'],
        ['loc', 'location'],
        ['mods', 'modifiers'],
        ['gap', 'since last'],
      ]);

      const logList = h('ol', { class: 'log' });
      const logEmpty = h('p', { class: 'log-empty' }, 'Press something.');
      const extrasWrap = h('div', { class: 'chips' });
      const extrasPanel = Bench.panel('Keys not on the drawing',
        h('p', { class: 'hint top' }, 'Media keys, language keys, F13 and friends land here.'),
        extrasWrap);
      extrasPanel.hidden = true;

      const profileSeg = Bench.seg([['full', 'Full-size'], ['tkl', 'TKL'], ['laptop', 'Laptop']], profile, (v) => {
        profile = v;
        Bench.store.set('kb.profile', v);
        applyProfile();
      });

      function reset() {
        seen.clear(); held.clear(); extras.clear(); lastUp.clear();
        log.length = 0;
        maxRoll = presses = chatter = 0;
        keys.forEach((k) => k.el.classList.remove('seen', 'down', 'chatter'));
        renderExtras();
        renderLog();
        render();
        ['key', 'code', 'kc', 'loc', 'mods', 'gap'].forEach((k) => last.set(k, ''));
      }

      root.append(
        h('div', { class: 'stack' },
          Bench.panel('Board', { live: true },
            h('div', { class: 'row', style: 'margin-bottom:14px' },
              h('span', { class: 'field inline' }, 'Layout', profileSeg),
              h('span', { class: 'spacer' }),
              h('span', { class: 'hint', style: 'margin:0' }, 'Shortcuts with Ctrl/⌘ still go to the browser.'),
              h('button', { class: 'btn small', type: 'button', onclick: reset }, 'Reset')),
            h('div', { class: 'kb-scroll' }, board),
            h('div', { style: 'margin-top:14px' }, stats.el),
            h('div', { style: 'margin-top:10px', class: 'row' }, h('span', { class: 'dim mono', style: 'font-size:12px' }, 'HELD →'), heldLine)),
          h('div', { class: 'grid cols-2' },
            Bench.panel('Last event', last.el,
              h('p', { class: 'hint' }, `Chatter = the same key pressed again within ${CHATTER_MS} ms of letting go. Fingers can't do that, worn switches can.`)),
            Bench.panel('Event log', logList, logEmpty)),
          extrasPanel)
      );

      /* --- rendering --- */
      function render() {
        let counted = 0, total = 0;
        keys.forEach((k) => {
          if (!inProfile(profile, k.code)) return;
          total++;
          if (seen.has(k.code)) counted++;
        });
        stats.set('tested', counted, ' / ' + total, counted === total ? 'good' : '');
        stats.set('roll', maxRoll);
        stats.set('presses', presses);
        stats.set('chatter', chatter, null, chatter ? 'alert' : '');
        heldLine.textContent = held.size
          ? Array.from(held).map((c) => c.replace(/^(Key|Digit)/, '')).join(' + ')
          : 'Nothing held.';
      }

      function renderLog() {
        logList.textContent = '';
        logEmpty.hidden = log.length > 0;
        log.forEach((e) => {
          logList.append(h('li', { class: e.dir + (e.flag ? ' flag' : '') },
            h('span', { class: 'arrow' }, e.dir === 'down' ? '↓' : '↑'),
            h('span', null, e.code, e.flag ? '  ' + e.flag : ''),
            h('span', { class: 'dt' }, e.dt != null ? '+' + Math.round(e.dt) + 'ms' : '')));
        });
      }

      function renderExtras() {
        extrasWrap.textContent = '';
        extras.forEach((key, code) => extrasWrap.append(h('span', { class: 'chip accent', title: 'key: ' + key }, code)));
        extrasPanel.hidden = extras.size === 0;
      }

      function pushLog(entry) {
        log.unshift(entry);
        if (log.length > 13) log.pop();
        renderLog();
      }

      /* --- events --- */
      const typing = (e) => {
        const t = e.target;
        return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      };
      const isModifier = (c) => /^(Shift|Control|Alt|Meta)/.test(c);

      s.on(window, 'keydown', (e) => {
        if (typing(e)) return;
        const code = e.code || 'key:' + e.key;
        // let real shortcuts through (reload, devtools, closing the tab), swallow the rest
        if (!(e.metaKey || e.ctrlKey) || isModifier(code)) e.preventDefault();

        const now = performance.now();
        const k = byCode.get(code);
        if (!e.repeat) {
          presses++;
          let flag = '';
          const up = lastUp.get(code);
          if (up != null && now - up < CHATTER_MS) {
            chatter++;
            flag = `chatter (${Math.round(now - up)}ms)`;
            if (k) {
              k.el.classList.remove('chatter');
              void k.el.offsetWidth; // restart the animation
              k.el.classList.add('chatter');
            }
          }
          held.add(code);
          seen.add(code);
          maxRoll = Math.max(maxRoll, held.size);
          pushLog({ dir: 'down', code, dt: lastDownAt ? now - lastDownAt : null, flag });
          last.set('gap', lastDownAt ? Math.round(now - lastDownAt) + ' ms' : '');
          lastDownAt = now;
          if (!k) {
            extras.set(code, e.key);
            renderExtras();
          }
        }
        if (k) k.el.classList.add('down', 'seen');

        last.set('key', e.key === ' ' ? '(space)' : JSON.stringify(e.key));
        last.set('code', code);
        last.set('kc', e.keyCode);
        last.set('loc', `${e.location} (${LOCATIONS[e.location] || '?'})`);
        const mods = ['shiftKey', 'ctrlKey', 'altKey', 'metaKey'].filter((m) => e[m]).map((m) => m.replace('Key', ''));
        if (e.getModifierState && e.getModifierState('CapsLock')) mods.push('caps');
        last.set('mods', mods.join(' ') || 'none');
        render();
      }, true);

      s.on(window, 'keyup', (e) => {
        if (typing(e)) return;
        const code = e.code || 'key:' + e.key;
        e.preventDefault();
        held.delete(code);
        lastUp.set(code, performance.now());
        const k = byCode.get(code);
        if (k) k.el.classList.remove('down');

        // macOS never sends keyup for keys pressed while ⌘ is down, so
        // when ⌘ goes up, assume everything that isn't a modifier is up too.
        if (code === 'MetaLeft' || code === 'MetaRight') {
          Array.from(held).forEach((c) => {
            if (isModifier(c)) return;
            held.delete(c);
            const kk = byCode.get(c);
            if (kk) kk.el.classList.remove('down');
          });
        }
        pushLog({ dir: 'up', code, dt: null, flag: '' });
        render();
      }, true);

      // alt-tabbing away mid-press leaves keys "stuck" otherwise
      s.on(window, 'blur', () => {
        held.forEach((c) => {
          const k = byCode.get(c);
          if (k) k.el.classList.remove('down');
        });
        held.clear();
        render();
      });

      applyProfile();
      renderLog();
    },
  });
})();
