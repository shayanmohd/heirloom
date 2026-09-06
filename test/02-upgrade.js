/* Upgrade from 1.0.0: a record shaped exactly as the shipped store wrote it, with real
   recordings in IndexedDB, loads into this build with nothing lost or misread. */
const { seed, raw, assert, audioKeys, visible } = require('./lib');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const rec = require('./lib').v100Record();
  await seed(page, rec, { native: true, audio: ['s_1', 's_2', 's_3', 's_4', 's_5'] });
  await wait(600);
  check(!(await visible(page, '#onboard')), 'no onboarding for an upgraded user');
  check(await visible(page, '#v-archive'), 'opens on the archive');
  check(/5 stories, 40 minutes/.test(await text('#archSub')), 'archive header counts every story: ' + await text('#archSub'));
  const cards = await page.$$eval('.story', l => l.length);
  check(cards === 4, 'private story hidden, sealed shown: ' + cards + ' cards');
  check(/Sealed until/.test(await text('#archList')), 'sealed badge on the sealed story');
  await shot('02-archive');
  await click('[data-act="filt"][data-k="private"]'); await wait(200);
  check(await page.$$eval('.story', l => l.length) === 5, 'show private reveals the fifth');
  await click('[data-act="filt"][data-k="private"]'); await wait(100);

  // Ask: the family question jumps the queue for Arthur, Sarla keeps her cached pick.
  await click('.tab[data-view="ask"]'); await wait(300); await shot('02-ask');
  const ask = await text('#askList');
  check(/Zoe asks:\s*What music did you dance to\?/.test(ask), 'family question at the front for Arthur');
  check(/What did the monsoon sound like on your roof\?/.test(ask), 'Sarla keeps the question 1.0.0 chose');

  // Family: consent state, listeners, settings and family name survive.
  await click('.tab[data-view="family"]'); await wait(300); await shot('02-family');
  const fam = await text('#famBody');
  check((await text('#famTitle')) === 'The Morgan family', 'family name survives');
  check(/Meera/.test(fam) && /Zoe/.test(fam), 'listeners survive');
  check(!(await page.$eval('[data-act="tog"][data-k="sound"]', e => e.classList.contains('on'))), 'sound off survives');
  check(await page.$eval('[data-act="tog"][data-k="notify"]', e => e.classList.contains('on')), 'notify on survives');
  await click('.tellcard[data-id="t_arthur"]'); await wait(400); await shot('02-teller');
  check(/agreed to be recorded/.test(await text('#sheetBody')), 'consent date survives');
  check(await page.$eval('[data-act="tpack"][data-p="britain"]', e => e.classList.contains('on')), 'packs survive');
  check(await page.$eval('[data-act="tday"]', e => e.value) === '0' && await page.$eval('[data-act="ttime"]', e => e.value) === '15:00', 'ritual survives');
  await page.evaluate(() => App.closeSheet(true));

  // The story sheet: play a 1.0.0 recording, the plays count moves, moments and tags render.
  await click('.tab[data-view="archive"]'); await wait(300);
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(800); await shot('02-story');
  const sh = await text('#sheetBody');
  check(/He does the foreman voice/.test(sh) && /Dai Morgan/.test(sh) && /Cardiff/.test(sh), 'moments and tags render');
  check(await page.$eval('[data-act="title"]', e => e.value) === 'The first pay packet', 'title survives');
  await click('#playBtn'); await wait(900);
  check(await page.$eval('#playBtn', e => e.classList.contains('playing')), 'a 1.0.0 recording plays');
  check(/0:0[1-9]/.test(await text('#pnow')), 'player time advances');
  check((await raw(page)).stories.find(s => s.id === 's_1').plays === 5, 'play count increments from 4 to 5');
  await page.evaluate(() => App.closeSheet(true));
  await page.evaluate(() => App.openSheet('story', 's_4')); await wait(500); await shot('02-sealed');
  check(/Sealed until/.test(await text('#sheetBody')) && !(await page.$('#playBtn')), 'sealed story has no player');
  await page.evaluate(() => App.closeSheet(true));

  // Threads: Nesta appears in three.
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(200); await shot('02-threads');
  check(/Nesta/.test(await text('#archList')), 'thread for Nesta');
  await click('#archSeg .seg-b[data-mode="timeline"]');

  // Keepsake counts.
  await click('.tab[data-view="keepsake"]'); await wait(300); await shot('02-keepsake');
  const meterN = await page.$eval('.meter .big', e => e.textContent.trim());
  const voices = await page.$$eval('#keepBody .stat', l => {
    const r = l.find(e => /Voices kept/.test(e.innerText));
    return r ? r.querySelector('.v').textContent.trim() : null;
  });
  check(meterN === '5' && voices === '1', 'keepsake counts five stories in one voice: ' + meterN + ' / ' + voices);

  // Export through the shell: a zip that unzip accepts, with every audio file in it.
  await click('#keepBody [data-act="export"]'); await wait(2500);
  const saved = await page.evaluate(() => window.__native.saved);
  check(saved.length === 1 && saved[0].mime === 'application/zip' && /^heirloom-archive-\d{4}-\d\d-\d\d\.zip$/.test(saved[0].name), 'one zip handed to the shell: ' + (saved[0] && saved[0].name));
  const out = path.join(__dirname, 'shots', 'upgrade-export.zip');
  fs.writeFileSync(out, Buffer.from(saved[0].b64, 'base64'));
  const listing = execSync('unzip -l ' + JSON.stringify(out)).toString();
  log(listing.split('\n').slice(-2, -1)[0].trim());
  check(/manifest\.json/.test(listing) && /README\.txt/.test(listing) && (listing.match(/audio\//g) || []).length === 5, 'zip lists manifest, readme and 5 audio files');
  check(execSync('unzip -t ' + JSON.stringify(out)).toString().indexOf('No errors detected') >= 0, 'unzip -t finds no errors');
  const manifest = JSON.parse(execSync('unzip -p ' + JSON.stringify(out) + ' manifest.json').toString());
  check(manifest.stories.length === 5 && manifest.tellers.length === 2 && manifest.stories[0].teller === 'Arthur', 'manifest carries every story and teller');
  check(manifest.stories.some(s => s.askedBy === 'Zoe'), 'manifest names who asked');
  await shot('02-exported');

  // The schedule: only the consenting teller, all in the future, well under 64.
  const sched = await page.evaluate(() => window.__native.scheduled);
  check(Array.isArray(sched) && sched.length === 12 && sched.every(o => o.at > Date.now()), 'twelve future reminders for the consenting teller: ' + (sched && sched.length));
  check(sched.every(o => /Arthur/.test(o.title)), 'no reminders for a teller without consent');

  // Nothing dropped from the record by all of that.
  const r = await raw(page);
  check(r.tellers[0].used.length === 4 && r.tellers[0].skipped[0] === 'co001' && r.tellers[0].consent.at === rec.tellers[0].consent.at, 'used, skipped and consent intact');
  check(r.stories.length === 5 && r.stories.find(s => s.id === 's_3').notes === 'Ask him about the cane again.', 'notes intact');
  check(r.queue.length === 1 && r.people.length === 2 && r.settings.reactAs === 'p_meera', 'queue, people and reactAs intact');
  check((await audioKeys(page)).length === 5, 'five recordings still in IndexedDB');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
