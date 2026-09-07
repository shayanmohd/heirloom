/* Reviewer pass 5: contrast, measured off the rendered pixels rather than off the stylesheet,
   so gradients, the vignette inside the big button and the translucent tab bar are all counted.
   For each label the region is screenshotted, decoded back inside the page on a canvas, and the
   ink is taken as the extreme luminance that still covers a real share of the pixels. WCAG AA:
   4.5 for body text, 3.0 for large text and for a control's own shape. */
const L = require('./lib.js');

const DECODE = `((dataUrl) => new Promise(res => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b) => 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    const bins = new Map();
    const L = new Float64Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      L[j] = lum(d[i], d[i + 1], d[i + 2]);
      const k = (d[i] >> 2) + ',' + (d[i + 1] >> 2) + ',' + (d[i + 2] >> 2);
      const e = bins.get(k);
      if (e) { e.n++; } else bins.set(k, { n: 1, c: [d[i], d[i + 1], d[i + 2]] });
    }
    const n = L.length;
    const modes = [...bins.values()].sort((a, b) => b.n - a.n);
    const bg = modes[0].c;
    const bgL = lum(bg[0], bg[1], bg[2]);
    const sorted = Float64Array.from(L).sort();
    /* the ink is the far end of the spread, half a percent in so a stray pixel cannot
       decide it; at two device pixels per CSS pixel a glyph stem is solid, so this is
       the real colour of the text rather than its anti-aliasing */
    const q = Math.max(1, Math.floor(n * 0.005));
    const inkL = bgL > 0.28 ? sorted[q] : sorted[n - 1 - q];
    /* a readable name for it: the average of the pixels sitting at that luminance */
    let rr = 0, gg = 0, bb = 0, cnt = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      if (Math.abs(L[j] - inkL) < 0.004) { rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; cnt++; }
    }
    const hi = Math.max(inkL, bgL), lo = Math.min(inkL, bgL);
    res({ ratio: Math.round((hi + 0.05) / (lo + 0.05) * 100) / 100,
          ink: cnt ? [Math.round(rr / cnt), Math.round(gg / cnt), Math.round(bb / cnt)] : null,
          bg: bg, inkShare: Math.round(cnt / n * 1000) / 10 });
  };
  img.onerror = () => res(null);
  img.src = dataUrl;
}))`;

