(() => {
  'use strict';
  const API = 'https://open.er-api.com/v6/latest/AED'; // free, no key, CORS-enabled
  const $ = id => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('aedphp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('aedphp.' + k, JSON.stringify(v)); } catch {} }
  };

  const S = { expr: '', dir: ls.get('dir', 'AED'), live: ls.get('rate', null), ts: ls.get('ts', null),
    ov: ls.get('ov', ''), fee: ls.get('fee', ''), hist: ls.get('hist', []), online: null, edit: null, toast: false, conv: null };
  const OPS = '+−×÷';
  const isOp = c => OPS.includes(c);
  const fmt = (n, max) => new Intl.NumberFormat('en-US', { maximumFractionDigits: max, minimumFractionDigits: 0 }).format(n);

  function evaluate(expr) {
    let e = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/[+\-*/.]+$/, '');
    if (!e) return 0;
    if (!/^[\d.+\-*/]+$/.test(e)) return NaN;
    try { const v = Function('"use strict";return (' + e + ')')(); return Number.isFinite(v) ? v : NaN; }
    catch { return NaN; }
  }

  const phpPerAed = () => { const o = parseFloat(S.ov); return o > 0 ? o : S.live; };
  const feeAed = () => (S.dir === 'AED' && parseFloat(S.fee) > 0) ? parseFloat(S.fee) : 0;

  function ago(ts) {
    const m = Math.floor((Date.now() - ts) / 6e4);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    return h < 48 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
  }

  // Edit rate/fee using the app's own keypad (no native keyboard)
  function editKey(k) {
    let v = S[S.edit];
    if (/\d/.test(k)) v += k;
    else if (k === '.') { if (!v.includes('.')) v += v ? '.' : '0.'; }
    else if (k === '⌫') v = v.slice(0, -1);
    else if (k === 'C') v = '';
    else if (k === '=') return closeSheet();
    else return;
    S[S.edit] = v; ls.set(S.edit, v); render();
  }

  function percent() {
    const m = S.expr.match(/^(.*?)(\d+\.?\d*)$/);
    if (!m) return;
    const pre = m[1], n = parseFloat(m[2]);
    let val = n / 100;
    if (/[+−]$/.test(pre)) { const base = evaluate(pre.slice(0, -1)); if (!isNaN(base)) val = base * n / 100; }
    S.expr = pre + String(+val.toFixed(8));
  }

  function press(k) {
    if (S.edit) return editKey(k);
    const tok = S.expr.split(/[+−×÷]/).pop();
    const last = S.expr.slice(-1);
    if (/\d/.test(k)) {
      S.expr = tok === '0' ? S.expr.slice(0, -1) + k : S.expr + k;
    } else if (k === '.') {
      if (tok.includes('.')) return;
      S.expr += tok === '' ? '0.' : '.';
    } else if (isOp(k)) {
      if (!S.expr) return;
      S.expr = isOp(last) ? S.expr.slice(0, -1) + k : S.expr + k;
    } else if (k === '%') {
      percent();
    } else if (k === 'C') {
      S.expr = '';
    } else if (k === '⌫') {
      S.expr = S.expr.slice(0, -1);
    } else if (k === '=') {
      const v = evaluate(S.expr);
      if (S.expr && !isNaN(v)) {
        if (/[+−×÷%]/.test(S.expr)) {
          render(); // refresh S.conv for this expression
          S.hist.unshift({ e: S.expr, r: +v.toFixed(8), c: $('convTotal').textContent, cur: $('convCur').textContent, t: Date.now() });
          S.hist = S.hist.slice(0, 10); ls.set('hist', S.hist);
        }
        S.expr = String(+v.toFixed(8)).replace('-', '−');
      }
    }
    render();
  }

  function render() {
    const from = S.dir, to = from === 'AED' ? 'PHP' : 'AED';
    const total = evaluate(S.expr);
    const r = phpPerAed();
    const rate = r ? (from === 'AED' ? r : 1 / r) : null;
    const fee = feeAed();
    const net = isNaN(total) ? NaN : (fee ? Math.max(0, total - fee) : total);

    $('fromLbl').textContent = from; $('toLbl').textContent = to;
    $('baseCur').textContent = from; $('convCur').textContent = to;
    $('expr').textContent = S.expr || '0';
    $('baseTotal').textContent = isNaN(total) ? '—' : fmt(total, 4);
    S.conv = isNaN(net) || !rate ? null : +(net * rate).toFixed(2);
    const cv = $('convTotal');
    cv.textContent = S.conv === null ? '—' : fmt(S.conv, 2);
    const len = cv.textContent.length;
    cv.style.fontSize = len > 14 ? '26px' : len > 11 ? '32px' : len > 8 ? '40px' : '';

    const st = $('status'); st.className = 'status';
    if (S.toast) { st.textContent = 'Copied ' + cv.textContent; st.classList.add('ok'); }
    else if (!rate) st.textContent = S.online === false ? 'No rate cached — connect once' : 'Loading rate…';
    else {
      const manual = parseFloat(S.ov) > 0;
      let t = `${manual ? 'Manual' : (S.online ? 'Live' : 'Cached')} · 1 ${from} = ${fmt(rate, 4)} ${to}`;
      if (!manual && S.ts) { t += ' · ' + ago(S.ts); if (Date.now() - S.ts > 864e5) st.classList.add('stale'); }
      if (fee) t += ` · −${fmt(fee, 2)} AED fee`;
      st.textContent = t + '  ✎';
    }

    $('sheet').hidden = !S.edit;
    $('fRate').textContent = S.ov || 'auto' + (S.live ? ' (' + fmt(S.live, 4) + ')' : '');
    $('fFee').textContent = S.fee || '0';
    document.querySelectorAll('.fld').forEach(b => b.classList.toggle('on', b.dataset.f === S.edit));
  }

  function openSheet(f) { $('hist').hidden = true; S.edit = f || 'ov'; render(); }
  function closeSheet() { S.edit = null; render(); }

  function renderHist() {
    const box = $('histList'); box.textContent = '';
    if (!S.hist.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = 'Press = to save a calculation here.'; box.appendChild(d); return; }
    S.hist.forEach(h => {
      const b = document.createElement('button'); b.className = 'h';
      const l = document.createElement('span'); l.textContent = h.e + ' = ' + fmt(h.r, 4);
      const s = document.createElement('small'); s.textContent = new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      l.appendChild(s);
      const c = document.createElement('b'); c.textContent = h.c + ' ' + h.cur;
      b.append(l, c);
      b.onclick = () => { S.expr = String(h.r).replace('-', '−'); $('hist').hidden = true; render(); };
      box.appendChild(b);
    });
  }

  async function copyTotal() {
    if (S.conv === null) return;
    const text = String(S.conv);
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
    S.toast = true; render(); setTimeout(() => { S.toast = false; render(); }, 1200);
  }

  async function fetchRate() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const d = await res.json();
      if (d.result !== 'success' || !d.rates || !d.rates.PHP) throw new Error('bad data');
      S.live = d.rates.PHP; S.ts = Date.now(); S.online = true;
      ls.set('rate', S.live); ls.set('ts', S.ts);
    } catch { S.online = false; }
    render();
  }

  $('pad').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { press(b.dataset.k); navigator.vibrate && navigator.vibrate(8); } });
  $('swap').addEventListener('click', () => { S.dir = S.dir === 'AED' ? 'PHP' : 'AED'; ls.set('dir', S.dir); render(); });
  $('status').addEventListener('click', () => openSheet('ov'));
  $('copy').addEventListener('click', copyTotal);
  $('sheet').addEventListener('click', e => { const f = e.target.closest('.fld'); if (f) { S.edit = f.dataset.f; render(); } });
  $('done').addEventListener('click', closeSheet);
  $('auto').addEventListener('click', () => { S.ov = ''; ls.set('ov', ''); S.edit = 'ov'; render(); fetchRate(); });
  $('histBtn').addEventListener('click', () => { S.edit = null; renderHist(); $('hist').hidden = !$('hist').hidden; render(); });
  $('clearHist').addEventListener('click', () => { S.hist = []; ls.set('hist', []); renderHist(); });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey) return;
    const m = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '⌫', Escape: 'C', ',': '.' };
    const k = m[e.key] || e.key;
    if (/^[\d.+=%]$|^[−×÷⌫C]$/.test(k)) { e.preventDefault(); press(k); }
  });

  window.addEventListener('online', fetchRate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if (!S.ts || Date.now() - S.ts > 36e5) fetchRate(); } });

  render();
  fetchRate();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
