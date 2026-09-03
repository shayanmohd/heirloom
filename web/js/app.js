/* Heirloom. Two interfaces in one app: Elder Mode, which is one screen with one
   button, and the keeper's side, which is everything else. Nothing here talks to
   a network; there is no network to talk to. */

const App = (() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const VIEWS = ['archive', 'ask', 'family', 'keepsake'];
  let view = 'archive';
  let mode = 'timeline';
  let filter = { teller: null, tag: null, showPrivate: false };
  let query = '';
  let elder = null;                 // { tellerId, stage }
  let sheets = [];                  // stack of { kind, arg }
  let step = 0;                     // onboarding
  let obPacks = [];
  let player = { audio: null, id: null, url: null, raf: 0 };
  let waveRaf = 0, waveLevels = [], tick = 0, recTimer = 0;

  /* ------------------------------------------------------------ effects - */
  let ac = null;
  function audioCtx() {
    if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  /** The one sound in the app: a tape head meeting a spool. */
  function tape(up) {
    if (!Store.settings().sound) return;
    const c = audioCtx(); if (!c) return;
    try {
      const t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = up ? 1400 : 900; f.Q.value = 1.1;
      o.type = 'square'; o.frequency.setValueAtTime(up ? 220 : 160, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      o.connect(f); f.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.1);
    } catch (e) {}
  }
  function buzz(ms, amp) {
    if (!Store.settings().haptics) return;
    try {
      if (window.Native && Native.vibrate) Native.vibrate(ms, amp || 150);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const TTS = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  function speak(text, onEnd) {
    if (!TTS) { toast('This device has no built in voice.'); if (onEnd) onEnd(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.86; u.pitch = 1;
      u.onend = () => { if (onEnd) onEnd(); };
      u.onerror = () => { toast('This device has no built in voice.'); if (onEnd) onEnd(); };
      speechSynthesis.speak(u);
    } catch (e) { toast('This device has no built in voice.'); if (onEnd) onEnd(); }
  }

  /* -------------------------------------------------------------- icons - */
  const ICONS = {
    archive: '<path d="M3.5 5.5h15M3.5 11h15M3.5 16.5h9"/>',
    ask: '<path d="M4 4.5h14v10H9l-4.2 3.2V14.5H4z"/><path d="M11 11.4v-.7c0-1.2 1.7-1.3 1.7-2.7 0-1-.8-1.6-1.8-1.6-.9 0-1.6.5-1.8 1.3"/>',
    family: '<circle cx="8" cy="7.6" r="2.8"/><circle cx="15.4" cy="9.2" r="2.1"/><path d="M2.8 17.4c0-2.8 2.3-4.4 5.2-4.4s5.2 1.6 5.2 4.4"/><path d="M14.6 13.2c2.4 0 4.6 1.1 4.6 3.6"/>',
    keepsake: '<rect x="3.2" y="7.4" width="15.6" height="10.4" rx="1.4"/><path d="M3.2 11.2h15.6M11 7.4v10.4"/><path d="M6.4 7.4c0-2 1.4-3.2 2.8-3.2 1.5 0 2 1.3 1.8 3.2M15.6 7.4c0-2-1.4-3.2-2.8-3.2-1.5 0-2 1.3-1.8 3.2"/>'
  };
  function paintIcons() {
    document.querySelectorAll('.tab-i').forEach(el => {
      el.innerHTML = '<svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + ICONS[el.dataset.i] + '</svg>';
    });
  }

  /* --------------------------------------------------------- navigation - */
  function setView(v) {
    view = v;
    elder = null;
    document.body.classList.add('has-tabs');
    $('#elder').hidden = true;
    $('#onboard').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = x !== v; });
    $('#tabs').hidden = false;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.view === v));
    stopPlayer();
    render();
    const sc = $('#v-' + v + ' .scroller'); if (sc) sc.scrollTop = 0;
  }

  function render() {
    if (view === 'archive') renderArchive();
    else if (view === 'ask') renderAsk();
    else if (view === 'family') renderFamily();
    else if (view === 'keepsake') renderKeepsake();
  }

  /* ---------------------------------------------------------- first run - */
  const STEPS = 4;
  function showOnboard() {
    document.body.classList.remove('has-tabs');
    $('#tabs').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = true; });
    $('#elder').hidden = true;
    $('#onboard').hidden = false;
    const sel = $('#obDay');
    if (!sel.options.length) {
      Store.DAYS.forEach((d, i) => sel.add(new Option(d, i)));
      sel.value = 0;
    }
    renderObPacks();
    paintOnboard();
  }
  function renderObPacks() {
    const y = parseInt($('#obYear').value, 10);
    if (!obPacks.length && y) obPacks = y <= 1945 ? ['prewar'] : (y <= 1968 ? ['midcentury'] : []);
    $('#obPacks').innerHTML = Content.PACKS.filter(p => p.id !== 'core').map(p =>
      '<button class="chip' + (obPacks.indexOf(p.id) >= 0 ? ' on' : '') + '" data-act="obpack" data-id="' +
      p.id + '">' + esc(p.name) + '</button>').join('');
  }
  function paintOnboard() {
    document.querySelectorAll('.ob-step').forEach(el => { el.hidden = +el.dataset.step !== step; });
    $('#obDots').innerHTML = Array.from({ length: STEPS },
      (_, i) => '<span class="dot' + (i === step ? ' on' : '') + '"></span>').join('');
    $('#obNext').textContent = step === STEPS - 1 ? 'Start the archive' : 'Next';
  }
  function obNext() {
    if (step < STEPS - 1) {
      step++;
      if (step === STEPS - 1) renderObPacks();
      paintOnboard();
      $('.ob-scroll').scrollTop = 0;
      return;
    }
    const name = $('#obName').value.trim();
    if (!name) { toast('Their name, first.'); $('#obName').focus(); return; }
    const y = parseInt($('#obYear').value, 10);
    const t = Store.addTeller({
      name, relation: $('#obRel').value, birthYear: y || null, place: $('#obPlace').value,
      packs: obPacks.slice(), day: +$('#obDay').value, time: $('#obTime').value || '15:00'
    });
    Store.onboarded(true);
    reschedule();
    setView('ask');
    toast(name + ' is in the archive.');
  }

  /* ------------------------------------------------------------ archive - */
  function visibleStories() {
    let list = query ? Store.search(query) : Store.stories();
    if (filter.teller) list = list.filter(s => s.tellerId === filter.teller);
    if (filter.tag) list = list.filter(s => s.tags.some(t => t.label.toLowerCase() === filter.tag));
    if (!filter.showPrivate) list = list.filter(s => s.visibility !== 'private');
    return list;
  }

  function renderArchive() {
    const all = Store.stories();
    const secs = all.reduce((a, s) => a + s.dur, 0);
    $('#archSub').textContent = all.length
      ? all.length + (all.length === 1 ? ' story, ' : ' stories, ') + Store.durWords(secs) + ' of them talking.'
      : 'Nothing kept yet.';
    document.querySelectorAll('#archSeg .seg-b').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));

    const chips = [];
    if (mode === 'timeline') {
      chips.push('<button class="chip' + (!filter.teller && !filter.tag ? ' on' : '') +
                 '" data-act="filt" data-k="all">Everyone</button>');
      Store.tellers().forEach(t => chips.push('<button class="chip' + (filter.teller === t.id ? ' on' : '') +
        '" data-act="filt" data-k="teller" data-id="' + t.id + '">' + esc(t.name) + '</button>'));
      if (filter.tag) chips.push('<button class="chip on" data-act="filt" data-k="all">' +
        esc(filter.tag) + '<span class="x">x</span></button>');
      if (all.some(s => s.visibility === 'private'))
        chips.push('<button class="chip' + (filter.showPrivate ? ' on' : '') +
          '" data-act="filt" data-k="private">Show private</button>');
    }
    $('#archChips').innerHTML = chips.join('');
    $('#archChips').hidden = !chips.length;

    if (mode === 'threads') { $('#archList').innerHTML = threadsHtml(); return; }

    const list = visibleStories();
    if (!list.length) {
      $('#archList').innerHTML = all.length
        ? '<div class="empty"><p class="q">Nothing matches that.</p><p>Try a name, a place or a word from a moment you marked.</p></div>'
        : '<div class="empty"><p class="q">The archive is empty, for now.</p><p>One question, answered once, and this page stops being empty forever.</p>' +
          '<button class="btn" data-act="go" data-v="ask">Go to this week' + "'" + 's question</button></div>';
      return;
    }
    let html = '', lastMonth = '';
    for (const s of list) {
      const d = new Date(s.at);
      const m = Store.MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      if (m !== lastMonth) { html += '<p class="month">' + m + '</p>'; lastMonth = m; }
      html += storyCard(s);
    }
    $('#archList').innerHTML = html;
  }

  function storyCard(s) {
    const t = Store.teller(s.tellerId);
    const isSealed = Store.sealed(s);
    const hearts = s.reactions.length;
    const badges = [];
    if (isSealed) badges.push('<span class="badge seal">Sealed until ' + esc(Store.longDate(new Date(s.sealUntil + 'T00:00:00').getTime())) + '</span>');
    if (s.visibility === 'private') badges.push('<span class="badge">Private</span>');
    if (hearts) badges.push('<span class="badge hearts">' + hearts + (hearts === 1 ? ' heart' : ' hearts') + '</span>');
    s.tags.slice(0, 3).forEach(tg => badges.push('<span class="badge">' + esc(tg.label) + '</span>'));
    return '<button class="story" data-act="story" data-id="' + s.id + '">' +
      '<p class="sq">' + esc(s.title || s.question) + '</p>' +
      '<div class="meta"><span class="who">' + esc(t ? t.name : 'Unknown') + '</span>' +
      '<span class="bar"></span><span>' + esc(Store.relDate(s.at)) + '</span>' +
      '<span>' + Store.dur(s.dur) + '</span></div>' +
      (badges.length ? '<div class="badges">' + badges.join('') + '</div>' : '') +
      '</button>';
  }

  function threadsHtml() {
    const th = Store.threads();
    if (!th.length) return '<div class="empty"><p class="q">No threads yet.</p>' +
      '<p>Tag a story with a person, a place or a decade and the family starts to join up. Tap a thread to hear everything it touches.</p></div>';
    return th.map(t => '<button class="thread" data-act="thread" data-l="' + esc(t.label.toLowerCase()) + '">' +
      '<span class="tl">' + esc(t.label) + '</span><span class="tt">' + t.type + '</span>' +
      '<span class="tn">' + t.ids.length + '</span></button>').join('');
  }

  /* ---------------------------------------------------------------- ask - */
  function renderAsk() {
    const ts = Store.tellers();
    if (!ts.length) {
      $('#askList').innerHTML = '<div class="empty"><p class="q">Nobody to ask yet.</p>' +
        '<p>Add the person whose voice you want to keep.</p>' +
        '<button class="btn" data-act="newteller">Add someone</button></div>';
      return;
    }
    let html = '';
    for (const t of ts) {
      const rest = resting(t);
      html += '<div class="askcard">';
      html += '<p class="when">' + esc(t.name) + (t.relation ? ' &middot; ' + esc(t.relation) : '') + '</p>';
      if (rest) {
        html += '<p class="aq">Answered this week.</p>' +
          '<p class="note" style="margin-top:-8px">The next question comes on ' +
          esc(Store.DAYS[t.ritual.day]) + ', ' + esc(Store.longDate(Store.nextRitual(t, t.answeredAt))) + '.</p>' +
          '<div class="acts"><button class="btn quiet" data-act="asknow" data-id="' + t.id +
          '">Ask another now</button></div>';
      } else {
        const c = Store.current(t.id);
        if (c && c.empty) {
          html += '<p class="aq">Every question in their packs has been answered.</p>' +
            '<div class="acts"><button class="btn quiet" data-act="teller" data-id="' + t.id +
            '">Add another pack</button></div>';
        } else {
          if (c.fromId) {
            const p = Store.person(c.fromId);
            html += '<p class="from">' + esc(p ? p.name : 'The family') + ' asks:</p>';
          }
          html += '<p class="aq">' + esc(c.text) + '</p>';
          html += '<div class="acts">' +
            '<button class="btn" data-act="hand" data-id="' + t.id + '">Hand them the phone</button>' +
            '<button class="btn quiet" data-act="swap" data-id="' + t.id + '">Swap the question</button>' +
            '<button class="btn quiet" data-act="skip" data-id="' + t.id + '">Not this week</button>' +
            '</div>';
        }
      }
      html += '</div>';
    }

    html += '<h2>Questions from the family</h2>';
    const qs = Store.tellers().map(t => Store.queueFor(t.id).map(q => ({ q, t }))).reduce((a, b) => a.concat(b), []);
    if (qs.length) {
      html += qs.map(({ q, t }) => {
        const p = q.fromId && Store.person(q.fromId);
        return '<div class="qitem"><span class="qt">' + esc(q.text) +
          '<br><span class="tiny">' + (p ? esc(p.name) + ' asks ' : 'For ') + esc(t.name) + '</span></span>' +
          '<button class="btn quiet sm" data-act="dropq" data-id="' + q.id + '">Remove</button></div>';
      }).join('');
    } else {
      html += '<p class="note" style="margin-top:0">Nothing waiting. A question asked by name is the one they answer fastest.</p>';
    }
    html += '<div style="margin-top:14px"><button class="btn ghost wide" data-act="askform">Add a question</button></div>';

    html += '<h2>Question packs</h2>';
    html += Content.PACKS.map(p => '<button class="packrow" data-act="pack" data-id="' + p.id + '">' +
      '<span class="pn">' + esc(p.name) + '</span><p class="pb">' + esc(p.blurb) + '</p></button>').join('');
    $('#askList').innerHTML = html;
  }

  function resting(t) {
    return !!(t.answeredAt && Date.now() < Store.nextRitual(t, t.answeredAt));
  }

  /* ------------------------------------------------------------- family - */
  function renderFamily() {
    const fam = Store.family();
    $('#famTitle').textContent = fam || 'Family';
    const st = Store.settings();
    let h = '';

    h += '<h2>Telling</h2>';
    for (const t of Store.tellers()) {
      const n = Store.storiesOf(t.id).length;
      const secs = Store.storiesOf(t.id).reduce((a, s) => a + s.dur, 0);
      h += '<button class="tellcard" data-act="teller" data-id="' + t.id + '">' +
        '<span class="tn">' + esc(t.name) + '</span>' +
        '<p class="td">' + esc([t.relation, t.birthYear ? 'born ' + t.birthYear : '', t.place]
          .filter(Boolean).join(' \u00B7 ')) + '</p>' +
        '<span class="ts"><span><b>' + n + '</b>' + (n === 1 ? 'story' : 'stories') + '</span>' +
        '<span><b>' + Math.round(secs / 60) + '</b>minutes</span>' +
        '<span><b>' + (t.consent ? 'Yes' : 'Not yet') + '</b>consent</span></span></button>';
    }
    h += '<button class="btn ghost wide" data-act="newteller">Add someone to record</button>';

    h += '<h2>Listening</h2>';
    const ppl = Store.people();
    if (ppl.length) {
      h += ppl.map(p => '<div class="person"><span class="grow"><span class="nm">' + esc(p.name) +
        '</span><br><span class="rl">' + (p.role === 'keeper' ? 'Keeper' : 'Listener') + '</span></span>' +
        '<button class="btn quiet sm" data-act="delperson" data-id="' + p.id + '">Remove</button></div>').join('');
    } else {
      h += '<p class="note" style="margin-top:0">Add the people who will listen. Their names are what the elder sees when somebody plays a story, and what a follow up question is signed with.</p>';
    }
    h += '<div style="margin-top:14px"><button class="btn ghost wide" data-act="newperson">Add a family member</button></div>';

    h += '<h2>This phone</h2>';
    h += tog('haptics', 'Haptics', 'A short tap when a story is kept.', st.haptics);
    h += tog('sound', 'Tape click', 'The one sound in the app, at the start and end of a recording.', st.sound);
    h += tog('speak', 'Read questions aloud', 'Shows a button in Elder Mode that speaks the question using this phone' + "'" + 's own voice.', st.speak);
    h += tog('notify', 'Weekly reminder', 'A notification at the ritual time, computed and stored on this phone.', st.notify);
    h += '<label class="fld" style="margin-top:18px"><span>Family name</span>' +
      '<input class="inp" id="famName" type="text" maxlength="46" placeholder="The Kapoor family" value="' + esc(fam) + '"></label>';

    h += '<h2>Getting it out</h2>';
    h += '<p class="note" style="margin-top:0">Export writes a zip into this phone' + "'" + 's Downloads folder: every recording, plus a manifest listing who told what and when. Android' + "'" + 's own automatic backup is switched off in this app on purpose, so nothing is copied to a cloud drive behind your back. That makes exporting the only copy. Keep one somewhere that is not a phone.</p>';
    h += '<div style="margin-top:12px"><button class="btn wide" data-act="export">Export the archive</button></div>';

    h += '<h2>What Heirloom does not do</h2>';
    h += '<p class="note" style="margin-top:0">It does not transcribe. Voices are the record; your titles, tags and marked moments are the index. ' +
      'It has no account, no cloud and no internet permission, so it cannot sync between phones or share a family space. ' +
      'Sharing happens by exporting files and sending them yourself. Sealed stories are held shut by this app on this phone, which is a promise rather than a lock.</p>';
    h += '<div style="margin-top:16px"><button class="btn danger wide" data-act="erase">Erase everything</button></div>';

    $('#famBody').innerHTML = h;
  }
  function tog(key, label, sub, on) {
    return '<div class="toggle"><span class="grow"><span class="tl">' + esc(label) + '</span>' +
      '<span class="ts">' + esc(sub) + '</span></span>' +
      '<button class="sw' + (on ? ' on' : '') + '" data-act="tog" data-k="' + key + '" aria-label="' +
      esc(label) + '"></button></div>';
  }

  /* ----------------------------------------------------------- keepsake - */
  function renderKeepsake() {
    const all = Store.stories();
    const year = new Date().getFullYear();
    const thisYear = all.filter(s => new Date(s.at).getFullYear() === year);
    const secs = all.reduce((a, s) => a + s.dur, 0);
    const pct = Math.min(100, Math.round(all.length / Content.TARGET * 100));
    let h = '';
    h += '<div class="meter"><p class="big">' + all.length + '</p>' +
      '<p class="of">' + (all.length >= Content.TARGET
        ? 'stories kept. Past forty, which is enough to listen through end to end.'
        : 'stories kept. Forty makes a keepsake you can listen to end to end.') + '</p>' +
      '<div class="track"><i style="width:' + pct + '%"></i></div></div>';

    h += '<h2>What is here</h2>';
    const longest = all.slice().sort((a, b) => b.dur - a.dur)[0];
    const w = Store.tagWeights();
    const top = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    h += stat('Voices kept', Store.tellers().length || '0');
    h += stat('Total listening time', Store.durWords(secs));
    h += stat('This year', thisYear.length + (thisYear.length === 1 ? ' story' : ' stories'));
    h += stat('Longest story', longest ? Store.dur(longest.dur) : 'None yet');
    h += stat('Threads', Store.threads().length);
    h += stat('Subject that keeps coming back', top ? top.charAt(0).toUpperCase() + top.slice(1) : 'Too early to tell');

    h += '<h2>Milestones</h2>';
    h += Content.MILESTONES.map(m => '<div class="mile' + (all.length >= m.n ? ' hit' : '') + '">' +
      '<span class="n">' + m.n + '</span><span class="l">' + esc(m.label) + '</span></div>').join('');

    h += '<h2>Threads</h2>';
    const th = Store.threads().slice(0, 12);
    h += th.length
      ? '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' + th.map(t =>
          '<button class="chip tag" data-act="thread" data-l="' + esc(t.label.toLowerCase()) + '">' +
          esc(t.label) + ' ' + t.ids.length + '</button>').join('') + '</div>'
      : '<p class="note" style="margin-top:0">Tag a few stories with the people and places in them. Tap a thread later and the family assembles itself out of several voices.</p>';

    h += '<h2>Take it with you</h2>';
    h += '<p class="note" style="margin-top:0">The export is a zip holding every recording plus a manifest with the question, the teller, the date, the tags and the moments you marked. It includes private and sealed stories, because it is meant for keeping rather than showing.</p>';
    h += '<div style="margin-top:12px"><button class="btn wide" data-act="export">Export the archive</button></div>';
    if (Store.tellers().length > 1) h += '<div style="margin-top:10px"><button class="btn ghost wide" data-act="exportwho">Export one person</button></div>';
    $('#keepBody').innerHTML = h;
  }
  const stat = (k, v) => '<div class="stat"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  /* -------------------------------------------------------- elder mode -- */
  function openElder(id) {
    const t = Store.teller(id); if (!t) return;
    elder = { tellerId: id, stage: t.consent ? 'home' : 'consent' };
    document.body.classList.remove('has-tabs');
    $('#tabs').hidden = true;
    VIEWS.forEach(x => { $('#v-' + x).hidden = true; });
    $('#onboard').hidden = true;
    $('#elder').hidden = false;
    renderElder();
  }
  function elderPanel(which) {
    ['elderHome', 'elderConsent', 'elderRecording', 'elderDone', 'elderErr']
      .forEach(p => { $('#' + p).hidden = p !== which; });
  }
  function renderElder() {
    const t = Store.teller(elder.tellerId); if (!t) { setView('family'); return; }
    $('#elderFor').textContent = 'For ' + (t.relation || t.name);
    if (elder.stage === 'consent') { elderPanel('elderConsent'); return; }
    if (elder.stage === 'rec') { elderPanel('elderRecording'); return; }
    if (elder.stage === 'done') { elderPanel('elderDone'); return; }
    if (elder.stage === 'err') { elderPanel('elderErr'); return; }

    elderPanel('elderHome');
    const rest = resting(t);
    const c = rest ? null : Store.current(t.id);
    const from = c && c.fromId ? Store.person(c.fromId) : null;
    $('#elderFrom').hidden = !from;
    if (from) $('#elderFrom').textContent = from.name + ' asks:';
    if (rest) {
      $('#elderQ').textContent = 'That is this week done. Thank you.';
      $('#elderRec').hidden = true;
      $('#elderSkip').hidden = true;
    } else if (c && c.empty) {
      $('#elderQ').textContent = 'No question waiting today.';
      $('#elderRec').hidden = true;
      $('#elderSkip').hidden = true;
    } else {
      $('#elderQ').textContent = c.text;
      $('#elderRec').hidden = false;
      $('#elderSkip').hidden = false;
    }
    const sp = $('#elderSpeak');
    sp.hidden = !(TTS && Store.settings().speak && !rest && c && !c.empty);
    sp.classList.remove('on');
    $('#elderReact').innerHTML = reactionLine(t);
  }

  function reactionLine(t) {
    const last = Store.storiesOf(t.id)[0];
    if (!last) return 'Your first story is the one everybody waits for.';
    const names = {};
    last.reactions.forEach(r => {
      const p = Store.person(r.personId);
      const n = p ? p.name : 'Someone';
      names[n] = (names[n] || 0) + 1;
    });
    const who = Object.keys(names);
    let out = '';
    if (last.plays > 0) {
      out += 'Your last story has been listened to ' +
        (last.plays === 1 ? 'once' : last.plays === 2 ? 'twice' : last.plays + ' times') + '. ';
    } else {
      out += 'Your last story is kept and waiting for them. ';
    }
    if (who.length) {
      out += '<b>' + who.map(esc).join(' and ') + '</b> left a heart.';
    }
    return out;
  }

  /* ------------------------------------------------------- recording --- */
  function startRecording() {
    const t = Store.teller(elder.tellerId);
    const c = Store.current(t.id);
    elder.prompt = c;
    tape(true); buzz(24, 190);
    elder.stage = 'rec'; renderElder();
    $('#recQ').textContent = c.text;
    $('#recState').textContent = 'Recording'; $('#recState').classList.remove('paused');
    $('#recPause').textContent = 'Pause';
    $('#recTime').textContent = '0:00';
    waveLevels = [];
    Recorder.start(() => { toast('Thirty minutes is the limit.'); finishRecording(); }).then(() => {
      if (window.Native && Native.keepAwake) { try { Native.keepAwake(true); } catch (e) {} }
      loopWave();
      recTimer = setInterval(() => { $('#recTime').textContent = Store.dur(Recorder.elapsed()); }, 250);
    }).catch(err => {
      elder.stage = 'err';
      $('#errMsg').textContent = err.message;
      renderElder();
    });
  }

  function loopWave() {
    const c = $('#recWave');
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth || 360, h = c.clientHeight || 96;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    tick++;
    if (tick % 3 === 0) {
      waveLevels.push(Recorder.getState() === 'paused' ? 0 : Recorder.level());
      if (waveLevels.length > 68) waveLevels.shift();
    }
    const bw = 4, gap = 2, mid = h / 2;
    const style = getComputedStyle(document.documentElement);
    ctx.fillStyle = style.getPropertyValue('--accent').trim() || '#1F4436';
    const n = Math.min(waveLevels.length, Math.floor(w / (bw + gap)));
    for (let i = 0; i < n; i++) {
      const v = waveLevels[waveLevels.length - n + i];
      const bh = Math.max(3, v * (h - 12));
      const x = i * (bw + gap);
      ctx.globalAlpha = 0.35 + 0.65 * (i / Math.max(1, n - 1));
      ctx.fillRect(x, mid - bh / 2, bw, bh);
    }
    ctx.globalAlpha = 1;
    waveRaf = requestAnimationFrame(loopWave);
  }
  function stopWave() {
    if (waveRaf) cancelAnimationFrame(waveRaf); waveRaf = 0;
    if (recTimer) clearInterval(recTimer); recTimer = 0;
    if (window.Native && Native.keepAwake) { try { Native.keepAwake(false); } catch (e) {} }
  }

  function togglePause() {
    if (Recorder.getState() === 'recording') {
      Recorder.pause();
      $('#recState').textContent = 'Paused'; $('#recState').classList.add('paused');
      $('#recPause').textContent = 'Carry on';
    } else {
      Recorder.resume();
      $('#recState').textContent = 'Recording'; $('#recState').classList.remove('paused');
      $('#recPause').textContent = 'Pause';
    }
    buzz(14, 120);
  }

  function finishRecording() {
    stopWave(); tape(false);
    Recorder.stop().then(out => {
      if (!out || !out.blob || out.blob.size < 500 || out.dur < 1) {
        elder.stage = 'err';
        $('#errMsg').textContent = 'That recording was too short to keep. Hold the button conversation and try again.';
        renderElder();
        return;
      }
      const t = Store.teller(elder.tellerId);
      const c = elder.prompt || Store.current(t.id);
      return Store.addStory({
        tellerId: t.id, promptId: c.promptId, question: c.text, label: c.label,
        fromId: c.fromId, queueId: c.queueId, dur: out.dur, mime: out.mime
      }, out.blob).then(s => {
        Store.updateTeller(t.id, { answeredAt: Date.now() });
        buzz(18, 200);
        setTimeout(() => buzz(26, 220), 130);
        elder.stage = 'done'; elder.lastStory = s.id;
        $('#doneLine').textContent = 'Kept.';
        $('#doneSub').textContent = Store.durWords(out.dur) + ' of ' + t.name +
          ', saved on this phone. The family will hear it.';
        renderElder();
        reschedule();
      });
    }).catch(() => {
      elder.stage = 'err';
      $('#errMsg').textContent = 'The recording could not be saved on this device.';
      renderElder();
    });
  }

  function discardRecording() {
    stopWave();
    Recorder.cancel();
    elder.stage = 'home';
    renderElder();
  }

  /* --------------------------------------------------------- the sheet - */
  function openSheet(kind, arg) {
    sheets.push({ kind, arg });
    paintSheet();
  }
  function closeSheet(all) {
    if (all) sheets = []; else sheets.pop();
    if (!sheets.length) { $('#sheet').hidden = true; stopPlayer(); }
    else paintSheet();
    if (!sheets.length) render();
  }
  function paintSheet() {
    const s = sheets[sheets.length - 1];
    $('#sheet').hidden = false;
    $('#sheetBody').innerHTML = SHEETS[s.kind](s.arg);
    $('.sheet-panel').scrollTop = 0;
    if (s.kind === 'story') {
      if (player.id !== s.arg) mountPlayer(s.arg);
      else {
        const b = $('#playBtn');
        if (b && player.audio && !player.audio.paused) b.classList.add('playing');
      }
    }
  }

  const SHEETS = {
    story: id => {
      const s = Store.story(id); if (!s) return '';
      const t = Store.teller(s.tellerId);
      const isSealed = Store.sealed(s);
      let h = '<p class="sheet-q">' + esc(s.question) + '</p>';
      h += '<p class="sheet-meta">' + esc(t ? t.name : '') + ' &middot; ' + esc(Store.longDate(s.at)) +
        ' &middot; ' + Store.dur(s.dur) +
        (s.askedBy && Store.person(s.askedBy) ? ' &middot; asked by ' + esc(Store.person(s.askedBy).name) : '') + '</p>';

      if (isSealed) {
        h += '<div class="card"><p class="q" style="font-size:20px;margin:0 0 8px">Sealed until ' +
          esc(Store.longDate(new Date(s.sealUntil + 'T00:00:00').getTime())) + '.</p>' +
          '<p class="tiny" style="margin:0">This app will not play it before then. That is a promise kept by this app on this phone, not encryption: the file is in the export like any other.</p>' +
          '<div style="margin-top:14px"><button class="btn quiet sm" data-act="unseal" data-id="' + s.id + '">Unseal it now</button></div></div>';
      } else {
        h += '<div class="player"><div class="prow">' +
          '<button class="play" id="playBtn" data-act="play" data-id="' + s.id + '" aria-label="Play"></button>' +
          '<div class="scrub" id="scrub" data-act="seek" data-id="' + s.id + '">' +
          '<span class="line"></span><span class="fill" id="fill"></span>' +
          s.moments.map(m => '<span class="tick" style="left:' +
            Math.min(99, (m.t / Math.max(1, s.dur)) * 100) + '%"></span>').join('') +
          '</div></div>' +
          '<div class="ptime"><span id="pnow">0:00</span><span>' + Store.dur(s.dur) + '</span></div>' +
          '<div style="margin-top:12px"><button class="btn ghost sm" data-act="mark" data-id="' + s.id +
          '">Mark this moment</button></div></div>';
      }

      if (s.moments.length) {
        h += '<h2>Moments</h2>';
        h += s.moments.map((m, i) => '<div class="moment">' +
          '<span class="mt" data-act="jump" data-t="' + m.t + '">' + Store.dur(m.t) + '</span>' +
          '<span class="mn">' + esc(m.note || 'Marked') + '</span>' +
          '<button class="btn quiet sm" data-act="delmoment" data-id="' + s.id + '" data-i="' + i + '">x</button>' +
          '</div>').join('');
      }

      h += '<h2>Title and notes</h2>';
      h += '<label class="fld"><span>Title</span><input class="inp" data-act="title" data-id="' + s.id +
        '" type="text" maxlength="70" placeholder="' + esc(s.label || 'A title for the archive') +
        '" value="' + esc(s.title) + '"></label>';
      h += '<label class="fld"><span>Notes</span><textarea class="inp" data-act="notes" data-id="' + s.id +
        '" maxlength="600" placeholder="Who is in it, what he meant, anything you want the next generation to know.">' + esc(s.notes) + '</textarea></label>';

      h += '<h2>Tags</h2>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        (s.tags.length ? s.tags.map((tg, i) => '<button class="chip tag" data-act="deltag" data-id="' + s.id +
          '" data-i="' + i + '">' + esc(tg.label) + '<span class="x">x</span></button>').join('')
          : '<span class="tiny">No tags yet. A person, a place and a decade is enough.</span>') + '</div>';
      h += '<div class="fld-row" style="margin-top:12px">' +
        '<select class="inp" id="tagType"><option value="person">Person</option>' +
        '<option value="place">Place</option><option value="decade">Decade</option></select>' +
        '<input class="inp" id="tagLabel" type="text" maxlength="32" placeholder="Uncle Dev"></div>' +
        '<div style="margin-top:10px"><button class="btn ghost sm" data-act="addtag" data-id="' + s.id + '">Add tag</button></div>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible;margin-top:10px">' +
        Content.DECADES.map(d => '<button class="chip" data-act="quicktag" data-id="' + s.id +
          '" data-l="' + d + '">' + d + '</button>').join('') + '</div>';

      h += '<h2>Who this is for</h2>';
      h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        vis(s, 'family', 'The family') + vis(s, 'private', 'Private') + vis(s, 'sealed', 'Sealed') + '</div>';
      if (s.visibility === 'sealed') {
        h += '<label class="fld" style="margin-top:12px"><span>Open on</span>' +
          '<input class="inp" type="date" data-act="sealdate" data-id="' + s.id + '" value="' +
          esc(s.sealUntil || '') + '"></label>';
      }
      h += '<p class="tiny">Private hides it from the timeline until you switch private stories back on. It is a curtain, not a lock.</p>';

      h += '<h2>Reactions</h2>';
      const ppl = Store.people();
      if (ppl.length) {
        h += '<div class="chiprow" style="flex-wrap:wrap;overflow:visible">' + ppl.map(p =>
          '<button class="chip" data-act="heart" data-id="' + s.id + '" data-p="' + p.id + '">' +
          esc(p.name) + ' left a heart</button>').join('') + '</div>';
      } else {
        h += '<p class="note" style="margin-top:0">Add family members on the Family screen and their hearts show up on the elder' + "'" + 's own screen.</p>';
      }
      if (s.reactions.length) {
        h += '<p class="tiny" style="margin-top:10px">' + esc(s.reactions.map(r =>
          (Store.person(r.personId) || { name: 'Someone' }).name).join(', ')) + '</p>';
      }

      h += '<h2>Keep the thread going</h2>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn ghost sm" data-act="followup" data-id="' + s.id + '">Ask a follow up</button>' +
        '<button class="btn ghost sm" data-act="exportone" data-id="' + s.id + '">Export this story</button>' +
        '<button class="btn danger sm" data-act="delstory" data-id="' + s.id + '">Delete</button></div>';
      return h;
    },

    teller: id => {
      const t = Store.teller(id); if (!t) return '';
      const n = Store.storiesOf(id).length;
      let h = '<p class="sheet-q">' + esc(t.name) + '</p>';
      h += '<p class="sheet-meta">' + esc([t.relation, t.birthYear ? 'born ' + t.birthYear : '', t.place]
        .filter(Boolean).join(' · ')) + '</p>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">' +
        '<button class="btn" data-act="hand" data-id="' + id + '">Hand them the phone</button>' +
        (n ? '<button class="btn quiet sm" data-act="filtteller" data-id="' + id + '">See their ' + n + ' stories</button>' : '') +
        '</div>';
      h += '<label class="fld"><span>Name</span><input class="inp" data-act="tset" data-k="name" data-id="' +
        id + '" value="' + esc(t.name) + '" maxlength="40"></label>';
      h += '<label class="fld"><span>What the family calls them</span><input class="inp" data-act="tset" data-k="relation" data-id="' +
        id + '" value="' + esc(t.relation) + '" maxlength="30"></label>';
      h += '<div class="fld-row"><label class="fld"><span>Born</span><input class="inp" type="number" data-act="tset" data-k="birthYear" data-id="' +
        id + '" value="' + (t.birthYear || '') + '"></label>' +
        '<label class="fld"><span>Grew up in</span><input class="inp" data-act="tset" data-k="place" data-id="' +
        id + '" value="' + esc(t.place) + '" maxlength="40"></label></div>';
      h += '<div class="fld"><span>Question packs</span><div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
        Content.PACKS.filter(p => p.id !== 'core').map(p => '<button class="chip' +
          (t.packs.indexOf(p.id) >= 0 ? ' on' : '') + '" data-act="tpack" data-id="' + id + '" data-p="' +
          p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      h += '<div class="fld-row"><label class="fld"><span>Ask them on</span><select class="inp" data-act="tday" data-id="' +
        id + '">' + Store.DAYS.map((d, i) => '<option value="' + i + '"' +
          (t.ritual.day === i ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></label>' +
        '<label class="fld"><span>At</span><input class="inp" type="time" data-act="ttime" data-id="' +
        id + '" value="' + esc(t.ritual.time) + '"></label></div>';
      h += '<h2>Consent</h2>';
      h += t.consent
        ? '<p class="note" style="margin-top:0">' + esc(t.name) + ' agreed to be recorded on ' +
          esc(Store.longDate(t.consent.at)) + '. It is shown again on their screen whenever you want, and they can withdraw it by asking you to delete a story or all of them.</p>'
        : '<p class="note" style="margin-top:0">Not given yet. The consent card is the first thing they see in Elder Mode, in large type, and nothing records until they agree.</p>';
      h += '<div style="margin-top:20px"><button class="btn danger wide" data-act="delteller" data-id="' + id +
        '">Remove ' + esc(t.name) + ' and their stories</button></div>';
      return h;
    },

    newteller: () => {
      let h = '<p class="sheet-q">Who else should be asked?</p>';
      h += '<label class="fld"><span>Their name</span><input class="inp" id="ntName" maxlength="40" placeholder="Sarla"></label>';
      h += '<label class="fld"><span>What the family calls them</span><input class="inp" id="ntRel" maxlength="30" placeholder="Nani"></label>';
      h += '<div class="fld-row"><label class="fld"><span>Born</span><input class="inp" id="ntYear" type="number" placeholder="1941"></label>' +
        '<label class="fld"><span>Grew up in</span><input class="inp" id="ntPlace" maxlength="40" placeholder="Lucknow"></label></div>';
      h += '<div class="fld"><span>Question packs</span><div class="chiprow" id="ntPacks" style="flex-wrap:wrap;overflow:visible">' +
        Content.PACKS.filter(p => p.id !== 'core').map(p => '<button class="chip" data-act="ntpack" data-p="' +
          p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      h += '<p class="tiny">Two people can be asked the same question in the same week. Hearing both answers to how they met is the thing families keep forever.</p>';
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="ntsave">Add them</button></div>';
      return h;
    },

    newperson: () => '<p class="sheet-q">Who is listening?</p>' +
      '<p class="sheet-meta">Names only. Nothing is sent anywhere and there is nothing to sign up for.</p>' +
      '<label class="fld"><span>Name</span><input class="inp" id="npName" maxlength="32" placeholder="Zoe"></label>' +
      '<div class="fld"><span>Role</span><div class="chiprow" id="npRole" style="overflow:visible">' +
      '<button class="chip on" data-act="nprole" data-r="listener">Listener</button>' +
      '<button class="chip" data-act="nprole" data-r="keeper">Keeper</button></div></div>' +
      '<p class="tiny">A keeper looks after the archive. A listener hears the stories and can ask questions by name.</p>' +
      '<div style="margin-top:18px"><button class="btn wide" data-act="npsave">Add them</button></div>',

    marknote: arg => '<p class="sheet-q">Mark this moment</p>' +
      '<p class="sheet-meta">At ' + Store.dur(arg.t) + '. A few words is plenty. Marked moments are searchable.</p>' +
      '<label class="fld"><span>What happens here</span><input class="inp" id="mkNote" maxlength="80" placeholder="He laughs about the puppy"></label>' +
      '<div style="margin-top:16px"><button class="btn wide" data-act="marksave" data-id="' + arg.id +
      '" data-t="' + arg.t + '">Mark it</button></div>',

    packs: id => {
      const p = Content.PACKS.find(x => x.id === id);
      const ts = Store.tellers();
      if (!sheetTeller && ts.length === 1) sheetTeller = ts[0].id;
      const t = Store.teller(sheetTeller);
      const list = Content.PROMPTS.filter(x => x.pack === id);
      let h = '<p class="sheet-q">' + esc(p.name) + '</p><p class="sheet-meta">' + esc(p.blurb) +
        ' ' + list.length + ' questions.</p>';
      if (!t && ts.length > 1) {
        h += '<div class="fld"><span>Ask which of them</span><div class="chiprow" style="flex-wrap:wrap;overflow:visible">' +
          ts.map(x => '<button class="chip" data-act="pickteller" data-id="' + x.id + '">' + esc(x.name) +
            '</button>').join('') + '</div></div>';
      }
      if (t) h += '<p class="tiny" style="margin-bottom:14px">Tap one and it becomes the question waiting for ' +
        esc(t.name) + '.</p>';
      h += list.map(x => '<button class="promptrow" data-act="setprompt" data-id="' + x.id + '">' +
        esc(x.text) + '</button>').join('');
      return h;
    },

    swap: id => {
      const t = Store.teller(id);
      const w = Store.tagWeights(id);
      const pool = Content.eligible(t).filter(p => t.used.indexOf(p.id) < 0);
      const picks = [];
      for (let i = 1; i <= 6 && picks.length < 6; i++) {
        const p = Content.pick(t, Store.weekIndex(t) + i * 37, t.used.concat(picks.map(x => x.id)), t.skipped, w);
        if (p) picks.push(p);
      }
      const firsts = Store.storiesOf(id).length === 0
        ? Content.FIRST_QUESTIONS.map(Content.byId).filter(p => t.used.indexOf(p.id) < 0)
        : [];
      let h = '<p class="sheet-q">A different question for ' + esc(t.name) + '</p>';
      if (firsts.length) {
        h += '<h2>Good first questions</h2>' + firsts.map(p =>
          '<button class="promptrow" data-act="setprompt" data-id="' + p.id + '">' + esc(p.text) + '</button>').join('');
      }
      h += '<h2>Suggested for them</h2>';
      h += picks.map(p => '<button class="promptrow" data-act="setprompt" data-id="' + p.id + '">' +
        esc(p.text) + '</button>').join('');
      h += '<h2>All packs</h2>';
      h += Content.PACKS.filter(p => p.id === 'core' || t.packs.indexOf(p.id) >= 0).map(p =>
        '<button class="packrow" data-act="pack" data-id="' + p.id + '"><span class="pn">' + esc(p.name) +
        '</span><p class="pb">' + esc(p.blurb) + '</p></button>').join('');
      h += '<p class="tiny" style="margin-top:14px">' + pool.length + ' questions left for ' + esc(t.name) + '.</p>';
      return h;
    },

    askform: arg => {
      const ts = Store.tellers(), ppl = Store.people();
      let h = '<p class="sheet-q">Ask them something</p>';
      h += '<p class="sheet-meta">A question with a name on it gets answered. Theirs will say who asked.</p>';
      h += '<label class="fld"><span>The question</span><textarea class="inp" id="qText" maxlength="220" placeholder="What music did you dance to?"></textarea></label>';
      h += '<div class="fld"><span>Ask</span><div class="chiprow" id="qWho" style="flex-wrap:wrap;overflow:visible">' +
        ts.map((t, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qwho" data-id="' +
          t.id + '">' + esc(t.name) + '</button>').join('') + '</div></div>';
      if (ppl.length) {
        h += '<div class="fld"><span>From</span><div class="chiprow" id="qFrom" style="flex-wrap:wrap;overflow:visible">' +
          ppl.map((p, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qfrom" data-id="' +
            p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      } else {
        h += '<p class="tiny">Add family members on the Family screen and their names appear on the question.</p>';
      }
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="qsave">Put it at the front of the queue</button></div>';
      return h;
    },

    followup: id => {
      const s = Store.story(id);
      const t = Store.teller(s.tellerId);
      const ppl = Store.people();
      let h = '<p class="sheet-q">Ask ' + esc(t.name) + ' more</p>';
      h += '<p class="sheet-meta">Following: ' + esc(s.question) + '</p>';
      h += '<label class="fld"><span>The follow up</span><textarea class="inp" id="fuText" maxlength="220" placeholder="You mentioned the dance hall. What music did you dance to?"></textarea></label>';
      if (ppl.length) {
        h += '<div class="fld"><span>From</span><div class="chiprow" id="fuFrom" style="flex-wrap:wrap;overflow:visible">' +
          ppl.map((p, i) => '<button class="chip' + (i === 0 ? ' on' : '') + '" data-act="qfrom" data-id="' +
            p.id + '">' + esc(p.name) + '</button>').join('') + '</div></div>';
      }
      h += '<div style="margin-top:18px"><button class="btn wide" data-act="fusave" data-id="' + id +
        '">Add it to the queue</button></div>';
      return h;
    },

    exportwho: () => '<p class="sheet-q">Export one person</p>' +
      '<p class="sheet-meta">A smaller zip, one voice in it.</p>' +
      Store.tellers().map(t => '<button class="packrow" data-act="exportteller" data-id="' + t.id +
        '"><span class="pn">' + esc(t.name) + '</span><p class="pb">' + Store.storiesOf(t.id).length +
        ' stories</p></button>').join(''),

    confirm: arg => '<p class="sheet-q">' + esc(arg.title) + '</p>' +
      '<p class="sheet-meta">' + esc(arg.body) + '</p>' +
      '<div style="display:flex;gap:10px;margin-top:10px">' +
      '<button class="btn quiet grow" data-act="cancel">' + esc(arg.no || 'Keep it') + '</button>' +
      '<button class="btn ' + (arg.danger ? 'danger' : '') + ' grow" data-act="confirmyes">' +
      esc(arg.yes) + '</button></div>'
  };
  let sheetTeller = null;
  let ntPacks = [], npRole = 'listener', qWho = null, qFrom = null, confirmFn = null;

  /* --------------------------------------------------------- the player - */
  function stopPlayer() {
    if (player.raf) cancelAnimationFrame(player.raf);
    if (player.audio) { player.audio.pause(); player.audio.src = ''; }
    if (player.url) URL.revokeObjectURL(player.url);
    player = { audio: null, id: null, url: null, raf: 0 };
  }
  function mountPlayer(id) {
    const s = Store.story(id);
    if (!s || Store.sealed(s)) return;
    stopPlayer();
    Store.getAudio(id).then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = new Audio();
      a.src = url; a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => {
        if (!isFinite(a.duration)) {
          a.currentTime = 1e6;
          const fix = () => { a.removeEventListener('timeupdate', fix); try { a.currentTime = 0; } catch (e) {} };
          a.addEventListener('timeupdate', fix);
        }
      });
      a.addEventListener('ended', () => { const b = $('#playBtn'); if (b) b.classList.remove('playing'); });
      player = { audio: a, id, url, raf: 0 };
      loopPlayer();
    });
  }
  function loopPlayer() {
    const s = Store.story(player.id);
    const f = $('#fill'), n = $('#pnow');
    if (f && player.audio && s) {
      const d = isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : s.dur;
      f.style.width = Math.min(100, (player.audio.currentTime / Math.max(0.1, d)) * 100) + '%';
      if (n) n.textContent = Store.dur(player.audio.currentTime);
    }
    player.raf = requestAnimationFrame(loopPlayer);
  }
  function togglePlay(id) {
    if (!player.audio || player.id !== id) { mountPlayer(id); setTimeout(() => togglePlay(id), 220); return; }
    const b = $('#playBtn');
    if (player.audio.paused) {
      player.audio.play().then(() => {
        if (b) b.classList.add('playing');
        if (player.audio.currentTime < 1) Store.played(id);
      }).catch(() => toast('That recording could not be played.'));
    } else {
      player.audio.pause();
      if (b) b.classList.remove('playing');
    }
  }

  /* -------------------------------------------------------------- files - */
  function b64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1] || '');
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function saveOut(blob, name, mime) {
    if (window.Native && Native.saveFile) {
      if (blob.size > 60 * 1024 * 1024) {
        toast('That is too big to hand to Android in one piece. Export one person, or one story.');
        return;
      }
      b64(blob).then(data => {
        let uri = '';
        try { uri = Native.saveFile(name, mime, data); } catch (e) { uri = ''; }
        if (!uri) { toast('The file could not be written.'); return; }
        toast('Saved to Downloads as ' + name);
        if (Native.shareUri) { try { Native.shareUri(uri, mime); } catch (e) {} }
      }).catch(() => toast('The file could not be written.'));
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('Downloaded ' + name);
    }
  }
  function exportAll(list, label) {
    if (!Store.stories().length) { toast('Nothing to export yet.'); return; }
    toast('Building the archive.');
    Store.exportArchive(list).then(zip => {
      saveOut(zip, 'heirloom-' + (label || 'archive') + '-' + Store.ymd(new Date()) + '.zip', 'application/zip');
    }).catch(() => toast('The archive could not be built.'));
  }

  /* ------------------------------------------------------- reminders ---- */
  function reschedule() {
    const st = Store.settings();
    if (!(window.Native && Native.scheduleNotifications)) return;
    try {
      if (!st.notify) { Native.cancelNotifications(); return; }
      Native.scheduleNotifications(JSON.stringify(Store.schedule()));
    } catch (e) {}
  }

  /* --------------------------------------------------------- delegation - */
  const ACTS = {
    go: (el) => setView(el.dataset.v),
    filt: (el) => {
      const k = el.dataset.k;
      if (k === 'all') { filter.teller = null; filter.tag = null; }
      else if (k === 'teller') { filter.teller = el.dataset.id; filter.tag = null; }
      else if (k === 'private') filter.showPrivate = !filter.showPrivate;
      renderArchive();
    },
    thread: (el) => { filter.tag = el.dataset.l; filter.teller = null; mode = 'timeline'; closeSheet(true); setView('archive'); },
    story: (el) => openSheet('story', el.dataset.id),
    teller: (el) => openSheet('teller', el.dataset.id),
    newteller: () => { ntPacks = []; openSheet('newteller'); },
    newperson: () => { npRole = 'listener'; openSheet('newperson'); },
    hand: (el) => { closeSheet(true); openElder(el.dataset.id); },
    asknow: (el) => { Store.updateTeller(el.dataset.id, { answeredAt: null }); renderAsk(); },
    swap: (el) => { sheetTeller = el.dataset.id; openSheet('swap', el.dataset.id); },
    skip: (el) => {
      const t = Store.teller(el.dataset.id);
      confirmFn = () => { Store.skipWeek(t.id); renderAsk(); toast('Skipped. A different question next.'); };
      openSheet('confirm', { title: 'Skip this week?', yes: 'Skip it', no: 'Keep it',
        body: 'The question goes to the back of the queue and a different one comes up. Skipping is information, not failure: the engine notices what does not land.' });
    },
    pack: (el) => { if (!sheets.length) sheetTeller = null; openSheet('packs', el.dataset.id); },
    pickteller: (el) => { sheetTeller = el.dataset.id; paintSheet(); },
    setprompt: (el) => {
      const tid = sheetTeller || (Store.tellers().length === 1 ? Store.tellers()[0].id : null);
      if (!tid) { toast('Choose who to ask first.'); return; }
      Store.setPrompt(tid, el.dataset.id);
      Store.updateTeller(tid, { answeredAt: null });
      closeSheet(true); setView('ask'); toast('That is the question waiting for them.');
    },
    askform: () => { qWho = null; qFrom = null; openSheet('askform'); },
    qwho: (el) => { qWho = el.dataset.id; sel(el, '#qWho'); },
    qfrom: (el) => { qFrom = el.dataset.id; sel(el, el.closest('.chiprow') ? '#' + el.closest('.chiprow').id : '#qFrom'); },
    qsave: () => {
      const txt = $('#qText').value.trim();
      if (!txt) { toast('Write the question first.'); return; }
      const tid = qWho || (Store.tellers()[0] || {}).id;
      const from = qFrom || (Store.people()[0] || {}).id;
      Store.askQuestion(tid, txt, from);
      closeSheet(true); setView('ask'); toast('It jumps the queue.');
    },
    dropq: (el) => { Store.dropQuestion(el.dataset.id); renderAsk(); },
    followup: (el) => { qFrom = null; openSheet('followup', el.dataset.id); },
    fusave: (el) => {
      const s = Store.story(el.dataset.id);
      const txt = $('#fuText').value.trim();
      if (!txt) { toast('Write the follow up first.'); return; }
      Store.askQuestion(s.tellerId, txt, qFrom || (Store.people()[0] || {}).id);
      closeSheet(true); setView('ask'); toast('Next time they open Elder Mode, that is what they see.');
    },
    ntpack: (el) => {
      const p = el.dataset.p;
      const i = ntPacks.indexOf(p);
      if (i < 0) ntPacks.push(p); else ntPacks.splice(i, 1);
      el.classList.toggle('on');
    },
    ntsave: () => {
      const name = $('#ntName').value.trim();
      if (!name) { toast('Their name, first.'); return; }
      Store.addTeller({
        name, relation: $('#ntRel').value, birthYear: parseInt($('#ntYear').value, 10) || null,
        place: $('#ntPlace').value, packs: ntPacks.slice(), day: 0, time: '15:00'
      });
      reschedule(); closeSheet(true); setView('family'); toast(name + ' added.');
    },
    nprole: (el) => { npRole = el.dataset.r; sel(el, '#npRole'); },
    npsave: () => {
      const name = $('#npName').value.trim();
      if (!name) { toast('A name, first.'); return; }
      Store.addPerson(name, npRole);
      closeSheet(true); renderFamily(); toast(name + ' can listen now.');
    },
    delperson: (el) => { Store.removePerson(el.dataset.id); renderFamily(); },
    tpack: (el) => {
      const t = Store.teller(el.dataset.id);
      const p = el.dataset.p;
      const i = t.packs.indexOf(p);
      if (i < 0) t.packs.push(p); else t.packs.splice(i, 1);
      t.current = null;
      Store.save(); el.classList.toggle('on');
    },
    delteller: (el) => {
      const t = Store.teller(el.dataset.id);
      confirmFn = () => {
        Store.removeTeller(t.id); reschedule(); closeSheet(true); setView('family');
        toast(t.name + ' removed.');
      };
      openSheet('confirm', { title: 'Remove ' + t.name + '?', yes: 'Remove everything', danger: true,
        body: 'Their stories and recordings are deleted from this phone and cannot be recovered. Export first if you want to keep them.' });
    },
    filtteller: (el) => { filter.teller = el.dataset.id; filter.tag = null; closeSheet(true); setView('archive'); },
    play: (el) => togglePlay(el.dataset.id),
    seek: (el, e) => {
      const s = Store.story(el.dataset.id);
      if (!player.audio || player.id !== s.id) return;
      const r = el.getBoundingClientRect();
      const x = ((e.clientX || 0) - r.left) / r.width;
      const d = isFinite(player.audio.duration) && player.audio.duration > 0 ? player.audio.duration : s.dur;
      try { player.audio.currentTime = Math.max(0, Math.min(d - 0.1, x * d)); } catch (err) {}
    },
    jump: (el) => { if (player.audio) { try { player.audio.currentTime = +el.dataset.t; } catch (e) {} } },
    mark: (el) => {
      if (!player.audio) { toast('Play it first, then mark the moment.'); return; }
      openSheet('marknote', { id: el.dataset.id, t: player.audio.currentTime });
    },
    marksave: (el) => {
      const note = $('#mkNote').value.trim();
      Store.addMoment(el.dataset.id, +el.dataset.t, note);
      buzz(12, 130);
      closeSheet();
      toast('Marked at ' + Store.dur(+el.dataset.t) + '.');
    },
    delmoment: (el) => { Store.removeMoment(el.dataset.id, +el.dataset.i); paintSheet(); },
    addtag: (el) => {
      const type = $('#tagType').value, label = $('#tagLabel').value.trim();
      if (!label) { toast('Type the tag first.'); return; }
      Store.addTag(el.dataset.id, type, label);
      paintSheet();
    },
    quicktag: (el) => { Store.addTag(el.dataset.id, 'decade', el.dataset.l); paintSheet(); },
    deltag: (el) => { Store.removeTag(el.dataset.id, +el.dataset.i); paintSheet(); },
    vis: (el) => {
      const s = Store.story(el.dataset.id);
      const v = el.dataset.v;
      const patch = { visibility: v };
      if (v === 'sealed' && !s.sealUntil) {
        const d = new Date(); d.setFullYear(d.getFullYear() + 5);
        patch.sealUntil = Store.ymd(d);
      }
      Store.updateStory(s.id, patch);
      paintSheet();
    },
    unseal: (el) => { Store.updateStory(el.dataset.id, { visibility: 'family', sealUntil: null }); paintSheet(); },
    heart: (el) => { Store.react(el.dataset.id, el.dataset.p); buzz(14, 150); paintSheet(); toast('Heart left.'); },
    exportone: (el) => {
      Store.exportStory(el.dataset.id).then(o => {
        if (!o) { toast('That recording is missing.'); return; }
        saveOut(o.blob, o.name, o.blob.type || 'audio/webm');
      });
    },
    exportteller: (el) => {
      const t = Store.teller(el.dataset.id);
      closeSheet(true);
      exportAll(Store.storiesOf(t.id).slice().reverse(), t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    },
    export: () => exportAll(null, 'archive'),
    exportwho: () => openSheet('exportwho'),
    delstory: (el) => {
      const s = Store.story(el.dataset.id);
      confirmFn = () => {
        Store.removeStory(s.id).then(() => { closeSheet(true); setView('archive'); toast('Deleted.'); });
      };
      openSheet('confirm', { title: 'Delete this story?', yes: 'Delete it', danger: true,
        body: 'The recording is removed from this phone for good. If the teller asked you to delete it, this is the button.' });
    },
    erase: () => {
      confirmFn = () => {
        Store.erase().then(() => { closeSheet(true); location.reload(); });
      };
      openSheet('confirm', { title: 'Erase everything?', yes: 'Erase it all', danger: true,
        body: 'Every recording, every tag and every name goes. There is no copy anywhere else, because there is no anywhere else.' });
    },
    tog: (el) => {
      const k = el.dataset.k;
      const st = Store.settings();
      const on = !st[k];
      Store.settings({ [k]: on });
      el.classList.toggle('on', on);
      if (k === 'notify') {
        if (on && window.Native && Native.notificationsAllowed && !Native.notificationsAllowed()) {
          try { Native.requestNotificationPermission(); } catch (e) {}
        }
        reschedule();
      }
      if (k === 'haptics' && on) buzz(16, 150);
    },
    cancel: () => closeSheet(),
    confirmyes: () => { const f = confirmFn; confirmFn = null; if (f) f(); else closeSheet(); }
  };
  function sel(el, scope) {
    const box = scope ? document.querySelector(scope) : el.parentElement;
    if (box) box.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
  }
  function vis(s, v, label) {
    return '<button class="chip' + (s.visibility === v ? ' on' : '') + '" data-act="vis" data-id="' +
      s.id + '" data-v="' + v + '">' + label + '</button>';
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACTS[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'famName') Store.family(e.target.value);
    if (e.target.id === 'obYear') { obPacks = []; renderObPacks(); }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    if (a === 'title') Store.updateStory(el.dataset.id, { title: el.value.slice(0, 70) });
    else if (a === 'notes') Store.updateStory(el.dataset.id, { notes: el.value });
    else if (a === 'tset') {
      const k = el.dataset.k;
      const v = k === 'birthYear' ? (parseInt(el.value, 10) || null) : el.value;
      Store.updateTeller(el.dataset.id, { [k]: v });
    } else if (a === 'tday') {
      const t = Store.teller(el.dataset.id); t.ritual.day = +el.value; Store.save(); reschedule();
    } else if (a === 'ttime') {
      const t = Store.teller(el.dataset.id); t.ritual.time = el.value; Store.save(); reschedule();
    } else if (a === 'sealdate') {
      Store.updateStory(el.dataset.id, { sealUntil: el.value || null });
    }
  });

  /* ---------------------------------------------------------- wiring ---- */
  function wire() {
    $('#obNext').addEventListener('click', obNext);
    document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
    document.querySelectorAll('#archSeg .seg-b').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode; renderArchive();
    }));
    $('#archSearch').addEventListener('input', e => { query = e.target.value; renderArchive(); });
    $('#sheetScrim').addEventListener('click', () => closeSheet(true));

    $('#elderRec').addEventListener('click', startRecording);
    $('#elderSkip').addEventListener('click', () => {
      Store.skipWeek(elder.tellerId);
      toast('Skipped. Something else next week.');
      renderElder();
    });
    $('#elderSpeak').addEventListener('click', () => {
      const b = $('#elderSpeak');
      b.classList.add('on');
      speak($('#elderQ').textContent, () => b.classList.remove('on'));
    });
    $('#consentYes').addEventListener('click', () => {
      Store.giveConsent(elder.tellerId);
      buzz(18, 170);
      elder.stage = 'home'; renderElder(); reschedule();
    });
    $('#consentNo').addEventListener('click', leaveElder);
    $('#recPause').addEventListener('click', togglePause);
    $('#recDone').addEventListener('click', finishRecording);
    $('#recRedo').addEventListener('click', () => {
      confirmFn = () => { closeSheet(true); discardRecording(); setTimeout(startRecording, 120); };
      openSheet('confirm', { title: 'Start again?', yes: 'Start again', no: 'Carry on', danger: true,
        body: 'What has been recorded so far is thrown away and the recording starts from the beginning.' });
    });
    $('#doneOk').addEventListener('click', () => { elder.stage = 'home'; renderElder(); });
    $('#errRetry').addEventListener('click', startRecording);
    $('#errBack').addEventListener('click', () => { elder.stage = 'home'; renderElder(); });

    /* Elder Mode is left by holding the corner mark, so it cannot be left by accident. */
    const exit = $('#elderExit');
    let holdT = 0;
    const down = () => {
      exit.classList.add('holding');
      holdT = setTimeout(() => { exit.classList.remove('holding'); leaveElder(); }, 1100);
    };
    const up = () => { clearTimeout(holdT); exit.classList.remove('holding'); };
    exit.addEventListener('pointerdown', down);
    exit.addEventListener('pointerup', up);
    exit.addEventListener('pointerleave', up);
    exit.addEventListener('pointercancel', up);
  }

  function leaveElder() {
    if (Recorder.getState() !== 'idle') { stopWave(); Recorder.cancel(); }
    if (TTS) { try { speechSynthesis.cancel(); } catch (e) {} }
    setView('ask');
  }

  /* ------------------------------------------------------------- shell -- */
  function back() {
    if (sheets.length) { closeSheet(); return true; }
    if (elder) {
      if (elder.stage === 'rec') {
        confirmFn = () => { closeSheet(true); discardRecording(); };
        openSheet('confirm', { title: 'Throw this recording away?', yes: 'Throw it away', no: 'Carry on', danger: true,
          body: 'It has not been kept yet. Press Done instead if you want it.' });
        return true;
      }
      confirmFn = () => { closeSheet(true); leaveElder(); };
      openSheet('confirm', { title: 'Leave the big button screen?', yes: 'Leave', no: 'Stay',
        body: 'This is the screen made for the person telling the stories. The rest of the app is for whoever looks after the archive.' });
      return true;
    }
    if (!Store.onboarded()) { if (step > 0) { step--; paintOnboard(); return true; } return false; }
    if (view !== 'archive') { setView('archive'); return true; }
    return false;
  }

  function onPause() {
    if (Recorder.getState() === 'recording') {
      togglePause();
      toast('Paused. Press Carry on when you come back.');
    }
    if (player.audio && !player.audio.paused) { player.audio.pause(); const b = $('#playBtn'); if (b) b.classList.remove('playing'); }
    if (TTS) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  function onResume() { reschedule(); }

  function boot() {
    paintIcons();
    wire();
    if (!Store.onboarded()) showOnboard();
    else { setView(Store.stories().length ? 'archive' : 'ask'); }
    reschedule();
  }

  boot();

  return { back, onPause, onResume, setView, openElder, openSheet, closeSheet, render, toast };
})();

window.App = App;
