/* Every screen with a 48px status bar and a 34px navigation bar. Nothing may sit under either. */
const { seed, assert, visible, v100Record } = require('./lib');
module.exports = async ({ page, shot, wait, click, text, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const SAT = 48, SAB = 34, H = 844;
  await seed(page, v100Record(), { native: true, insets: [SAT, SAB], audio: ['s_1'] });
  await wait(600);

  /* Any element with visible content inside a fixed or absolute layer whose box crosses into a
     bar is a failure. Scrolled content passes behind nothing here: the app has no fixed top bar,
     so the scroller's own padding is what keeps the first line clear of the status bar. */
  const probe = async (label) => {
    const bad = await page.evaluate((SAT, SAB, H) => {
      const out = [];
      const vis = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05; };
      for (const el of document.querySelectorAll('button, input, textarea, select, h1, h2, p, b, i, span, canvas, label, li')) {
        if (!vis(el) || el.closest('[hidden]')) continue;
        if (!(el.innerText || '').trim() && !/CANVAS|INPUT|BUTTON|SELECT/.test(el.tagName)) continue;
        const r = el.getBoundingClientRect();
        if (r.height < 4 || r.width < 4) continue;
        let top = r.top, bottom = r.bottom, n = el.parentElement;
        while (n && n !== document.body) {
          const o = getComputedStyle(n).overflowY;
          /* Clip to the padding box, which is where overflow actually cuts, not the border box. */
          if (o === 'auto' || o === 'scroll' || o === 'hidden') {
            const c = n.getBoundingClientRect();
            top = Math.max(top, c.top + n.clientTop);
            bottom = Math.min(bottom, c.top + n.clientTop + n.clientHeight);
          }
          n = n.parentElement;
        }
        if (bottom - top < 2) continue;
        const name = el.tagName + ' "' + (el.innerText || el.id || el.className || '').toString().slice(0, 28).replace(/\n/g, ' ') + '"';
        if (top < SAT - 1 && bottom > 0) out.push('top: ' + name + ' at ' + Math.round(top));
        if (bottom > H - SAB + 1 && top < H) out.push('bottom: ' + name + ' at ' + Math.round(bottom));
      }
      return out;
    }, SAT, SAB, H);
    if (bad.length) log(label, 'UNDER A BAR:', bad.join(' ; '));
    check(!bad.length, label + ': nothing under the bars');
  };

  await shot('07-archive'); await probe('archive');
  await click('.tab[data-view="ask"]'); await wait(200); await shot('07-ask'); await probe('ask');
  await click('.tab[data-view="family"]'); await wait(200); await shot('07-family'); await probe('family');
  await click('.tab[data-view="keepsake"]'); await wait(200); await shot('07-keepsake'); await probe('keepsake');
  await page.evaluate(() => App.setView('archive'));
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(500); await shot('07-story'); await probe('story sheet');
  await page.evaluate(() => { document.querySelector('.sheet-panel').scrollTop = 99999; }); await wait(200); await shot('07-story-bottom'); await probe('story sheet bottom');
  await page.evaluate(() => App.closeSheet(true));
  await page.evaluate(() => App.openSheet('confirm', { title: 'Delete this story?', yes: 'Delete it', body: 'A short one.' })); await wait(200); await shot('07-confirm'); await probe('confirm');
  await page.evaluate(() => App.closeSheet(true));
  await page.evaluate(() => App.openElder('t_sarla')); await wait(200); await shot('07-consent'); await probe('consent');
  await page.evaluate(() => App.openElder('t_arthur')); await wait(200); await shot('07-elder'); await probe('elder home');
  await click('#elderRec'); await wait(1500); await shot('07-recording'); await probe('recording');
  await click('#recDone'); await wait(1200); await shot('07-kept'); await probe('kept');
  await page.evaluate(() => { App.toast('A toast sits above the bar.'); }); await wait(100); await shot('07-toast'); await probe('toast');
  await seed(page, null, { native: true, insets: [SAT, SAB] }); await wait(300);
  await shot('07-onboard'); await probe('onboarding');
  for (let i = 0; i < 3; i++) { await click('#obNext'); await wait(360); }
  await wait(200); await shot('07-onboard-form'); await probe('onboarding form');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
