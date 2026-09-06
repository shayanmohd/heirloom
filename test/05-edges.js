/* Every input with an edge, rapid double taps on every primary button, and quick rotation
   through the screens.

   A tap that opens or closes a sheet deliberately swallows anything that lands in the next 280ms,
   so that a thumb already coming down for its second tap cannot confirm something. Waits after
   those taps are 400ms on purpose: below that this file measures the guard, not the app. */
const { seed, raw, assert, audioKeys, clearAudio, visible, setVal, doubleTap, v100Record } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };

  /* Onboarding edges: blank and whitespace names, impossible years, a 40 character name. */
  await seed(page, null, { native: true }); await clearAudio(page); await wait(200);
  for (let i = 0; i < 3; i++) { await click('#obNext'); await wait(360); }
  await type('#obName', '   '); await click('#obNext'); await wait(250);
  check(await visible(page, '#onboard'), 'whitespace name refused');
  check(!!(await page.$('#onboard .fld-err, #onboard .err')), 'the refusal is inline');
  await shot('05-ob-blank');
  const longName = 'Bartholomew Fitzgerald Montgomery Smyth';
  await setVal(page, '#obName', longName);
  await setVal(page, '#obYear', '-5'); await setVal(page, '#obTime', '');
  await click('#obNext'); await wait(400);
  check(await visible(page, '#onboard'), 'an impossible year holds the form');
  check(!!(await page.$('#onboard .fld-err')), 'the year is refused inline');
  await shot('05-ob-badyear');
  await setVal(page, '#obYear', ''); await wait(120);
  await click('#obNext'); await wait(500);
  let r = await raw(page);
  check(r && r.tellers.length === 1 && r.tellers[0].name === longName, 'long name accepted');
  check(r.tellers[0].birthYear === null, 'a blank year is stored as unknown: ' + r.tellers[0].birthYear);
  check(r.tellers[0].ritual.time === '15:00', 'a cleared time falls back to 15:00: ' + r.tellers[0].ritual.time);
  await click('.tab[data-view="archive"]'); await wait(200); await shot('05-long-name-chips');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow from a long name');

  /* The teller sheet: years out of range and a cleared time. */
  await click('.tab[data-view="family"]'); await wait(200);
  await click('.tellcard'); await wait(300);
  await setVal(page, '[data-act="tset"][data-k="birthYear"]', '3000'); await wait(100);
  check((await raw(page)).tellers[0].birthYear === null, 'a year in the future is not stored');
  await setVal(page, '[data-act="tset"][data-k="birthYear"]', '1931'); await wait(100);
  check((await raw(page)).tellers[0].birthYear === 1931, 'a real year is');
  await setVal(page, '[data-act="ttime"]', ''); await wait(100);
  check(/^\d\d:\d\d$/.test((await raw(page)).tellers[0].ritual.time), 'a cleared ritual time stays a time: ' + (await raw(page)).tellers[0].ritual.time);
  await setVal(page, '[data-act="tset"][data-k="name"]', ''); await wait(100);
  check((await raw(page)).tellers[0].name === longName, 'a blanked name is not saved');
  await page.evaluate(() => App.closeSheet(true));

  /* Duplicate names: a second teller with the same name is refused inline. */
  await click('[data-act="newteller"]'); await wait(400);
  await type('#ntName', longName); await click('[data-act="ntsave"]'); await wait(300);
  check((await raw(page)).tellers.length === 1, 'duplicate teller refused');
  check(!!(await page.$('#sheetBody .fld-err')), 'refusal shown inline in the sheet');
  await shot('05-dup-teller');
  await setVal(page, '#ntName', 'Sarla'); await click('[data-act="ntsave"]'); await wait(300);
  check((await raw(page)).tellers.length === 2, 'a different name is added');
  await click('[data-act="newperson"]'); await wait(400);
  await type('#npName', 'Zoe'); await doubleTap(page, '[data-act="npsave"]'); await wait(300);
  check((await raw(page)).people.length === 1, 'double tap adds one person');
  await click('[data-act="newperson"]'); await wait(400);
  await type('#npName', 'zoe'); await click('[data-act="npsave"]'); await wait(300);
  check((await raw(page)).people.length === 1, 'duplicate listener refused, case blind');
  await page.evaluate(() => App.closeSheet(true));
  await setVal(page, '#famName', 'The Fitzgerald Montgomery Smyth Family of'); await wait(150);
  check((await raw(page)).family.length <= 46, 'family name capped');

  /* Ask: a question of 220 characters, double tapped, lands once. Skipping a family question
     keeps it. */
  await click('.tab[data-view="ask"]'); await wait(200);
  await click('[data-act="askform"]'); await wait(400);
  const longQ = 'What did the kitchen look like in the house where you were born, and who was allowed to sit at the table, and what was cooked on a day when there was money, and what was cooked on a day when there was none at all, and who ate first?';
  await setVal(page, '#qText', longQ); await doubleTap(page, '[data-act="qsave"]'); await wait(400);
  r = await raw(page);
  check(r.queue.length === 1 && r.queue[0].text.length <= 220, 'one queued question, capped at 220: ' + r.queue.length + '/' + (r.queue[0] && r.queue[0].text.length));
  check(await visible(page, '#v-ask'), 'the second tap does not fall through the closing sheet');
  await shot('05-long-question');
  await click('[data-act="askform"]'); await wait(400);
  await setVal(page, '#qText', '   '); await click('[data-act="qsave"]'); await wait(200);
  check((await raw(page)).queue.length === 1 && await visible(page, '#sheet'), 'a blank question is refused and the sheet stays');
  check(!!(await page.$('#sheetBody .fld-err')), 'blank question refused inline');
  await page.evaluate(() => App.closeSheet(true)); await wait(100);
  const tid = (await raw(page)).tellers[0].id;
  await click('[data-act="skip"][data-id="' + tid + '"]'); await wait(400);
  await click('[data-act="confirmyes"]'); await wait(300);
  r = await raw(page);
  check(r.queue.length === 1, 'skipping a family question keeps it for later');
  check(!/kitchen look like/.test(await text('#askList .askcard')), 'a skipped family question is not the one waiting');
  await shot('05-skipped-family-q');

  /* Every question answered: the empty engine state on both sides. */
  const used = await page.evaluate(() => Content.PROMPTS.filter(p => p.pack === 'core').map(p => p.id));
  const done = v100Record({ tellers: [{ id: 't_done', name: 'Ivy', relation: '', birthYear: null, place: '', packs: [], consent: { at: Date.now() - 1000, note: '' }, ritual: { day: 0, time: '15:00' }, startedAt: Date.now() - 1000, current: null, used, skipped: [], answeredAt: null }], stories: [], queue: [], people: [] });
  await seed(page, done, { native: true }); await wait(300);
  await click('.tab[data-view="ask"]'); await wait(200); await shot('05-all-answered');
  check(/Every question in their packs has been answered/.test(await text('#askList')), 'Ask says the packs are used up');
  await page.evaluate(() => App.openElder('t_done')); await wait(200); await shot('05-elder-nothing');
  check(/No question waiting/.test(await text('#elderQ')) && !(await visible(page, '#elderRec')), 'elder sees no button when nothing waits');
  await page.evaluate(() => App.back()); await click('[data-act="confirmyes"]'); await wait(200);

  /* Elder mode double taps: one recording, one microphone, one story. */
  await seed(page, v100Record(), { native: true, audio: ['s_1'] }); await wait(300);
  await page.evaluate(() => {
    window.__gum = 0;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; return real(c); };
  });
  await page.evaluate(() => App.openElder('t_arthur')); await wait(200);
  await doubleTap(page, '#elderRec'); await wait(1800);
  check(await page.evaluate(() => window.__gum) === 1, 'a double tap on the big button opens the microphone once: ' + await page.evaluate(() => window.__gum));
  check(await page.evaluate(() => Recorder.getState()) === 'recording', 'recording after the double tap');
  await doubleTap(page, '#recPause'); await wait(300);
  check(await page.evaluate(() => Recorder.getState()) === 'recording', 'double tap on pause ends where it started');
  await wait(800);
  const storiesBefore = (await raw(page)).stories.length;
  await doubleTap(page, '#recDone'); await wait(1800);
  r = await raw(page);
  check(r.stories.length === storiesBefore + 1, 'double tap on done keeps exactly one story: ' + (r.stories.length - storiesBefore));
  check(await visible(page, '#elderDone'), 'kept screen after a double tapped done');
  check(r.stories[r.stories.length - 1].dur > 2, 'the story has its duration');
  await doubleTap(page, '#doneOk'); await wait(200);
  check(await visible(page, '#elderHome'), 'finish lands home');
  await shot('05-elder-after-double');

  /* Elder skip rests until next week rather than dealing a new question. */
  await page.evaluate(() => App.openElder('t_sarla')); await wait(200);
  await click('#consentYes'); await wait(200);
  await click('#elderSkip'); await wait(300); await shot('05-elder-skipped');
  check(!(await visible(page, '#elderRec')), 'after Not this week the big button rests');
  await page.evaluate(() => App.back()); await click('[data-act="confirmyes"]'); await wait(200);
  check(/Skipped this week|until/.test(await text('#askList')), 'Ask reflects the rest');

  /* The story sheet: mark before the audio is there, then mark after a scrub, heart double
     tap, past seal date. */
  await page.evaluate(() => App.setView('archive')); await wait(200);
  /* s_2 has no recording in this seed: the sheet must say so where the player is, not crash. */
  await page.evaluate(() => App.openSheet('story', 's_2')); await wait(600);
  check(await page.$eval('#playErr', e => !e.hidden && /not on this phone/.test(e.textContent)),
        'a story whose recording is missing says so inline: ' + await page.$eval('#playErr', e => e.textContent));
  await click('[data-act="mark"]'); await wait(200);
  check(!(await page.$('#mkNote')), 'and marking it does not open the note');
  await shot('05-audio-missing');
  await page.evaluate(() => App.closeSheet(true)); await wait(150);
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(700);
  await click('#scrub'); await wait(120);
  await click('[data-act="mark"]'); await wait(400);
  check(!!(await page.$('#mkNote')), 'marking after a scrub opens the note');
  await page.$eval('#mkNote', e => { e.value = 'Scrubbed to here'; });
  await click('[data-act="marksave"]'); await wait(450);
  r = await raw(page);
  const m1 = r.stories.find(s => s.id === 's_1').moments;
  check(m1.length === 3 && m1.some(m => m.note === 'Scrubbed to here' && m.t > 0.4), 'the mark lands where the scrub left it: ' + JSON.stringify(m1.map(m => m.t)));
  await doubleTap(page, '[data-act="heart"]'); await wait(300);
  r = await raw(page);
  check(r.stories.find(s => s.id === 's_1').reactions.length === 3, 'a double tapped heart counts once: ' + r.stories.find(s => s.id === 's_1').reactions.length);
  await click('[data-act="vis"][data-v="sealed"]'); await wait(200);
  await setVal(page, '[data-act="sealdate"]', '2001-01-01'); await wait(200);
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(300);
  check(!!(await page.$('#playBtn')), 'a seal dated in the past does not hide the player');
  check(/opened|passed/i.test(await text('#sheetBody')), 'and the sheet says the seal has opened');
  await shot('05-seal-past');
  await setVal(page, '[data-act="sealdate"]', ''); await wait(100);
  check((await raw(page)).stories.find(s => s.id === 's_1').sealUntil === null, 'an emptied seal date is null');
  await page.evaluate(() => App.closeSheet(true));

  /* Tags: blank, 32 characters, duplicates in different case. */
  await page.evaluate(() => App.openSheet('story', 's_2')); await wait(300);
  await page.$eval('#tagLabel', e => { e.value = '   '; }); await click('[data-act="addtag"]'); await wait(150);
  await page.$eval('#tagLabel', e => { e.value = 'nesta'; }); await click('[data-act="addtag"]'); await wait(150);
  await page.$eval('#tagLabel', e => { e.value = 'The Old Capitol Cinema on Queen St'; }); await click('[data-act="addtag"]'); await wait(150);
  r = await raw(page);
  const s2 = r.stories.find(s => s.id === 's_2');
  check(s2.tags.length === 4 && s2.tags.every(t => t.label.trim().length && t.label.length <= 32), 'blank and duplicate tags refused, long tag capped: ' + JSON.stringify(s2.tags.map(t => t.label)));
  await shot('05-tags');
  await page.evaluate(() => App.closeSheet(true));

  /* Rapid rotation through screens and sheets. */
  for (let i = 0; i < 6; i++) for (const v of ['ask', 'family', 'keepsake', 'archive']) await click('.tab[data-view="' + v + '"]');
  for (let i = 0; i < 4; i++) { await page.evaluate(() => App.openSheet('story', 's_2')); await page.evaluate(() => App.closeSheet(true)); }
  for (let i = 0; i < 3; i++) { await page.evaluate(() => App.openElder('t_arthur')); await page.evaluate(() => App.setView('ask')); }
  await wait(300);
  check(await visible(page, '#v-ask') && !(await visible(page, '#elder')), 'ends on Ask after rapid rotation');
  await click('.tab[data-view="archive"]'); await wait(200);
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(600);
  await click('#playBtn'); await wait(500);
  check(await page.evaluate(() => { const a = document.querySelector('#playBtn'); return a && a.classList.contains('playing'); }), 'the story is playing');
  /* A sheet covers the tab bar, so the only way out is the scrim above it. */
  await click('.tab[data-view="keepsake"]'); await wait(200);
  check(await visible(page, '#sheet'), 'the tab bar cannot be reached through an open sheet');
  await page.mouse.click(195, 24); await wait(300);
  check(!(await visible(page, '#sheet')), 'a tap above the sheet closes it');
  check(await page.evaluate(() => !App.playing()), 'and the playback stops with it');

  /* Delete a story, double tapping the confirm. */
  await page.evaluate(() => App.setView('archive')); await wait(150);
  await page.evaluate(() => App.openSheet('story', 's_2')); await wait(300);
  await click('[data-act="delstory"]'); await wait(400);
  await doubleTap(page, '[data-act="confirmyes"]'); await wait(600);
  r = await raw(page);
  check(r.stories.length === 5 && !r.stories.find(s => s.id === 's_2'), 'story deleted once');
  check((await audioKeys(page)).indexOf('s_2') < 0, 'and its recording is gone from the database');
  check(await visible(page, '#v-archive') && !(await visible(page, '#sheet')), 'back on the archive after delete');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
