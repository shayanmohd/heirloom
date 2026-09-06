/* A thumb that taps twice. Nothing may stack a screen on top of itself, a second tap on a
   control that is still opening must not undo the first, and no button may claim a state
   the app is not actually in. */
const { v100Record, seed, doubleTap, raw } = require('./lib');

module.exports = async ({ page, shot, wait, click, log }) => {
  const fails = [];
  const check = (ok, what) => { if (!ok) fails.push(what); };
  const tap = sel => page.evaluate(s => document.querySelector(s).click(), sel);
  const sheetUp = () => page.evaluate(() => !document.querySelector('#sheet').hidden);
  const playState = () => page.evaluate(() => ({
    playing: App.playing(), says: document.querySelector('#playBtn').classList.contains('playing') }));

  await seed(page, v100Record(), { native: true, audio: ['s_1'] });
  await wait(300);

  /* A story card tapped twice: one sheet, and one Back is enough to leave it. */
  await doubleTap(page, '[data-act="story"][data-id="s_1"]'); await wait(500);
  check(await sheetUp(), 'the story sheet opened');
  check(await page.evaluate(() => App.back()) === true, 'back consumed the story sheet');
  check(!(await sheetUp()), 'one back is enough after a double tapped card');
  await wait(200);

  /* Play, tapped twice while the recording is still being read out of the database.
     Both taps are the same tap: it plays, and the button says exactly that. */
  await page.evaluate(() => App.openSheet('story', 's_1'));
  await page.evaluate(() => { const b = document.querySelector('#playBtn'); b.click(); b.click(); });
  await wait(1600);
  let st = await playState();
  check(st.playing && st.says, 'a double tap during loading plays: ' + JSON.stringify(st));

  /* Tapped twice while it is playing: one tap again, so it stops once rather than stopping and
     starting. Either way nothing may claim the recording could not be played: a pause landing on
     top of a play is the browser reporting a failure the person never caused. */
  await tap('#playBtn'); await tap('#playBtn'); await wait(900);
  st = await playState();
  check(!st.playing && !st.says, 'a double tap on a playing story stops it once: ' + JSON.stringify(st));
  check(await page.evaluate(() => document.querySelector('#playErr').hidden), 'and nothing claims it could not be played');

  /* And it starts again on the next tap, from where it was left. */
  await tap('#playBtn'); await wait(700);
  st = await playState();
  check(st.playing && st.says, 'it plays again after that: ' + JSON.stringify(st));
  check(await page.evaluate(() => document.querySelector('#playErr').hidden), 'still no error on the player');
  await shot('10-player');

  /* Mark this moment, tapped twice: one sheet, one moment. */
  const before = await page.evaluate(() => Store.story('s_1').moments.length);
  await doubleTap(page, '[data-act="mark"]'); await wait(500);
  check(await page.evaluate(() => !!document.querySelector('#mkNote') &&
        document.querySelector('#mkNote').getBoundingClientRect().height > 0), 'the mark sheet is up and visible');
  await page.$eval('#mkNote', e => { e.value = 'He laughs'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap('[data-act="marksave"]'); await wait(400);
  check(await page.evaluate(() => !!document.querySelector('#playBtn') &&
        document.querySelector('#playBtn').getBoundingClientRect().height > 0), 'marking lands back on the story');
  const after = await page.evaluate(() => Store.story('s_1').moments.length);
  check(after === before + 1, 'one moment added, not two: ' + before + ' -> ' + after);

  /* Ask a follow up, tapped twice: one question in the queue. */
  const qBefore = (await raw(page)).queue.length;
  await doubleTap(page, '[data-act="followup"]'); await wait(500);
  check(await page.evaluate(() => !!document.querySelector('#fuText')), 'the follow up sheet is up');
  await page.$eval('#fuText', e => { e.value = 'What music did you dance to?'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await tap('[data-act="fusave"]'); await wait(500);
  check(!(await sheetUp()), 'saving the follow up closes every sheet');
  const qAfter = (await raw(page)).queue.length;
  check(qAfter === qBefore + 1, 'one question queued, not two: ' + qBefore + ' -> ' + qAfter);

  /* Tabs, tapped twice each and rapidly across. */
  for (const v of ['keepsake', 'family', 'archive', 'ask']) {
    await doubleTap(page, '[data-view="' + v + '"]'); await wait(120);
  }
  await wait(400);
  check(await page.evaluate(() => !document.querySelector('#v-ask').hidden), 'the tab bar survives fast taps');
  check(await page.evaluate(() => document.querySelectorAll('.view:not([hidden])').length) === 1,
        'exactly one view is shown');
  await shot('10-after-tabs');

  /* Erase, double tapped through the confirm: one reload, nothing left. */
  await page.evaluate(() => App.setView('family'));
  await wait(300);
  await click('[data-act="erase"]'); await wait(300);
  await doubleTap(page, '[data-act="confirmyes"]'); await wait(1500);
  check(await page.evaluate(() => !document.querySelector('#onboard').hidden), 'erase lands on the first run screen');
  check(await page.evaluate(() => !localStorage.getItem('heirloom.v1')), 'and the record is gone');

  /* Onboarding, tapped twice on every card: no card of the explanation is skipped, and the
     last double tap does not fall through onto the tab bar of the app that just appeared. */
  await seed(page, null, { native: true }); await wait(400);
  for (let i = 0; i < 3; i++) {
    const before = await page.evaluate(() => document.querySelector('.ob-step:not([hidden])').dataset.step);
    await doubleTap(page, '#obNext'); await wait(400);
    const after = await page.evaluate(() => document.querySelector('.ob-step:not([hidden])').dataset.step);
    check(+after === +before + 1, 'a double tap moves one card, not two: ' + before + ' -> ' + after);
  }
  await page.$eval('#obName', e => { e.value = 'Arthur'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await doubleTap(page, '#obNext'); await wait(700);
  check((await raw(page)).tellers.length === 1, 'one teller from a double tapped finish');
  check(await page.evaluate(() => !document.querySelector('#v-ask').hidden), 'and it lands on Ask, not on whatever the second tap hit');
  await shot('10-onboard-done');

  /* Consent, tapped twice: the second tap must not reach the record button behind it. */
  await seed(page, v100Record(), { native: true }); await wait(400);
  await page.evaluate(() => App.openElder('t_sarla')); await wait(400);
  await doubleTap(page, '#consentYes'); await wait(1200);
  check(await page.evaluate(() => Recorder.getState()) === 'idle', 'agreeing twice does not start a recording');
  check(await page.evaluate(() => !document.querySelector('#elderHome').hidden), 'and lands on the big button screen');
  await shot('10-consent-double');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
  log('10 clean');
};
