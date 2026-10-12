/*
 * 10 Test sheet
 *
 * Collects every verdict + note into one page you can print, copy into a
 * ticket, or save as a .txt next to the listing photos. Same data the
 * verdict bars write to; editing here edits there.
 */
(function () {
  'use strict';
  const { h } = Bench;

  const LABEL = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP', untested: '—' };

  function asText(meta, tests) {
    const res = Bench.results.all();
    const line = (k, v) => `${k.padEnd(13, ' ')}: ${v}`;
    const out = [];
    out.push('BENCH · HARDWARE TEST SHEET');
    out.push('='.repeat(48));
    out.push(line('Unit', meta.unit || '—'));
    out.push(line('Serial / tag', meta.serial || '—'));
    out.push(line('Tested by', meta.by || '—'));
    out.push(line('Date', new Date().toLocaleString()));
    out.push('');
    out.push('RESULTS');
    out.push('-'.repeat(48));
    const counts = { pass: 0, fail: 0, skip: 0, untested: 0 };
    tests.forEach((t) => {
      const r = res[t.id] || {};
      const st = r.status || 'untested';
      counts[st]++;
      const name = `${t.num} ${t.title} `.padEnd(30, '.');
      out.push(`${name} ${LABEL[st].padEnd(5, ' ')}${r.note ? '  ' + r.note : ''}`);
    });
    out.push('');
    out.push(`${counts.pass} pass · ${counts.fail} fail · ${counts.skip} skipped · ${counts.untested} not tested`);
    out.push('');
    out.push('DEVICE (as reported by the browser)');
    out.push('-'.repeat(48));
    (Bench.deviceSummary ? Bench.deviceSummary() : []).forEach(([k, v]) => out.push(line(k, v)));
    if (meta.notes) {
      out.push('');
      out.push('NOTES');
      out.push('-'.repeat(48));
      out.push(meta.notes);
    }
    return out.join('\n');
  }

  Bench.register({
    id: 'report',
    num: '10',
    title: 'Test sheet',
    verdict: false,
    blurb: 'Every verdict and note from the tests, on one page. Print it, save it as text, or paste it into a ticket or a sale listing.',

    mount(root, s) {
      const tests = Bench.modules.filter((m) => m.verdict !== false).sort((a, b) => a.num.localeCompare(b.num));
      const meta = Object.assign({ unit: '', serial: '', by: '', notes: '' }, Bench.store.get('sheet', {}));
      const saveMeta = () => Bench.store.set('sheet', meta);

      const field = (key, label, ph) => {
        const inp = h('input', { type: 'text', value: meta[key], placeholder: ph });
        inp.addEventListener('input', () => {
          meta[key] = inp.value;
          saveMeta();
        });
        return h('label', { class: 'field' }, label, inp);
      };

      const stamp = h('div', { class: 'stamp' });
      const tbody = h('tbody');
      const sum = h('p', { class: 'sheet-sum' });
      const devList = Bench.readout((Bench.deviceSummary ? Bench.deviceSummary() : []).map(([k], i) => ['d' + i, k]));
      (Bench.deviceSummary ? Bench.deviceSummary() : []).forEach(([, v], i) => devList.set('d' + i, v));

      const notes = h('textarea', { rows: 3, placeholder: 'Anything else: cosmetic damage, missing charger, battery cycle count…', style: 'width:100%;resize:vertical' });
      notes.value = meta.notes;
      notes.addEventListener('input', () => {
        meta.notes = notes.value;
        saveMeta();
      });

      function row(t) {
        const r = Bench.results.get(t.id);
        const seg = h('div', { class: 'seg' });
        [['pass', 'Pass'], ['fail', 'Fail'], ['skip', 'Skip']].forEach(([st, label]) => {
          const b = h('button', { type: 'button', 'data-s': st, class: r.status === st ? 'on' : '' }, label);
          b.addEventListener('click', () => {
            const cur = Bench.results.get(t.id).status;
            Bench.results.set(t.id, { status: cur === st ? 'untested' : st });
          });
          seg.append(b);
        });
        const note = h('input', { type: 'text', value: r.note || '', placeholder: '—', 'aria-label': t.title + ' notes' });
        let tm;
        note.addEventListener('input', () => {
          clearTimeout(tm);
          tm = setTimeout(() => Bench.results.set(t.id, { note: note.value }), 300);
        });
        return h('tr', { 'data-id': t.id },
          h('td', { class: 'n' }, t.num),
          h('td', { class: 'name' }, h('a', { href: '#' + t.id }, t.title)),
          h('td', { class: 'st' }, seg),
          h('td', { class: 'nt' }, note));
      }

      function paint() {
        // don't rebuild while someone is typing a note in the table
        const focused = document.activeElement && tbody.contains(document.activeElement);
        if (!focused) {
          tbody.textContent = '';
          tests.forEach((t) => tbody.append(row(t)));
        } else {
          tbody.querySelectorAll('tr').forEach((tr) => {
            const st = Bench.results.get(tr.dataset.id).status;
            tr.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.s === st));
          });
        }
        const res = Bench.results.all();
        const c = { pass: 0, fail: 0, skip: 0, untested: 0 };
        tests.forEach((t) => c[(res[t.id] && res[t.id].status) || 'untested']++);
        sum.textContent = `${c.pass} pass · ${c.fail} fail · ${c.skip} skipped · ${c.untested} not tested`;
        if (c.fail) {
          stamp.textContent = 'Faults found';
          stamp.className = 'stamp fail';
        } else if (!c.untested && c.pass) {
          stamp.textContent = 'All clear';
          stamp.className = 'stamp pass';
        } else {
          stamp.textContent = 'In progress';
          stamp.className = 'stamp';
        }
      }
      s.on(document, 'bench:results', paint);

      const copy = async () => {
        const txt = asText(meta, tests);
        try {
          await navigator.clipboard.writeText(txt);
          Bench.toast('Copied as plain text.');
        } catch (e) {
          // clipboard API blocked (file://, old Safari): fall back to a hidden textarea
          const ta = h('textarea', { style: 'position:fixed;opacity:0' });
          ta.value = txt;
          document.body.append(ta);
          ta.select();
          const ok = document.execCommand && document.execCommand('copy');
          ta.remove();
          Bench.toast(ok ? 'Copied as plain text.' : 'Couldn\'t reach the clipboard. Use Download instead.');
        }
      };
      const download = () => {
        const name = (meta.unit || 'device').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'device';
        Bench.download(`bench-${name}-${new Date().toISOString().slice(0, 10)}.txt`, asText(meta, tests));
      };
      const wipe = () => {
        if (!confirm('Clear every verdict and note? Unit details stay.')) return;
        Bench.results.clear();
      };

      root.append(
        h('div', { class: 'row no-print', style: 'margin-bottom:22px' },
          h('button', { class: 'btn primary', type: 'button', onclick: copy }, 'Copy as text'),
          h('button', { class: 'btn', type: 'button', onclick: download }, 'Download .txt'),
          h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Print'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn ghost small', type: 'button', onclick: wipe }, 'Clear results')),
        h('div', { class: 'sheet' },
          h('div', { class: 'sheet-head' },
            h('div', null,
              h('h2', null, 'Hardware test sheet'),
              h('div', { class: 'dim mono', style: 'font-size:12px;margin-top:4px' }, new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))),
            stamp),
          h('div', { class: 'sheet-fields' },
            field('unit', 'Unit / model', 'e.g. ThinkPad T14 Gen 3'),
            field('serial', 'Serial / asset tag', 'e.g. PF-3K2M9X'),
            field('by', 'Tested by', 'your name'),
            h('div', { class: 'field' }, 'Device', h('span', { class: 'mono', style: 'text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink);padding:5px 0' }, (Bench.deviceSummary ? Bench.deviceSummary()[1][1] + ' on ' + Bench.deviceSummary()[0][1] : '')))),
          h('table', { class: 'sheet-table' },
            h('thead', null, h('tr', null, h('th', null, '#'), h('th', null, 'Test'), h('th', null, 'Result'), h('th', null, 'Notes'))),
            tbody),
          sum,
          h('div', { style: 'margin-top:26px' }, h('div', { class: 'field', style: 'margin-bottom:8px' }, 'As reported by the browser'), devList.el),
          h('div', { style: 'margin-top:22px' }, h('label', { class: 'field' }, 'Other notes', notes)),
          h('div', { class: 'sheet-sig' }, h('div', null, 'Signature'), h('div', null, 'Date'))));

      paint();
    },
  });
})();
