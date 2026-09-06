/* Shared bits for the Heirloom drive scripts. */
const KEY = 'heirloom.v1';
const DB = 'heirloom-audio';
const DAY = 86400000;

/* A record shaped exactly as the shipped 1.0.0 store wrote it (git show 91e0d13:web/js/store.js):
   v:1, tellers with consent/ritual/startedAt/current/used/skipped/answeredAt, people, queue,
   stories with tags/moments/visibility/sealUntil/plays/reactions, and the five settings. */
function v100Record(overrides) {
  const now = Date.now();
  const ago = d => now - d * DAY;
  const ymdIn = years => { const d = new Date(); d.setFullYear(d.getFullYear() + years); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const story = (id, tellerId, promptId, question, label, title, atDays, dur, extra) => Object.assign({
    id, tellerId, promptId, question, label, title, askedBy: null, at: ago(atDays), dur,
    mime: 'audio/webm;codecs=opus', size: 21000, tags: [], moments: [], notes: '',
    visibility: 'family', sealUntil: null, plays: 0, reactions: []
  }, extra || {});
  return Object.assign({
    v: 1, onboarded: true, family: 'The Morgan family',
    tellers: [
      { id: 't_arthur', name: 'Arthur', relation: 'Papa', birthYear: 1947, place: 'Cardiff', packs: ['midcentury', 'britain'],
        consent: { at: ago(190), note: '' }, ritual: { day: 0, time: '15:00' }, startedAt: ago(6), current: null,
        used: ['co033', 'br240', 'co024', 'co058'], skipped: ['co001'], answeredAt: null },
      { id: 't_sarla', name: 'Sarla', relation: 'Nani', birthYear: 1939, place: 'Lucknow', packs: ['prewar', 'india'],
        consent: null, ritual: { day: 3, time: '11:00' }, startedAt: ago(4),
        current: { week: 0, promptId: 'in187', text: 'What did the monsoon sound like on your roof?', label: 'Rain on the roof', fromId: null },
        used: [], skipped: [], answeredAt: null }
    ],
    people: [
      { id: 'p_meera', name: 'Meera', role: 'keeper' },
      { id: 'p_zoe', name: 'Zoe', role: 'listener' }
    ],
    queue: [{ id: 'q_1', tellerId: 't_arthur', text: 'What music did you dance to?', fromId: 'p_zoe', at: ago(3) }],
    stories: [
      story('s_1', 't_arthur', 'co033', 'Tell me about your first job and your first pay.', 'The first pay', 'The first pay packet', 186, 492,
        { tags: [{ type: 'person', label: 'Dai Morgan' }, { type: 'place', label: 'Cardiff' }, { type: 'decade', label: '1960s' }],
          moments: [{ t: 125, note: 'He does the foreman voice' }, { t: 340, note: 'The wage packet in his hand' }],
          plays: 4, reactions: [{ personId: 'p_meera', at: ago(185) }, { personId: 'p_zoe', at: ago(184) }] }),
      story('s_2', 't_arthur', 'br240', 'Where did you go dancing?', 'The dance hall', '', 165, 407,
        { tags: [{ type: 'place', label: 'The Capitol' }, { type: 'person', label: 'Nesta' }, { type: 'decade', label: '1960s' }],
          moments: [{ t: 211, note: 'He sings a bit of it' }], plays: 3, reactions: [{ personId: 'p_zoe', at: ago(164) }] }),
      story('s_3', 't_arthur', 'co024', 'Tell me about a day you got in trouble at school.', 'In trouble', '', 137, 434,
        { tags: [{ type: 'person', label: 'Mr Pugh' }, { type: 'decade', label: '1950s' }], notes: 'Ask him about the cane again.',
          visibility: 'private', plays: 2 }),
      story('s_4', 't_arthur', 'co058', 'Describe your wedding day from waking up to going to sleep.', 'The whole day', 'The wedding, minute by minute', 52, 723,
        { tags: [{ type: 'person', label: 'Nesta' }, { type: 'place', label: 'Cardiff' }, { type: 'decade', label: '1970s' }],
          visibility: 'sealed', sealUntil: ymdIn(6), plays: 0 }),
      story('s_5', 't_arthur', null, 'What was Nan like when you met her?', '', '', 6, 333,
        { askedBy: 'p_zoe', tags: [{ type: 'person', label: 'Nesta' }], moments: [{ t: 96, note: 'He goes quiet, then laughs' }],
          plays: 6, reactions: [{ personId: 'p_zoe', at: ago(4) }, { personId: 'p_meera', at: ago(4) }] })
    ],
    settings: { haptics: true, notify: true, speak: true, sound: false, reactAs: 'p_meera' }
  }, overrides || {});
}

/* A window.Native mock that records what the app hands the shell. */
const NATIVE_MOCK = `
  window.__native = { vibrations: [], saved: [], shared: [], scheduled: null, cancelled: 0, requested: 0, awake: [], allowed: true };
  window.Native = {
    isNative: () => true,
    vibrate: (ms, amp) => { window.__native.vibrations.push([ms, amp]); },
    vibratePattern: () => {}, hasAmplitudeControl: () => true, cancelVibration: () => {},
    keepAwake: (on) => { window.__native.awake.push(on); },
    saveFile: (name, mime, b64) => { window.__native.saved.push({ name, mime, b64 }); return 'content://downloads/' + name; },
    shareText: () => {}, shareUri: (uri, mime) => { window.__native.shared.push([uri, mime]); },
    scheduleNotifications: (json) => { window.__native.scheduled = JSON.parse(json); },
    cancelNotifications: () => { window.__native.cancelled++; window.__native.scheduled = []; },
    notificationsAllowed: () => window.__native.allowed,
    requestNotificationPermission: () => { window.__native.requested++; window.__native.allowed = true; }
  };
`;

/* Runs before every document: optional Native mock, the record, optional safe area insets.
   The record is written once per seed; reloads keep whatever the app wrote since. */
let seedSeq = 0, seedScript = null;
async function seed(page, record, opts) {
  opts = opts || {};
  const nonce = 'seed' + (++seedSeq) + '-' + Date.now();
  if (seedScript) { try { await page.removeScriptToEvaluateOnNewDocument(seedScript.identifier); } catch (e) {} }
  seedScript = await page.evaluateOnNewDocument((k, r, native, insets, nonce) => {
    if (native) eval(native); else { try { delete window.Native; } catch (e) {} }
    if (sessionStorage.getItem('heirloom.test.seed') !== nonce) {
      sessionStorage.setItem('heirloom.test.seed', nonce);
      if (r) localStorage.setItem(k, JSON.stringify(r)); else localStorage.removeItem(k);
    }
    if (insets) {
      const apply = () => { document.documentElement.style.setProperty('--sat', insets[0] + 'px'); document.documentElement.style.setProperty('--sab', insets[1] + 'px'); };
      if (document.documentElement) apply();
      document.addEventListener('DOMContentLoaded', apply);
    }
  }, KEY, record, opts.native ? NATIVE_MOCK : '', opts.insets || null, nonce);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  if (opts.audio) await seedAudio(page, opts.audio);
}

/* Records a real clip from the fake microphone with MediaRecorder, exactly as 1.0.0 did, and
   files it in IndexedDB under each story id. Runs after the page has loaded. Four seconds, so a
   playback check that waits a second and a half is measuring the app rather than the end of the
   clip. */
async function seedAudio(page, ids) {
  await page.evaluate(async (DB, ids) => {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(s, { mimeType: 'audio/webm;codecs=opus' });
    const chunks = [];
    rec.ondataavailable = e => chunks.push(e.data);
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(200);
    await new Promise(r => setTimeout(r, 4000));
    rec.stop(); await done;
    s.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('audio');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    await new Promise((res, rej) => {
      const tx = db.transaction('audio', 'readwrite');
      for (const id of ids) tx.objectStore('audio').put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, DB, ids);
}

/* Every key in the audio store. */
const audioKeys = page => page.evaluate(DB => new Promise(res => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('audio');
  r.onsuccess = () => {
    const q = r.result.transaction('audio', 'readonly').objectStore('audio').getAllKeys();
    q.onsuccess = () => { res(q.result); r.result.close(); };
  };
}), DB);

/* Wipes the audio store so a test starts clean. */
const clearAudio = page => page.evaluate(DB => new Promise(res => {
  const r = indexedDB.deleteDatabase(DB);
  r.onsuccess = r.onerror = r.onblocked = () => res();
}), DB);

const raw = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

/* Two taps inside the double tap window, the way a nervous thumb does it. */
async function doubleTap(page, sel) {
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.evaluate(s => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' }); }, sel);
  const el = await page.$(sel);
  const box = await el.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await page.mouse.click(x, y);
}

const visible = (page, sel) => page.$eval(sel, e => !e.hidden && getComputedStyle(e).display !== 'none');
const setVal = (page, sel, v) => page.$eval(sel, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);

module.exports = { KEY, DB, DAY, v100Record, NATIVE_MOCK, seed, seedAudio, audioKeys, clearAudio, raw, assert, doubleTap, visible, setVal };
