/* Reviewer pass 8: the awkward inputs and the impatient thumb. Long strings, duplicate names,
   a year in the future, a seal date already past, every sheet opened and closed at speed, and
   the two export paths that are not the big one. */
const L = require('./lib.js');

const LONG = 'Bartholomew Fitzwilliam Llewellyn Morgan the Third of Cardiff';

module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const assert = L.assert;
  const fieldErr = sel => page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return 'no field';
    const f = e.closest('.fld') || e.parentElement;
    const p = f && f.querySelector('.fld-err');
    return p ? p.textContent : null;
  }, sel);

  await L.clearAudio(page);
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_1', 's_2', 's_5'] });
  await wait(500);

  /* --------------------------------------------------- a second teller, badly */
  await page.evaluate(() => window.App.setView('family')); await wait(420);
  await click('[data-act="newteller"]'); await wait(460);
  await click('[data-act="ntsave"]'); await wait(300);
  assert((await fieldErr('#ntName') || '').length > 5, 'an empty name is refused inline');

  await type('#ntName', 'arthur');
  await click('[data-act="ntsave"]'); await wait(340);
  const dup = await fieldErr('#ntName');
  assert(dup && dup.toLowerCase().indexOf('already here') >= 0, 'a duplicate name is refused: ' + dup);

  await L.setVal(page, '#ntName', LONG);
  await L.setVal(page, '#ntYear', '2199');
  await click('[data-act="ntsave"]'); await wait(340);
  const yr = await fieldErr('#ntYear');
  assert(yr && yr.length > 5, 'a year in the future is refused: ' + yr);
  await L.setVal(page, '#ntYear', '-40');
  await click('[data-act="ntsave"]'); await wait(340);
  assert((await fieldErr('#ntYear') || '').length > 5, 'a negative year is refused too');
  await L.setVal(page, '#ntYear', '1938');
  await L.setVal(page, '#ntPlace', 'Aberystwyth and later Pontypridd, then Newport for forty years');
  await click('[data-act="ntsave"]'); await wait(600);
  const t3 = await page.evaluate(() => Store.tellers()[2]);
  assert(t3 && t3.name.length <= 40, 'the long name is stored inside its limit: ' + t3.name.length);
  assert(t3.place.length <= 40, 'the long place is stored inside its limit: ' + t3.place.length);
  assert(t3.birthYear === 1938, 'the good year stuck: ' + t3.birthYear);
  await shot('r08-three-tellers');

  /* three tellers means the pack sheet has to ask who */
  await page.evaluate(() => window.App.setView('ask')); await wait(420);
  await click('#askList .packrow'); await wait(460);
  assert((await text('#sheetBody')).toLowerCase().indexOf('ask which of them') >= 0, 'the pack sheet asks who');
  await click('#sheetBody .promptrow'); await wait(420);
  const toast1 = await text('#toast');
  assert((toast1 || '').toLowerCase().indexOf('choose who') >= 0, 'and refuses to guess: ' + toast1);
  await click('[data-act="pickteller"]'); await wait(420);
  await click('#sheetBody .promptrow'); await wait(700);
  assert(await page.$eval('#sheet', e => e.hidden), 'picking a person then a question closes the sheet');
  const cur = await page.evaluate(() => Store.teller(Store.tellers()[0].id).current);
  assert(cur && cur.promptId, 'and a question is waiting: ' + JSON.stringify(cur));
  await shot('r08-pack-picked');

  /* --------------------------------------------------- the story sheet edges */
  await page.evaluate(() => window.App.setView('archive')); await wait(420);
  await click('.story[data-id="s_2"]'); await wait(500);

  /* marking before pressing play marks the opening, and says which second it marked */
  await click('[data-act="mark"]'); await wait(420);
  assert((await text('#sheetBody')).toLowerCase().indexOf('at 0:00') >= 0,
    'marking before playing marks the opening: ' + (await text('#sheetBody')).slice(0, 90));
  await click('[data-act="marksave"]'); await wait(600);
  const m0 = await page.evaluate(() => Store.story('s_2').moments);
  assert(m0.length === 2 && m0[0].t === 0, 'and it is kept at zero: ' + JSON.stringify(m0));
  await click('.story[data-id="s_2"]'); await wait(500);

  /* an empty tag is refused, a very long one is cut to size */
  await click('[data-act="addtag"]'); await wait(320);
  assert((await fieldErr('#tagLabel') || '').length > 5, 'an empty tag is refused inline');
  await L.setVal(page, '#tagLabel', 'A tag far longer than anybody would ever type into this box');
  await click('[data-act="addtag"]'); await wait(420);
  const tag = await page.evaluate(() => Store.story('s_2').tags.slice(-1)[0]);
  assert(tag.label.length <= 32, 'a long tag is cut to 32: ' + tag.label.length);

  /* the same tag twice is one tag */
  const before = await page.evaluate(() => Store.story('s_2').tags.length);
  await L.setVal(page, '#tagLabel', tag.label);
  await click('[data-act="addtag"]'); await wait(400);
  const afterT = await page.evaluate(() => Store.story('s_2').tags.length);
  assert(afterT === before, 'the same tag twice stays one tag: ' + before + ' to ' + afterT);

  /* a seal date already in the past leaves the story playable */
  await click('[data-act="vis"][data-v="sealed"]'); await wait(420);
  await page.$eval('[data-act="sealdate"]', e => { e.value = '2001-01-01'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await wait(500);
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);
  await click('.story[data-id="s_2"]'); await wait(500);
  assert(await page.$('#playBtn'), 'a seal date in the past does not hide the player');
  assert((await text('#sheetBody')).toLowerCase().indexOf('the seal opened') >= 0, 'and the sheet explains it');
  await shot('r08-seal-past');

  /* one story out, through the same bridge */
  await page.evaluate(() => { window.__native.saved.length = 0; });
  await click('[data-act="exportone"]'); await wait(1600);
  const one = await page.evaluate(() => window.__native.saved.map(s => s.name));
  assert(one.length === 1 && /\.webm$/.test(one[0]), 'one story exports as one audio file: ' + JSON.stringify(one));
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  /* one person out */
  await page.evaluate(() => { window.__native.saved.length = 0; window.App.setView('keepsake'); }); await wait(440);
  await click('[data-act="exportwho"]'); await wait(460);
  await click('#sheetBody .packrow'); await wait(3000);
  const who = await page.evaluate(() => window.__native.saved.map(s => s.name));
  assert(who.length === 1 && /^heirloom-arthur-/.test(who[0]), 'one person exports under their own name: ' + JSON.stringify(who));

  /* a person with no stories exports nothing and says so */
  await page.evaluate(() => { window.__native.saved.length = 0; });
  await click('[data-act="exportwho"]'); await wait(460);
  const rows = await page.$$('#sheetBody .packrow');
  await rows[2].click(); await wait(1600);
  const none = await page.evaluate(() => window.__native.saved.length);
  assert(none === 0, 'a teller with nothing recorded writes no file, got ' + none);
  assert((await text('#toast') || '').toLowerCase().indexOf('nothing to export') >= 0, 'and says so: ' + (await text('#toast')));

  /* ----------------------------------------- removing a listener and a teller */
  await page.evaluate(() => window.App.setView('family')); await wait(420);
  const reactBefore = await page.evaluate(() => Store.settings().reactAs);
  await click('[data-act="delperson"][data-id="' + reactBefore + '"]'); await wait(460);
  const reactAfter = await page.evaluate(() => Store.settings().reactAs);
  assert(reactAfter && reactAfter !== reactBefore, 'removing the remembered listener picks another: ' + reactAfter);

  await click('.tellcard'); await wait(460);
  await click('[data-act="delteller"]'); await wait(460);
  await click('[data-act="confirmyes"]'); await wait(900);
  const tn = await page.evaluate(() => Store.tellers().length);
  const sn = await page.evaluate(() => Store.stories().length);
  assert(tn === 2, 'the teller went, got ' + tn);
  assert(sn === 0, 'and their stories with them, got ' + sn);
  await wait(700);
  const ak = await L.audioKeys(page);
  assert(ak.length === 0, 'and their recordings, got ' + JSON.stringify(ak));
  await shot('r08-after-delete');

  /* ------------------------------------------- the impatient thumb, everywhere */
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_5'] });
  await wait(500);
  for (let i = 0; i < 3; i++) {
    for (const v of ['ask', 'family', 'keepsake', 'archive']) {
      await click('.tab[data-view="' + v + '"]'); await wait(60);
    }
  }
  await wait(600);
  assert(await L.visible(page, '#v-archive'), 'a dozen fast taps on the tab bar lands somewhere sane');
  assert(errors.length === 0, 'and nothing threw: ' + errors.join(' | '));

  /* open and shut every sheet quickly */
  await page.evaluate(() => window.App.setView('archive')); await wait(400);
  for (let i = 0; i < 4; i++) {
    await click('.story'); await wait(160);
    await page.evaluate(() => window.App.back()); await wait(160);
  }
  await wait(500);
  assert(await page.$eval('#sheet', e => e.hidden), 'the sheet is shut after four fast opens');

  /* an elder handed the phone and taken back at speed */
  await page.evaluate(() => window.App.setView('ask')); await wait(400);
  for (let i = 0; i < 3; i++) {
    await click('[data-act="hand"][data-id="t_arthur"]'); await wait(200);
    await page.evaluate(() => { window.App.setView('ask'); }); await wait(200);
  }
  await wait(500);
  assert(await L.visible(page, '#v-ask'), 'and the keeper gets their screen back');

  /* the read aloud button on a device with no voices must not throw */
  await click('[data-act="hand"][data-id="t_arthur"]'); await wait(460);
  const hasSpeak = await page.$('#elderSpeak:not([hidden])');
  if (hasSpeak) { await click('#elderSpeak'); await wait(900); log('read aloud says: ' + (await text('#toast'))); }
  else log('no speech synthesis in this browser, the button is hidden as designed');

  log('page errors: ' + errors.length);
};