module.exports = async ({ page, shot, wait, click, errors, log }) => {
  const assert = L.assert;
  const fails = [], rows = [];

  const measure = async (label, sel, kind) => {
    const box = await page.evaluate(s => {
      const e = document.querySelector(s);
      if (!e) return null;
      let r = e.getBoundingClientRect();
      /* only move the page when the thing is not already on it: scrolling a screen that
         does not need it changes what is under the clip */
      if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: 'center' }); r = e.getBoundingClientRect(); }
      const cs = getComputedStyle(e);
      const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
      return { x: r.x, y: r.y, w: r.width, h: r.height, size, weight };
    }, sel);
    if (!box || box.w < 2 || box.h < 2) { fails.push(label + ': not on screen'); return; }
    await wait(90);
    const clip = { x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)),
                   width: Math.max(2, Math.round(box.w)), height: Math.max(2, Math.round(box.h)) };
    const buf = await page.screenshot({ clip, encoding: 'base64' });
    const out = await page.evaluate(DECODE + '("data:image/png;base64,' + buf + '")');
    if (!out) { fails.push(label + ': nothing to measure'); return; }
    const large = kind === 'graphic' || box.size >= 24 || (box.size >= 18.66 && box.weight >= 700);
    const need = large ? 3 : 4.5;
    rows.push(label.padEnd(34) + out.ratio + '  need ' + need + '  ' + box.size + 'px/' + box.weight +
              '  ink ' + out.ink + ' on ' + out.bg + '  ' + out.inkShare + '%');
    if (out.ratio < need) fails.push(label + ': ' + out.ratio + ' needs ' + need +
      ' (ink ' + out.ink + ' on ' + out.bg + ', ' + box.size + 'px weight ' + box.weight + ')');
  };

  await L.clearAudio(page);
  await L.seed(page, null, { native: true });
  await wait(400);

  /* --------------------------------------------------------- onboarding */
  await measure('onboarding eyebrow', '.ob-step[data-step="0"] .ob-eyebrow');
  await measure('onboarding body', '.ob-step[data-step="0"] .ob-sub');
  await measure('onboarding heading', '.ob-step[data-step="0"] .ob-line');
  await measure('Next button', '#obNext');
  await click('#obNext'); await wait(420); await click('#obNext'); await wait(420); await click('#obNext'); await wait(460);
  await measure('field label', '.ob-step[data-step="3"] .fld > span');
  await measure('field helper', '.ob-step[data-step="3"] .fld-note');
  await measure('pack chip, off', '#obPacks .chip');
  await page.$eval('#obName', e => { e.value = 'Arthur'; });
  await click('#obNext'); await wait(500);

  /* ---------------------------------------------------------- the app */
  await L.seed(page, L.v100Record(), { native: true, audio: ['s_5'] });
  await wait(500);
  await measure('archive subtitle', '#archSub');
  await measure('segment, off', '#archSeg .seg-b:not(.on)');
  await measure('segment, on', '#archSeg .seg-b.on');
  await measure('search placeholder', '#archSearch');
  await measure('filter chip, off', '#archChips .chip:not(.on)');
  await measure('filter chip, on', '#archChips .chip.on');
  await measure('month rule', '.month');
  await measure('story question', '.story .sq');
  await measure('story teller', '.story .who');
  await measure('badge', '.badge');
  await measure('tab, off', '.tab:not(.on)', 'graphic');
  await measure('tab, on', '.tab.on', 'graphic');

  await click('#archSeg .seg-b[data-mode="threads"]'); await wait(340);
  await measure('thread label', '.thread .tl');
  await measure('thread kind', '.thread .tt');
  await measure('thread count', '.thread .tn');
  await click('#archSeg .seg-b[data-mode="timeline"]'); await wait(320);

  await click('.story[data-id="s_1"]'); await wait(460);
  await measure('sheet question', '.sheet-q');
  await measure('sheet meta', '.sheet-meta');
  await measure('play button', '.play', 'graphic');
  await measure('player clock', '.ptime');
  await measure('ghost button', '[data-act="mark"]');
  await measure('moment time', '.moment .mt');
  await measure('input placeholder', '#tagLabel');
  await measure('tag chip', '.chip.tag');
  await measure('danger button', '[data-act="delstory"]');
  await measure('small print', '.tiny');
  await page.evaluate(() => window.App.closeSheet(true)); await wait(360);

  await click('.tab[data-view="ask"]'); await wait(380);
  await measure('ask card eyebrow', '.askcard .when');
  await measure('ask card question', '.askcard .aq');
  await measure('ask card from', '.askcard .from');
  await measure('primary button', '.askcard [data-act="hand"]');
  await measure('quiet button', '.askcard [data-act="swap"]');
  await measure('section rule', '#askList h2');
  await measure('pack blurb', '.packrow .pb');

  await click('.tab[data-view="family"]'); await wait(380);
  await measure('teller card name', '.tellcard .tn');
  await measure('teller card detail', '.tellcard .td');
  await measure('toggle label', '.toggle .tl');
  await measure('toggle sub', '.toggle .ts');
  await measure('switch, on', '.sw.on', 'graphic');
  await measure('note paragraph', '#famBody .note');

  await click('.tab[data-view="keepsake"]'); await wait(400);
  await measure('keepsake count', '.meter .big span');
  await measure('keepsake caption', '.meter .of');
  await measure('stat key', '.stat .k');
  await measure('stat value', '.stat .v');
  await measure('milestone hit', '.mile.hit .l');
  await measure('milestone unmet', '.mile:not(.hit) .l');

  /* ---------------------------------------------------------- elder mode */
  await click('.tab[data-view="ask"]'); await wait(360);
  await click('[data-act="hand"][data-id="t_sarla"]'); await wait(460);
  await measure('consent list', '.consent');
  await measure('consent button', '#consentYes');
  await measure('consent decline', '#consentNo');
  await click('#consentYes'); await wait(520);
  await measure('elder header', '#elderFor');
  await measure('elder question', '#elderQ');
  await measure('read aloud', '#elderSpeak');
  await measure('record button label', '.reccircle-label');
  await measure('reaction line', '#elderReact');
  await measure('skip link', '#elderSkip');
  await measure('exit mark', '#elderExit', 'graphic');
  await shot('r05-elder');

  await click('#elderRec'); await wait(2400);
  await measure('recording clock', '#recTime');
  await measure('recording state', '#recState');
  await measure('recording question', '#recQ');
  await measure('done button', '#recDone');
  await measure('pause button', '#recPause');
  await measure('start again link', '#recRedo');
  await shot('r05-recording');
  await click('#recDone'); await wait(2600);
  await measure('kept line', '#doneLine');
  await measure('kept detail', '#doneSub');
  await measure('finish button', '#doneOk');

  /* the toast, white on ink */
  await page.evaluate(() => window.App.toast('Saved to Downloads'));
  await wait(320);
  await measure('toast', '#toast');

  log('\n' + rows.join('\n') + '\n');
  assert(fails.length === 0, 'contrast below AA:\n' + fails.join('\n'));
  log('page errors: ' + errors.length);
};
