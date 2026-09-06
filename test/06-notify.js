/* The reminder schedule: recomputed on every open, at most 64, nothing in the past, only for
   tellers who have consented, at the ritual hour, and the permission asked for when it matters. */
const { seed, raw, assert, visible, setVal, v100Record, DAY } = require('./lib');
module.exports = async ({ page, shot, wait, text, click, type, errors, log }) => {
  const fails = [];
  const check = (c, m) => { if (!c) { fails.push(m); log('FAIL:', m); } };
  const sched = () => page.evaluate(() => window.__native.scheduled);
  const sane = (s, label) => {
    check(Array.isArray(s), label + ': a schedule was sent');
    if (!Array.isArray(s)) return;
    check(s.length <= 64, label + ': at most 64, got ' + s.length);
    check(s.every(o => o.at > Date.now()), label + ': nothing in the past');
    check(new Set(s.map(o => o.id)).size === s.length, label + ': ids unique');
    check(s.every(o => typeof o.title === 'string' && o.title && typeof o.body === 'string' && o.body), label + ': every entry has text');
    check(s.every(o => !/[\u2013\u2014!]/.test(o.title + o.body)), label + ': no dashes or exclamation marks');
    check(s.every((o, i) => i === 0 || o.at >= s[i - 1].at), label + ': sorted by time');
    log(label + ':', s.length, 'entries;', s.slice(0, 3).map(o => new Date(o.at).toString().slice(0, 21) + ' ' + o.title).join(' | '));
  };

  // 1.0.0 record: one consenting teller, Sundays at 15:00.
  await seed(page, v100Record(), { native: true }); await wait(400);
  let s = await sched(); sane(s, 'upgrade');
  check(s.length === 12 && s.every(o => /Arthur/.test(o.title)), 'twelve for Arthur, none for Sarla who has not consented');
  check(s.every(o => { const d = new Date(o.at); return d.getDay() === 0 && d.getHours() === 15 && d.getMinutes() === 0; }), 'every one on a Sunday at 15:00 local');
  check(s.every((o, i) => i === 0 || o.at - s[i - 1].at === 7 * DAY || Math.abs(o.at - s[i - 1].at - 7 * DAY) === 3600000), 'a week apart');

  // Sarla consents: her Wednesdays at 11:00 join the plan.
  await page.evaluate(() => App.openElder('t_sarla')); await wait(200);
  await click('#consentYes'); await wait(300);
  s = await sched(); sane(s, 'after consent');
  check(s.length === 24 && s.some(o => /Sarla/.test(o.title)), 'both tellers scheduled');
  check(s.filter(o => /Sarla/.test(o.title)).every(o => { const d = new Date(o.at); return d.getDay() === 3 && d.getHours() === 11; }), 'Sarla on Wednesdays at 11:00');
  await page.evaluate(() => App.back()); await click('[data-act="confirmyes"]'); await wait(200);

  // Changing the ritual recomputes the plan at once.
  await click('.tab[data-view="family"]'); await wait(200);
  await click('.tellcard[data-id="t_arthur"]'); await wait(300);
  await setVal(page, '[data-act="tday"]', '6'); await wait(150);
  await setVal(page, '[data-act="ttime"]', '19:30'); await wait(150);
  s = await sched(); sane(s, 'after ritual change');
  check(s.filter(o => /Arthur/.test(o.title)).every(o => { const d = new Date(o.at); return d.getDay() === 6 && d.getHours() === 19 && d.getMinutes() === 30; }), 'Arthur moved to Saturdays at 19:30');
  await page.evaluate(() => App.closeSheet(true));

  // Six consenting tellers: the cap holds and nothing is lost to the past.
  const many = v100Record();
  many.tellers = Array.from({ length: 6 }, (_, i) => Object.assign({}, many.tellers[0], { id: 't' + i, name: 'Teller ' + i, consent: { at: Date.now(), note: '' }, ritual: { day: i, time: '0' + (7 + i) + ':00' } }));
  await seed(page, many, { native: true }); await wait(400);
  s = await sched(); sane(s, 'six tellers');
  check(s.length >= 60 && s.length <= 64, 'cap holds at 60 to 64: ' + s.length);
  check(new Set(s.map(o => o.title)).size === 6, 'every teller keeps a place in the plan');

  // Off: cancelled, not stale. On again: recomputed, and the permission asked for.
  await seed(page, v100Record(), { native: true }); await wait(300);
  await page.evaluate(() => { window.__native.allowed = false; });
  await click('.tab[data-view="family"]'); await wait(200);
  await click('[data-act="tog"][data-k="notify"]'); await wait(200);
  check(await page.evaluate(() => window.__native.cancelled >= 1 && window.__native.scheduled.length === 0), 'off cancels the plan');
  check((await raw(page)).settings.notify === false, 'setting saved off');
  await click('[data-act="tog"][data-k="notify"]'); await wait(300);
  check(await page.evaluate(() => window.__native.requested >= 1), 'permission requested when turned on without it');
  s = await sched(); sane(s, 'on again');
  await shot('06-family-notify');

  // Setting notify off in 1.0.0 stays off, and nothing is scheduled on open.
  await seed(page, v100Record({ settings: { haptics: true, notify: false, speak: true, sound: true, reactAs: null } }), { native: true }); await wait(400);
  check(await page.evaluate(() => window.__native.cancelled >= 1 && (!window.__native.scheduled || window.__native.scheduled.length === 0)), 'a 1.0.0 user with reminders off gets none');

  // First run with the permission not yet granted: onboarding asks once the ritual is set.
  await seed(page, null, { native: true }); await wait(200);
  await page.evaluate(() => { window.__native.allowed = false; window.__native.requested = 0; });
  for (let i = 0; i < 3; i++) { await click('#obNext'); await wait(360); }
  await type('#obName', 'Arthur'); await click('#obNext'); await wait(500);
  check(await page.evaluate(() => window.__native.requested >= 1), 'first run asks for the notification permission');
  s = await sched();
  check(Array.isArray(s) && s.length === 0, 'nothing scheduled before consent');

  // Resume recomputes. A recording made on the ritual day pushes nothing into the past.
  await seed(page, v100Record(), { native: true }); await wait(300);
  await page.evaluate(() => { window.__native.scheduled = null; App.onResume(); });
  s = await sched(); sane(s, 'resume');

  if (fails.length) throw new Error(fails.length + ' check(s) failed:\n  ' + fails.join('\n  '));
};
