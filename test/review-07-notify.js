/* Reviewer pass 7: the weekly reminder. Six tellers against the shell's cap, nothing in the
   past, and the hour held across a daylight saving change in both directions. */
const L = require('./lib.js');

const DAY = 86400000;

function sixTellers() {
  const now = Date.now();
  const t = (i, day, time) => ({
    id: 't' + i, name: 'Teller ' + i, relation: '', birthYear: 1940 + i, place: '', packs: [],
    consent: { at: now - 100 * DAY, note: '' }, ritual: { day, time },
    startedAt: now - 40 * DAY, current: null, used: [], skipped: [], answeredAt: null
  });
  return {
    v: 1, onboarded: true, family: 'Six voices',
    tellers: [t(1, 0, '15:00'), t(2, 1, '09:30'), t(3, 3, '11:00'), t(4, 5, '18:45'), t(5, 6, '08:00'), t(6, 2, '20:15')],
    people: [], queue: [], stories: [],
    settings: { haptics: true, notify: true, speak: true, sound: true, reactAs: null }
  };
}

module.exports = async ({ page, wait, text, click, errors, log }) => {
  const assert = L.assert;

  await L.clearAudio(page);
  await L.seed(page, sixTellers(), { native: true });
  await wait(500);

  const sched = await page.evaluate(() => window.__native.scheduled);
  log('six tellers give ' + sched.length + ' reminders');
  assert(sched.length <= 64, 'inside the shell cap of 64, got ' + sched.length);
  assert(sched.every(n => n.at > Date.now()), 'nothing is scheduled in the past');
  assert(sched.every((n, i) => i === 0 || n.at >= sched[i - 1].at), 'the plan is in time order');
  assert(new Set(sched.map(n => n.id)).size === sched.length, 'ids are unique');
  assert(sched.every(n => n.title && n.body), 'every entry has words');

  /* the cap must not throw a whole person off the end: everyone gets a reminder soon */
  const named = new Set(sched.map(n => n.title));
  assert(named.size === 6, 'all six people are in the plan, got ' + named.size + ': ' + [...named].join(', '));
  const firstOf = {};
  for (const n of sched) if (!(n.title in firstOf)) firstOf[n.title] = n.at;
  const worst = Math.max(...Object.values(firstOf));
  assert(worst - Date.now() < 8 * DAY, 'and nobody waits more than a week for their first: ' +
    Math.round((worst - Date.now()) / DAY) + ' days');

  /* the hour is the ritual hour, in local time, on every entry */
  const hours = await page.evaluate(() => window.__native.scheduled.map(n => {
    const d = new Date(n.at);
    return { title: n.title, h: d.getHours(), m: d.getMinutes(), day: d.getDay() };
  }));
  const want = { 'A question for Teller 1': [15, 0, 0], 'A question for Teller 2': [9, 30, 1],
                 'A question for Teller 3': [11, 0, 3], 'A question for Teller 4': [18, 45, 5],
                 'A question for Teller 5': [8, 0, 6], 'A question for Teller 6': [20, 15, 2] };
  for (const e of hours) {
    const w = want[e.title];
    assert(w && e.h === w[0] && e.m === w[1] && e.day === w[2],
      'every reminder lands on the ritual slot: ' + JSON.stringify(e) + ' wanted ' + JSON.stringify(w));
  }

  /* -------------------------------------------- across a clock change, both ways */
  await page.emulateTimezone('Europe/London');
  await page.reload({ waitUntil: 'networkidle0' });
  await wait(600);
  const dst = await page.evaluate(() => {
    const t = { ritual: { day: 0, time: '15:00' } };
    const out = [];
    /* start on the Sunday before the October change and step twelve weeks the way
       the schedule does, then again across the March change */
    for (const startISO of ['2026-10-11T12:00:00Z', '2027-03-14T12:00:00Z']) {
      let at = Store.nextRitual(t, Date.parse(startISO));
      const run = [];
      for (let i = 0; i < 8; i++) {
        const d = new Date(at);
        run.push(d.toDateString() + ' ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'));
        at = Store.nextRitual(t, at);
      }
      out.push(run);
    }
    return out;
  });
  log('October run: ' + dst[0].join(' | '));
  log('March run:   ' + dst[1].join(' | '));
  for (const run of dst) {
    for (const line of run) {
      assert(/ 15:00$/.test(line), 'the ritual keeps its hour across the clock change: ' + line);
      assert(/^Sun /.test(line), 'and its day: ' + line);
    }
  }

  /* ------------------------------------------------- the switch really switches */
  await L.seed(page, sixTellers(), { native: true });
  await wait(500);
  await page.evaluate(() => { window.App.setView('family'); }); await wait(420);
  await click('[data-act="tog"][data-k="notify"]'); await wait(500);
  const off = await page.evaluate(() => ({ cancelled: window.__native.cancelled, scheduled: window.__native.scheduled }));
  assert(off.cancelled >= 1 && off.scheduled.length === 0, 'switching the reminder off cancels the plan: ' + JSON.stringify(off));
  await click('[data-act="tog"][data-k="notify"]'); await wait(500);
  const on = await page.evaluate(() => window.__native.scheduled.length);
  assert(on > 0, 'and switching it back on rebuilds it, got ' + on);

  /* a teller with no consent is never reminded */
  await page.evaluate(() => { Store.tellers().forEach(t => { t.consent = null; }); Store.save(); window.App.onResume(); });
  await wait(400);
  const nc = await page.evaluate(() => window.__native.scheduled.length);
  assert(nc === 0, 'nobody has agreed, so nothing is scheduled, got ' + nc);

  log('page errors: ' + errors.length);
};
