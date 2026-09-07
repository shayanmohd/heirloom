/* Reviewer pass 4: safe areas. --sat 48px, --sab 34px on :root, every screen.
   A scrolling list is allowed to pass behind the bars while it is being dragged, which is
   what an edge to edge app does; what is not allowed is content that can never be got clear
   of them. So each screen is measured twice: once with every scroller wound to the top, when
   nothing may be inside the status bar, and once wound to the bottom, when nothing may be
   inside the navigation bar. Each element is clipped to its scroll containers first, so a
   card whose bottom half is hidden under the tab bar's own scroll box does not count.  */
const L = require('./lib.js');

const SAT = 48, SAB = 34;

const PROBE = `((edge) => {
  const SAT = ${SAT}, SAB = ${SAB};
  const H = innerHeight;
  const bad = [];
  const tappable = e => /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
  const own = e => { let s = ''; for (const n of e.childNodes) if (n.nodeType === 3) s += n.nodeValue; return s.trim(); };
  /* the box a container actually paints its children into: inside its own borders */
  const inner = e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return { top: r.top + parseFloat(cs.borderTopWidth), bottom: r.bottom - parseFloat(cs.borderBottomWidth) };
  };
  for (const e of document.querySelectorAll('body *')) {
    if (e.closest('[hidden]')) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (!own(e) && !tappable(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    let top = r.top, bottom = r.bottom;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.overflowY === 'visible' && pc.overflowX === 'visible') continue;
      const b = inner(p);
      top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
    }
    if (bottom - top < 1) continue;                       /* clipped away entirely */
    const label = e.tagName + (e.id ? '#' + e.id : '') +
      (e.className && typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/)[0] : '');
    if (edge === 'top' && top < SAT - 0.5) bad.push([label, Math.round(top), Math.round(bottom)]);
    if (edge === 'bottom' && bottom > H - SAB + 0.5) bad.push([label, Math.round(top), Math.round(bottom)]);
  }
  return bad;
})`;

module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const assert = L.assert;
  const all = [];

  const scrollAll = to => page.evaluate(to => {
    for (const e of document.querySelectorAll('*')) {
      const cs = getComputedStyle(e);
      if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        e.scrollTop = to === 'top' ? 0 : e.scrollHeight;
      }
    }
  }, to);

  const check = async name => {
    await scrollAll('top'); await wait(220);
    const topBad = await page.evaluate(PROBE + '("top")');
    await shot('r04-' + name + '-top');
    await scrollAll('bottom'); await wait(220);
    const botBad = await page.evaluate(PROBE + '("bottom")');
    await shot('r04-' + name + '-bottom');
    if (topBad.length) { all.push(name + ' status bar: ' + JSON.stringify(topBad)); log('STATUS BAR ' + name + ' ' + JSON.stringify(topBad)); }
    if (botBad.length) { all.push(name + ' navigation bar: ' + JSON.stringify(botBad)); log('NAV BAR ' + name + ' ' + JSON.stringify(botBad)); }
    if (!topBad.length && !botBad.length) log(name + ' clear');
    await scrollAll('top'); await wait(150);
  };

  await L.clearAudio(page);
  await L.seed(page, null, { native: true, insets: [SAT, SAB] });
  await wait(400);
  const insets = await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--sat').trim(),
                                            getComputedStyle(document.documentElement).getPropertyValue('--sab').trim()]);
  assert(insets[0] === SAT + 'px' && insets[1] === SAB + 'px', 'the insets are set: ' + insets);

  await check('onboard-0');
  await click('#obNext'); await wait(300);
  await click('#obNext'); await wait(300);
  await click('#obNext'); await wait(340);
  await check('onboard-form');
  await page.$eval('#obName', e => { e.value = 'Arthur'; });
  await page.$eval('#obYear', e => { e.value = '1947'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('#obNext'); await wait(500);

  await L.seed(page, L.v100Record(), { native: true, insets: [SAT, SAB], audio: ['s_5'] });
  await wait(500);
  await check('archive');
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(320);
  await check('threads');
  await click('#archSeg .seg-b[data-mode="timeline"]'); await wait(320);

  await click('.story[data-id="s_1"]'); await wait(460);
  await check('story-sheet');
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  await click('.tab[data-view="ask"]'); await wait(360);
  await check('ask');
  await click('[data-act="askform"]'); await wait(420);
  await check('askform');
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  await click('.tab[data-view="family"]'); await wait(360);
  await check('family');
  await click('.tab[data-view="keepsake"]'); await wait(360);
  await check('keepsake');

  /* elder mode: fixed, no scrolling to hide behind */
  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="hand"][data-id="t_sarla"]'); await wait(460);
  await check('elder-consent');
  await click('#consentYes'); await wait(520);
  await check('elder-home');

  await page.evaluate(() => {
    Store.askQuestion('t_sarla', 'You told me once that the whole street came out when the first television arrived, and that you were the only one small enough to fit behind the sofa, so tell me about that evening from the beginning, and who was in the room.', 'p_zoe');
    Store.updateTeller('t_sarla', { current: null, answeredAt: null });
    window.App.openElder('t_sarla');
  });
  await wait(500);
  await check('elder-long-question');
  const room = await page.evaluate(() => {
    const b = document.querySelector('#elderRec').getBoundingClientRect();
    const s = document.querySelector('#elderSkip').getBoundingClientRect();
    const r = document.querySelector('#elderReact').getBoundingClientRect();
    const body = document.querySelector('#elderHome');
    return { recBottom: Math.round(b.bottom), skipTop: Math.round(s.top), reactTop: Math.round(r.top),
             reactBottom: Math.round(r.bottom), scrolls: body.scrollHeight > body.clientHeight + 1, h: innerHeight };
  });
  assert(room.recBottom <= room.reactTop + 1, 'the big button does not overlap the reaction line: ' + JSON.stringify(room));
  assert(room.reactBottom <= room.skipTop + 1, 'the reaction line does not run through the skip link: ' + JSON.stringify(room));

  await click('#elderRec'); await wait(2400);
  await check('elder-recording');
  await click('#recDone'); await wait(2600);
  await check('elder-done');

  /* the week already answered: the big button comes off and the rings stand in */
  await page.evaluate(() => {
    Store.updateTeller('t_arthur', { answeredAt: Date.now(), skippedAt: null });
    window.App.openElder('t_arthur');
  });
  await wait(520);
  assert(await page.$eval('#elderRest', e => !e.hidden), 'the rested elder screen draws its rings');
  await check('elder-rested');

  /* the toast, which floats over the tab bar */
  await page.evaluate(() => window.App.toast('Saved to Downloads as heirloom-archive.zip'));
  await wait(300);
  const toast = await page.evaluate(() => { const r = document.querySelector('#toast').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; });
  assert(toast[1] <= toast[2] - SAB, 'the toast clears the navigation bar: ' + JSON.stringify(toast));

  assert(all.length === 0, 'something sits under a bar:\n' + all.join('\n'));
  log('page errors: ' + errors.length);
};
