/* The Back gesture on every nested screen, and the pause and resume hooks: timers stop,
   audio stops, a recording pauses and can carry on. */
const { seed, raw, assert, audioKeys, visible } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  await seed(page, require('./lib').v100Record(), { native: true, audio: ['s_1', 's_2', 's_3', 's_4', 's_5'] });
  await wait(500);
  const back = () => page.evaluate(() => window.App.back());
  const pause = () => page.evaluate(() => { window.App.onPause(); return true; });
  const resume = () => page.evaluate(() => { window.App.onResume(); return true; });

  check((await back()) === false, 'back at the root returns false');
  for (const v of ['ask', 'family', 'keepsake']) {
    await click('.tab[data-view="' + v + '"]'); await wait(200);
    check((await back()) === true, 'back from ' + v + ' consumed');
    check(await visible(page, '#v-archive'), 'landed on archive from ' + v);
  }

  // Every sheet: back closes it. A sheet over a sheet closes one at a time.
  const sheetOpen = () => visible(page, '#sheet');
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(500);
  check(await sheetOpen(), 'story sheet open');
  await click('[data-act="followup"]'); await wait(200);
  check((await back()) === true && await sheetOpen() && /Following:/.test(await text('#sheetBody')) === false, 'back closes the follow up, keeps the story');
  check(/first job/.test(await text('#sheetBody')), 'story sheet restored underneath');
  check((await back()) === true && !(await sheetOpen()), 'then closes the story');
  for (const [kind, arg] of [['teller', 't_arthur'], ['newteller'], ['newperson'], ['askform'], ['packs', 'core'], ['swap', 't_arthur'], ['exportwho']]) {
    await page.evaluate((k, a) => App.openSheet(k, a), kind, arg); await wait(150);
    check(await sheetOpen(), kind + ' sheet open');
    check((await back()) === true && !(await sheetOpen()), 'back closes the ' + kind + ' sheet');
  }
  await click('.tab[data-view="family"]'); await wait(200);
  await click('[data-act="erase"]'); await wait(200);
  check(await sheetOpen() && (await back()) === true && !(await sheetOpen()), 'back cancels the erase confirm');
  check((await raw(page)).stories.length === 5, 'nothing erased');
  check((await back()) === true && await visible(page, '#v-archive'), 'then back to the archive');

  // Elder mode: back asks first, staying is honoured, leaving lands on Ask.
  await page.evaluate(() => App.openElder('t_arthur')); await wait(300);
  check(await visible(page, '#elder') && await visible(page, '#elderHome'), 'elder home');
  check((await back()) === true && await sheetOpen(), 'back in elder mode opens the leave confirm');
  await click('[data-act="cancel"]'); await wait(200);
  check(!(await sheetOpen()) && await visible(page, '#elder'), 'staying keeps elder mode');
  check((await back()) === true, 'back again');
  await click('[data-act="confirmyes"]'); await wait(300);
  check(await visible(page, '#v-ask'), 'leaving elder mode lands on Ask');

  // A recording in progress: pause hook pauses it, resume does not throw, back asks, cancel
  // carries on, and throwing it away really throws it away.
  await page.evaluate(() => App.openElder('t_arthur')); await wait(200);
  await click('#elderRec'); await wait(1500);
  check(await page.evaluate(() => Recorder.getState()) === 'recording', 'recording');
  const keysBefore = (await audioKeys(page)).length;
  await pause(); await wait(300);
  check(await page.evaluate(() => Recorder.getState()) === 'paused', 'onPause pauses the recorder');
  check(/Carry on/.test(await text('#recPause')), 'button offers to carry on');
  const t1 = await text('#recTime'); await wait(700);
  check((await text('#recTime')) === t1, 'timer holds while paused by the shell');
  await resume(); await wait(200);
  check(await page.evaluate(() => Recorder.getState()) === 'paused', 'resume leaves the choice to the person');
  await click('#recPause'); await wait(600);
  check(await page.evaluate(() => Recorder.getState()) === 'recording', 'carry on resumes');
  check((await back()) === true && await sheetOpen(), 'back while recording asks');
  await shot('03-rec-back');
  await click('[data-act="cancel"]'); await wait(200);
  check(await page.evaluate(() => Recorder.getState()) === 'recording' && await visible(page, '#elderRecording'), 'cancel keeps recording');
  await back(); await wait(150);
  await click('[data-act="confirmyes"]'); await wait(400);
  check(await page.evaluate(() => Recorder.getState()) === 'idle' && await visible(page, '#elderHome'), 'thrown away: recorder idle, back on elder home');
  check((await audioKeys(page)).length === keysBefore && (await raw(page)).stories.length === 5, 'nothing was kept');
  check(await page.evaluate(() => window.__native.awake.slice(-1)[0] === false), 'keep awake released');

  // The player: pause hook stops playback; leaving the sheet stops it too.
  await page.evaluate(() => App.back()); await click('[data-act="confirmyes"]'); await wait(300);
  await page.evaluate(() => App.openSheet('story', 's_2')); await wait(600);
  await click('#playBtn'); await wait(700);
  check(await page.evaluate(() => !document.querySelector('#playBtn') ? false : document.querySelector('#playBtn').classList.contains('playing')), 'playing');
  await pause(); await wait(200);
  check(!(await page.$eval('#playBtn', e => e.classList.contains('playing'))), 'onPause pauses playback');
  await click('#playBtn'); await wait(400);
  await page.evaluate(() => App.back()); await wait(200);
  check(await page.evaluate(() => !window.__playerLeak), 'no player left running after the sheet closes');

  // Pause and resume on every screen without a throw; resume recomputes the schedule.
  for (const v of ['archive', 'ask', 'family', 'keepsake']) {
    await page.evaluate(v => App.setView(v), v);
    await page.evaluate(() => { window.__native.scheduled = null; });
    await pause(); await resume(); await wait(50);
    check(Array.isArray(await page.evaluate(() => window.__native.scheduled)), 'resume on ' + v + ' recomputes the schedule');
  }

  // Onboarding: back steps backward, then falls out at step 0.
  await seed(page, null, { native: true }); await wait(300);
  check((await back()) === false, 'back on onboarding step 0 exits');
  await click('#obNext'); await wait(150);
  check((await back()) === true && await page.$eval('.ob-step[data-step="0"]', e => !e.hidden), 'back returns to step 0');
  await pause(); await resume();

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
