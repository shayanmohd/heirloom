/* Three things this app has to get right that the DOM will happily lie about.

   1. Real WCAG contrast, measured, on every screen and every state. Cards, buttons and the big
      record button are painted with gradients, so the effective ground is worked out from the
      gradient stops rather than from backgroundColor, which is transparent on all of them.
   2. The search box sits above both archive modes, so it has to filter threads as well.
   3. The weekly reminder in a country that puts its clocks back. Twelve weeks from now crosses
      the end of British summer time, and every one of them still has to land at the ritual hour. */
const { v100Record, seed, setVal, visible } = require('./lib');

/* WCAG 2.1 relative luminance and contrast ratio. */
const MEASURE = `(() => {
  const parse = c => { const m = (c || '').match(/[\\d.]+/g); if (!m || m.length < 3) return null;
                       return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1]; };
  const grads = img => {
    if (!img || img === 'none' || img.indexOf('gradient') < 0) return null;
    const cols = (img.match(/rgba?\\([^)]+\\)/g) || []).map(parse).filter(c => c && c[3] > 0.5);
    if (!cols.length) return null;
    const n = cols.length;
    return [cols.reduce((a, c) => a + c[0], 0) / n, cols.reduce((a, c) => a + c[1], 0) / n,
            cols.reduce((a, c) => a + c[2], 0) / n, 1];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])).concat([1]);
  const ground = el => {
    let n = el, acc = null;
    while (n) {
      const s = getComputedStyle(n);
      const g = grads(s.backgroundImage);
      const c = parse(s.backgroundColor);
      const layer = g || (c && c[3] > 0.01 ? c : null);
      if (layer) { acc = acc ? over(acc, layer) : layer; if (acc[3] >= 0.99) return acc; }
      n = n.parentElement;
    }
    return acc || [255, 255, 255, 1];
  };
  const lum = c => { const f = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
                     return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

  const out = [];
  for (const el of document.querySelectorAll('*')) {
    if (el.closest('[hidden]')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.5) continue;
    /* Only elements that paint text of their own. */
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
    const ph = /^(INPUT|TEXTAREA)$/.test(el.tagName) && el.placeholder;
    if (!own && !ph) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight * 3) continue;
    const col = parse(ph && !el.value ? (getComputedStyle(el, '::placeholder').color || s.color) : s.color);
    if (!col) continue;
    const bg = ground(el);
    const fg = col[3] < 0.99 ? over(col, bg) : col;
    const px = parseFloat(s.fontSize), bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = px >= 24 || (bold && px >= 18.66);
    const need = large ? 3 : 4.5;
    const got = ratio(fg, bg);
    if (got < need) out.push({ what: el.tagName + '.' + (el.className || el.id || '').toString().slice(0, 24),
                               text: (el.textContent || el.placeholder || '').trim().slice(0, 32),
                               px: Math.round(px), need, got: Math.round(got * 100) / 100,
                               fg: s.color, bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')' });
  }
  return out;
})()`;

module.exports = async ({ page, shot, wait, click, text, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const measure = async label => {
    const bad = await page.evaluate(MEASURE);
    if (bad.length) log(label, 'BELOW AA:', bad.map(b => b.what + ' "' + b.text + '" ' + b.got + ' < ' + b.need + ' (' + b.fg + ' on ' + b.bg + ')').join(' ; '));
    check(!bad.length, label + ': every label clears AA');
  };

  await seed(page, v100Record(), { native: true, audio: ['s_1'] });
  await wait(500);
  await measure('archive'); await shot('11-archive');
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(300); await measure('threads');
  await click('.tab[data-view="ask"]'); await wait(300); await measure('ask');
  await click('.tab[data-view="family"]'); await wait(300); await measure('family');
  await click('.tab[data-view="keepsake"]'); await wait(300); await measure('keepsake');
  await page.evaluate(() => App.setView('archive'));
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(600); await measure('story sheet');
  await page.evaluate(() => { document.querySelector('.sheet-panel').scrollTop = 99999; }); await wait(200);
  await measure('story sheet, scrolled');
  await page.evaluate(() => App.closeSheet(true)); await wait(300);
  await page.evaluate(() => App.openElder('t_arthur')); await wait(400);
  await measure('elder home'); await shot('11-elder');
  await click('#elderRec'); await wait(1600); await measure('recording'); await shot('11-recording');
  await click('#recPause'); await wait(400); await measure('paused');
  await click('#recDone'); await wait(1800); await measure('kept'); await shot('11-kept');
  await page.evaluate(() => App.openElder('t_sarla')); await wait(400); await measure('consent'); await shot('11-consent');
  await page.evaluate(() => App.setView('family')); await wait(300);
  await page.evaluate(() => App.toast('Saved to Downloads.')); await wait(200); await measure('toast');
  await seed(page, null, { native: true }); await wait(400);
  await measure('onboarding'); await shot('11-onboard');
  for (let i = 0; i < 3; i++) { await click('#obNext'); await wait(360); }
  await click('#obNext'); await wait(300);
  await measure('onboarding form with an error'); await shot('11-onboard-err');

  /* ---- the search box means something in Threads too ---------------------- */
  await seed(page, v100Record(), { native: true }); await wait(400);
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(250);
  const allThreads = await page.evaluate(() => document.querySelectorAll('.thread').length);
  check(allThreads > 3, 'threads are listed to start with: ' + allThreads);
  await setVal(page, '#archSearch', 'nesta'); await wait(300);
  const narrowed = await page.evaluate(() => Array.from(document.querySelectorAll('.thread .tl')).map(e => e.textContent));
  check(narrowed.length && narrowed.length < allThreads, 'searching narrows the threads: ' + JSON.stringify(narrowed));
  check(narrowed.some(l => /nesta/i.test(l)), 'and keeps the thread that matches: ' + JSON.stringify(narrowed));
  await shot('11-threads-search');
  await setVal(page, '#archSearch', 'zzzzz'); await wait(300);
  check(/No threads match/.test(await text('#archList')), 'a search that matches nothing says so');
  await shot('11-threads-none');
  await setVal(page, '#archSearch', 'cardiff'); await wait(300);
  const byStory = await page.evaluate(() => Array.from(document.querySelectorAll('.thread .tl')).map(e => e.textContent));
  check(byStory.length >= 1, 'a place tag is found through the search: ' + JSON.stringify(byStory));

  /* ---- reminders in a country that puts its clocks back -------------------- */
  await page.emulateTimezone('Europe/London');
  await seed(page, v100Record(), { native: true }); await wait(500);
  const plan = await page.evaluate(() => { App.onResume(); return window.__native.scheduled; });
  check(Array.isArray(plan) && plan.length === 12, 'twelve reminders in London: ' + (plan && plan.length));
  const wrong = await page.evaluate(p => p.filter(o => {
    const d = new Date(o.at); return d.getDay() !== 0 || d.getHours() !== 15 || d.getMinutes() !== 0;
  }).map(o => new Date(o.at).toString().slice(0, 24)), plan);
  check(!wrong.length, 'every one still lands at three on a Sunday when the clocks go back: ' + wrong.join(' ; '));
  log('London plan:', plan.slice(0, 2).concat(plan.slice(-2)).map(o => new Date(o.at).toISOString()).join(' | '));
  await page.emulateTimezone('Asia/Calcutta');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
  log('11 clean');
};
