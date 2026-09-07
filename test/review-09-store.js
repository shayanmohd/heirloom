/* Reviewer pass 9: the three things the review changed in the store, held to their promises.
   The export names a file after the person and the subject, the manifest never names a file
   the zip does not hold, and a phone that refuses the write says so instead of saying Kept. */
const L = require('./lib.js');

const readZip = `((b64) => {
  const bin = atob(b64);
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
  return { names, readme, stories: manifest.stories };
})`;

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = L.assert;

  /* a teller whose name alone would fill the old forty character budget */
  const rec = L.v100Record();
  rec.tellers[0].name = 'Arthur Llewellyn Morgan of Cardiff and later Newport';
  await L.clearAudio(page);
  await L.seed(page, rec, { native: true, audio: ['s_1', 's_2', 's_5'] });
  await wait(600);

  await page.evaluate(() => { window.App.setView('keepsake'); }); await wait(440);
  await click('#keepBody [data-act="export"]'); await wait(3200);
  const zip = await page.evaluate(readZip + '(window.__native.saved[0].b64)');
  log(JSON.stringify(zip.names, null, 0));

  const withAudio = zip.stories.filter(s => s.file);
  assert(withAudio.length === 3, 'three stories carry a file, got ' + withAudio.length);
  for (const s of withAudio) {
    assert(zip.names.indexOf(s.file) >= 0, 'the manifest names a file the zip holds: ' + s.file);
    assert(/^audio\/arthur-llewellyn/.test(s.file), 'the file starts with the person: ' + s.file);
    assert(!/-$/.test(s.file.split('-s_')[0]), 'and does not end a half word: ' + s.file);
    const subject = (s.label || s.question).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0];
    assert(s.file.indexOf('-' + subject) > 0, 'and carries the subject "' + subject + '": ' + s.file);
  }
  const gone = zip.stories.filter(s => !s.file);
  assert(gone.length === 2, 'the two stories with no recording carry no file path, got ' + gone.length);
  assert(zip.readme.indexOf('3 recordings') >= 0, 'the readme counts three: ' + zip.readme.split('\n')[6]);
  assert((zip.readme.match(/no recording in this export/g) || []).length === 2, 'and names the two that are gone');

  /* the same zip still restores everything, files or no files */
  const b64 = await page.evaluate(() => window.__native.saved[0].b64);
  await L.clearAudio(page);
  await L.seed(page, null, { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('keepsake'); }); await wait(400);
  await page.evaluate(b => {
    const bin = atob(b);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dt = new DataTransfer();
    dt.items.add(new File([u], 'heirloom-archive.zip', { type: 'application/zip' }));
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, b64);
  await wait(3200);
  const back = await page.evaluate(() => Store.stories().map(s => ({ id: s.id, tags: s.tags.length, mime: s.mime })));
  assert(back.length === 5, 'all five stories restore, files or none, got ' + back.length);
  assert(back.every(s => s.mime), 'and each keeps a type: ' + JSON.stringify(back));
  const keys = await L.audioKeys(page);
  assert(keys.length === 3, 'the three that had audio have it again, got ' + JSON.stringify(keys));
  await shot('r09-restored');

  /* ------------------------------------- a phone that refuses to write the record */
  await L.clearAudio(page);
  await L.seed(page, L.v100Record(), { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('ask'); }); await wait(420);
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  const before = await page.evaluate(() => Store.stories().length);
  await page.evaluate(() => {
    window.__refused = 0;
    localStorage.setItem = function () { window.__refused++; throw new Error('QuotaExceededError'); };
  });
  await click('#elderRec'); await wait(2600);
  await click('#recDone'); await wait(3000);
  const refused = await page.evaluate(() => window.__refused);
  assert(refused > 0, 'the write was actually attempted, ' + refused + ' times');
  assert(await L.visible(page, '#elderErr'), 'a refused write shows the error card, not the kept card');
  const msg = await text('#errMsg');
  assert(msg && msg.length > 10, 'and says what happened: ' + msg);
  const line = await text('#errLine');
  assert(line.toLowerCase().indexOf('microphone') < 0, 'and does not blame the microphone: ' + line);
  assert(line.toLowerCase().indexOf('saved') >= 0, 'it names the real failure: ' + line);
  const after = await page.evaluate(() => Store.stories().length);
  assert(after === before, 'nothing was added to the record, ' + before + ' to ' + after);
  const t = await page.evaluate(() => { const x = Store.teller('t_arthur'); return { answeredAt: x.answeredAt, used: x.used.length }; });
  assert(t.answeredAt === null, 'and the teller is not marked as having answered: ' + JSON.stringify(t));
  await wait(800);
  const ak = await L.audioKeys(page);
  assert(ak.length === 0, 'and no orphan recording is left behind: ' + JSON.stringify(ak));
  await shot('r09-refused');

  /* -------------------------------- the same card, the other two failures it carries */
  await L.clearAudio(page);
  await L.seed(page, L.v100Record(), { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('ask'); }); await wait(420);
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  await click('#elderRec'); await wait(700);
  await click('#recDone'); await wait(2200);
  assert(await L.visible(page, '#elderErr'), 'pressing Done straight away shows the error card, saw ' +
    (await page.evaluate(() => ['elderHome','elderConsent','elderRecording','elderDone','elderErr'].filter(p => !document.getElementById(p).hidden).join(','))));
  const shortLine = await text('#errLine');
  assert(shortLine.toLowerCase().indexOf('short') >= 0, 'and says it was too short: ' + shortLine);
  assert(shortLine.toLowerCase().indexOf('microphone') < 0, 'not that the microphone failed: ' + shortLine);
  await shot('r09-tooshort');
  await click('#errBack'); await wait(420);

  /* a microphone the person has said no to */
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
  });
  await click('#elderRec'); await wait(1400);
  assert(await L.visible(page, '#elderErr'), 'a refused microphone shows the error card');
  const micLine = await text('#errLine'), micMsg = await text('#errMsg');
  assert(micLine.toLowerCase().indexOf('microphone') >= 0, 'and this time it is the microphone: ' + micLine);
  assert(micMsg.toLowerCase().indexOf('permission') >= 0, 'with something to do about it: ' + micMsg);
  await shot('r09-nomic');

  log('page errors: ' + errors.length);
};
