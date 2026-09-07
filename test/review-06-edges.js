/* Reviewer pass 6: the edges. Double taps on every primary button, the export and the
   restore round trip, an archive with a recording missing from the database, erase, search
   in both halves of the archive, and the reminder plan under six tellers and a clock change. */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const assert = L.assert;
  const dbl = sel => L.doubleTap(page, sel);

  /* ------------------------------------------------- double taps, everywhere */
  await L.clearAudio(page);
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_1', 's_5'] });
  await wait(500);

  /* a story kept twice by a bouncing thumb is one story */
  await click('.tab[data-view="ask"]'); await wait(380);
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  await click('#elderRec'); await wait(2600);
  await dbl('#recDone'); await wait(3000);
  const n1 = await page.evaluate(() => Store.stories().length);
  assert(n1 === 6, 'Done twice keeps one story, got ' + n1 + ' stories');
  assert(await L.visible(page, '#elderDone'), 'and it lands on the kept screen');
  const keys1 = await L.audioKeys(page);
  assert(keys1.length === 3, 'one new recording in the database, got ' + keys1.length);
  await click('#doneOk'); await wait(420);

  /* consent twice must not also press the record button underneath */
  await page.evaluate(() => { const t = Store.teller('t_sarla'); t.consent = null; Store.save(); window.App.openElder('t_sarla'); });
  await wait(460);
  assert(await L.visible(page, '#elderConsent'), 'the consent card');
  await dbl('#consentYes'); await wait(900);
  assert(await L.visible(page, '#elderHome'), 'agreeing twice lands on the home card, not in a recording');
  assert(await page.evaluate(() => Recorder.getState()) === 'idle', 'nothing started recording');
  await shot('r06-consent-double');

  /* skip twice */
  await dbl('#elderSkip'); await wait(700);
  const sk = await text('#elderQ');
  assert(sk.toLowerCase().indexOf('no question this week') >= 0, 'skipping says so: ' + sk);
  await page.evaluate(() => { Store.updateTeller('t_sarla', { answeredAt: null, skippedAt: null, current: null }); window.App.setView('archive'); });
  await wait(420);

  /* play twice on the same tap */
  await click('.story[data-id="s_1"]'); await wait(500);
  await dbl('#playBtn'); await wait(1800);
  assert(await page.evaluate(() => window.App.playing()), 'two taps on play leave it playing');
  assert(await page.$eval('#playErr', e => e.hidden), 'and no error is shown: ' + (await text('#playErr')));
  const plays = await page.evaluate(() => Store.story('s_1').plays);
  assert(plays === 5, 'the play was counted once, plays is ' + plays);
  await shot('r06-play-double');

  /* a heart twice is one heart */
  const h0 = await page.evaluate(() => Store.story('s_1').reactions.length);
  await dbl('[data-act="heart"][data-p="p_zoe"]'); await wait(700);
  const h1 = await page.evaluate(() => Store.story('s_1').reactions.length);
  assert(h1 === h0 + 1, 'a double tapped heart counts once: ' + h0 + ' to ' + h1);

  /* delete twice must not delete a second story */
  await click('[data-act="delstory"]'); await wait(460);
  await dbl('[data-act="confirmyes"]'); await wait(900);
  const n2 = await page.evaluate(() => Store.stories().length);
  assert(n2 === 5, 'one story went, got ' + n2);
  await wait(600);
  const keys2 = await L.audioKeys(page);
  assert(keys2.indexOf('s_1') < 0, 'and its recording went with it: ' + JSON.stringify(keys2));

  /* -------------------------------------------------------- export, restored */
  await click('.tab[data-view="keepsake"]'); await wait(420);
  await dbl('#keepBody [data-act="export"]'); await wait(3200);
  const saved = await page.evaluate(() => window.__native.saved.length);
  assert(saved === 1, 'a double tapped export writes one file, got ' + saved);
  const b64 = await page.evaluate(() => window.__native.saved[0].b64);
  log('zip is ' + b64.length + ' base64 chars');

  const beforeStories = await page.evaluate(() => Store.stories().map(s => ({ id: s.id, q: s.question, tags: s.tags.length, moments: s.moments.length, title: s.title, dur: s.dur })));

  /* wipe the phone and bring the export back in through the real file input */
  await L.clearAudio(page);
  await L.seed(page, null, { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('keepsake'); });
  await wait(400);
  await page.evaluate(async b => {
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const file = new File([u], 'heirloom-archive.zip', { type: 'application/zip' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, b64);
  await wait(3000);
  const note = await text('#importNote');
  log('restore says: ' + note);
  const afterStories = await page.evaluate(() => Store.stories().map(s => ({ id: s.id, q: s.question, tags: s.tags.length, moments: s.moments.length, title: s.title, dur: s.dur })));
  assert(afterStories.length === beforeStories.length, 'every story came back: ' + afterStories.length + ' of ' + beforeStories.length);
  for (const s of beforeStories) {
    const n = afterStories.find(x => x.id === s.id);
    assert(n, 'story ' + s.id + ' came back');
    assert(n.q === s.q && n.tags === s.tags && n.moments === s.moments && n.title === s.title,
      'story ' + s.id + ' came back whole: ' + JSON.stringify(n) + ' vs ' + JSON.stringify(s));
  }
  const rkeys = await L.audioKeys(page);
  assert(rkeys.length === 2, 'the two recordings came back, got ' + JSON.stringify(rkeys));
  await shot('r06-restored');

  /* importing the same file again changes nothing */
  await page.evaluate(async b => {
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([u], 'heirloom-archive.zip', { type: 'application/zip' }));
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, b64);
  await wait(2600);
  const again = await page.evaluate(() => Store.stories().length);
  assert(again === beforeStories.length, 'a second restore of the same file adds nothing, got ' + again);
  const note2 = await text('#importNote');
  assert(note2.toLowerCase().indexOf('already here') >= 0, 'and it says so: ' + note2);

  /* a file that is not a Heirloom export says so inline, never with an alert */
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1, 2, 3, 4, 5])], 'holiday.zip', { type: 'application/zip' }));
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(1200);
  const bad = await text('#importNote');
  assert(bad.length > 10, 'a rubbish file is explained: ' + bad);
  await shot('r06-badfile');

  /* ------------------------------------ an archive whose audio has gone missing */
  await page.evaluate(() => new Promise(res => {
    const r = indexedDB.open('heirloom-audio', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('audio', 'readwrite');
      tx.objectStore('audio').clear();
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await page.evaluate(() => { window.__native.saved.length = 0; window.App.setView('keepsake'); });
  await wait(420);
  await click('#keepBody [data-act="export"]'); await wait(2600);
  const orphan = await page.evaluate(() => {
    const bin = atob(window.__native.saved[0].b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = new DataView(u.buffer), dec = new TextDecoder();
    const names = []; let readme = null, manifest = null, o = 0;
    while (o < u.length - 4 && v.getUint32(o, true) === 0x04034b50) {
      const nlen = v.getUint16(o + 26, true), xlen = v.getUint16(o + 28, true), size = v.getUint32(o + 18, true);
      const name = dec.decode(u.subarray(o + 30, o + 30 + nlen));
      const start = o + 30 + nlen + xlen;
      names.push(name);
      if (name === 'README.txt') readme = dec.decode(u.subarray(start, start + size));
      if (name === 'manifest.json') manifest = JSON.parse(dec.decode(u.subarray(start, start + size)));
      o = start + size;
    }
    return { names, readme, files: manifest.stories.map(s => s.file), stories: manifest.stories.length };
  });
  assert(orphan.names.length === 2, 'a zip with no audio holds only the manifest and the readme: ' + JSON.stringify(orphan.names));
  assert(orphan.readme.indexOf('0 recordings') >= 0, 'the readme counts nothing: ' + orphan.readme.split('\n')[6]);
  assert(orphan.readme.indexOf('no recording in this export') >= 0, 'and names the ones that are gone');
  log('manifest still lists ' + orphan.stories + ' stories with file paths: ' + JSON.stringify(orphan.files.slice(0, 1)));
  const missing = orphan.files.filter(f => orphan.names.indexOf(f) < 0);
  log('paths in the manifest with nothing behind them: ' + missing.length);

  /* the story sheet must say the recording is gone rather than fail silently */
  await page.evaluate(() => { window.App.setView('archive'); });
  await wait(420);
  await click('.story'); await wait(500);
  await click('#playBtn'); await wait(1400);
  const perr = await page.$eval('#playErr', e => ({ hidden: e.hidden, t: e.textContent }));
  assert(!perr.hidden && perr.t.length > 10, 'a missing recording is explained: ' + JSON.stringify(perr));
  await shot('r06-missing-audio');
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  /* --------------------------------------------- nothing to export at all */
  await L.clearAudio(page);
  await L.seed(page, { v: 1, onboarded: true, family: '', tellers: [{ id: 't1', name: 'Arthur', relation: '', birthYear: null, place: '', packs: [], consent: null, ritual: { day: 0, time: '15:00' }, startedAt: Date.now(), current: null, used: [], skipped: [] }], people: [], queue: [], stories: [], settings: { haptics: true, notify: true, speak: true, sound: true, reactAs: null } }, { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('keepsake'); }); await wait(400);
  await click('#keepBody [data-act="export"]'); await wait(1400);
  const none = await page.evaluate(() => window.__native.saved.length);
  assert(none === 0, 'an empty archive writes no file, got ' + none);
  const t0 = await text('#toast');
  assert((t0 || '').toLowerCase().indexOf('nothing to export') >= 0, 'and says so: ' + t0);

  /* ---------------------------------------------------------- search */
  await L.seed(page, L.v100Record(), { native: true });
  await wait(500);
  await L.setVal(page, '#archSearch', 'Nesta'); await wait(400);
  const hits = (await page.$$('#archList .story')).length;
  assert(hits >= 2, 'searching a tagged name finds the stories, got ' + hits);
  await L.setVal(page, '#archSearch', ''); await wait(300);
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(400);
  const thAll = (await page.$$('.thread')).length;
  await L.setVal(page, '#archSearch', 'Nesta'); await wait(400);
  const th = (await page.$$('.thread')).length;
  assert(th > 0 && th < thAll, 'the same search narrows the threads: ' + th + ' of ' + thAll);
  assert((await text('#archList')).indexOf('Nesta') >= 0, 'and the named thread is among them');
  await shot('r06-search-threads');
  await L.setVal(page, '#archSearch', 'zzzznothing'); await wait(400);
  assert((await page.$$('.thread')).length === 0 && (await page.$('#archList .empty')), 'a search with no threads is drawn, not blank');
  await L.setVal(page, '#archSearch', ''); await wait(400);
  await click('#archSeg .seg-b[data-mode="timeline"]'); await wait(320);

  /* ------------------------------------------------- erase means erase */
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_1', 's_2'] });
  await wait(500);
  await page.evaluate(() => new Promise(res => {
    /* an orphan write that no story points at, the kind a half finished keep leaves behind */
    const r = indexedDB.open('heirloom-audio', 1);
    r.onsuccess = () => {
      const tx = r.result.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(new Blob(['x']), 'orphan');
      tx.oncomplete = () => { r.result.close(); res(); };
    };
  }));
  await page.evaluate(() => { window.App.setView('family'); }); await wait(420);
  await click('[data-act="erase"]'); await wait(460);
  await click('[data-act="confirmyes"]');
  await wait(2500);
  const left = await L.raw(page);
  assert(!left || !left.onboarded, 'erase clears the record: ' + JSON.stringify(left));
  const ekeys = await L.audioKeys(page);
  assert(ekeys.length === 0, 'erase clears every audio row including the orphan: ' + JSON.stringify(ekeys));
  assert(await L.visible(page, '#onboard'), 'and the app is back at the first run');

  log('page errors: ' + errors.length);
};
