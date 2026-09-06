/* First run, the empty states, then the full happy path that creates real data on every screen,
   then a reload and a fresh tab to prove it all persists. */
const { seed, raw, assert, audioKeys, clearAudio, visible, setVal } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log, browser }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  await seed(page, null, { native: false });
  await clearAudio(page);
  await wait(300);
  check(await visible(page, '#onboard'), 'onboarding shows on first run');
  await shot('01-ob-0');
  await click('#obNext'); await wait(400); await shot('01-ob-1');
  await click('#obNext'); await wait(400); await shot('01-ob-2');
  await click('#obNext'); await wait(400); await shot('01-ob-3');

  // Empty name is refused, and refused inline rather than by a toast alone.
  await click('#obNext'); await wait(400);
  check(await visible(page, '#onboard'), 'still on onboarding after an empty name');
  await shot('01-ob-3-empty');

  // The year picks a pack; a pack chip must toggle.
  await type('#obYear', '1947'); await wait(200);
  check(await page.$eval('#obPacks .chip[data-id="midcentury"]', e => e.classList.contains('on')), '1947 preselects the midcentury pack');
  await click('#obPacks .chip[data-id="britain"]'); await wait(150);
  check(await page.$eval('#obPacks .chip[data-id="britain"]', e => e.classList.contains('on')), 'tapping a pack chip in onboarding selects it');
  await type('#obName', 'Arthur');
  await type('#obRel', 'Papa');
  await type('#obPlace', 'Cardiff');
  await shot('01-ob-3-filled');
  await click('#obNext'); await wait(600);
  check(await visible(page, '#v-ask'), 'lands on Ask after onboarding');
  let r = await raw(page);
  check(r.tellers.length === 1 && r.tellers[0].name === 'Arthur' && r.tellers[0].birthYear === 1947, 'teller saved');
  check(r.tellers[0].packs.indexOf('britain') >= 0 && r.tellers[0].packs.indexOf('midcentury') >= 0, 'both packs saved: ' + JSON.stringify(r.tellers[0].packs));
  await shot('01-ask-first');

  // Archive is empty and says so with a way forward.
  await click('.tab[data-view="archive"]'); await wait(300); await shot('01-archive-empty');
  check(/empty|Nothing kept/i.test(await text('#v-archive')), 'archive empty state present');
  /* Nothing to search and nothing to sort yet, so neither control is on the screen. */
  check(!(await visible(page, '#archSeg')) && !(await visible(page, '.searchwrap')),
        'no search box or timeline switch over an empty archive');
  check(!(await visible(page, '#archChips')), 'and no filter chips either');
  await click('.tab[data-view="family"]'); await wait(300); await shot('01-family-empty');
  await click('.tab[data-view="keepsake"]'); await wait(300); await shot('01-keepsake-empty');

  // Swap the question: the good first questions are offered.
  await click('.tab[data-view="ask"]'); await wait(300);
  await click('[data-act="swap"]'); await wait(400); await shot('01-swap');
  check(/Good first questions/i.test(await text('#sheetBody')), 'first questions offered for a teller with no stories');
  await click('#sheetBody [data-act="setprompt"]'); await wait(400);
  const q1 = await text('#askList .aq');
  log('question now:', q1);

  // Hand them the phone: consent first.
  await click('[data-act="hand"]'); await wait(400);
  check(await visible(page, '#elderConsent'), 'consent shown before the first recording');
  await shot('01-consent');
  await click('#consentYes'); await wait(400);
  check(await visible(page, '#elderHome'), 'elder home after consent');
  check((await text('#elderQ')).trim() === q1.trim(), 'elder sees the same question the keeper chose');
  await shot('01-elder-home');

  // Record: talk, pause, carry on, done.
  await click('#elderRec'); await wait(2600); await shot('01-recording');
  check(await visible(page, '#elderRecording'), 'recording panel');
  check(/0:0[1-9]/.test(await text('#recTime')), 'timer runs: ' + await text('#recTime'));
  await click('#recPause'); await wait(700); await shot('01-paused');
  check(/Paused/i.test(await text('#recState')), 'paused state shown');
  const tPaused = await text('#recTime');
  await wait(800);
  check((await text('#recTime')) === tPaused, 'timer holds while paused');
  await click('#recPause'); await wait(1200);
  await click('#recDone'); await wait(1500); await shot('01-kept');
  check(await visible(page, '#elderDone'), 'kept screen after done');
  r = await raw(page);
  check(r.stories.length === 1 && r.stories[0].dur > 3 && r.stories[0].dur < 8, 'one story with a sane duration: ' + (r.stories[0] && r.stories[0].dur));
  check((await audioKeys(page)).length === 1, 'one recording in IndexedDB');
  await click('#doneOk'); await wait(400); await shot('01-elder-rested');
  check(/this week done/i.test(await text('#elderQ')), 'elder rests after answering');

  // Leave elder mode through the Back gesture and its confirm.
  check(await page.evaluate(() => App.back()), 'back in elder mode is consumed');
  await wait(300); await shot('01-leave-confirm');
  await click('[data-act="confirmyes"]'); await wait(400);
  check(await visible(page, '#v-ask'), 'back to Ask after leaving');
  check(/Answered this week/.test(await text('#askList')), 'Ask shows the week as answered');
  await shot('01-ask-answered');

  // Family: a listener, a second teller, the toggles, the family name.
  await click('.tab[data-view="family"]'); await wait(300);
  await click('[data-act="newperson"]'); await wait(300);
  await type('#npName', 'Zoe'); await shot('01-newperson');
  await click('[data-act="npsave"]'); await wait(400);
  await click('[data-act="newteller"]'); await wait(300);
  await type('#ntName', 'Sarla'); await type('#ntRel', 'Nani'); await type('#ntYear', '1939'); await type('#ntPlace', 'Lucknow');
  await click('#ntPacks .chip[data-p="india"]'); await wait(100);
  await shot('01-newteller');
  await click('[data-act="ntsave"]'); await wait(400);
  await click('[data-act="tog"][data-k="sound"]'); await wait(100);
  await setVal(page, '#famName', 'The Morgan family'); await wait(200);
  await shot('01-family');
  r = await raw(page);
  check(r.people.length === 1 && r.tellers.length === 2 && r.settings.sound === false && r.family === 'The Morgan family', 'family screen writes persisted');
  check(r.tellers[1].packs.indexOf('india') >= 0, 'second teller pack chosen');

  // The story sheet: play, mark, tag, title, notes, heart, follow up, visibility.
  await click('.tab[data-view="archive"]'); await wait(300); await shot('01-archive-one');
  await click('.story'); await wait(700); await shot('01-story');
  await click('#playBtn'); await wait(900);
  check(await page.$eval('#playBtn', e => e.classList.contains('playing')), 'play button shows playing');
  check(/0:0[1-9]/.test(await text('#pnow')), 'player time advances: ' + await text('#pnow'));
  await click('[data-act="mark"]'); await wait(300);
  await type('#mkNote', 'He laughs'); await click('[data-act="marksave"]'); await wait(400);
  await page.$eval('#tagLabel', e => { e.value = 'Nesta'; });
  await click('[data-act="addtag"]'); await wait(300);
  await click('[data-act="quicktag"][data-l="1960s"]'); await wait(300);
  await setVal(page, '[data-act="title"]', 'How they met');
  await setVal(page, '[data-act="notes"]', 'Recorded on the first Sunday.');
  await click('[data-act="heart"]'); await wait(300);
  await click('[data-act="vis"][data-v="sealed"]'); await wait(300);
  await shot('01-story-edited');
  r = await raw(page);
  const s = r.stories[0];
  check(s.moments.length === 1 && s.tags.length === 2 && s.title === 'How they met' && /first Sunday/.test(s.notes), 'story edits persisted');
  check(s.reactions.length === 1 && s.visibility === 'sealed' && /^\d{4}-\d\d-\d\d$/.test(s.sealUntil), 'heart and seal persisted');
  await click('[data-act="vis"][data-v="family"]'); await wait(300);
  await click('[data-act="followup"]'); await wait(300);
  await type('#fuText', 'What music did you dance to?');
  await click('[data-act="fusave"]'); await wait(500);
  check(await visible(page, '#v-ask'), 'follow up lands on Ask');
  check(/What music did you dance to/.test(await text('#askList')), 'follow up waits in the queue');
  await shot('01-ask-queue');

  // Threads and search.
  await click('.tab[data-view="archive"]'); await wait(200);
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(200); await shot('01-threads');
  check(/Nesta/.test(await text('#archList')), 'thread for Nesta');
  await click('#archList .thread'); await wait(300);
  check(await page.$$eval('.story', l => l.length) === 1, 'thread filter shows the story');
  await type('#archSearch', 'laughs'); await wait(200);
  check(await page.$$eval('.story', l => l.length) === 1, 'search hits a marked moment');
  await setVal(page, '#archSearch', 'zzzz'); await wait(200); await shot('01-search-none');
  check(/Nothing matches/.test(await text('#archList')), 'no match state');
  await setVal(page, '#archSearch', ''); await wait(100);

  await click('.tab[data-view="keepsake"]'); await wait(300); await shot('01-keepsake');

  // Reload keeps everything. A brand new tab keeps everything.
  const before = JSON.stringify(await raw(page));
  await page.reload({ waitUntil: 'networkidle0' }); await wait(500);
  check(JSON.stringify(await raw(page)) === before, 'record identical after reload');
  check((await audioKeys(page)).length === 1, 'audio survives reload');
  const p2 = await browser.newPage();
  await p2.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p2.goto(page.url(), { waitUntil: 'networkidle0' });
  await wait(500);
  check(JSON.stringify(await p2.evaluate(k => JSON.parse(localStorage.getItem(k)), 'heirloom.v1')) === before, 'record identical in a new tab');
  check(await p2.$eval('#v-archive', e => !e.hidden), 'new tab opens on the archive when stories exist');
  await p2.close();

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
