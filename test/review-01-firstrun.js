/* Reviewer pass 1: first run from nothing, every screen, real data, reload, persistence.
   Zero page errors is the pass condition; the drive harness enforces that. */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const assert = L.assert;
  /* the scrim is the strip of dimmed screen above the panel: tapping its centre would land
     on the panel itself, which is exactly what a thumb would do too */
  const tapScrim = async () => { await page.mouse.click(195, 24); await wait(420); };

  /* nothing stored at all, and a Native shell present so the bridge paths run */
  await L.clearAudio(page);
  await L.seed(page, null, { native: true });

  /* ---------------------------------------------------------- onboarding */
  assert(await L.visible(page, '#onboard'), 'first run shows onboarding');
  await shot('r01-ob-0');
  await click('#obNext'); await wait(280);
  await shot('r01-ob-1');
  await click('#obNext'); await wait(280);
  await click('#obNext'); await wait(320);
  await shot('r01-ob-3');

  /* the form: an empty name must be refused inline, never with an alert */
  await click('#obNext'); await wait(200);
  assert((await text('#obName') !== null), 'name field exists');
  const err = await page.$eval('#obName', e => {
    const f = e.closest('.fld'); const p = f && f.querySelector('.fld-err');
    return p ? p.textContent : null;
  });
  assert(err && err.length, 'empty name gives an inline error, got ' + err);
  assert(await L.visible(page, '#onboard'), 'still on onboarding after the refusal');

  /* a nonsense year must be refused too */
  await type('#obName', 'Arthur Llewellyn Morgan');
  await type('#obRel', 'Papa');
  await L.setVal(page, '#obYear', '47');
  await click('#obNext'); await wait(200);
  const yerr = await page.$eval('#obYear', e => {
    const f = e.closest('.fld'); const p = f && f.querySelector('.fld-err');
    return p ? p.textContent : null;
  });
  assert(yerr && yerr.length, 'a two digit year is refused inline, got ' + yerr);

  await L.setVal(page, '#obYear', '1947');
  await type('#obPlace', 'Cardiff');
  await wait(120);
  await shot('r01-ob-form');
  await click('#obNext'); await wait(420);

  assert(!(await L.visible(page, '#onboard')), 'onboarding is gone');
  assert(await L.visible(page, '#v-ask'), 'lands on Ask');
  const rec = await L.raw(page);
  assert(rec && rec.onboarded === true, 'onboarded is stored');
  assert(rec.tellers.length === 1, 'one teller stored');
  assert(rec.tellers[0].birthYear === 1947, 'birth year stored as a number, got ' + rec.tellers[0].birthYear);
  await shot('r01-ask-first');

  /* the notification plan on a teller who has not consented yet */
  const sched0 = await page.evaluate(() => window.__native.scheduled);
  assert(Array.isArray(sched0) && sched0.length === 0, 'no reminders before consent, got ' + JSON.stringify(sched0));

  /* -------------------------------------------------------- empty states */
  await click('.tab[data-view="archive"]'); await wait(360);
  assert(!(await L.visible(page, '#archSeg')), 'no Timeline/Threads switch over an empty archive');
  assert(!(await L.visible(page, '.searchwrap')), 'no search box over an empty archive');
  assert(await page.$('#archList .empty-art svg'), 'the empty archive is drawn, not only worded');
  await shot('r01-archive-empty');

  await click('.tab[data-view="family"]'); await wait(360);
  await shot('r01-family-empty');
  await click('.tab[data-view="keepsake"]'); await wait(360);
  await shot('r01-keepsake-empty');

  /* --------------------------------------------------------- elder mode */
  await click('.tab[data-view="ask"]'); await wait(320);
  await click('[data-act="hand"]'); await wait(400);
  assert(await L.visible(page, '#elderConsent'), 'consent card first');
  await shot('r01-elder-consent');
  await click('#consentYes'); await wait(500);
  assert(await L.visible(page, '#elderHome'), 'home after consent');
  const q = await text('#elderQ');
  assert(q && q.length > 5, 'a question is on the elder screen: ' + q);
  await shot('r01-elder-home');

  const sched1 = await page.evaluate(() => window.__native.scheduled);
  assert(sched1.length === 12, 'twelve reminders after consent, got ' + sched1.length);
  assert(sched1.every(n => n.at > Date.now()), 'nothing scheduled in the past');
  assert(sched1.every((n, i) => i === 0 || n.at > sched1[i - 1].at), 'reminders are in order');

  /* record for real off the fake microphone */
  await click('#elderRec');
  await wait(3200);
  assert(await L.visible(page, '#elderRecording'), 'the recording panel is up');
  const t1 = await text('#recTime');
  assert(/^\d:\d\d$/.test(t1), 'a clock is running: ' + t1);
  const geo = await page.evaluate(() => window.App.ringGeometry());
  assert(geo && geo.outer < geo.half, 'the disc stays inside its box: ' + JSON.stringify(geo));
  await shot('r01-elder-recording');

  await click('#recPause'); await wait(600);
  assert((await text('#recState')).toLowerCase().indexOf('paused') >= 0, 'pause says paused');
  const tp = await text('#recTime');
  await wait(700);
  assert(await text('#recTime') === tp, 'the clock stops while paused');
  await click('#recPause'); await wait(1200);

  await click('#recDone'); await wait(2500);
  assert(await L.visible(page, '#elderDone'), 'kept screen, got ' + (await text('#elder')));
  await shot('r01-elder-done');
  await click('#doneOk'); await wait(400);
  assert(await L.visible(page, '#elderHome'), 'back to the elder home');
  await shot('r01-elder-after');

  /* leaving elder mode is a hold, not a tap */
  const box = await (await page.$('#elderExit')).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(300);
  assert(await L.visible(page, '#elder'), 'a tap on the exit mark does not leave');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await wait(1400); await page.mouse.up();
  await wait(500);
  assert(!(await L.visible(page, '#elder')), 'a hold leaves elder mode');

  /* ------------------------------------------------------------ archive */
  await click('.tab[data-view="archive"]'); await wait(420);
  assert(await L.visible(page, '.searchwrap'), 'the search box is back now there is something to search');
  assert((await page.$$('#archList .story')).length === 1, 'one story card');
  await shot('r01-archive-one');

  await click('.story'); await wait(500);
  await shot('r01-story-sheet');
  /* play it */
  await click('#playBtn'); await wait(1600);
  const playing = await page.evaluate(() => window.App.playing());
  assert(playing, 'the story plays');
  const now = await text('#pnow');
  assert(now !== '0:00', 'the clock moves while it plays: ' + now);
  await shot('r01-story-playing');

  /* mark a moment while it plays */
  await click('[data-act="mark"]'); await wait(420);
  await type('#mkNote', 'He laughs about the puppy');
  await click('[data-act="marksave"]'); await wait(500);
  await click('.story'); await wait(450);
  assert((await page.$$('.moment')).length === 1, 'the moment is listed');

  /* title, notes, tags */
  await page.$eval('[data-act="title"]', e => { e.value = 'The first pay packet'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('[data-act="notes"]', e => { e.value = 'Ask him about the foreman again.'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await L.setVal(page, '#tagLabel', 'Dai Morgan');
  await click('[data-act="addtag"]'); await wait(360);
  await click('[data-act="quicktag"][data-l="1960s"]'); await wait(360);
  assert((await page.$$('.chip.tag')).length >= 2, 'two tags on the story');
  await shot('r01-story-tagged');

  /* seal it and unseal it */
  await click('[data-act="vis"][data-v="sealed"]'); await wait(360);
  assert(await page.$('[data-act="sealdate"]'), 'a seal date field appears');
  await shot('r01-story-sealed');
  await click('[data-act="unseal"]'); await wait(360);
  assert(await page.$('#playBtn'), 'unsealing brings the player back');

  await tapScrim();

  /* --------------------------------------------------------- the family */
  await click('.tab[data-view="family"]'); await wait(360);
  await click('[data-act="newperson"]'); await wait(400);
  await type('#npName', 'Zoe');
  await click('[data-act="npsave"]'); await wait(500);
  assert((await text('#famBody')).indexOf('Zoe') >= 0, 'Zoe is listed');
  await L.setVal(page, '#famName', 'The Morgan family');
  await wait(200);
  assert(await text('#famTitle') === 'The Morgan family', 'the family name is the header');
  await shot('r01-family');

  /* --------------------------------------------------------------- ask */
  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="askform"]'); await wait(420);
  await type('#qText', 'What music did you dance to?');
  await click('[data-act="qsave"]'); await wait(560);
  assert((await text('#askList')).indexOf('What music did you dance to') >= 0, 'the family question is queued');
  await shot('r01-ask-queued');

  /* the teller is resting after this week's answer: deal again, then swap the question */
  await click('[data-act="asknow"]'); await wait(460);
  assert(await page.$('[data-act="swap"]'), 'dealing again puts a question back on the card');
  await click('[data-act="swap"]'); await wait(460);
  assert((await text('#sheetBody')).toLowerCase().indexOf('suggested for them') >= 0, 'the swap sheet suggests');
  assert((await page.$$('.promptrow')).length > 0, 'there are prompts to pick');
  await shot('r01-swap');
  await tapScrim();

  await click('.packrow'); await wait(460);
  assert((await page.$$('.promptrow')).length > 20, 'a pack lists its questions');
  await shot('r01-pack');
  await tapScrim();

  /* ----------------------------------------------------------- keepsake */
  await click('.tab[data-view="keepsake"]'); await wait(420);
  const keep = await text('#keepBody');
  assert(keep.indexOf('1') >= 0, 'the meter has a count');
  await shot('r01-keepsake');

  /* export through the Native bridge */
  await click('#keepBody [data-act="export"]'); await wait(2600);
  const saved = await page.evaluate(() => window.__native.saved.map(s => ({ name: s.name, mime: s.mime, len: s.b64.length })));
  assert(saved.length === 1, 'one file handed to Android, got ' + JSON.stringify(saved));
  assert(/^heirloom-archive-\d{4}-\d\d-\d\d\.zip$/.test(saved[0].name), 'the zip is named for the day: ' + saved[0].name);
  assert(saved[0].len > 2000, 'the zip has the audio in it, base64 length ' + saved[0].len);
  log('exported ' + saved[0].name + ', ' + saved[0].len + ' base64 chars');

  /* ------------------------------------------------------- persistence */
  const before = await L.raw(page);
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(700);
  const after = await L.raw(page);
  assert(JSON.stringify(before) === JSON.stringify(after), 'the record survives a reload untouched');
  assert(!(await L.visible(page, '#onboard')), 'no onboarding on the second run');
  const keys = await L.audioKeys(page);
  assert(keys.length === 1, 'the recording is still in the database, keys ' + JSON.stringify(keys));
  await click('.tab[data-view="archive"]'); await wait(420);
  assert((await page.$$('#archList .story')).length === 1, 'the story is still in the archive');
  assert((await text('#archList')).indexOf('The first pay packet') >= 0, 'the title survived');
  await shot('r01-after-reload');

  /* and it still plays after the reload */
  await click('.story'); await wait(500);
  await click('#playBtn'); await wait(1500);
  assert(await page.evaluate(() => window.App.playing()), 'it plays after a reload');
  assert(await page.$eval('#playErr', e => e.hidden), 'no player error');
  await shot('r01-replay');

  log('page errors: ' + errors.length);
};
