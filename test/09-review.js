/* A second pair of eyes over the parts a keeper touches most: the weekly rhythm after a
   story is kept, the player, and whether every screen still passes AA once the paper,
   the gold and the cards are stacked on top of each other. */
const { v100Record, seed, seedAudio, raw, assert } = require('./lib');

module.exports = async ({ page, shot, wait, click, text, log }) => {
  const fails = [];
  const check = (ok, what) => { if (!ok) fails.push(what); };

  /* ---- the week after a story is kept ------------------------------------
     Sunday morning visits are the normal case: the family arrives before the
     ritual time, records, and must not be dealt a second question that afternoon. */
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 3600000);
  const hhmm = String(soon.getHours()).padStart(2, '0') + ':' + String(soon.getMinutes()).padStart(2, '0');
  const rec = v100Record();
  rec.tellers[0].ritual = { day: now.getDay(), time: hhmm };
  rec.tellers[0].answeredAt = Date.now() - 60000;
  rec.tellers[0].current = null;
  rec.tellers[1].consent = { at: Date.now() - 1000, note: '' };
  await seed(page, rec, { native: true });
  await wait(300);
  await click('[data-view="ask"]'); await wait(300);
  const askTxt = await text('#askList');
  check(/Answered this week/.test(askTxt), 'a teller who answered an hour ago is resting');
  const due = await page.evaluate(() => {
    const t = Store.tellers()[0];
    return { due: Store.nextDue(t, t.answeredAt), answered: t.answeredAt };
  });
  const sameDay = new Date(due.due).toDateString() === new Date(due.answered).toDateString();
  check(!sameDay, 'the next question is not dealt again on the day they answered');
  log('answered ' + new Date(due.answered).toString().slice(0, 24) + ' -> next ' + new Date(due.due).toString().slice(0, 24));

  /* Nothing is scheduled for the ritual slot they have already used. */
  const first = await page.evaluate(() => { App.onResume(); return (window.__native.scheduled || [])[0]; });
  check(first && new Date(first.at).toDateString() !== new Date(due.answered).toDateString(),
        'no reminder later on the day the story was kept');
  await shot('09-rested');

  /* ---- the player -------------------------------------------------------- */
  await seed(page, v100Record(), { native: true, audio: ['s_1', 's_2'] });
  await wait(300);
  await click('[data-act="story"][data-id="s_1"]'); await wait(500);
  await click('#playBtn'); await wait(700);
  check(await page.evaluate(() => App.playing()), 'the story plays');
  /* Run it to the end: the button must come back to a playable state, not stick. */
  await page.evaluate(() => { const a = document.querySelector('#playBtn'); a.click(); });
  await wait(200);
  await page.evaluate(async () => {
    const s = Store.story('s_1');
    App.closeSheet(true);
  });
  await wait(200);
  await click('[data-act="story"][data-id="s_2"]'); await wait(600);
  await click('#playBtn'); await wait(600);
  check(await page.evaluate(() => App.playing()), 'a second story plays after the first');
  const played = await page.evaluate(() => [Store.story('s_1').plays, Store.story('s_2').plays]);
  check(played[0] > 4 && played[1] > 3, 'both play counts moved: ' + played.join(','));
  await shot('09-player');
  await page.evaluate(() => App.closeSheet(true));
  await wait(200);

  /* ---- contrast on every screen ------------------------------------------
     Walks the painted tree, finds the real background behind each run of text and
     insists on 4.5:1 for body text and 3:1 for large text and for control edges. */
  const audit = () => page.evaluate(() => {
    const lum = c => { const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
    const parse = s => { const m = String(s).match(/[\d.]+/g); return m ? m.map(Number) : null; };
    const over = (fg, bg) => { const a = fg[3] == null ? 1 : fg[3];
      return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    /* Every ground a run of text could be sitting on: solid colours composited in order,
       and for a gradient, every one of its stops, since any of them can be under a letter. */
    const groundsOf = el => {
      const layers = [];
      let n = el;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n);
        const img = cs.backgroundImage || 'none';
        const stops = img.indexOf('gradient') >= 0
          ? (img.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean) : [];
        const c = parse(cs.backgroundColor);
        const solid = c && (c[3] == null || c[3] > 0.02) ? [c] : [];
        if (stops.length || solid.length) layers.push(stops.length ? stops : solid);
        n = n.parentElement;
      }
      let out = [[246, 239, 221]];
      for (let i = layers.length - 1; i >= 0; i--) {
        const next = [];
        for (const under of out) for (const c of layers[i]) next.push(over(c, under));
        out = next.slice(0, 24);
      }
      return out;
    };
    const bad = [];
    document.querySelectorAll('body *').forEach(el => {
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim());
      if (!own) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity < 0.5) return;
      const fg = parse(cs.color); if (!fg) return;
      const px = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
      const grounds = groundsOf(el);
      let got = 99;
      for (const g of grounds) got = Math.min(got, ratio(over(fg, g), g));
      if (got < need) bad.push(el.className + '|' + el.textContent.trim().slice(0, 24) + '|' + got.toFixed(2) + '/' + need);
    });
    return bad;
  });

  const screens = [
    ['archive', () => App.setView('archive')],
    ['ask', () => App.setView('ask')],
    ['family', () => App.setView('family')],
    ['keepsake', () => App.setView('keepsake')],
    ['story', () => { App.setView('archive'); App.openSheet('story', 's_1'); }],
    ['teller', () => { App.closeSheet(true); App.openSheet('teller', 't_arthur'); }],
    ['swap', () => { App.closeSheet(true); App.openSheet('swap', 't_arthur'); }],
    ['elder', () => { App.closeSheet(true); App.openElder('t_arthur'); }]
  ];
  for (const [name, fn] of screens) {
    await page.evaluate(f => eval('(' + f + ')()'), fn.toString());
    await wait(450);
    const bad = await audit();
    check(!bad.length, name + ' contrast: ' + bad.join(' ; '));
    if (bad.length) log(name, bad);
  }
  await page.evaluate(() => { App.closeSheet(true); App.setView('archive'); });

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
  log('09 clean');
};
