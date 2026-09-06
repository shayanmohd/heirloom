/* The things a long-lived archive and a stubborn phone do: a full year of stories, a very long
   recording, the thirty minute cap, removing a teller, erasing everything, reduced motion, and
   a phone whose system theme is dark while the app is light only. */
const { seed, raw, audioKeys, clearAudio, visible, v100Record, DAY } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };

  /* A year of Sundays: 52 stories across two tellers, tagged and threaded. */
  const many = v100Record();
  const now = Date.now();
  many.stories = Array.from({ length: 52 }, (_, i) => ({
    id: 'sy' + i, tellerId: i % 3 ? 't_arthur' : 't_sarla', promptId: null,
    question: 'Question number ' + (i + 1) + ' about a life that went on for a long time.',
    label: '', title: i % 4 ? '' : 'A title for number ' + (i + 1), askedBy: null,
    at: now - i * 7 * DAY, dur: 240 + (i % 11) * 47, mime: 'audio/webm;codecs=opus', size: 21000,
    tags: [{ type: 'person', label: i % 2 ? 'Nesta' : 'Dai Morgan' }, { type: 'decade', label: (1940 + (i % 6) * 10) + 's' }],
    moments: [], notes: '', visibility: 'family', sealUntil: null, plays: i % 5, reactions: []
  }));
  await seed(page, many, { native: true });
  await wait(700);
  check(await page.$$eval('.story', l => l.length) === 52, 'all fifty two stories on the timeline');
  check(/52 stories/.test(await text('#archSub')), 'the header counts them: ' + await text('#archSub'));
  await shot('08-year-archive');
  await click('.tab[data-view="keepsake"]'); await wait(400);
  const meter = await page.$eval('.meter .big', e => e.textContent.trim());
  check(meter === '52', 'the keepsake disc shows fifty two: ' + meter);
  check(await page.$$eval('.mile.hit', l => l.length) === 6, 'six milestones reached: ' + await page.$$eval('.mile.hit', l => l.length));
  check(await page.$eval('.meter-art .rings', e => e.querySelectorAll('path').length) === 40, 'the disc draws at most forty rings');
  await shot('08-year-keepsake');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no horizontal overflow with a full archive');

  /* A long recording: the rings must stay inside the disc and the ring count must keep up. */
  await seed(page, v100Record(), { native: true }); await wait(400);
  await page.evaluate(() => App.openElder('t_arthur')); await wait(200);
  await click('#elderRec'); await wait(1200);
  check(await page.evaluate(() => Recorder.getState()) === 'recording', 'recording started');
  const geo = await page.evaluate(async () => {
    const real = Recorder.elapsed;
    const out = [];
    for (const t of [90, 400, 900, 1799]) {
      Recorder.elapsed = () => t;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.push(App.ringGeometry());
    }
    Recorder.elapsed = real;
    return out;
  });
  log('ring geometry:', JSON.stringify(geo));
  check(geo.every(g => g.outer <= g.half - 2), 'every ring stays inside the disc: ' + JSON.stringify(geo.map(g => [g.ring, Math.round(g.outer), Math.round(g.half)])));
  check(geo[geo.length - 1].ring === 29, 'thirty minutes is thirty rings: ' + geo[geo.length - 1].ring);
  check(geo.every(g => g.done === g.ring), 'every finished ring is kept, none dropped');
  await shot('08-long-recording');

  /* The cap: at thirty minutes the app stops itself and keeps what it has. The recorder counts
     with the wall clock, so pushing the wall clock forward is what a thirty minute story is. */
  const before = (await raw(page)).stories.length;
  check(await page.evaluate(() => Recorder.MAX_MS) === 1800000, 'the cap is thirty minutes');
  await page.evaluate(() => {
    const real = Date.now;
    Date.now = () => real() + 1801000;
    setTimeout(() => { Date.now = real; }, 1100);
  });
  await wait(3000);
  check(await visible(page, '#elderDone'), 'the cap ends the recording and keeps it');
  const after = (await raw(page)).stories.length;
  check(after === before + 1, 'the capped recording is in the archive: ' + before + ' to ' + after);
  const last = (await raw(page)).stories.slice(-1)[0];
  check(last && last.dur > 1700, 'and it is a full length story: ' + (last && Math.round(last.dur)) + 's');
  check(await page.evaluate(() => Recorder.getState()) === 'idle', 'the microphone is released');
  await shot('08-cap');
  await page.evaluate(() => App.setView('archive')); await wait(200);

  /* Removing a teller takes their recordings out of IndexedDB too. */
  await clearAudio(page);
  await seed(page, v100Record(), { native: true, audio: ['s_1', 's_2', 's_3', 's_4', 's_5'] }); await wait(500);
  check((await audioKeys(page)).length === 5, 'five recordings to start: ' + (await audioKeys(page)).length);
  await page.evaluate(() => App.openSheet('teller', 't_arthur')); await wait(300);
  await click('[data-act="delteller"]'); await wait(250);
  await click('[data-act="confirmyes"]'); await wait(1200);
  let r = await raw(page);
  check(r.tellers.length === 1 && r.stories.length === 0 && r.queue.length === 0, 'the teller, their stories and their queue are gone');
  check((await audioKeys(page)).length === 0, 'and so are the recordings: ' + (await audioKeys(page)).length);
  check(await page.evaluate(() => window.__native.scheduled.length === 0), 'the reminder plan is emptied with them');
  await shot('08-after-remove');

  /* Erase everything: back to the first run, nothing left anywhere. */
  await seed(page, v100Record(), { native: true, audio: ['s_1', 's_2'] }); await wait(500);
  await click('.tab[data-view="family"]'); await wait(300);
  await click('[data-act="erase"]'); await wait(250);
  await click('[data-act="confirmyes"]'); await wait(1800);
  r = await raw(page);
  check(!r || (!r.onboarded && !r.stories.length && !r.tellers.length), 'the record is back to nothing: ' + JSON.stringify(r && { on: r.onboarded, s: r.stories.length, t: r.tellers.length }));
  check((await audioKeys(page)).length === 0, 'no recordings left');
  check(await visible(page, '#onboard'), 'and the app is on its first run again');
  await shot('08-erased');

  /* Reduced motion: nothing animates, and nothing is left invisible by an animation that
     never ran. */
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await seed(page, v100Record(), { native: true }); await wait(600);
  const hidden = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.rise, .story, .thread, .empty-art, .view')) {
      const s = getComputedStyle(el);
      if (el.closest('[hidden]')) continue;
      if (+s.opacity < 0.99 || s.animationName !== 'none') out.push(el.className + ' op=' + s.opacity + ' anim=' + s.animationName);
    }
    return out;
  });
  check(!hidden.length, 'reduced motion leaves everything visible and still: ' + hidden.join(' ; '));
  await shot('08-reduced-motion');
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

  /* A phone set to dark: Heirloom is a light interface on purpose, so it must not be half
     repainted by the browser. */
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await seed(page, v100Record(), { native: true }); await wait(600);
  const dark = await page.evaluate(() => {
    const lum = c => { const m = (c || '').match(/[\d.]+/g); if (!m) return null; if (m.length > 3 && +m[3] < 0.5) return null;
                       const [r, g, b] = m.map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    const bad = [];
    /* Walk up for the painted background, then insist text and ground are far enough apart. */
    const ground = el => { let n = el; while (n) { const v = lum(getComputedStyle(n).backgroundColor); if (v != null) return v; n = n.parentElement; } return 1; };
    for (const el of document.querySelectorAll('input, select, textarea, .btn, .chip, .story, h1, p, .tab, .sw')) {
      if (el.closest('[hidden]')) continue;
      const s = getComputedStyle(el);
      const t = lum(s.color), g = ground(el);
      if (t != null && Math.abs(t - g) < 0.22) bad.push(el.tagName + '.' + el.className + ' text ' + s.color + ' on ' + g.toFixed(2));
    }
    return { html: getComputedStyle(document.documentElement).backgroundColor,
             scheme: getComputedStyle(document.documentElement).colorScheme, bad: bad.slice(0, 6) };
  });
  log('dark phone:', JSON.stringify(dark));
  check(dark.scheme === 'light', 'the page declares itself light only: ' + dark.scheme);
  check(/246, 239, 221/.test(dark.html), 'the paper is still paper: ' + dark.html);
  check(!dark.bad.length, 'nothing loses its contrast: ' + dark.bad.join(' ; '));
  await shot('08-dark-phone');
  await click('.tab[data-view="family"]'); await wait(300); await shot('08-dark-family');
  await page.evaluate(() => App.openSheet('story', 's_1')); await wait(400); await shot('08-dark-sheet');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

  if (errors.length) fails.push(errors.length + ' page error(s)');
  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
