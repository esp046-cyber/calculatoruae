(() => {
  'use strict';
  const API = 'https://open.er-api.com/v6/latest/AED'; // free, no key, CORS-enabled
  const $ = id => document.getElementById(id);
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('aedphp.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('aedphp.' + k, JSON.stringify(v)); } catch {} }
  };

  const S = { expr: '', dir: ls.get('dir', 'AED'), live: ls.get('rate', null), ts: ls.get('ts', null), ov: ls.get('ov', ''), online: null };
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

  // PHP per 1 AED (override wins)
  const phpPerAed = () => { const o = parseFloat(S.ov); return o > 0 ? o : S.live; };

  function press(k) {
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
    } else if (k === 'C') {
      S.expr = '';
    } else if (k === '⌫') {
      S.expr = S.expr.slice(0, -1);
    } else if (k === '=') {
      const v = evaluate(S.expr);
      if (S.expr && !isNaN(v)) S.expr = String(+v.toFixed(8)).replace('-', '−');
    }
    render();
  }

  function render() {
    const from = S.dir, to = from === 'AED' ? 'PHP' : 'AED';
    const total = evaluate(S.expr);
    const r = phpPerAed();
    const rate = r ? (from === 'AED' ? r : 1 / r) : null;

    $('fromLbl').textContent = from; $('toLbl').textContent = to;
    $('baseCur').textContent = from; $('convCur').textContent = to;
    $('expr').textContent = S.expr || '0';
    $('baseTotal').textContent = isNaN(total) ? '—' : fmt(total, 4);
    $('convTotal').textContent = isNaN(total) || !rate ? '—' : fmt(total * rate, 2);

    let st;
    if (!rate) st = S.online === false ? 'No rate cached — connect once' : 'Loading rate…';
    else {
      const manual = parseFloat(S.ov) > 0;
      const src = manual ? 'Manual' : (S.online ? 'Live' : 'Cached');
      const t = !manual && S.ts ? ' · ' + new Date(S.ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '';
      st = `${src} · 1 ${from} = ${fmt(rate, 4)} ${to}${t}`;
    }
    $('status').textContent = st;
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
  $('ov').value = S.ov;
  $('ov').addEventListener('input', e => { S.ov = e.target.value.replace(',', '.'); ls.set('ov', S.ov); render(); });

  document.addEventListener('keydown', e => {
    if (e.target.id === 'ov' || e.ctrlKey || e.metaKey) return;
    const m = { '*': '×', '/': '÷', '-': '−', Enter: '=', Backspace: '⌫', Escape: 'C', ',': '.' };
    const k = m[e.key] || e.key;
    if (/^[\d.+=]$|^[−×÷⌫C]$/.test(k)) { e.preventDefault(); press(k); }
  });

  window.addEventListener('online', fetchRate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!S.ts || Date.now() - S.ts > 36e5)) fetchRate(); });

  render();
  fetchRate();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }
})();
