/* Export through Native.saveFile and through the browser download, then bring an export back
   in with Restore, and check the round trip loses nothing. */
const { seed, raw, assert, audioKeys, clearAudio, visible, v100Record } = require('./lib');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const shots = path.join(__dirname, 'shots');
  const zipOk = file => execSync('unzip -t ' + JSON.stringify(file)).toString().indexOf('No errors detected') >= 0;

  /* Native: one story, one person, the whole archive. */
  await seed(page, v100Record(), { native: true, audio: ['s_1', 's_2', 's_3', 's_4', 's_5'] });
  await wait(400);
  await page.evaluate(() => App.openSheet('story', 's_2')); await wait(400);
  await click('[data-act="exportone"]'); await wait(800);
  let saved = await page.evaluate(() => window.__native.saved);
  check(saved.length === 1 && /^arthur-the-dance-hall\.webm$/.test(saved[0].name) && /webm/.test(saved[0].mime), 'one story exported as audio: ' + JSON.stringify(saved[0] && [saved[0].name, saved[0].mime]));
  check(Buffer.from(saved[0].b64, 'base64').length > 1000, 'the audio file has bytes');
  check(await page.evaluate(() => window.__native.shared.length === 1), 'handed to the share sheet');
  await page.evaluate(() => App.closeSheet(true));
  await click('.tab[data-view="keepsake"]'); await wait(300);
  await click('[data-act="exportwho"]'); await wait(300); await shot('04-exportwho');
  await click('[data-act="exportteller"][data-id="t_arthur"]'); await wait(2500);
  saved = await page.evaluate(() => window.__native.saved);
  check(saved.length === 2 && /^heirloom-arthur-\d{4}-\d\d-\d\d\.zip$/.test(saved[1].name), 'one person export named for them: ' + (saved[1] && saved[1].name));
  const one = path.join(shots, 'io-arthur.zip');
  fs.writeFileSync(one, Buffer.from(saved[1].b64, 'base64'));
  check(zipOk(one), 'unzip accepts the one person zip');
  const m1 = JSON.parse(execSync('unzip -p ' + JSON.stringify(one) + ' manifest.json').toString());
  check(m1.stories.length === 5 && m1.stories.every(s => s.teller === 'Arthur'), 'only that person in the zip');

  /* Browser path: capture the anchor click and read the blob. */
  await seed(page, v100Record(), { native: false });
  await wait(400);
  await page.evaluate(() => {
    window.__dl = [];
    HTMLAnchorElement.prototype.click = function () {
      const a = this;
      window.__dl.push(fetch(a.href).then(r => r.arrayBuffer()).then(b => ({ name: a.download, b64: (u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); })(new Uint8Array(b)) })));
    };
  });
  await click('.tab[data-view="family"]'); await wait(200);
  await click('#famBody [data-act="export"]'); await wait(2500);
  const dl = await page.evaluate(() => Promise.all(window.__dl));
  check(dl.length === 1 && /^heirloom-archive-\d{4}-\d\d-\d\d\.zip$/.test(dl[0].name), 'browser download produced the zip: ' + (dl[0] && dl[0].name));
  const full = path.join(shots, 'io-archive.zip');
  fs.writeFileSync(full, Buffer.from(dl[0].b64, 'base64'));
  check(zipOk(full), 'unzip accepts the browser zip');
  const m2 = JSON.parse(execSync('unzip -p ' + JSON.stringify(full) + ' manifest.json').toString());
  check(m2.stories.length === 5 && m2.tellers.length === 2, 'browser export complete');
  check(/Downloaded/.test(await text('#toast')), 'toast confirms the download');
  await shot('04-export-browser');

  /* Restore: a fresh phone, the zip comes back, everything is there. */
  await seed(page, { v: 1, onboarded: true, family: '', tellers: [], people: [], queue: [], stories: [], settings: { haptics: true, notify: true, speak: true, sound: true, reactAs: null } }, { native: true });
  await clearAudio(page);
  await wait(300);
  check((await raw(page)).stories.length === 0 && (await audioKeys(page)).length === 0, 'starting from nothing');
  await click('.tab[data-view="keepsake"]'); await wait(300);
  check(!!(await page.$('[data-act="import"]')), 'a restore control exists on Keepsake');
  await click('[data-act="import"]'); await wait(200);
  const input = await page.$('#importFile');
  check(!!input, 'restore uses a file input');
  await input.uploadFile(full);
  await wait(2500);
  await shot('04-restored');
  let r = await raw(page);
  check(r.stories.length === 5 && r.tellers.length === 2 && r.people.length === 2, 'stories, tellers and people restored: ' + r.stories.length + '/' + r.tellers.length + '/' + r.people.length);
  check((await audioKeys(page)).length === 5, 'five recordings restored to IndexedDB');
  const s1 = r.stories.find(s => s.title === 'The first pay packet');
  check(s1 && s1.tags.length === 3 && s1.moments.length === 2 && s1.dur === 492, 'tags, moments and duration restored');
  check(r.stories.some(s => s.visibility === 'sealed' && s.sealUntil) && r.stories.some(s => s.visibility === 'private'), 'visibility restored');
  const s5 = r.stories.find(s => /Nan like/.test(s.question));
  check(s5 && s5.askedBy && r.people.find(p => p.id === s5.askedBy).name === 'Zoe', 'who asked is restored by name');
  check(r.tellers.find(t => t.name === 'Arthur').consent && !r.tellers.find(t => t.name === 'Sarla').consent, 'consent restored');
  check(r.family === 'The Morgan family', 'family name restored');
  await click('.tab[data-view="archive"]'); await wait(300); await shot('04-restored-archive');
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(500);
  await click('#playBtn'); await wait(800);
  check(await page.$eval('#playBtn', e => e.classList.contains('playing')), 'a restored recording plays');
  await page.evaluate(() => App.closeSheet(true));

  // Restoring the same file twice adds nothing.
  await click('.tab[data-view="keepsake"]'); await wait(200);
  await click('[data-act="import"]'); await wait(100);
  await (await page.$('#importFile')).uploadFile(full); await wait(2000);
  r = await raw(page);
  check(r.stories.length === 5 && r.tellers.length === 2 && (await audioKeys(page)).length === 5, 'a second restore of the same file changes nothing');
  await shot('04-restored-twice');

  // Restoring a file that is not an export says so inline, without a page error.
  const junk = path.join(shots, 'io-junk.zip');
  fs.writeFileSync(junk, Buffer.from('not a zip at all'));
  await click('[data-act="import"]'); await wait(100);
  await (await page.$('#importFile')).uploadFile(junk); await wait(800);
  check(/not a Heirloom export|could not be read/i.test(await text('#keepBody')), 'bad file refused inline');
  await shot('04-restore-bad');

  // The round trip: export again and compare manifests.
  await click('#keepBody [data-act="export"]'); await wait(2500);
  saved = await page.evaluate(() => window.__native.saved);
  const again = path.join(shots, 'io-roundtrip.zip');
  fs.writeFileSync(again, Buffer.from(saved[saved.length - 1].b64, 'base64'));
  const m3 = JSON.parse(execSync('unzip -p ' + JSON.stringify(again) + ' manifest.json').toString());
  const strip = m => m.stories.map(s => [s.teller, s.question, s.title, s.seconds, s.visibility, s.sealedUntil, JSON.stringify(s.tags), JSON.stringify(s.moments), s.notes, s.askedBy].join('|')).sort().join('\n');
  check(strip(m3) === strip(m2), 'the manifest after a round trip matches the original');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
