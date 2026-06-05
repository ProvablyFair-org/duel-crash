// Capture methodology, published for provenance/review.
// Reference record, not a runnable tool.
// Dataset in `data/`, hash-verified by the suite.

if (window._crashkill) window._crashkill();

(function () {
  'use strict';

  var INSTANCE = Date.now();
  window._crashkill = function () { INSTANCE = -1; };

  // ── Phase config ────────────────────────────────────────────────────────
  var PHASES = [
    { key: 'A', name: '800 @ 1.5x $0.01',   total: 800, amount: '0.01', cashout: 1.5 },
    { key: 'B', name: '200 varied cashout',   total: 200, amount: '0.01', cashout: null },
    { key: 'C', name: '100 @ 2x $10',         total: 100, amount: '10',   cashout: 2 },
  ];
  var PHASE_B_TARGETS = [1.1, 2, 5, 10];
  var CURRENCY = 105;
  var DB_NAME = 'crash_capture';
  var TOKEN_MAX_AGE = 300000;

  // drand quicknet chain — publishTime(round) = GENESIS + (round - 1) * PERIOD
  // Verified: drandRoundId 27798178 -> 1776197898 matches dataset samples exactly.
  var DRAND_GENESIS = 1692803367;
  var DRAND_PERIOD  = 3;
  function drandPublishTime(round) { return DRAND_GENESIS + (round - 1) * DRAND_PERIOD; }

  // ── IndexedDB ───────────────────────────────────────────────────────────
  var db = null;
  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise(function (ok, fail) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function (e) { var d = e.target.result; if (!d.objectStoreNames.contains('rounds')) d.createObjectStore('rounds', { autoIncrement: true }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); };
      req.onsuccess = function (e) { db = e.target.result; ok(db); };
      req.onerror = function (e) { fail(e.target.error); };
    });
  }
  function dbPut(s, v, k) { return new Promise(function (ok, fail) { var tx = db.transaction(s, 'readwrite'); var r = k !== undefined ? tx.objectStore(s).put(v, k) : tx.objectStore(s).add(v); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbGetAll(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).getAll(); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbGet(s, k) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).get(k); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }
  function dbClear(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readwrite').objectStore(s).clear(); r.onsuccess = function () { ok(); }; r.onerror = function () { fail(r.error); }; }); }
  function dbCount(s) { return new Promise(function (ok, fail) { var r = db.transaction(s, 'readonly').objectStore(s).count(); r.onsuccess = function () { ok(r.result); }; r.onerror = function () { fail(r.error); }; }); }

  // ── State ───────────────────────────────────────────────────────────────
  var meta = {};
  var paused = true;
  var roundCount = 0;
  var cur = null;

  function freshMeta() { return { phaseIdx: 0, phaseBets: 0, running: false, token: null, tokenAt: 0, errors: 0, createdAt: new Date().toISOString(), phaseBetCounts: { A: 0, B: 0, C: 0, D: 0 } }; }
  function resetCur() { cur = { roundId: null, serverSeedHash: null, drandRoundId: null, drandRandomness: null, crashPoint: null, serverSeed: null, betPlaced: false, betId: null, transactionId: null, amountWon: null, effectiveEdge: null, isWin: null, _amount: null, _cashout: null, _phase: null, _saved: false }; }
  function saveMeta() { return dbPut('meta', meta, 'state'); }
  resetCur();

  // ── Logging ─────────────────────────────────────────────────────────────
  function ts() { return new Date().toTimeString().slice(0, 8); }
  function log(msg) { console.log('%c[crash ' + ts() + '] ' + msg, 'color:#60a5fa'); updatePanel(); }
  function warn(msg) { console.warn('%c[crash ' + ts() + '] ' + msg, 'color:#ffb74d'); updatePanel(); }
  function good(msg) { console.log('%c[crash ' + ts() + '] ' + msg, 'color:#81c784;font-weight:bold'); updatePanel(); }

  // ── API ─────────────────────────────────────────────────────────────────
  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'content-type': 'application/json', 'accept': 'application/json, text/plain, */*', 'x-duel-device-identifier': localStorage.getItem('security:uuid') || '', 'x-env-class': localStorage.getItem('env_class') || 'blue' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (res) { return res.json().then(function (j) { if (!res.ok || j.success === false) throw new Error((j.error || j.message || JSON.stringify(j).slice(0, 200))); return j.data || j; }); });
  }
  function refreshToken() { return api('POST', '/api/v2/user/security/token', { uuid: localStorage.getItem('security:uuid'), code: '0000', type: 'standard' }).then(function (r) { meta.token = r.token || r; meta.tokenAt = Date.now(); return meta.token; }); }
  function ensureToken() { return (Date.now() - meta.tokenAt > TOKEN_MAX_AGE) ? refreshToken() : Promise.resolve(meta.token); }

  // ── Bet via WebSocket ────────────────────────────────────────────────────
  // Crash bets are placed as Socket.IO emits, NOT HTTP POST.
  // Format: 42/crash,["place bet",{amount, multiplier, currency, round, security_token, coin}]
  var _liveWS = null; // set by .send() hook

  function getCashout() { var cfg = PHASES[meta.phaseIdx]; if (!cfg) return 2; if (cfg.cashout !== null) return cfg.cashout; return PHASE_B_TARGETS[meta.phaseBets % PHASE_B_TARGETS.length]; }

  function placeBet() {
    if (!cur || cur.betPlaced || paused || meta.phaseIdx >= PHASES.length) return;
    if (!_liveWS || _liveWS.readyState !== 1) { warn('no live WS — cannot bet'); return; }

    var cfg = PHASES[meta.phaseIdx];
    var cashout = getCashout();
    cur._amount = cfg.amount; cur._cashout = cashout; cur._phase = cfg.key;

    ensureToken().then(function (token) {
      cur.betPlaced = true;
      var payload = '42/crash,' + JSON.stringify(["place bet", {
        amount: cfg.amount,
        multiplier: cashout,
        currency: CURRENCY,
        round: cur.roundId,
        security_token: token,
        coin: "crash",
      }]);
      _liveWS.send(payload);
      log('bet $' + cfg.amount + ' @ ' + cashout + 'x (round ' + cur.roundId + ')');
    }).catch(function (e) {
      warn('token failed: ' + e.message);
    });
  }

  // ── Save round ──────────────────────────────────────────────────────────
  function trySaveRound() {
    if (!cur || !cur.roundId || cur.crashPoint == null || !cur.betPlaced || cur._saved) return;
    var cfg = PHASES[meta.phaseIdx];
    if (!cfg) return;
    cur._saved = true;

    var record = {
      at: new Date().toISOString(), phase: cur._phase || cfg.key, roundId: cur.roundId,
      request: { amount: cur._amount || cfg.amount, auto_cashout: cur._cashout || getCashout() },
      result: { crashPoint: cur.crashPoint, serverSeed: cur.serverSeed, serverSeedHash: cur.serverSeedHash, drandRoundId: cur.drandRoundId, drandRandomness: cur.drandRandomness, betId: cur.betId, transactionId: cur.transactionId, amountWon: cur.amountWon, effectiveEdge: cur.effectiveEdge, isWin: cur.isWin },
      // timing is populated at save() via the transactions API (authoritative) + drand formula
      timing: null,
    };

    openDB().then(function () { return dbPut('rounds', record); }).then(function () {
      roundCount++; meta.phaseBets++; meta.phaseBetCounts[cfg.key]++; meta.errors = 0;
      if (roundCount % 10 === 0) log(cfg.key + ': ' + meta.phaseBets + '/' + cfg.total + ' | total: ' + roundCount + ' | ' + cur.crashPoint + 'x');
      if (meta.phaseBets >= cfg.total) {
        good('Phase ' + cfg.key + ' done');
        meta.phaseIdx++; meta.phaseBets = 0;
        if (meta.phaseIdx >= PHASES.length) { good('ALL DONE — ' + roundCount + ' rounds. crash.save()'); paused = true; meta.running = false; }
      }
      return saveMeta();
    }).then(function () { updatePanel(); });
  }

  // ── Socket.IO parser ────────────────────────────────────────────────────
  function parseSocketIO(raw) {
    if (typeof raw !== 'string') return null;
    var m = raw.match(/^42\/crash,\[(.+)\]$/s);
    if (!m) return null;
    try { var arr = JSON.parse('[' + m[1] + ']'); return { event: arr[0], data: arr[1] }; }
    catch (_) { return null; }
  }

  // ── Event handler ───────────────────────────────────────────────────────
  function handleEvent(ev, data) {
    if (INSTANCE === -1) return;

    if (ev === 'collecting-bets') {
      // Save previous round if pending
      if (cur && cur.betPlaced && cur.crashPoint != null && !cur._saved) trySaveRound();
      resetCur();
      cur.roundId = data.round;
      if (!paused && meta.phaseIdx < PHASES.length) placeBet();
    }

    if (ev === 'crash_hashed_pf' && Array.isArray(data)) {
      var pf = data[0];
      if (pf && cur && (pf.id === cur.roundId || !cur.serverSeedHash)) {
        cur.serverSeedHash = pf.server_seed_hashed;
      }
    }

    if (ev === 'pending_drand' && Array.isArray(data)) {
      var pd = data[0];
      if (pd && cur) {
        if (pd.seed_index) cur.drandRoundId = pd.seed_index;
        if (pd.drand_randomness && !cur.drandRandomness) cur.drandRandomness = pd.drand_randomness;
        if (pd.server_seed) { cur.serverSeed = pd.server_seed; trySaveRound(); }
        if (pd.server_seed_hashed && !cur.serverSeedHash) cur.serverSeedHash = pd.server_seed_hashed;
      }
    }

    if (ev === 'crashed') {
      if (cur) {
        cur.crashPoint = Math.floor(parseFloat(data.multiplier) * 100) / 100;
        if (cur._cashout != null) cur.isWin = cur.crashPoint >= cur._cashout;
        // server_seed arrives in pending_drand after crash — wait 3s then save anyway
        setTimeout(function () { trySaveRound(); }, 3000);
      }
    }

    if (ev === 'crash_bet_placed' && data && cur && data.round_id === cur.roundId) {
      cur.betId = cur.betId || data.id;
      cur.transactionId = cur.transactionId || data.transaction_id;
      cur.effectiveEdge = cur.effectiveEdge || data.effective_edge;
      cur.serverSeedHash = cur.serverSeedHash || data.server_seed_hashed;
      cur.amountWon = data.amount_won || null;
      if (data.is_win !== undefined && cur.isWin == null) cur.isWin = !!data.is_win;
    }

    if (ev === 'bet' && data && data.bets && cur) {
      for (var i = 0; i < data.bets.length; i++) {
        var b = data.bets[i].data && data.bets[i].data.bet;
        if (b && b.round_id === cur.roundId) {
          cur.betId = cur.betId || b.id;
          cur.transactionId = cur.transactionId || b.transaction_id;
          cur.effectiveEdge = cur.effectiveEdge || b.effective_edge;
          cur.serverSeedHash = cur.serverSeedHash || b.server_seed_hashed;
        }
      }
    }
  }

  // ── Hook WS via .send() patch ────────────────────────────────────────────
  // The Socket.IO client keeps the WS in a closure — can't find it by scanning.
  // But the app calls .send() for heartbeats. We patch .send() to grab the
  // WS instance on first call, then add our message listener.
  var _origSend = WebSocket.prototype.send;
  var _wsHooked = false;

  WebSocket.prototype.send = function (data) {
    if (!_wsHooked) {
      _wsHooked = true;
      _liveWS = this;
      this.addEventListener('message', function (event) {
        var parsed = parseSocketIO(event.data);
        if (parsed) handleEvent(parsed.event, parsed.data);
      });
      good('hooked live WebSocket via .send() intercept');
    }
    return _origSend.call(this, data);
  };

  // ── Panel ───────────────────────────────────────────────────────────────
  function buildPanel() {
    var old = document.getElementById('cap-panel'); if (old) old.remove();
    var d = document.createElement('div'); d.id = 'cap-panel';
    Object.assign(d.style, { position:'fixed', bottom:'16px', right:'16px', zIndex:'99999', background:'#0d1117', border:'1px solid #1e2d3d', borderRadius:'8px', padding:'12px 16px', fontFamily:'monospace', fontSize:'11px', color:'#b8cfe0', minWidth:'280px', boxShadow:'0 4px 24px rgba(0,0,0,.7)', cursor:'move', userSelect:'none' });
    var dragging = false, ox = 0, oy = 0;
    d.addEventListener('mousedown', function (e) { if (e.target.tagName === 'BUTTON') return; dragging = true; ox = e.clientX - d.offsetLeft; oy = e.clientY - d.offsetTop; });
    document.addEventListener('mousemove', function (e) { if (!dragging) return; d.style.left = (e.clientX - ox) + 'px'; d.style.top = (e.clientY - oy) + 'px'; d.style.right = 'auto'; d.style.bottom = 'auto'; });
    document.addEventListener('mouseup', function () { dragging = false; });

    var title = document.createElement('div'); title.textContent = 'CRASH CAPTURE'; Object.assign(title.style, { color:'#ef4444', fontWeight:'700', fontSize:'13px' }); d.appendChild(title);
    var st = document.createElement('div'); st.id = 'cap-status'; Object.assign(st.style, { margin:'6px 0', color:'#4d6880', fontSize:'10px' }); d.appendChild(st);

    for (var pi = 0; pi < PHASES.length; pi++) {
      var ph = PHASES[pi]; var row = document.createElement('div'); Object.assign(row.style, { display:'flex', alignItems:'center', gap:'6px', marginBottom:'3px' });
      var lbl = document.createElement('span'); lbl.textContent = ph.key; Object.assign(lbl.style, { width:'14px', color:'#4d6880', fontWeight:'700' });
      var barOuter = document.createElement('div'); Object.assign(barOuter.style, { flex:'1', height:'8px', background:'#161e28', borderRadius:'4px', overflow:'hidden' });
      var fill = document.createElement('div'); fill.id = 'cap-bar-' + ph.key; Object.assign(fill.style, { height:'100%', width:'0%', background:'#2dff82', borderRadius:'4px', transition:'width .3s' }); barOuter.appendChild(fill);
      var ct = document.createElement('span'); ct.id = 'cap-ct-' + ph.key; ct.textContent = '0/' + ph.total; Object.assign(ct.style, { width:'70px', textAlign:'right', fontSize:'9px', color:'#4d6880' });
      row.appendChild(lbl); row.appendChild(barOuter); row.appendChild(ct); d.appendChild(row);
    }
    var lastLine = document.createElement('div'); lastLine.id = 'cap-last'; Object.assign(lastLine.style, { margin:'6px 0 4px', fontSize:'10px', color:'#4d6880' }); d.appendChild(lastLine);
    var btnRow = document.createElement('div'); Object.assign(btnRow.style, { display:'flex', gap:'4px', marginTop:'8px' });
    function mkBtn(text, color, fn) { var b = document.createElement('button'); b.textContent = text; Object.assign(b.style, { flex:'1', padding:'5px 0', background:'#161e28', border:'1px solid #1e2d3d', color: color, borderRadius:'3px', cursor:'pointer', fontFamily:'monospace', fontSize:'10px', fontWeight:'700' }); b.addEventListener('click', fn); return b; }
    btnRow.appendChild(mkBtn('GO', '#2dff82', function () { pub.go(); }));
    btnRow.appendChild(mkBtn('PAUSE', '#ffcc44', function () { pub.pause(); }));
    btnRow.appendChild(mkBtn('SAVE', '#33ccff', function () { pub.save(); }));
    d.appendChild(btnRow); document.body.appendChild(d);
  }

  function updatePanel() {
    for (var pi = 0; pi < PHASES.length; pi++) {
      var ph = PHASES[pi]; var n = meta.phaseBetCounts ? (meta.phaseBetCounts[ph.key] || 0) : 0;
      var bar = document.getElementById('cap-bar-' + ph.key); var ct = document.getElementById('cap-ct-' + ph.key);
      if (bar) { bar.style.width = Math.min(100, n / ph.total * 100) + '%'; bar.style.background = n >= ph.total ? '#33ccff' : '#2dff82'; }
      if (ct) ct.textContent = n + '/' + ph.total;
    }
    var st = document.getElementById('cap-status');
    if (st) { var phase = PHASES[meta.phaseIdx]; st.textContent = (paused ? 'paused' : 'running') + ' | rounds: ' + roundCount + ' | phase: ' + (phase ? phase.key : 'done'); st.style.color = !paused ? '#2dff82' : '#4d6880'; }
    var last = document.getElementById('cap-last');
    if (last && cur && cur.crashPoint != null) last.textContent = 'last: #' + cur.roundId + ' -> ' + cur.crashPoint + 'x';
  }

  });
console.log('[crash] reference record loaded — see data/ for the captured dataset');
