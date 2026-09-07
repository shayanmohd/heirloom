/* Reviewer pass 3: the Back gesture on every nested screen, and the two lifecycle hooks.
   window.App.back() must return true wherever the app consumed the press and false only at
   the root, and onPause/onResume must stop what is running without throwing. */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = L.assert;
  const back = () => page.evaluate(() => window.App.back());
  const pause = () => page.evaluate(() => window.App.onPause());
  const resume = () => page.evaluate(() => window.App.onResume());

  /* --------------------------------------------------- during onboarding */
  await L.clearAudio(page);
  await L.seed(page, null, { native: true });
  await wait(400);
  assert(await back() === false, 'back on the first onboarding card is the root');
  await click('#obNext'); await wait(300);
  assert(await back() === true, 'back steps a card of the explanation');
  await wait(200);
  assert(await page.$eval('.ob-step[data-step="0"]', e => !e.hidden), 'and it really went back one');
  assert(await back() === false, 'back on the first card again is the root');
  await pause(); await resume(); await wait(200);
  assert(errors.length === 0, 'the lifecycle hooks do not throw during onboarding');

  /* ------------------------------------------------- the four root views */
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_5'] });
  await wait(500);
  assert(await back() === false, 'back on the archive is the root');
  for (const v of ['ask', 'family', 'keepsake']) {
    await click('.tab[data-view="' + v + '"]'); await wait(360);
    assert(await back() === true, 'back leaves ' + v);
    await wait(300);
    assert(await L.visible(page, '#v-archive'), 'back from ' + v + ' lands on the archive');
    assert(await back() === false, 'and then it is the root');
  }

  /* ------------------------------------------------------- sheets, stacked */
  await click('.story'); await wait(460);
  assert(await back() === true, 'back closes the story sheet');
  await wait(300);
  assert(await page.$eval('#sheet', e => e.hidden), 'the sheet is really shut');

  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="swap"]'); await wait(420);
  await click('#sheetBody .packrow'); await wait(420);
  assert((await page.$$('.promptrow')).length > 20, 'a pack sheet is stacked on the swap sheet');
  assert(await back() === true, 'back pops the pack sheet');
  await wait(320);
  assert(!(await page.$eval('#sheet', e => e.hidden)), 'the swap sheet underneath is still open');
  assert((await text('#sheetBody')).toLowerCase().indexOf('a different question') >= 0, 'and it is the swap sheet');
  assert(await back() === true, 'back pops the swap sheet');
  await wait(320);
  assert(await page.$eval('#sheet', e => e.hidden), 'both sheets are shut');
  assert(await back() === true, 'back leaves Ask for the archive');
  await wait(300);
  assert(await back() === false, 'root again');

  /* ---------------------------------------------------------- elder mode */
  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  assert(await L.visible(page, '#elderHome'), 'elder home for a teller who has consented');
  assert(await back() === true, 'back in elder mode asks before leaving');
  await wait(320);
  assert(!(await page.$eval('#sheet', e => e.hidden)), 'it is a question, not an exit');
  assert(await back() === true, 'back dismisses that question');
  await wait(320);
  assert(await L.visible(page, '#elder'), 'and stays in elder mode');
  await shot('r03-elder-back');

  /* the confirmation actually leaves */
  assert(await back() === true, 'ask again');
  await wait(320);
  await click('[data-act="confirmyes"]'); await wait(460);
  assert(!(await L.visible(page, '#elder')), 'confirming leaves elder mode');

  /* ---------------------------------------------- elder mode, mid recording */
  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  await click('#elderRec'); await wait(2600);
  assert(await L.visible(page, '#elderRecording'), 'recording');
  assert(await page.evaluate(() => Recorder.getState()) === 'recording', 'the recorder is running');

  /* onPause must pause it rather than lose it */
  await pause(); await wait(400);
  assert(await page.evaluate(() => Recorder.getState()) === 'paused', 'onPause pauses the recording');
  const t = await text('#recTime');
  await wait(800);
  assert(await text('#recTime') === t, 'the clock is stopped while the app is away');
  await resume(); await wait(300);
  assert(await page.evaluate(() => Recorder.getState()) === 'paused', 'onResume does not silently restart it');
  assert((await text('#recState')).toLowerCase().indexOf('paused') >= 0, 'and the screen says paused');
  await shot('r03-paused');

  await click('#recPause'); await wait(900);
  assert(await back() === true, 'back during a recording asks before throwing it away');
  await wait(320);
  assert((await text('#sheetBody')).toLowerCase().indexOf('throw this recording away') >= 0, 'it asks the right question');
  await click('[data-act="confirmyes"]'); await wait(700);
  assert(await page.evaluate(() => Recorder.getState()) === 'idle', 'the recorder is stopped');
  assert(await L.visible(page, '#elderHome'), 'and we are back on the elder home');
  const n0 = await page.evaluate(() => Store.stories().length);
  assert(n0 === 5, 'nothing was kept, still ' + n0 + ' stories');

  /* --------------------------------- onPause stops playback, onResume redraws */
  await page.evaluate(() => window.App.setView('archive')); await wait(400);
  await click('.story[data-id="s_5"]'); await wait(460);
  await click('#playBtn'); await wait(1500);
  assert(await page.evaluate(() => window.App.playing()), 'it plays');
  await pause(); await wait(300);
  assert(!(await page.evaluate(() => window.App.playing())), 'onPause stops the audio');
  await resume(); await wait(300);
  assert(!(await page.evaluate(() => window.App.playing())), 'onResume does not start it again by itself');

  /* onResume redraws: a teller whose rest has expired while the app was away */
  await page.evaluate(() => window.App.closeSheet(true)); await wait(300);
  await page.evaluate(() => { window.App.setView('ask'); });
  await wait(400);
  await page.evaluate(() => {
    const t = Store.teller('t_arthur');
    Store.updateTeller('t_arthur', { answeredAt: Date.now() });
  });
  await resume(); await wait(400);
  const restedText = await text('#askList');
  assert(restedText.toLowerCase().indexOf('answered this week') >= 0, 'onResume redrew the ask card: ' + restedText.slice(0, 80));
  await page.evaluate(() => Store.updateTeller('t_arthur', { answeredAt: null }));
  await resume(); await wait(400);
  const freshText = await text('#askList');
  assert(freshText.toLowerCase().indexOf('answered this week') < 0, 'and redraws it back when the week turns over');
  await shot('r03-resume');

  /* the notification plan is recomputed on every resume */
  await page.evaluate(() => { window.__native.scheduled = null; });
  await resume(); await wait(300);
  const sched = await page.evaluate(() => window.__native.scheduled);
  assert(Array.isArray(sched) && sched.length > 0, 'onResume re-sends the plan');

  log('page errors: ' + errors.length);
};
