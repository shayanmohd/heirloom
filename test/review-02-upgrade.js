/* Reviewer pass 2: a phone that has been running 1.0.0 for months opens 1.0.1.
   The record below is shaped exactly as `git show 91e0d13:web/js/store.js` wrote it: no
   skippedAt on a teller, no deferUntil on a queued question, no v bump, and it carries the
   awkward shapes a real 1.0.0 phone could hold (a teller who never answered and so has no
   answeredAt key at all, a stale `current` from a week that has long passed, a settings
   object missing a key, a seal whose date has already come, a very long queued question). */
const L = require('./lib.js');
const DAY = 86400000;

function v100() {
  const now = Date.now();
  const ago = d => now - d * DAY;
  const past = d => { const x = new Date(now - d * DAY); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  return {
    v: 1,
    onboarded: true,
    family: 'The Morgan family',
    tellers: [
      /* answered a fortnight ago; note there is no skippedAt key, as 1.0.0 never wrote one */
      { id: 't_arthur', name: 'Arthur Llewellyn Morgan of Cardiff and later Newport',
        relation: 'Papa', birthYear: 1947, place: 'Cardiff', packs: ['midcentury', 'britain'],
        consent: { at: ago(220), note: '' }, ritual: { day: 0, time: '15:00' },
        startedAt: ago(14), current: null, used: ['co033', 'br240', 'co024', 'co058'],
        skipped: ['co001'], answeredAt: ago(14) },
      /* never answered anything: 1.0.0 left answeredAt undefined, and current is stale */
      { id: 't_sarla', name: 'Sarla', relation: 'Nani', birthYear: 1939, place: 'Lucknow',
        packs: ['prewar', 'india'], consent: null, ritual: { day: 3, time: '11:00' },
        startedAt: ago(120),
        current: { week: 0, promptId: 'in187', text: 'What did the monsoon sound like on your roof?', label: 'Rain on the roof', fromId: null },
        used: [], skipped: [] }
    ],
    people: [
      { id: 'p_meera', name: 'Meera', role: 'keeper' },
      { id: 'p_zoe', name: 'Zoe', role: 'listener' }
    ],
    queue: [
      { id: 'q_1', tellerId: 't_arthur', text: 'What music did you dance to?', fromId: 'p_zoe', at: ago(3) },
      { id: 'q_2', tellerId: 't_arthur',
        text: 'You told me once that the whole street came out when the first television arrived, and that you were the only one small enough to fit behind the sofa, so tell me about that evening from the beginning, and who was in the room, and what was actually on the screen when it warmed up.',
        fromId: 'p_meera', at: ago(2) }
    ],
    stories: [
      { id: 's_1', tellerId: 't_arthur', promptId: 'co033',
        question: 'Tell me about your first job and your first pay.', label: 'The first pay',
        title: 'The first pay packet', askedBy: null, at: ago(200), dur: 492,
        mime: 'audio/webm;codecs=opus', size: 21000,
        tags: [{ type: 'person', label: 'Dai Morgan' }, { type: 'place', label: 'Cardiff' }, { type: 'decade', label: '1960s' }],
        moments: [{ t: 125, note: 'He does the foreman voice' }, { t: 340, note: 'The wage packet in his hand' }],
        notes: 'Ask him about the foreman again.', visibility: 'family', sealUntil: null,
        plays: 4, reactions: [{ personId: 'p_meera', at: ago(199) }, { personId: 'p_zoe', at: ago(198) }] },
      { id: 's_2', tellerId: 't_arthur', promptId: 'br240', question: 'Where did you go dancing?',
        label: 'The dance hall', title: '', askedBy: null, at: ago(160), dur: 407,
        mime: 'audio/webm;codecs=opus', size: 19000,
        tags: [{ type: 'place', label: 'The Capitol' }, { type: 'person', label: 'Nesta' }, { type: 'decade', label: '1960s' }],
        moments: [{ t: 211, note: 'He sings a bit of it' }], notes: '',
        visibility: 'private', sealUntil: null, plays: 3, reactions: [{ personId: 'p_zoe', at: ago(159) }] },
      /* sealed in 1.0.0 with a date that has since passed: it must play, not stay shut */
      { id: 's_3', tellerId: 't_arthur', promptId: 'co058',
        question: 'Describe your wedding day from waking up to going to sleep.', label: 'The whole day',
        title: 'The wedding, minute by minute', askedBy: null, at: ago(120), dur: 723,
        mime: 'audio/webm;codecs=opus', size: 30000,
        tags: [{ type: 'person', label: 'Nesta' }, { type: 'place', label: 'Cardiff' }],
        moments: [], notes: '', visibility: 'sealed', sealUntil: past(30), plays: 0, reactions: [] },
      { id: 's_4', tellerId: 't_arthur', promptId: null, question: 'What was Nan like when you met her?',
        label: '', title: '', askedBy: 'p_zoe', at: ago(14), dur: 333,
        mime: 'audio/webm;codecs=opus', size: 16000,
        tags: [{ type: 'person', label: 'Nesta' }], moments: [{ t: 96, note: 'He goes quiet, then laughs' }],
        notes: '', visibility: 'family', sealUntil: null, plays: 6,
        reactions: [{ personId: 'p_zoe', at: ago(13) }, { personId: 'p_meera', at: ago(13) }] }
    ],
    /* 1.0.0 shipped five settings; this phone predates one of them being written back */
    settings: { haptics: true, notify: true, speak: true, reactAs: 'p_meera' }
  };
}

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = L.assert;
  const before = v100();

  await L.clearAudio(page);
  await L.seed(page, before, { native: true, audio: ['s_1', 's_2', 's_3', 's_4'] });
  await wait(600);

  /* ---------------------------------------------- nothing lost, nothing misread */
  const after = await L.raw(page);
  assert(after.v === 1, 'the schema version is untouched: ' + after.v);
  assert(after.family === before.family, 'the family name survives');
  assert(after.tellers.length === 2, 'both tellers survive');
  assert(after.people.length === 2, 'both listeners survive');
  assert(after.stories.length === 4, 'all four stories survive');
  assert(after.queue.length === 2, 'both queued questions survive');

  for (const s of before.stories) {
    const n = after.stories.find(x => x.id === s.id);
    assert(n, 'story ' + s.id + ' is still here');
    for (const k of Object.keys(s)) {
      assert(JSON.stringify(n[k]) === JSON.stringify(s[k]),
        'story ' + s.id + '.' + k + ' unchanged: ' + JSON.stringify(s[k]) + ' vs ' + JSON.stringify(n[k]));
    }
  }
  for (const t of before.tellers) {
    const n = after.tellers.find(x => x.id === t.id);
    assert(n, 'teller ' + t.id + ' is still here');
    for (const k of ['name', 'relation', 'birthYear', 'place', 'packs', 'consent', 'ritual', 'used', 'skipped']) {
      assert(JSON.stringify(n[k]) === JSON.stringify(t[k]),
        'teller ' + t.id + '.' + k + ' unchanged: ' + JSON.stringify(t[k]) + ' vs ' + JSON.stringify(n[k]));
    }
  }
  /* the stored record is left byte for byte alone until the app next writes; the live
     settings are the merge of 1.0.0's four with the shipped defaults */
  const live = await page.evaluate(() => Store.settings());
  assert(live.sound === true, 'a setting 1.0.0 never wrote gets its default, got ' + live.sound);
  assert(live.reactAs === 'p_meera', 'the remembered reactor survives');
  assert(live.haptics === true && live.notify === true && live.speak === true, 'the four 1.0.0 settings survive');
  const keys = await L.audioKeys(page);
  assert(keys.length === 4, 'all four recordings are still in the database: ' + JSON.stringify(keys));

  /* ----------------------------------------------------- every screen reads it */
  await click('.tab[data-view="archive"]'); await wait(420);
  const arch = await text('#archSub');
  assert(/4 stories/.test(arch), 'the archive counts four: ' + arch);
  assert((await page.$$('#archList .story')).length === 3, 'the private one is hidden until asked for');
  await shot('r02-archive');

  await click('[data-act="filt"][data-k="private"]'); await wait(400);
  assert((await page.$$('#archList .story')).length === 4, 'showing private brings it back');
  await click('[data-act="filt"][data-k="private"]'); await wait(300);

  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(400);
  assert((await page.$$('.thread')).length >= 5, 'the 1.0.0 tags became threads');
  await shot('r02-threads');
  await click('#archSeg .seg-b[data-mode="timeline"]'); await wait(300);

  /* the seal that has come due plays, and says so */
  await click('.story[data-id="s_3"]'); await wait(500);
  const sheet = await text('#sheetBody');
  assert(sheet.toLowerCase().indexOf('the seal opened on') >= 0, 'the opened seal is explained: ' + sheet.slice(0, 200));
  assert(await page.$('#playBtn'), 'a seal whose date has passed plays');
  await click('#playBtn'); await wait(1500);
  assert(await page.evaluate(() => window.App.playing()), 'the 1.0.0 recording plays');
  assert(await page.$eval('#playErr', e => e.hidden), 'no player error on 1.0.0 audio');
  await shot('r02-sealopened');
  await page.mouse.click(195, 24); await wait(420);

  /* the ask screen with a very long 1.0.0 question in the queue */
  await click('.tab[data-view="ask"]'); await wait(420);
  const ask = await text('#askList');
  assert(ask.indexOf('What music did you dance to') >= 0, 'the queue is intact');
  await shot('r02-ask');

  await click('.tab[data-view="family"]'); await wait(400);
  const fam = await text('#famBody');
  assert(fam.indexOf('Arthur Llewellyn Morgan of Cardiff') >= 0, 'the long 1.0.0 name is not truncated on screen');
  assert(fam.indexOf('Meera') >= 0 && fam.indexOf('Zoe') >= 0, 'both listeners show');
  await shot('r02-family');

  await click('.tab[data-view="keepsake"]'); await wait(420);
  const keep = await text('#keepBody');
  assert(/Voices kept\s*1/.test(keep) || keep.indexOf('Voices kept') >= 0, 'the keepsake reads the archive');
  await shot('r02-keepsake');

  /* --------------------------------------------------- reminders after upgrade */
  const sched = await page.evaluate(() => window.__native.scheduled);
  assert(sched.length === 12, 'only the consenting teller is reminded, got ' + sched.length);
  assert(sched.every(n => n.at > Date.now()), 'nothing scheduled in the past');
  assert(sched.length <= 64, 'inside the shell cap');
  assert(new Set(sched.map(n => n.id)).size === sched.length, 'the ids are unique');

  /* ------------------------------------------------ export carries 1.0.0 data */
  await click('#keepBody [data-act="export"]'); await wait(3000);
  const saved = await page.evaluate(() => window.__native.saved.map(s => ({ name: s.name, len: s.b64.length })));
  assert(saved.length === 1, 'one zip written, got ' + JSON.stringify(saved));
  const zipInfo = await page.evaluate(() => {
    const bin = atob(window.__native.saved[0].b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const dec = new TextDecoder();
    const names = [];
    let manifest = null, readme = null;
    let o = 0;
    const v = new DataView(u.buffer);
    while (o < u.length - 4 && v.getUint32(o, true) === 0x04034b50) {
      const nlen = v.getUint16(o + 26, true), xlen = v.getUint16(o + 28, true);
      const size = v.getUint32(o + 18, true);
      const name = dec.decode(u.subarray(o + 30, o + 30 + nlen));
      const start = o + 30 + nlen + xlen;
      names.push(name);
      if (name === 'manifest.json') manifest = JSON.parse(dec.decode(u.subarray(start, start + size)));
      if (name === 'README.txt') readme = dec.decode(u.subarray(start, start + size));
      o = start + size;
    }
    return { names: names, stories: manifest.stories.length, tellers: manifest.tellers.length,
             people: manifest.people.length, family: manifest.family,
             readmeHead: readme.split('\n').slice(0, 10).join(' | '),
             missingLines: (readme.match(/no recording in this export/g) || []).length,
             files: manifest.stories.map(s => s.file) };
  });
  log(JSON.stringify(zipInfo.names));
  assert(zipInfo.stories === 4, 'the manifest has all four stories');
  assert(zipInfo.names.filter(n => n.indexOf('audio/') === 0).length === 4, 'four audio files in the zip');
  assert(zipInfo.family === 'The Morgan family', 'the family name is in the manifest');
  assert(zipInfo.readmeHead.indexOf('4 recordings') >= 0, 'the readme counts what is actually there: ' + zipInfo.readmeHead);
  assert(zipInfo.missingLines === 0, 'no story is marked as missing its audio');
  assert(zipInfo.files.every(f => zipInfo.names.indexOf(f) >= 0), 'every file the manifest names is in the zip');

  log('page errors: ' + errors.length);
};
