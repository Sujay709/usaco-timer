(() => {
    "use strict";
  
    const KEY = "usaco-timer-v1";
    const DEFAULTS = { focus: 25, short: 5, long: 15, longEvery: 4, sound: true, autoBreak: true };
    const RING_C = 2 * Math.PI * 108;
    const PHASE_LABEL = { focus: "Focus", short: "Short break", long: "Long break" };
  
    const $ = (s) => document.querySelector(s);
    const pad = (n) => String(n).padStart(2, "0");
  
    /* ---------- state ---------- */
    function newRun() {
      return { mode: "pomodoro", phase: "focus", status: "idle", startedAt: 0, paused: 0, firstStart: 0, tag: "Bronze", note: "" };
    }
  
    function load() {
      try {
        const raw = JSON.parse(localStorage.getItem(KEY));
        if (raw && Array.isArray(raw.sessions)) {
          return {
            sessions: raw.sessions,
            settings: { ...DEFAULTS, ...(raw.settings || {}) },
            run: { ...newRun(), ...(raw.run || {}) },
            cycles: raw.cycles || 0,
          };
        }
      } catch (e) { /* fall through */ }
      return { sessions: [], settings: { ...DEFAULTS }, run: newRun(), cycles: 0 };
    }
  
    let db = load();
  
    function save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch (e) {
        toast("Could not save. Browser storage may be full or blocked.");
      }
    }
  
    /* ---------- helpers ---------- */
    function dayKey(ms) {
      const d = new Date(ms);
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    function startOfDay(ms) {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    function startOfWeek() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
      return d.getTime();
    }
    function fmtDur(sec) {
      const m = Math.round(sec / 60);
      if (m < 60) return m + "m";
      return Math.floor(m / 60) + "h " + pad(m % 60) + "m";
    }
    function fmtTime(ms) {
      return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }
    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }
  
    let toastTimer;
    function toast(msg) {
      const t = $("#toast");
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
    }
  
    /* ---------- timer core ---------- */
    function targetSec() {
      const r = db.run;
      if (r.mode === "free") return 0;
      const s = db.settings;
      const min = r.phase === "focus" ? s.focus : r.phase === "short" ? s.short : s.long;
      return Math.max(1, min) * 60;
    }
  
    function elapsed() {
      const r = db.run;
      return r.paused + (r.status === "running" ? (Date.now() - r.startedAt) / 1000 : 0);
    }
  
    function start() {
      const r = db.run;
      if (r.status === "idle") {
        r.firstStart = Date.now();
        r.paused = 0;
        if ("Notification" in window && Notification.permission === "default") {
          try { Notification.requestPermission(); } catch (e) { /* ignore */ }
        }
      }
      r.startedAt = Date.now();
      r.status = "running";
      save();
      render();
    }
  
    function pause() {
      const r = db.run;
      r.paused = elapsed();
      r.status = "paused";
      save();
      render();
    }
  
    function resetRun(nextPhase) {
      const r = db.run;
      r.status = "idle";
      r.startedAt = 0;
      r.paused = 0;
      r.firstStart = 0;
      r.phase = nextPhase || "focus";
    }
  
    function addSession(startMs, endMs, sec, tag, note) {
      db.sessions.push({ id: uid(), start: startMs, end: endMs, seconds: Math.round(sec), tag: tag, note: note || "" });
    }
  
    function endAndLog() {
      const r = db.run;
      if (r.phase !== "focus") {
        // skipping a break
        resetRun("focus");
        save();
        render();
        return;
      }
      const sec = Math.round(elapsed());
      if (sec < 60) {
        resetRun("focus");
        save();
        render();
        toast("Under a minute, so it was not logged.");
        return;
      }
      addSession(r.firstStart || Date.now() - sec * 1000, Date.now(), sec, r.tag, r.note.trim());
      r.note = "";
      $("#note").value = "";
      resetRun("focus");
      save();
      render();
      toast("Logged " + fmtDur(sec) + ".");
    }
  
    function notify(title, body) {
      chime();
      try {
        if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
          new Notification(title, { body });
        }
      } catch (e) { /* ignore */ }
    }
  
    function chime() {
      if (!db.settings.sound) return;
      try {
        const C = window.AudioContext || window.webkitAudioContext;
        const c = new C();
        [660, 880, 1320].forEach((f, i) => {
          const t = c.currentTime + i * 0.25;
          const o = c.createOscillator();
          const g = c.createGain();
          o.frequency.value = f;
          o.connect(g);
          g.connect(c.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
          o.start(t);
          o.stop(t + 0.25);
        });
      } catch (e) { /* ignore */ }
    }
  
    function complete() {
      const r = db.run;
      const target = targetSec();
      const overshoot = Math.max(0, elapsed() - target);
      const endMs = Date.now() - overshoot * 1000;
  
      if (r.phase === "focus") {
        addSession(r.firstStart || endMs - target * 1000, endMs, target, r.tag, r.note.trim());
        r.note = "";
        $("#note").value = "";
        db.cycles += 1;
        const next = db.cycles % db.settings.longEvery === 0 ? "long" : "short";
        resetRun(next);
        notify("Focus session logged", fmtDur(target) + " added. Time for a break.");
        toast("Logged " + fmtDur(target) + ".");
        if (db.settings.autoBreak) {
          r.firstStart = Date.now();
          r.startedAt = Date.now();
          r.status = "running";
        }
      } else {
        resetRun("focus");
        notify("Break over", "Ready for the next focus session.");
      }
      save();
      render();
    }
  
    function tick() {
      const r = db.run;
      if (r.status === "running" && r.mode === "pomodoro" && elapsed() >= targetSec()) {
        complete();
        return;
      }
      renderTimer();
    }
  
    /* ---------- rendering ---------- */
    function renderDigits(totalSec) {
      const s = Math.max(0, Math.floor(totalSec));
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const str = h > 0 ? h + ":" + pad(m) + ":" + pad(sec) : pad(m) + ":" + pad(sec);
      const box = $("#digits");
      if (box.dataset.val === str) return str;
      box.dataset.val = str;
      box.textContent = "";
      for (const ch of str) {
        box.appendChild(el("span", ch === ":" ? "c" : "d", ch));
      }
      return str;
    }
  
    function renderTimer() {
      const r = db.run;
      const el_ = elapsed();
      const target = targetSec();
      let shown, progress;
  
      if (r.mode === "free") {
        shown = el_;
        progress = (el_ % 3600) / 3600;
      } else {
        shown = Math.max(0, target - el_);
        progress = Math.min(1, el_ / target);
      }
      const str = renderDigits(shown);
      const ring = $("#ring-progress");
      ring.style.strokeDasharray = RING_C;
      ring.style.strokeDashoffset = RING_C * (1 - progress);
  
      document.title = r.status === "idle" ? "USACO log" : str + " | " + (r.mode === "free" ? "Free timer" : PHASE_LABEL[r.phase]);
    }
  
    function renderControls() {
      const r = db.run;
      const main = $("#btn-main");
      const end = $("#btn-end");
      main.textContent = r.status === "running" ? "Pause" : r.status === "paused" ? "Resume" : "Start";
  
      if (r.phase !== "focus" && r.mode === "pomodoro") {
        end.hidden = false;
        end.textContent = "Skip break";
      } else {
        end.hidden = r.status === "idle";
        end.textContent = "End and log";
      }
  
      const idle = r.status === "idle";
      $("#mode-pomodoro").disabled = !idle;
      $("#mode-free").disabled = !idle;
      $("#mode-pomodoro").setAttribute("aria-selected", r.mode === "pomodoro");
      $("#mode-free").setAttribute("aria-selected", r.mode === "free");
  
      document.body.dataset.phase = r.mode === "free" ? "focus" : r.phase;
      $("#phase-label").textContent = r.mode === "free" ? "Free session" : PHASE_LABEL[r.phase];
  
      const dots = $("#dots");
      dots.textContent = "";
      if (r.mode === "pomodoro") {
        const every = db.settings.longEvery;
        const done = db.cycles % every;
        for (let i = 0; i < every; i++) dots.appendChild(el("i", i < done ? "on" : ""));
      }
    }
  
    function renderStats() {
      const list = db.sessions;
      const total = list.reduce((a, s) => a + s.seconds, 0);
      $("#total-hours").textContent = (total / 3600).toFixed(1);
      $("#total-sub").textContent = list.length
        ? fmtDur(total) + " across " + list.length + (list.length === 1 ? " session" : " sessions")
        : "No sessions yet";
  
      const today0 = startOfDay(Date.now());
      const week0 = startOfWeek();
      let today = 0, week = 0;
      const byDay = {};
      for (const s of list) {
        const k = dayKey(s.end);
        byDay[k] = (byDay[k] || 0) + s.seconds;
        if (s.end >= today0) today += s.seconds;
        if (s.end >= week0) week += s.seconds;
      }
      $("#stat-today").textContent = fmtDur(today);
      $("#stat-week").textContent = fmtDur(week);
  
      // streak: consecutive days with a session, ending today (or yesterday if nothing yet today)
      let streak = 0;
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      if (!byDay[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
      while (byDay[dayKey(d.getTime())]) {
        streak++;
        d.setDate(d.getDate() - 1);
      }
      $("#stat-streak").textContent = streak;
  
      // 14-day chart
      const chart = $("#chart");
      chart.textContent = "";
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const x = new Date();
        x.setHours(12, 0, 0, 0);
        x.setDate(x.getDate() - i);
        days.push({ key: dayKey(x.getTime()), date: x, sec: byDay[dayKey(x.getTime())] || 0, today: i === 0 });
      }
      const max = Math.max(1800, ...days.map((x) => x.sec));
      for (const x of days) {
        const bar = el("div", "bar" + (x.sec ? " has" : "") + (x.today ? " today" : ""));
        bar.title = x.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) + ": " + fmtDur(x.sec);
        const fill = el("div", "fill");
        fill.style.height = Math.max(3, (x.sec / max) * 88) + "px";
        bar.appendChild(fill);
        bar.appendChild(el("em", null, x.date.toLocaleDateString([], { weekday: "narrow" })));
        chart.appendChild(bar);
      }
    }
  
    function renderHistory() {
      const box = $("#history-list");
      box.textContent = "";
      const list = [...db.sessions].sort((a, b) => b.end - a.end);
      if (!list.length) {
        box.appendChild(el("div", "empty-state", "Nothing logged yet. Hit Start and get a problem going."));
        return;
      }
      const groups = new Map();
      for (const s of list) {
        const k = dayKey(s.end);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(s);
      }
      for (const [, items] of groups) {
        const wrap = el("div", "day");
        const head = el("div", "day-head");
        head.appendChild(el("span", null, new Date(items[0].end).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })));
        const tot = el("b", null, fmtDur(items.reduce((a, s) => a + s.seconds, 0)));
        head.appendChild(tot);
        wrap.appendChild(head);
  
        for (const s of items) {
          const row = el("div", "row");
          row.appendChild(el("span", "when", fmtTime(s.start) + " to " + fmtTime(s.end)));
          row.appendChild(el("span", "dur", fmtDur(s.seconds)));
          row.appendChild(el("span", "chip " + String(s.tag || "other").toLowerCase(), s.tag || "Other"));
          row.appendChild(el("span", "note" + (s.note ? "" : " empty"), s.note || "No note"));
          const del = el("button", "del", "\u00d7");
          del.type = "button";
          del.setAttribute("aria-label", "Delete this session");
          del.addEventListener("click", () => {
            if (confirm("Delete this " + fmtDur(s.seconds) + " session?")) {
              db.sessions = db.sessions.filter((x) => x.id !== s.id);
              save();
              renderStats();
              renderHistory();
            }
          });
          row.appendChild(del);
          wrap.appendChild(row);
        }
        box.appendChild(wrap);
      }
    }
  
    function render() {
      renderControls();
      renderTimer();
      renderStats();
      renderHistory();
    }
  
    /* ---------- import / export ---------- */
    function download(name, text, type) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type }));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  
    function exportJSON() {
      const payload = { app: "usaco-timer", version: 1, exported: new Date().toISOString(), sessions: db.sessions, settings: db.settings };
      download("usaco-log-" + dayKey(Date.now()) + ".json", JSON.stringify(payload, null, 2), "application/json");
    }
  
    function exportCSV() {
      const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
      const rows = [["date", "start", "end", "minutes", "division", "note"]];
      [...db.sessions].sort((a, b) => a.end - b.end).forEach((s) => {
        rows.push([dayKey(s.end), new Date(s.start).toISOString(), new Date(s.end).toISOString(), (s.seconds / 60).toFixed(1), s.tag, s.note]);
      });
      download("usaco-log-" + dayKey(Date.now()) + ".csv", rows.map((r) => r.map(q).join(",")).join("\n"), "text/csv");
    }
  
    function importJSON(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.sessions)) throw new Error("bad");
          const have = new Set(db.sessions.map((s) => s.id));
          let added = 0;
          for (const s of data.sessions) {
            if (s && typeof s.seconds === "number" && typeof s.end === "number" && typeof s.start === "number") {
              const id = s.id && !have.has(s.id) ? s.id : have.has(s.id) ? null : uid();
              if (id) {
                db.sessions.push({ id, start: s.start, end: s.end, seconds: Math.round(s.seconds), tag: s.tag || "Other", note: String(s.note || "").slice(0, 120) });
                have.add(id);
                added++;
              }
            }
          }
          save();
          render();
          toast("Imported " + added + " new " + (added === 1 ? "session" : "sessions") + ".");
        } catch (e) {
          toast("That file is not a valid backup.");
        }
      };
      reader.readAsText(file);
    }
  
    /* ---------- wiring ---------- */
    function wire() {
      $("#btn-main").addEventListener("click", () => (db.run.status === "running" ? pause() : start()));
      $("#btn-end").addEventListener("click", endAndLog);
  
      $("#mode-pomodoro").addEventListener("click", () => { db.run.mode = "pomodoro"; db.run.phase = "focus"; save(); render(); });
      $("#mode-free").addEventListener("click", () => { db.run.mode = "free"; db.run.phase = "focus"; save(); render(); });
  
      $("#tag").value = db.run.tag;
      $("#note").value = db.run.note;
      $("#tag").addEventListener("change", (e) => { db.run.tag = e.target.value; save(); });
      $("#note").addEventListener("input", (e) => { db.run.note = e.target.value; save(); });
  
      // settings
      const map = [["#set-focus", "focus"], ["#set-short", "short"], ["#set-long", "long"], ["#set-every", "longEvery"]];
      for (const [sel, key] of map) {
        const input = $(sel);
        input.value = db.settings[key];
        input.addEventListener("change", () => {
          const v = Math.max(1, Math.min(180, parseInt(input.value, 10) || DEFAULTS[key]));
          input.value = v;
          db.settings[key] = v;
          save();
          render();
        });
      }
      $("#set-sound").checked = db.settings.sound;
      $("#set-auto").checked = db.settings.autoBreak;
      $("#set-sound").addEventListener("change", (e) => { db.settings.sound = e.target.checked; save(); });
      $("#set-auto").addEventListener("change", (e) => { db.settings.autoBreak = e.target.checked; save(); });
  
      // manual add
      $("#m-date").value = dayKey(Date.now());
      $("#manual-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const [y, m, d] = $("#m-date").value.split("-").map(Number);
        const mins = parseInt($("#m-min").value, 10);
        if (!y || !mins || mins < 1) return;
        const end = new Date(y, m - 1, d, 20, 0, 0).getTime();
        addSession(end - mins * 60000, end, mins * 60, $("#m-tag").value, $("#m-note").value.trim());
        save();
        render();
        $("#m-min").value = "";
        $("#m-note").value = "";
        toast("Added " + mins + " min.");
      });
  
      // tools
      $("#btn-export").addEventListener("click", exportJSON);
      $("#btn-csv").addEventListener("click", exportCSV);
      $("#btn-import").addEventListener("click", () => $("#file-import").click());
      $("#file-import").addEventListener("change", (e) => {
        if (e.target.files[0]) importJSON(e.target.files[0]);
        e.target.value = "";
      });
      $("#btn-clear").addEventListener("click", () => {
        if (!db.sessions.length) return;
        if (confirm("Delete all " + db.sessions.length + " sessions? Export a backup first if you want to keep them.")) {
          db.sessions = [];
          db.cycles = 0;
          save();
          render();
        }
      });
  
      // space bar toggles the timer
      document.addEventListener("keydown", (e) => {
        if (e.code !== "Space") return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.tagName === "SUMMARY")) return;
        e.preventDefault();
        db.run.status === "running" ? pause() : start();
      });
  
      document.addEventListener("visibilitychange", tick);
      // keep tabs in sync if the app is open twice
      window.addEventListener("storage", (e) => {
        if (e.key === KEY) { db = load(); render(); }
      });
    }
  
    wire();
    render();
    tick();
    setInterval(tick, 250);
  })();