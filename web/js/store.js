/* Heirloom store. Metadata lives in one localStorage record under heirloom.v1.
   Audio is far too big for localStorage, so recordings live in IndexedDB in the
   same origin, keyed by story id. Nothing here ever touches a network. */

const Store = (() => {
  const KEY = 'heirloom.v1';
  const DB = 'heirloom-audio';
  const WEEK = 604800000;

  const DEFAULTS = {
    v: 1,
    onboarded: false,
    family: '',
    tellers: [],
    people: [],
    queue: [],
    stories: [],
    settings: { haptics: true, notify: true, speak: true, sound: true, reactAs: null }
  };

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULTS));
      const d = JSON.parse(raw);
      return {
        v: 1,
        onboarded: !!d.onboarded,
        family: d.family || '',
        tellers: d.tellers || [],
        people: d.people || [],
        queue: d.queue || [],
        stories: d.stories || [],
        settings: Object.assign({}, DEFAULTS.settings, d.settings || {})
      };
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULTS)); }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  const all = () => db;
  const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ----------------------------------------------------------- dates ---- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function longDate(ms) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
  function shortDate(ms) { const d = new Date(ms); return d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); }
  function relDate(ms) {
    const days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 14) return 'Last week';
    if (days < 60) return Math.floor(days / 7) + ' weeks ago';
    return shortDate(ms);
  }
  function dur(s) {
    s = Math.max(0, Math.round(s));
    const m = Math.floor(s / 60);
    return m + ':' + pad(s % 60);
  }
  function durWords(s) {
    const m = Math.round(s / 60);
    if (s < 60) return Math.round(s) + ' seconds';
    return m + (m === 1 ? ' minute' : ' minutes');
  }

  /** Next occurrence of the teller's ritual slot, as epoch ms. */
  function nextRitual(t, from) {
    const now = new Date(from || Date.now());
    const [hh, mm] = (t.ritual && t.ritual.time || '15:00').split(':').map(Number);
    const day = (t.ritual && typeof t.ritual.day === 'number') ? t.ritual.day : 0;
    const d = new Date(now);
    d.setHours(hh, mm, 0, 0);
    let delta = (day - d.getDay() + 7) % 7;
    if (delta === 0 && d.getTime() <= now.getTime()) delta = 7;
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }
  function weekIndex(t, now) {
    return Math.floor(((now || Date.now()) - (t.startedAt || Date.now())) / WEEK);
  }

  /* --------------------------------------------------------- tellers ---- */
  const tellers = () => db.tellers;
  const teller = id => db.tellers.find(t => t.id === id) || null;

  function addTeller(o) {
    const t = {
      id: uid('t'), name: o.name.trim(), relation: (o.relation || '').trim(),
      birthYear: o.birthYear || null, place: (o.place || '').trim(),
      packs: o.packs || [], consent: null,
      ritual: { day: o.day == null ? 0 : o.day, time: o.time || '15:00' },
      startedAt: Date.now(), current: null, used: [], skipped: []
    };
    db.tellers.push(t); save();
    return t;
  }
  function updateTeller(id, patch) {
    const t = teller(id); if (!t) return null;
    Object.assign(t, patch); save(); return t;
  }
  function giveConsent(id, note) {
    const t = teller(id); if (!t) return null;
    t.consent = { at: Date.now(), note: note || '' }; save(); return t;
  }
  function removeTeller(id) {
    db.stories.filter(s => s.tellerId === id).forEach(s => dropAudio(s.id));
    db.stories = db.stories.filter(s => s.tellerId !== id);
    db.queue = db.queue.filter(q => q.tellerId !== id);
    db.tellers = db.tellers.filter(t => t.id !== id);
    save();
  }

  /* ---------------------------------------------------------- people ---- */
  const people = () => db.people;
  const person = id => db.people.find(p => p.id === id) || null;
  function addPerson(name, role) {
    const p = { id: uid('p'), name: name.trim(), role: role || 'listener' };
    db.people.push(p);
    if (!db.settings.reactAs) db.settings.reactAs = p.id;
    save(); return p;
  }
  function removePerson(id) {
    db.people = db.people.filter(p => p.id !== id);
    db.queue = db.queue.filter(q => q.fromId !== id);
    if (db.settings.reactAs === id) db.settings.reactAs = db.people.length ? db.people[0].id : null;
    save();
  }

  /* --------------------------------------------------------- prompts ---- */
  /** Counts of the subjects already in the archive. This is the biography boost. */
  function tagWeights(tellerId) {
    const w = {};
    for (const s of db.stories) {
      if (tellerId && s.tellerId !== tellerId) continue;
      const p = s.promptId && Content.byId(s.promptId);
      if (p) for (const t of p.tags) w[t] = (w[t] || 0) + 1;
      for (const t of s.tags || []) {
        const k = t.label.toLowerCase();
        w[k] = (w[k] || 0) + 1;
      }
    }
    return w;
  }

  /** The question this teller is on right now. Family questions jump the queue. */
  function current(id) {
    const t = teller(id); if (!t) return null;
    const wk = weekIndex(t);
    if (t.current && t.current.week === wk) return t.current;
    const q = db.queue.find(x => x.tellerId === id);
    if (q) {
      t.current = { week: wk, promptId: null, text: q.text, label: '',
                    fromId: q.fromId, queueId: q.id };
    } else {
      const p = Content.pick(t, wk, t.used, t.skipped, tagWeights(id));
      t.current = p ? { week: wk, promptId: p.id, text: p.text, label: p.label, fromId: null }
                    : { week: wk, promptId: null, text: '', label: '', fromId: null, empty: true };
    }
    save();
    return t.current;
  }
  /** Put a specific prompt in front of a teller now, replacing this week's pick. */
  function setPrompt(id, promptId) {
    const t = teller(id), p = Content.byId(promptId);
    if (!t || !p) return null;
    t.current = { week: weekIndex(t), promptId: p.id, text: p.text, label: p.label, fromId: null };
    save(); return t.current;
  }
  function skipWeek(id) {
    const t = teller(id); if (!t) return;
    const c = current(id);
    if (c && c.promptId && t.skipped.indexOf(c.promptId) < 0) t.skipped.push(c.promptId);
    if (c && c.queueId) db.queue = db.queue.filter(q => q.id !== c.queueId);
    t.current = null;
    save();
  }
  function askQuestion(tellerId, text, fromId) {
    const q = { id: uid('q'), tellerId, text: text.trim(), fromId: fromId || null, at: Date.now() };
    db.queue.push(q);
    const t = teller(tellerId);
    if (t && !db.stories.some(s => s.tellerId === tellerId && s.at > Date.now() - 6 * 86400000)) t.current = null;
    save(); return q;
  }
  const queueFor = id => db.queue.filter(q => q.tellerId === id);
  function dropQuestion(qid) { db.queue = db.queue.filter(q => q.id !== qid); save(); }

  /* --------------------------------------------------- audio (IndexedDB) */
  let idb = null;
  function open() {
    if (idb) return Promise.resolve(idb);
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('audio'); };
      r.onsuccess = () => { idb = r.result; res(idb); };
      r.onerror = () => rej(r.error);
    });
  }
  function putAudio(id, blob) {
    return open().then(d => new Promise((res, rej) => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    }));
  }
  function getAudio(id) {
    return open().then(d => new Promise((res, rej) => {
      const r = d.transaction('audio', 'readonly').objectStore('audio').get(id);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    }));
  }
  function dropAudio(id) {
    return open().then(d => new Promise(res => {
      const tx = d.transaction('audio', 'readwrite');
      tx.objectStore('audio').delete(id);
      tx.oncomplete = res; tx.onerror = res;
    })).catch(() => {});
  }

  /* -------------------------------------------------------- stories ----- */
  const stories = () => db.stories.slice().sort((a, b) => b.at - a.at);
  const story = id => db.stories.find(s => s.id === id) || null;
  const storiesOf = id => db.stories.filter(s => s.tellerId === id).sort((a, b) => b.at - a.at);

  function addStory(o, blob) {
    const t = teller(o.tellerId);
    const s = {
      id: uid('s'), tellerId: o.tellerId,
      promptId: o.promptId || null,
      question: o.question, label: o.label || '', title: '',
      askedBy: o.fromId || null,
      at: Date.now(), dur: o.dur, mime: o.mime, size: blob ? blob.size : 0,
      tags: [], moments: [], notes: '',
      visibility: 'family', sealUntil: null,
      plays: 0, reactions: []
    };
    db.stories.push(s);
    if (t) {
      if (o.promptId && t.used.indexOf(o.promptId) < 0) t.used.push(o.promptId);
      if (o.queueId) db.queue = db.queue.filter(q => q.id !== o.queueId);
      t.current = null;
      t.startedAt = Date.now();
      t.answeredAt = Date.now();
    }
    save();
    return blob ? putAudio(s.id, blob).then(() => s) : Promise.resolve(s);
  }
  function updateStory(id, patch) {
    const s = story(id); if (!s) return null;
    Object.assign(s, patch); save(); return s;
  }
  function removeStory(id) {
    db.stories = db.stories.filter(s => s.id !== id);
    save();
    return dropAudio(id);
  }
  function played(id) { const s = story(id); if (s) { s.plays++; save(); } }
  function react(id, personId) {
    const s = story(id); if (!s) return;
    s.reactions.push({ personId, at: Date.now() });
    db.settings.reactAs = personId; save();
  }
  function addMoment(id, t, note) {
    const s = story(id); if (!s) return;
    s.moments.push({ t: Math.round(t * 10) / 10, note: (note || '').trim() });
    s.moments.sort((a, b) => a.t - b.t); save();
  }
  function removeMoment(id, i) { const s = story(id); if (s) { s.moments.splice(i, 1); save(); } }
  function addTag(id, type, label) {
    const s = story(id); if (!s) return;
    label = label.trim(); if (!label) return;
    if (s.tags.some(t => t.type === type && t.label.toLowerCase() === label.toLowerCase())) return;
    s.tags.push({ type, label }); save();
  }
  function removeTag(id, i) { const s = story(id); if (s) { s.tags.splice(i, 1); save(); } }

  /** A sealed story stays shut until its date. This is a promise kept by the app,
      not encryption, and the app says so wherever it is offered. */
  function sealed(s, now) {
    if (s.visibility !== 'sealed' || !s.sealUntil) return false;
    return new Date(s.sealUntil + 'T00:00:00').getTime() > (now || Date.now());
  }

  /* ------------------------------------------------------- the threads -- */
  function threads() {
    const map = {};
    for (const s of db.stories) {
      for (const t of s.tags) {
        const k = t.type + '|' + t.label.toLowerCase();
        if (!map[k]) map[k] = { type: t.type, label: t.label, ids: [] };
        map[k].ids.push(s.id);
      }
    }
    return Object.values(map).sort((a, b) => b.ids.length - a.ids.length || a.label.localeCompare(b.label));
  }
  function search(q) {
    q = q.trim().toLowerCase();
    if (!q) return stories();
    return stories().filter(s => {
      const t = teller(s.tellerId);
      const hay = [s.question, s.label, s.title, s.notes, t ? t.name : '',
                   s.tags.map(x => x.label).join(' '),
                   s.moments.map(m => m.note).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  /* ------------------------------------------------------- reminders ---- */
  /** Twelve weeks of ritual reminders, recomputed and re-sent on every app open. */
  function schedule() {
    const out = [];
    let id = 1;
    for (const t of db.tellers) {
      if (!t.consent) continue;
      let at = nextRitual(t);
      for (let i = 0; i < 12 && out.length < 60; i++) {
        out.push({ id: id++, at, title: 'One question for ' + t.name,
                   body: 'A few minutes of ' + t.name + ' talking is worth more than anything else you will do today.' });
        at += WEEK;
      }
    }
    return out.sort((a, b) => a.at - b.at).slice(0, 60).map((n, i) => ({ ...n, id: i + 1 }));
  }

  /* ------------------------------------------------------- the export --- */
  const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();
  function crc32(b) {
    let c = -1;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  }
  /** A stored (uncompressed) zip. Audio is already compressed, so this costs nothing. */
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      const v = new DataView(lh.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0, true);
      v.setUint16(8, 0, true); v.setUint16(10, dosTime, true); v.setUint16(12, dosDate, true);
      v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
      v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      lh.set(name, 30);
      parts.push(lh, data);
      const ch = new Uint8Array(46 + name.length);
      const c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    }
    let cdLen = 0;
    for (const c of central) cdLen += c.length;
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdLen, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }

  function extFor(mime) {
    if (!mime) return 'bin';
    if (mime.indexOf('webm') >= 0) return 'webm';
    if (mime.indexOf('ogg') >= 0) return 'ogg';
    if (mime.indexOf('mp4') >= 0 || mime.indexOf('aac') >= 0) return 'm4a';
    if (mime.indexOf('mpeg') >= 0) return 'mp3';
    if (mime.indexOf('wav') >= 0) return 'wav';
    return 'bin';
  }
  const slug = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'story';

  function manifest(list) {
    return {
      archive: 'Heirloom',
      family: db.family,
      exported: new Date().toISOString(),
      note: 'Audio files are named in the stories list below. Nothing here was uploaded anywhere; this file was written on the device that made the recordings.',
      tellers: db.tellers.map(t => ({
        name: t.name, relation: t.relation, born: t.birthYear, place: t.place,
        consentGiven: t.consent ? new Date(t.consent.at).toISOString() : null
      })),
      stories: list.map(s => {
        const t = teller(s.tellerId);
        return {
          file: 'audio/' + slug((t ? t.name : '') + '-' + (s.label || s.question)) + '-' + s.id + '.' + extFor(s.mime),
          teller: t ? t.name : '', question: s.question, title: s.title || s.label || null,
          recorded: new Date(s.at).toISOString(), seconds: Math.round(s.dur),
          visibility: s.visibility, sealedUntil: s.sealUntil,
          tags: s.tags, moments: s.moments, notes: s.notes,
          askedBy: s.askedBy ? (person(s.askedBy) || {}).name || null : null
        };
      })
    };
  }

  /** Everything, in one zip: a JSON manifest, a plain readme and the audio. */
  function exportArchive(list) {
    list = list || stories().slice().reverse();
    const m = manifest(list);
    const enc = new TextEncoder();
    const files = [{ name: 'manifest.json', data: enc.encode(JSON.stringify(m, null, 2)) }];
    const readme =
      'HEIRLOOM ARCHIVE\n\n' +
      (db.family ? db.family + '\n' : '') +
      'Exported ' + longDate(Date.now()) + '\n\n' +
      'This folder holds ' + list.length + ' recording' + (list.length === 1 ? '' : 's') +
      ' and a manifest that says who told each one, which question it answers, when it\n' +
      'was recorded and how it was tagged. The audio files play in any media player.\n\n' +
      'Keep a copy somewhere that is not a phone.\n\n' +
      m.stories.map((s, i) => (i + 1) + '. ' + s.teller + ': ' + s.question + '\n   ' + s.file).join('\n\n') + '\n';
    files.push({ name: 'README.txt', data: enc.encode(readme) });
    return list.reduce((chain, s, i) => chain.then(acc => getAudio(s.id).then(b => {
      if (!b) return acc;
      return b.arrayBuffer().then(ab => { acc.push({ name: m.stories[i].file, data: new Uint8Array(ab) }); return acc; });
    })), Promise.resolve(files)).then(zip);
  }

  function exportStory(id) {
    const s = story(id); if (!s) return Promise.resolve(null);
    const t = teller(s.tellerId);
    return getAudio(id).then(b => b && {
      blob: b,
      name: slug((t ? t.name : '') + '-' + (s.label || s.question)) + '.' + extFor(s.mime)
    });
  }

  function erase() {
    const ids = db.stories.map(s => s.id);
    db = JSON.parse(JSON.stringify(DEFAULTS));
    localStorage.removeItem(KEY);
    return Promise.all(ids.map(dropAudio));
  }

  function onboarded(v) {
    if (v !== undefined) { db.onboarded = !!v; save(); }
    return db.onboarded;
  }
  function settings(patch) { if (patch) { Object.assign(db.settings, patch); save(); } return db.settings; }
  function family(v) { if (v !== undefined) { db.family = v.trim(); save(); } return db.family; }

  return {
    all, save, uid, onboarded, settings, family,
    tellers, teller, addTeller, updateTeller, giveConsent, removeTeller,
    people, person, addPerson, removePerson,
    current, setPrompt, skipWeek, askQuestion, queueFor, dropQuestion, tagWeights,
    stories, story, storiesOf, addStory, updateStory, removeStory, played, react,
    addMoment, removeMoment, addTag, removeTag, sealed, threads, search,
    getAudio, schedule, exportArchive, exportStory, extFor, erase,
    nextRitual, weekIndex, longDate, shortDate, relDate, dur, durWords, ymd, DAYS, MONTHS
  };
})();
