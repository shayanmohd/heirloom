/* The widest and longest content the app will actually let a person store, on the screens where
   there is least room for it: Elder Mode, the ask card, the archive and the sheets. Plus the
   states that only appear once a teller has run out of questions or a person out of stories. */
const { v100Record, seed, raw, visible, setVal } = require('./lib');

const LONG_NAME = 'Bartholomew Fitzgerald Montgomery';           /* 33, under the 40 cap */
const LONG_REL = 'Great grandfather Bartie';                      /* 24, under the 30 cap */
const LONG_Q = 'What did the kitchen look like in the house where you were born, and who was allowed to sit at the table, and what was cooked on a day when there was money, and what was cooked on a day when there was none?';

module.exports = async ({ page, shot, wait, click, text, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const noOverflow = async where => {
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
    check(w.doc <= w.win + 1, where + ': no sideways overflow (' + w.doc + ' vs ' + w.win + ')');
  };
  /* Nothing on a screen may be drawn through anything else on it. */
  const noOverlap = async (root, where) => {
    const hits = await page.evaluate(sel => {
      const kids = Array.from(document.querySelector(sel).children)
        .filter(e => !e.hidden && e.getBoundingClientRect().height > 2);
      const out = [];
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(), b = kids[j].getBoundingClientRect();
        const over = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (over > 2) out.push(kids[i].className + ' over ' + kids[j].className + ' by ' + Math.round(over));
      }
      return out;
    }, root);
    if (hits.length) log(where, 'OVERLAP:', hits.join(' ; '));
    check(!hits.length, where + ': nothing is drawn through anything else');
  };

  /* Anything a person has to press must be on the screen, not below it. */
  const onScreen = async (sel, where) => {
    const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: window.innerHeight }; }, sel);
    check(r && r.bottom <= r.h + 1 && r.top >= -1, where + ': ' + sel + ' is on the screen ' + JSON.stringify(r));
  };

  /* ---- a long name, a long relation and a 220 character family question ---- */
  const rec = v100Record();
  rec.tellers[0].name = LONG_NAME;
  rec.tellers[0].relation = LONG_REL;
  rec.queue = [{ id: 'q_long', tellerId: 't_arthur', text: LONG_Q.slice(0, 220), fromId: 'p_zoe', at: Date.now() - 1000 }];
  rec.tellers[0].answeredAt = null;
  rec.tellers[0].current = null;
  await seed(page, rec, { native: true });
  await wait(500);
  await noOverflow('archive with a long name');
  await shot('12-archive-long');
  await click('.tab[data-view="ask"]'); await wait(300);
  await noOverflow('ask with a long question');
  await shot('12-ask-long');
  await page.evaluate(() => App.openElder('t_arthur')); await wait(500);
  await noOverflow('elder with a long question');
  await noOverlap('#elderHome', 'elder with a long question');
  await onScreen('#elderRec', 'elder with a long question');
  await onScreen('#elderSkip', 'elder with a long question');
  await onScreen('#elderFor', 'elder header');
  check(await page.evaluate(() => document.querySelector('#elderQ').classList.contains('long')),
        'a 220 character question is set at the smaller size');
  check(await page.evaluate(() => { const e = document.querySelector('#elderFor'); return e.scrollWidth <= e.clientWidth + 1; }),
        'the long relation fits the header rather than running off it');
  await shot('12-elder-long');
  await click('#elderRec'); await wait(1400);
  await noOverflow('recording with a long question');
  await noOverlap('#elderRecording', 'recording with a long question');
  await onScreen('#recDone', 'recording with a long question');
  await shot('12-recording-long');
  await click('#recDone'); await wait(1800);
  await onScreen('#doneOk', 'kept');
  await shot('12-kept-long');

  /* ---- a story carrying everything it can carry ---------------------------- */
  const heavy = v100Record();
  heavy.stories[0].title = 'The first pay packet, the foreman, and the long walk home in the rain';
  heavy.stories[0].moments = Array.from({ length: 12 }, (_, i) => ({ t: i * 30 + 5, note: 'A moment worth finding again, number ' + (i + 1) }));
  heavy.stories[0].tags = ['Dai Morgan', 'Cardiff', '1960s', 'The Capitol', 'Nesta', 'Mr Pugh', 'Splott', 'The docks']
    .map((l, i) => ({ type: i % 3 === 0 ? 'person' : i % 3 === 1 ? 'place' : 'decade', label: l }));
  heavy.stories[0].notes = 'Ask him about the cane again. '.repeat(18).slice(0, 600);
  await seed(page, heavy, { native: true, audio: ['s_1'] });
  await wait(500);
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(700);
  await noOverflow('a story sheet with everything on it');
  await shot('12-story-heavy');
  await page.evaluate(() => { document.querySelector('.sheet-panel').scrollTop = 99999; }); await wait(300);
  await shot('12-story-heavy-bottom');
  await page.evaluate(() => App.closeSheet(true)); await wait(300);
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(300);
  await noOverflow('threads');
  await shot('12-threads-heavy');

  /* ---- a teller who has answered every question in their packs -------------- */
  const used = await page.evaluate(() => Content.PROMPTS.filter(p => p.pack === 'core').map(p => p.id));
  const done = v100Record({
    tellers: [{ id: 't_done', name: 'Ivy', relation: 'Gran', birthYear: 1938, place: 'Leeds', packs: [],
                consent: { at: Date.now() - 1000, note: '' }, ritual: { day: 0, time: '15:00' },
                startedAt: Date.now() - 1000, current: null, used, skipped: [], answeredAt: null }],
    stories: [], queue: [], people: []
  });
  await seed(page, done, { native: true }); await wait(400);
  await click('.tab[data-view="ask"]'); await wait(300);
  await click('[data-act="teller"][data-id="t_done"]'); await wait(400);
  await page.evaluate(() => App.closeSheet(true)); await wait(300);
  await page.evaluate(() => App.openSheet('swap', 't_done')); await wait(400);
  const swap = await text('#sheetBody');
  check(/has answered every question/.test(swap), 'the swap sheet says why there is nothing to suggest');
  check(!/Suggested for them\s*ALL PACKS/i.test(swap.replace(/\n/g, ' ')), 'no empty heading in the swap sheet');
  await shot('12-swap-exhausted');
  await page.evaluate(() => App.closeSheet(true));

  /* ---- exporting a person who has told nothing ------------------------------ */
  const twoTellers = v100Record();
  twoTellers.stories = twoTellers.stories.filter(s => s.tellerId === 't_arthur');
  await seed(page, twoTellers, { native: true, audio: ['s_1'] }); await wait(400);
  await click('.tab[data-view="keepsake"]'); await wait(300);
  await click('[data-act="exportwho"]'); await wait(500);
  await click('[data-act="exportteller"][data-id="t_sarla"]'); await wait(900);
  check(/Nothing to export/.test(await text('#toast')), 'exporting a person with no stories says so: ' + await text('#toast'));
  check(await page.evaluate(() => window.__native.saved.length) === 0, 'and writes no file');
  await shot('12-export-empty-person');

  /* ---- what the export actually says ---------------------------------------- */
  await page.evaluate(() => { window.__native.saved = []; });
  await click('[data-act="export"]'); await wait(1800);
  const zipB64 = await page.evaluate(() => (window.__native.saved[0] || {}).b64);
  check(!!zipB64, 'the full archive exported');
  const names = await page.evaluate(b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = new DataView(u.buffer);
    let eocd = -1;
    for (let i = u.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    const count = v.getUint16(eocd + 10, true);
    let off = v.getUint32(eocd + 16, true), out = [];
    for (let i = 0; i < count; i++) {
      const nlen = v.getUint16(off + 28, true), xlen = v.getUint16(off + 30, true), clen = v.getUint16(off + 32, true);
      out.push(new TextDecoder().decode(u.subarray(off + 46, off + 46 + nlen)));
      off += 46 + nlen + xlen + clen;
    }
    return out;
  }, zipB64);
  log('export holds:', JSON.stringify(names));
  check(names.indexOf('manifest.json') >= 0 && names.indexOf('README.txt') >= 0, 'the export carries its manifest and readme');
  check(names.filter(n => /^audio\//.test(n)).length === 1, 'and one audio file for the one recording that is on the phone: ' + JSON.stringify(names));
  const readme = await page.evaluate(b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = new DataView(u.buffer);
    let eocd = -1;
    for (let i = u.length - 22; i >= 0; i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    const count = v.getUint16(eocd + 10, true);
    let off = v.getUint32(eocd + 16, true), out = '';
    for (let i = 0; i < count; i++) {
      const nlen = v.getUint16(off + 28, true), xlen = v.getUint16(off + 30, true), clen = v.getUint16(off + 32, true);
      const lho = v.getUint32(off + 42, true), csize = v.getUint32(off + 20, true);
      const name = new TextDecoder().decode(u.subarray(off + 46, off + 46 + nlen));
      const lnlen = v.getUint16(lho + 26, true), lxlen = v.getUint16(lho + 28, true);
      if (name === 'README.txt') out = new TextDecoder().decode(u.subarray(lho + 30 + lnlen + lxlen, lho + 30 + lnlen + lxlen + csize));
      off += 46 + nlen + xlen + clen;
    }
    return out;
  }, zipB64);
  check(/holds 1 recording /.test(readme), 'the readme counts the recordings that are really there');
  check(/no recording in this export/.test(readme), 'and names the stories whose audio was already gone');
  check(!/[\u2013\u2014]/.test(readme), 'no dashes in the readme');
  log('readme head:', readme.split('\n').slice(0, 8).join(' / '));

  await noOverflow('after everything');
  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
  log('12 clean');
};
