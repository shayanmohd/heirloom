/* Reviewer pass 10: the states that are easy to leave half drawn. The elder screen when the
   week is already answered, when it was skipped, and when the packs have run out; the keeper's
   ask card in the same three; and the archive with a search that finds nothing. */
const L = require('./lib.js');

module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const assert = L.assert;
  const gap = () => page.evaluate(() => {
    const vis = [...document.querySelectorAll('#elderHome > *')].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
    const body = document.querySelector('#elderHome').getBoundingClientRect();
    const boxes = vis.map(e => { const r = e.getBoundingClientRect(); return { tag: e.id || e.className, top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
    let worst = 0, where = '';
    for (let i = 1; i < boxes.length; i++) {
      const d = boxes[i].top - boxes[i - 1].bottom;
      if (d > worst) { worst = d; where = boxes[i - 1].tag + ' to ' + boxes[i].tag; }
    }
    const tail = Math.round(body.bottom - (boxes.length ? boxes[boxes.length - 1].bottom : body.top));
    return { boxes, worst: Math.round(worst), where, tail };
  });

  await L.clearAudio(page);
  await L.seed(page, L.v100Record(), { native: true });
  await wait(500);

  /* the week already answered */
  await page.evaluate(() => { Store.updateTeller('t_arthur', { answeredAt: Date.now(), skippedAt: null }); window.App.openElder('t_arthur'); });
  await wait(520);
  const answered = await text('#elderQ');
  assert(answered.toLowerCase().indexOf('this week done') >= 0, 'the elder is told the week is done: ' + answered);
  const g1 = await gap();
  log('answered: ' + JSON.stringify(g1));
  await shot('r10-elder-answered');

  /* the week skipped */
  await page.evaluate(() => { Store.updateTeller('t_arthur', { answeredAt: Date.now(), skippedAt: Date.now() }); window.App.openElder('t_arthur'); });
  await wait(520);
  const skipped = await text('#elderQ');
  assert(skipped.toLowerCase().indexOf('no question this week') >= 0, 'and told when it was skipped: ' + skipped);
  await shot('r10-elder-skipped');

  /* every question in their packs answered */
  await page.evaluate(() => {
    const t = Store.teller('t_arthur');
    t.packs = [];
    t.used = Content.PROMPTS.filter(p => p.pack === 'core').map(p => p.id);
    t.current = null; t.answeredAt = null; t.skippedAt = null;
    Store.save();
    Store.all().queue.length = 0;
    Store.save();
    window.App.openElder('t_arthur');
  });
  await wait(520);
  const dry = await text('#elderQ');
  assert(dry.toLowerCase().indexOf('no question waiting') >= 0, 'and when the packs have run dry: ' + dry);
  await shot('r10-elder-dry');
  const g3 = await gap();
  log('dry: ' + JSON.stringify(g3));

  /* the keeper's side of the same */
  await page.evaluate(() => { window.App.setView('ask'); }); await wait(460);
  const ask = await text('#askList');
  assert(ask.toLowerCase().indexOf('every question in their packs has been answered') >= 0,
    'the ask card offers another pack: ' + ask.slice(0, 140));
  assert(await page.$('.askcard [data-act="teller"]'), 'with a way to add one');
  await shot('r10-ask-dry');

  /* the swap sheet with nothing left to suggest */
  await page.evaluate(() => { window.App.openSheet('swap', 't_arthur'); }); await wait(500);
  const swap = await text('#sheetBody');
  assert(swap.toLowerCase().indexOf('has answered every question') >= 0, 'the swap sheet says so rather than showing an empty heading: ' + swap.slice(0, 200));
  await shot('r10-swap-dry');
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  /* a search that finds nothing, in both halves */
  await page.evaluate(() => { window.App.setView('archive'); }); await wait(440);
  await L.setVal(page, '#archSearch', 'llanfairpwllgwyngyll'); await wait(420);
  assert(await page.$('#archList .empty-art svg'), 'a timeline search with no hits is drawn');
  await shot('r10-search-none');
  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(420);
  assert(await page.$('#archList .empty-art svg'), 'and so is a threads search with no hits');
  await shot('r10-threads-none');

  log('page errors: ' + errors.length);
};
