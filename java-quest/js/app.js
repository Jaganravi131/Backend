/* ============================================================
   JAVA QUEST — Application engine
   Routing · rendering · quiz + challenge evaluation · XP, levels,
   badges, streaks · glossary tooltips · demo mounting.
   ============================================================ */
"use strict";

/* ------------------------------------------------------------
   STATE — persisted in localStorage
   ------------------------------------------------------------ */
const STORE_KEY = "javaQuestState.v1";
const DEFAULT_STATE = {
  xp: 0,
  completed: {},            // lessonId -> true
  challengesDone: {},       // challengeId -> true
  answeredCorrect: {},      // questionId -> true (first-correct XP only once)
  correctCount: 0,
  badges: [],               // badge ids
  streak: 0,
  lastVisit: null,          // YYYY-MM-DD
  demosTried: [],
  examBest: null,           // percentage
  learnerName: "",
  lessonScroll: {},
};

let STATE = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (e) { /* corrupted storage — start fresh */ }
  return { ...DEFAULT_STATE };
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); } catch (e) {}
}

/* ------------------------------------------------------------
   LEVELS & XP
   ------------------------------------------------------------ */
const LEVELS = [
  { xp: 0, name: "Newcomer" },
  { xp: 150, name: "Code Cadet" },
  { xp: 350, name: "Loop Runner" },
  { xp: 650, name: "Object Wrangler" },
  { xp: 1050, name: "Inheritance Heir" },
  { xp: 1550, name: "Polymorph Pro" },
  { xp: 2150, name: "Exception Tamer" },
  { xp: 2850, name: "Collection Curator" },
  { xp: 3650, name: "Thread Warrior" },
  { xp: 4550, name: "Stream Surfer" },
  { xp: 5600, name: "JVM Sage" },
  { xp: 7000, name: "Java Architect" },
];

function levelInfo(xp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].xp) idx = i;
  const next = LEVELS[idx + 1];
  return {
    level: idx + 1,
    name: LEVELS[idx].name,
    next: next ? next.xp : null,
    nextName: next ? next.name : null,
  };
}

function awardXP(amount, reason) {
  const before = levelInfo(STATE.xp);
  STATE.xp += amount;
  const after = levelInfo(STATE.xp);
  saveState();
  refreshHUD();
  if (after.level > before.level) {
    confetti();
    toast("🏆", "LEVEL UP!", `You are now: ${after.name} (+${amount} XP)`, "gold");
  } else if (reason) {
    toast("⚡", `+${amount} XP`, reason, "green");
  }
}

/* ------------------------------------------------------------
   STREAK
   ------------------------------------------------------------ */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayDiff(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function touchStreak() {
  const today = todayStr();
  if (STATE.lastVisit === today) return;
  if (STATE.lastVisit && dayDiff(STATE.lastVisit, today) === 1) {
    STATE.streak = (STATE.streak || 0) + 1;
    if (STATE.streak >= 2) toast("🔥", `${STATE.streak}-day streak!`, "Come back tomorrow to keep it alive.", "gold");
  } else {
    STATE.streak = 1;
  }
  STATE.lastVisit = today;
  saveState();
  const pill = document.querySelector(".streak-pill");
  if (pill) { pill.classList.add("bump"); setTimeout(() => pill.classList.remove("bump"), 500); }
}

/* ------------------------------------------------------------
   BADGES
   ------------------------------------------------------------ */
function worldComplete(world) {
  return world.lessons.every((l) => STATE.completed[l.id]);
}
const EXTRA_BADGES = [
  { id: "b_first", emoji: "🌱", name: "First Steps", desc: "Complete your first lesson.", cond: () => Object.keys(STATE.completed).length >= 1 },
  { id: "b_quiz10", emoji: "🧠", name: "Sharp Mind", desc: "Answer 10 checkpoint questions correctly.", cond: () => STATE.correctCount >= 10 },
  { id: "b_quiz30", emoji: "🔮", name: "Quiz Wizard", desc: "Answer 30 checkpoint questions correctly.", cond: () => STATE.correctCount >= 30 },
  { id: "b_chal1", emoji: "🔨", name: "First Forge", desc: "Solve your first coding challenge.", cond: () => Object.keys(STATE.challengesDone).length >= 1 },
  { id: "b_chal5", emoji: "⚒️", name: "Code Smith", desc: "Solve 5 coding challenges.", cond: () => Object.keys(STATE.challengesDone).length >= 5 },
  { id: "b_demo3", emoji: "🔬", name: "Lab Rat", desc: "Try 3 interactive visual demos.", cond: () => STATE.demosTried.length >= 3 },
  { id: "b_streak3", emoji: "🔥", name: "On Fire", desc: "Reach a 3-day streak.", cond: () => (STATE.streak || 0) >= 3 },
  { id: "b_half", emoji: "🌗", name: "Halfway Hero", desc: "Complete 50% of all lessons.", cond: () => totalLessonPct() >= 50 },
  { id: "b_exam", emoji: "🎓", name: "Gauntlet Champion", desc: "Score 70%+ on the Final Gauntlet.", cond: () => (STATE.examBest || 0) >= 70 },
  { id: "b_all", emoji: "👑", name: "Java Architect", desc: "Complete every lesson in the course.", cond: () => totalLessonPct() >= 100 },
];
function allBadges() {
  const worldBadges = WORLDS.map((w) => ({
    id: w.badge.id, emoji: w.badge.emoji, name: w.badge.name, desc: w.badge.desc,
    cond: () => worldComplete(w),
  }));
  return [...worldBadges, ...EXTRA_BADGES];
}
function checkBadges() {
  let got = false;
  for (const b of allBadges()) {
    if (!STATE.badges.includes(b.id) && b.cond()) {
      STATE.badges.push(b.id);
      saveState();
      confetti(24);
      toast(b.emoji, "BADGE UNLOCKED!", b.name, "gold");
      got = true;
    }
  }
  return got;
}

/* ------------------------------------------------------------
   PROGRESS
   ------------------------------------------------------------ */
function allLessons() {
  return WORLDS.flatMap((w) => w.lessons);
}
function totalLessonPct() {
  const all = allLessons();
  const done = all.filter((l) => STATE.completed[l.id]).length;
  return all.length ? Math.round((done / all.length) * 100) : 0;
}
function worldPct(world) {
  const done = world.lessons.filter((l) => STATE.completed[l.id]).length;
  return Math.round((done / world.lessons.length) * 100);
}

/* ------------------------------------------------------------
   HUD / sidebar
   ------------------------------------------------------------ */
function refreshHUD() {
  const li = levelInfo(STATE.xp);
  const set = (id, v) => { const n = document.getElementById(id); if (n) n.textContent = v; };
  set("xp-count", STATE.xp);
  set("level-name", li.name);
  set("streak-count", STATE.streak || 0);
  const pct = totalLessonPct();
  set("ring-label", pct + "%");
  const ring = document.getElementById("ring-fg");
  if (ring) ring.style.strokeDashoffset = String(113 - (113 * pct) / 100);
}

function renderSidebar() {
  const nav = document.getElementById("world-nav");
  nav.innerHTML = WORLDS.map((w) => {
    const pct = worldPct(w);
    return `<a href="#" class="world-link" data-world="${w.id}">
      <div class="world-emoji">${w.emoji}</div>
      <div class="world-meta">
        <strong>${w.num}. ${w.title.split(":")[0]}</strong>
        <small>${w.lessons.length} lessons · ${pct}%</small>
        <div class="world-mini-bar"><i style="width:${pct}%"></i></div>
      </div>
    </a>`;
  }).join("");
}

/* ------------------------------------------------------------
   CODE HIGHLIGHTER (lightweight Java)
   ------------------------------------------------------------ */
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const JAVA_KEYWORDS = "public|private|protected|class|interface|abstract|extends|implements|static|final|void|int|long|double|float|boolean|char|byte|short|new|return|if|else|for|while|do|switch|case|default|break|continue|try|catch|finally|throw|throws|import|package|this|super|null|true|false|instanceof|synchronized|volatile|transient|enum|record|sealed|permits|var|yield|assert|strictfp|native|goto|const";
function hlJava(code) {
  let out = escHtml(code);
  out = out.replace(
    new RegExp("(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|(\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*')|(\\b\\d+\\.?\\d*[fLdD]?\\b)|\\b(" + JAVA_KEYWORDS + ")\\b|\\b([A-Z][A-Za-z0-9_]*)\\b", "g"),
    (m, cm, st, nu, kw, ty) => {
      if (cm) return `<span class="cm">${cm}</span>`;
      if (st) return `<span class="st">${st}</span>`;
      if (nu) return `<span class="nu">${nu}</span>`;
      if (kw) return `<span class="kw">${kw}</span>`;
      if (ty) return `<span class="ty">${ty}</span>`;
      return m;
    }
  );
  return out;
}

/* ------------------------------------------------------------
   TOASTS & CONFETTI
   ------------------------------------------------------------ */
function ensureToastWrap() {
  let w = document.querySelector(".toast-wrap");
  if (!w) {
    w = document.createElement("div");
    w.className = "toast-wrap";
    document.body.appendChild(w);
  }
  return w;
}
function toast(icon, title, sub, kind) {
  const w = ensureToastWrap();
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.innerHTML = `<span class="t-ico">${icon}</span><div><strong>${title}</strong><small>${sub || ""}</small></div>`;
  w.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .5s"; setTimeout(() => t.remove(), 500); }, 3600);
}
function confetti(count = 40) {
  const layer = document.getElementById("confetti-layer");
  if (!layer) return;
  const colors = ["#5b7cfa", "#8b5cf6", "#22d3ee", "#fbbf24", "#34d399", "#fb7185", "#f6c453"];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement("div");
    bit.className = "confetti-bit";
    bit.style.left = Math.random() * 100 + "vw";
    bit.style.background = colors[Math.floor(Math.random() * colors.length)];
    bit.style.animationDuration = 2.2 + Math.random() * 2.2 + "s";
    bit.style.animationDelay = Math.random() * 0.7 + "s";
    bit.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(bit);
    setTimeout(() => bit.remove(), 5200);
  }
}

/* ------------------------------------------------------------
   GLOSSARY TOOLTIPS
   ------------------------------------------------------------ */
function applyGlossary(root) {
  root.querySelectorAll(".term[data-term]").forEach((el) => {
    if (el.querySelector(".tip")) return;
    const entry = GLOSSARY[el.dataset.term];
    if (entry) {
      const tip = document.createElement("span");
      tip.className = "tip";
      tip.innerHTML = `<b>${entry[0]}</b>${entry[1]}`;
      el.appendChild(tip);
    }
  });
}

/* ------------------------------------------------------------
   QUIZ ENGINE
   ------------------------------------------------------------ */
let qCounter = 0;
function renderQuiz(questions, title, idPrefix) {
  const wrap = document.createElement("div");
  wrap.className = "quiz";
  wrap.innerHTML = `<div class="quiz-head">
      <span class="quiz-badge">⚡ ${title || "Checkpoint"}</span>
      <span class="q-count">${questions.length} question${questions.length > 1 ? "s" : ""} · instant feedback · retry anytime</span>
    </div>`;
  questions.forEach((q, i) => {
    wrap.appendChild(renderQuestion(q, `${idPrefix}-q${i}`, i));
  });
  return wrap;
}

function renderQuestion(q, qid, num) {
  const div = document.createElement("div");
  div.className = "question";
  const numBadge = `<span class="q-num">${num + 1}</span>`;
  const qText = `<div class="q-text">${numBadge}<span>${q.q}</span></div>`;

  if (q.type === "mcq" || q.type === "output" || q.type === "codefix") {
    let codeHtml = "";
    if (q.code) codeHtml = `<div class="code-block"><div class="code-head"><div class="code-dots"><i></i><i></i><i></i></div><span class="code-title">${q.type === "output" ? "predict the output" : "examine the code"}</span></div><pre><code>${hlJava(q.code)}</code></pre></div>`;
    div.innerHTML = qText + codeHtml +
      `<div class="options">${q.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="key">${"ABCDEF"[i]}</span><span>${o}</span></button>`).join("")}</div>
       <div class="feedback"></div>`;
    div.querySelectorAll(".opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (div.dataset.done === "1") return;
        div.dataset.attempted = "1";
        const i = Number(btn.dataset.i);
        const fb = div.querySelector(".feedback");
        div.querySelectorAll(".opt").forEach((b) => b.classList.add("locked"));
        if (i === q.answer) {
          btn.classList.add("correct");
          fb.className = "feedback show ok";
          fb.innerHTML = `✅ <b>Correct!</b> ${q.explain}`;
          div.dataset.done = "1";
          markCorrect(qid);
        } else {
          btn.classList.add("wrong");
          fb.className = "feedback show no";
          fb.innerHTML = `❌ <b>Not quite.</b> ${q.explain} <br><br><button class="btn btn-small btn-ghost retry">↺ Try again</button>`;
          fb.querySelector(".retry").addEventListener("click", () => {
            div.dataset.done = "";
            fb.className = "feedback";
            div.querySelectorAll(".opt").forEach((b) => { b.className = "opt"; });
          });
        }
      });
    });
    return div;
  }

  if (q.type === "multi") {
    div.innerHTML = qText +
      `<div class="options">${q.options.map((o, i) => `<button class="opt multi" data-i="${i}"><span class="key">${"ABCDEF"[i]}</span><span>${o}</span></button>`).join("")}</div>
       <div class="btn-row" style="margin-top:10px"><button class="btn btn-small btn-primary check-btn">Check answers</button></div>
       <div class="feedback"></div>`;
    div.querySelectorAll(".opt.multi").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (div.dataset.done === "1") return;
        btn.classList.toggle("picked");
        btn.style.borderColor = btn.classList.contains("picked") ? "var(--accent)" : "";
      });
    });
    div.querySelector(".check-btn").addEventListener("click", () => {
      if (div.dataset.done === "1") return;
      div.dataset.attempted = "1";
      const picked = [...div.querySelectorAll(".opt.multi")].map((b) => b.classList.contains("picked"));
      const correct = q.options.map((_, i) => q.answers.includes(i));
      const ok = picked.every((p, i) => p === correct[i]);
      const fb = div.querySelector(".feedback");
      div.querySelectorAll(".opt.multi").forEach((b, i) => {
        if (correct[i]) b.classList.add("correct");
        else if (picked[i]) b.classList.add("wrong");
        b.classList.add("locked");
      });
      if (ok) {
        fb.className = "feedback show ok";
        fb.innerHTML = `✅ <b>All correct!</b> ${q.explain}`;
        div.dataset.done = "1";
        markCorrect(qid);
      } else {
        fb.className = "feedback show no";
        fb.innerHTML = `❌ <b>Selection wasn't complete.</b> ${q.explain} <br><br><button class="btn btn-small btn-ghost retry">↺ Try again</button>`;
        fb.querySelector(".retry").addEventListener("click", () => {
          div.dataset.done = "";
          fb.className = "feedback";
          div.querySelectorAll(".opt.multi").forEach((b) => { b.className = "opt multi"; b.style.borderColor = ""; });
        });
      }
    });
    return div;
  }

  if (q.type === "tf") {
    div.innerHTML = qText +
      `<div class="options">
        <button class="opt" data-v="true"><span class="key">T</span><span>True</span></button>
        <button class="opt" data-v="false"><span class="key">F</span><span>False</span></button>
      </div><div class="feedback"></div>`;
    div.querySelectorAll(".opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (div.dataset.done === "1") return;
        div.dataset.attempted = "1";
        const val = btn.dataset.v === "true";
        const fb = div.querySelector(".feedback");
        div.querySelectorAll(".opt").forEach((b) => b.classList.add("locked"));
        if (val === q.answer) {
          btn.classList.add("correct");
          fb.className = "feedback show ok";
          fb.innerHTML = `✅ <b>Correct!</b> ${q.explain}`;
          div.dataset.done = "1";
          markCorrect(qid);
        } else {
          btn.classList.add("wrong");
          fb.className = "feedback show no";
          fb.innerHTML = `❌ <b>Nope.</b> ${q.explain} <br><br><button class="btn btn-small btn-ghost retry">↺ Try again</button>`;
          fb.querySelector(".retry").addEventListener("click", () => {
            div.dataset.done = "";
            fb.className = "feedback";
            div.querySelectorAll(".opt").forEach((b) => (b.className = "opt"));
          });
        }
      });
    });
    return div;
  }

  if (q.type === "fill") {
    div.innerHTML = qText +
      `<div class="fill-row">
        <input class="fill-input" placeholder="${q.placeholder || "type your answer…"}" />
        <button class="btn btn-small btn-primary check-btn">Check</button>
      </div><div class="feedback"></div>`;
    const input = div.querySelector(".fill-input");
    const check = () => {
      if (div.dataset.done === "1") return;
      div.dataset.attempted = "1";
      const val = input.value.trim().toLowerCase().replace(/\s+/g, " ");
      const fb = div.querySelector(".feedback");
      const ok = q.answers.some((a) => a.toLowerCase() === val);
      if (ok) {
        input.classList.add("correct");
        fb.className = "feedback show ok";
        fb.innerHTML = `✅ <b>Correct!</b> ${q.explain}`;
        div.dataset.done = "1";
        markCorrect(qid);
      } else {
        input.classList.add("wrong");
        fb.className = "feedback show no";
        fb.innerHTML = `❌ <b>Not it.</b> ${q.explain} <br><br><button class="btn btn-small btn-ghost retry">↺ Try again</button>`;
        fb.querySelector(".retry").addEventListener("click", () => {
          div.dataset.done = "";
          fb.className = "feedback";
          input.classList.remove("wrong");
          input.focus();
        });
      }
    };
    div.querySelector(".check-btn").addEventListener("click", check);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check(); });
    return div;
  }

  if (q.type === "order") {
    // items shown shuffled; user clicks in the correct order
    const shuffled = q.items.map((it, i) => ({ it, i }));
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    div.innerHTML = qText +
      `<div class="order-list">${shuffled.map((s) => `<div class="order-item" data-orig="${s.i}"><span class="seq">•</span><span>${s.it}</span></div>`).join("")}</div>
       <div class="feedback"></div>`;
    let next = 0;
    const items = [...div.querySelectorAll(".order-item")];
    items.forEach((item) => {
      item.addEventListener("click", () => {
        if (div.dataset.done === "1" || item.classList.contains("done")) return;
        div.dataset.attempted = "1";
        const orig = Number(item.dataset.orig);
        const fb = div.querySelector(".feedback");
        if (orig === next) {
          item.classList.add("done", "picked-correct");
          item.querySelector(".seq").textContent = String(next + 1);
          next++;
          if (next === q.items.length) {
            fb.className = "feedback show ok";
            fb.innerHTML = `✅ <b>Perfect order!</b> ${q.explain}`;
            div.dataset.done = "1";
            markCorrect(qid);
          }
        } else {
          item.classList.add("picked-wrong");
          setTimeout(() => item.classList.remove("picked-wrong"), 450);
          fb.className = "feedback show no";
          fb.innerHTML = `❌ <b>That's not the next step.</b> Think about the flow, then start again.<br><br><button class="btn btn-small btn-ghost retry">↺ Reset order</button>`;
          fb.querySelector(".retry").addEventListener("click", () => {
            next = 0;
            div.dataset.done = "";
            fb.className = "feedback";
            items.forEach((it) => {
              it.classList.remove("done", "picked-correct");
              it.querySelector(".seq").textContent = "•";
            });
          });
        }
      });
    });
    return div;
  }

  if (q.type === "code") {
    div.innerHTML = qText +
      `<textarea class="challenge-editor">${q.starter || ""}</textarea>
       <div class="btn-row" style="margin-top:10px">
         <button class="btn btn-small btn-primary check-btn">▶ Evaluate my code</button>
         <button class="btn btn-small btn-ghost hint-btn">💡 Hint</button>
       </div>
       <div class="hint-box"></div>
       <div class="check-list"></div>
       <div class="feedback"></div>`;
    wireChallengeUI(div, q, qid);
    return div;
  }

  div.innerHTML = qText + `<div class="tiny">Unknown question type</div>`;
  return div;
}

function markCorrect(qid) {
  if (!STATE.answeredCorrect[qid]) {
    STATE.answeredCorrect[qid] = true;
    STATE.correctCount = (STATE.correctCount || 0) + 1;
    awardXP(5, "Correct answer");
  }
  checkBadges();
}

/* ------------------------------------------------------------
   CODE CHALLENGE EVALUATION
   ------------------------------------------------------------ */
function wireChallengeUI(div, spec, chalId) {
  const editor = div.querySelector(".challenge-editor") || div.querySelector("textarea");
  const checkBtn = div.querySelector(".check-btn");
  const hintBtn = div.querySelector(".hint-btn");
  const hintBox = div.querySelector(".hint-box");
  const listBox = div.querySelector(".check-list");
  const fb = div.querySelector(".feedback");
  let hintIdx = 0;

  if (hintBtn && hintBox) {
    hintBtn.addEventListener("click", () => {
      const hints = spec.hints || [];
      if (!hints.length) { hintBox.innerHTML = "No hints for this one — you got this!"; hintBox.classList.add("show"); return; }
      hintBox.classList.add("show");
      hintBox.innerHTML = `💡 <b>Hint ${Math.min(hintIdx + 1, hints.length)}:</b> ${hints[hintIdx]}`;
      hintIdx = Math.min(hintIdx + 1, hints.length - 1);
    });
  }

  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      const code = editor.value;
      const results = (spec.checks || []).map((c) => {
        let pass = false;
        try { pass = new RegExp(c.re, c.flags || "i").test(code); } catch (e) { pass = code.includes(c.re); }
        return { msg: c.msg, pass };
      });
      const allPass = results.every((r) => r.pass);
      listBox.innerHTML = results.map((r) =>
        `<div class="check-item ${r.pass ? "pass" : "fail"}"><span class="ci">${r.pass ? "✓" : "✗"}</span><span>${r.msg}</span></div>`
      ).join("");
      if (allPass) {
        fb.className = "feedback show ok";
        fb.innerHTML = `🎉 <b>Challenge complete!</b> All checks passed.` +
          (spec.solution ? `<details style="margin-top:8px"><summary style="cursor:pointer"><b>See a reference solution</b></summary><pre style="margin-top:8px;font-family:var(--mono);font-size:.82rem;white-space:pre-wrap">${escHtml(spec.solution)}</pre></details>` : "");
        if (!STATE.challengesDone[chalId]) {
          STATE.challengesDone[chalId] = true;
          awardXP(25, "Coding challenge solved");
          confetti(22);
          checkBadges();
        }
      } else {
        fb.className = "feedback show no";
        fb.innerHTML = `🔨 <b>Not yet!</b> The checks in red still fail. Fix them and evaluate again.` +
          (spec.solution ? ` <button class="btn btn-small btn-ghost reveal-btn">Reveal solution</button><div class="sol-box" style="display:none;margin-top:8px"><pre style="font-family:var(--mono);font-size:.82rem;white-space:pre-wrap;background:var(--code-bg);padding:12px;border-radius:8px">${escHtml(spec.solution)}</pre></div>` : "");
        const rev = fb.querySelector(".reveal-btn");
        if (rev) rev.addEventListener("click", () => {
          const box = fb.querySelector(".sol-box");
          box.style.display = "block";
          rev.style.display = "none";
        });
      }
    });
  }
}

/* ------------------------------------------------------------
   SECTION RENDERERS
   ------------------------------------------------------------ */
function renderSection(s, ctx) {
  const wrap = document.createElement("div");
  wrap.className = "section";
  switch (s.t) {
    case "h":
      wrap.innerHTML = `<h2><span class="h-ico">${s.icon || "📘"}</span>${s.html}</h2>`;
      break;
    case "h3":
      wrap.innerHTML = `<h3>${s.html}</h3>`;
      break;
    case "p":
      wrap.innerHTML = `<p>${s.html}</p>`;
      break;
    case "ul":
      wrap.innerHTML = `<ul>${s.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
      break;
    case "ol":
      wrap.innerHTML = `<ol>${s.items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
      break;
    case "code": {
      wrap.innerHTML =
        `<div class="code-block">
          <div class="code-head">
            <div class="code-dots"><i></i><i></i><i></i></div>
            <span class="code-title">${s.title || "java"}</span>
            <button class="code-copy">⧉ copy</button>
            ${s.output ? `<button class="code-copy show-out">👁 show output</button>` : ""}
          </div>
          <pre><code>${hlJava(s.code)}</code></pre>
        </div>
        ${s.output ? `<div class="output-box">▶ output:<br>${escHtml(s.output).replace(/\n/g, "<br>")}</div>` : ""}`;
      const copyBtn = wrap.querySelector(".code-copy");
      copyBtn.addEventListener("click", () => {
        navigator.clipboard?.writeText(s.code).then(() => {
          copyBtn.textContent = "✓ copied!";
          setTimeout(() => (copyBtn.textContent = "⧉ copy"), 1400);
        });
      });
      const outBtn = wrap.querySelector(".show-out");
      if (outBtn) outBtn.addEventListener("click", () => {
        const box = wrap.querySelector(".output-box");
        box.classList.toggle("show");
        outBtn.textContent = box.classList.contains("show") ? "🙈 hide output" : "👁 show output";
      });
      break;
    }
    case "callout": {
      const icons = { jargon: "📖", analogy: "💡", pitfall: "⚠️", pro: "🌟", depth: "🔬", story: "📜" };
      wrap.innerHTML = `<div class="callout callout-${s.kind}">
        <div class="co-title">${icons[s.kind] || "📌"} ${s.title}</div>
        <div>${s.html}</div>
      </div>`;
      break;
    }
    case "demo":
      wrap.innerHTML = `<div class="demo">
        <div class="demo-head"><span class="live"><i></i>LIVE DEMO</span><h4>${s.title}</h4></div>
        <div data-demo="${s.name}"></div>
      </div>`;
      break;
    case "table":
      wrap.innerHTML = `<table class="dtable"><thead><tr>${s.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${s.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      break;
    case "diagram":
      wrap.innerHTML = `<div class="diagram">${s.html}</div>`;
      break;
    case "reflection":
      wrap.innerHTML = `<div class="reflection"><h4>🪞 Reflection pause</h4>${s.html}</div>`;
      break;
    case "quiz":
      wrap.appendChild(renderQuiz(s.questions, s.title, ctx.idPrefix + "-" + ctx.secIdx));
      break;
    case "challenge": {
      const spec = { ...s };
      delete spec.t;
      spec.q = spec.q || spec.title;
      wrap.innerHTML = `<div class="quiz">
        <div class="quiz-head"><span class="quiz-badge">🔨 ${s.title || "Implement it"}</span>
        <span class="q-count">write real code · evaluated live · +25 XP</span></div>
        <div class="question">
          <div class="q-text"><span class="q-num">⚒</span><span>${s.q || ""}</span></div>
          <textarea class="challenge-editor">${s.starter || ""}</textarea>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn btn-small btn-primary check-btn">▶ Evaluate my code</button>
            <button class="btn btn-small btn-ghost hint-btn">💡 Hint</button>
          </div>
          <div class="hint-box"></div>
          <div class="check-list"></div>
          <div class="feedback"></div>
        </div>
      </div>`;
      const qdiv = wrap.querySelector(".question");
      wireChallengeUI(qdiv, spec, ctx.idPrefix + "-chal-" + ctx.secIdx);
      break;
    }
    default:
      wrap.innerHTML = "";
  }
  return wrap;
}

/* ------------------------------------------------------------
   VIEWS
   ------------------------------------------------------------ */
let currentView = "home";

function navigate(view, params = {}) {
  currentView = view;
  const root = document.getElementById("view-root");
  document.querySelectorAll(".side-link").forEach((l) => l.classList.toggle("active", l.dataset.view === view));
  if (view !== "lesson") {
    document.querySelectorAll(".world-link").forEach((l) => l.classList.remove("active"));
  }
  if (view === "home") renderHome(root);
  else if (view === "lesson") renderLesson(root, params.worldId, params.lessonId);
  else if (view === "arena") renderArena(root);
  else if (view === "glossary") renderGlossaryView(root);
  else if (view === "achievements") renderAchievements(root);
  else if (view === "exam") renderExam(root);
  window.scrollTo({ top: 0 });
  applyGlossary(root);
  mountAllDemos(root);
  refreshHUD();
  renderSidebar();
}

function mountAllDemos(root) {
  root.querySelectorAll("[data-demo]").forEach((node) => {
    if (!node.dataset.mounted) {
      node.dataset.mounted = "1";
      const name = node.dataset.demo;
      mountDemo(name, node);
      if (!STATE.demosTried.includes(name)) {
        STATE.demosTried.push(name);
        saveState();
        setTimeout(checkBadges, 300);
      }
    }
  });
}

/* ---------- HOME ---------- */
function renderHome(root) {
  const li = levelInfo(STATE.xp);
  const pct = totalLessonPct();
  const next = findNextLesson();
  root.innerHTML = `
    <div class="hero">
      <div class="hero-tag">☕ Gamified Java Mastery · GeeksforGeeks syllabus + beyond</div>
      <h1>Learn Java from your first line<br>to the JVM's deepest internals.</h1>
      <p class="lead">A story-driven course with visual simulators, live race conditions, interactive OOP palaces,
      code challenges you actually implement, and checkpoints that never break the flow. Every technical term is
      explained like you've never heard it — because everyone starts somewhere.</p>
      <div class="hero-features">
        <span class="chip">🧱 <b>45+ lessons</b> — basics → advanced</span>
        <span class="chip">⚡ <b>Race condition lab</b> — see bugs happen</span>
        <span class="chip">🏛️ <b>OOP deep-dive</b> — all 4 pillars visual</span>
        <span class="chip">🔨 <b>Implement challenges</b> — code, evaluate, level up</span>
        <span class="chip">🧠 <b>JVM internals</b> — memory, GC, reflection</span>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="continue-btn">${STATE.completed && Object.keys(STATE.completed).length ? "▶ Continue your journey" : "🚀 Start the quest"}</button>
        <button class="btn btn-ghost" data-view="arena">⚔️ Practice Arena</button>
        <button class="btn btn-ghost" data-view="exam">🎓 Final Gauntlet</button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="num">${STATE.xp}</div><div class="lbl">⚡ Total XP</div></div>
      <div class="stat-card"><div class="num">${li.name}</div><div class="lbl">🏆 Current rank</div></div>
      <div class="stat-card"><div class="num">${pct}%</div><div class="lbl">📚 Course complete</div></div>
      <div class="stat-card"><div class="num">${STATE.badges.length}</div><div class="lbl">🥇 Badges earned</div></div>
      <div class="stat-card"><div class="num">${Object.keys(STATE.challengesDone).length}</div><div class="lbl">🔨 Challenges solved</div></div>
      <div class="stat-card"><div class="num">🔥 ${STATE.streak || 0}</div><div class="lbl">Day streak</div></div>
    </div>

    <h2 class="path-title">🗺️ The Learning Path</h2>
    <p class="path-sub">Follow the flow in order for the smoothest ride — or jump anywhere. Nothing is locked; curiosity is never punished.</p>
    <div class="path">
      ${WORLDS.map((w) => {
        const p = worldPct(w);
        return `<div class="path-item ${p === 100 ? "done" : ""}">
          <div class="path-dot">${p === 100 ? "✓" : w.num}</div>
          <div class="path-card">
            <div class="path-icon">${w.emoji}</div>
            <div class="path-info">
              <h3>World ${w.num}: ${w.title}</h3>
              <p>${w.subtitle}</p>
              <div class="lesson-count">${w.lessons.length} lessons · ${w.lessons.reduce((a, l) => a + l.minutes, 0)} min · ${w.badge.emoji} badge: ${w.badge.name}</div>
            </div>
            <div class="path-progress">
              <div class="bar"><i style="width:${p}%"></i></div>
              <span class="tiny">${p}% complete</span>
            </div>
            <button class="btn btn-small ${p > 0 && p < 100 ? "btn-primary" : "btn-ghost"} open-world" data-world="${w.id}">${p === 100 ? "✓ Review" : p > 0 ? "▶ Continue" : "Enter world"}</button>
          </div>
        </div>`;
      }).join("")}
    </div>

    <h2 class="path-title" style="margin-top:40px">⚙️ How Java Quest works</h2>
    <div class="how-grid">
      <div class="how-card"><div class="n">1</div><h4>📖 Learn in a flow</h4><p>Story-driven lessons where every jargon word is explained inline. No context-switching to Wikipedia.</p></div>
      <div class="how-card"><div class="n">2</div><h4>🔬 Watch it happen</h4><p>Interactive simulators: race conditions, memory, GC, dispatch, HashMap buckets — run them yourself.</p></div>
      <div class="how-card"><div class="n">3</div><h4>⚡ Prove it</h4><p>Checkpoints in 8 styles: MCQ, true/false, fill-in, predict-output, ordering, code-fix, and real code challenges.</p></div>
      <div class="how-card"><div class="n">4</div><h4>🏆 Level up</h4><p>XP, ranks, streaks, badges — and a Final Gauntlet with your certificate at the summit.</p></div>
    </div>`;

  root.querySelector("#continue-btn").addEventListener("click", () => {
    if (next) navigate("lesson", { worldId: next.world.id, lessonId: next.lesson.id });
    else navigate("exam");
  });
  root.querySelectorAll(".open-world").forEach((b) =>
    b.addEventListener("click", () => {
      const w = WORLDS.find((x) => x.id === b.dataset.world);
      const lesson = w.lessons.find((l) => !STATE.completed[l.id]) || w.lessons[0];
      navigate("lesson", { worldId: w.id, lessonId: lesson.id });
    })
  );
  root.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(b.dataset.view);
    })
  );
}

function findNextLesson() {
  for (const w of WORLDS) {
    for (const l of w.lessons) {
      if (!STATE.completed[l.id]) return { world: w, lesson: l };
    }
  }
  return null;
}

/* ---------- LESSON ---------- */
function renderLesson(root, worldId, lessonId) {
  const world = WORLDS.find((w) => w.id === worldId);
  const idx = world.lessons.findIndex((l) => l.id === lessonId);
  const lesson = world.lessons[idx];
  const prev = idx > 0 ? world.lessons[idx - 1] : null;
  const nextL = idx < world.lessons.length - 1 ? world.lessons[idx + 1] : null;
  const nextWorld = WORLDS[WORLDS.indexOf(world) + 1];

  root.innerHTML = `
    <div class="lesson-wrap">
      <div class="lesson-top">
        <div class="crumb"><a href="#" class="home-crumb">Learning Path</a> &nbsp;›&nbsp; World ${world.num}: ${world.title} &nbsp;›&nbsp; Lesson ${idx + 1}/${world.lessons.length}</div>
      </div>
      <div class="lesson-hero">
        <div class="hero-tag">${world.emoji} ${world.title}</div>
        <h1>${lesson.title}</h1>
        <div class="narrative">“${lesson.narrative}”</div>
        <div class="lesson-meta">
          <span class="meta-pill">⏱ ${lesson.minutes} min</span>
          <span class="meta-pill">⚡ +${lesson.xp} XP for completion</span>
          <span class="meta-pill">🎯 checkpoints inside</span>
          ${STATE.completed[lesson.id] ? '<span class="meta-pill" style="color:var(--emerald)">✓ completed</span>' : ""}
        </div>
      </div>
      <div class="lesson-progress-bar">
        <span class="tiny">Lesson progress</span>
        <div class="bar"><i class="lesson-fill" style="width:5%"></i></div>
        <span class="tiny lesson-pct">5%</span>
      </div>
      <div class="lesson-sections"></div>
      <div class="complete-panel">
        <div class="big">${STATE.completed[lesson.id] ? "✅" : "🏁"}</div>
        <h2>${STATE.completed[lesson.id] ? "Lesson complete!" : "Finish the lesson"}</h2>
        <p class="muted">${STATE.completed[lesson.id] ? "You can replay it any time — repetition is mastery." : "Mark it done to earn XP and keep the story flowing."}</p>
        <div class="btn-row" style="justify-content:center;margin-top:16px">
          ${prev ? `<button class="btn btn-ghost nav-prev">← ${prev.title.slice(0, 28)}…</button>` : ""}
          <button class="btn btn-success complete-btn">✓ ${STATE.completed[lesson.id] ? "Completed" : "Complete & earn +" + lesson.xp + " XP"}</button>
          ${nextL ? `<button class="btn btn-primary nav-next">${nextL.title.slice(0, 28)}… →</button>`
            : nextWorld ? `<button class="btn btn-primary nav-next-world">Onward: ${nextWorld.title.split(":")[0]} →</button>`
            : `<button class="btn btn-amber nav-exam">🎓 Take the Final Gauntlet</button>`}
        </div>
      </div>
    </div>`;

  const sectionsBox = root.querySelector(".lesson-sections");
  lesson.sections.forEach((s, i) => {
    sectionsBox.appendChild(renderSection(s, { idPrefix: lesson.id, secIdx: i }));
    const div = document.createElement("div");
    div.className = "mini-divider";
    sectionsBox.appendChild(div);
  });
  if (lesson.outro) {
    const out = document.createElement("div");
    out.className = "callout callout-story";
    out.innerHTML = `<div class="co-title">🧭 The journey continues</div><div>${lesson.outro}</div>`;
    sectionsBox.appendChild(out);
  }

  // scroll progress
  const fill = root.querySelector(".lesson-fill");
  const pctLbl = root.querySelector(".lesson-pct");
  const onScroll = () => {
    const h = document.body.scrollHeight - window.innerHeight;
    const p = h > 0 ? Math.min(100, Math.max(5, Math.round((window.scrollY / h) * 100))) : 100;
    fill.style.width = p + "%";
    pctLbl.textContent = p + "%";
  };
  window.removeEventListener("scroll", window.__jqScroll || (() => {}));
  window.__jqScroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });

  root.querySelector(".home-crumb").addEventListener("click", (e) => { e.preventDefault(); navigate("home"); });
  const completeBtn = root.querySelector(".complete-btn");
  completeBtn.addEventListener("click", () => {
    if (!STATE.completed[lesson.id]) {
      STATE.completed[lesson.id] = true;
      saveState();
      awardXP(lesson.xp, "Lesson completed: " + lesson.title.slice(0, 30));
      confetti(30);
      checkBadges();
      completeBtn.textContent = "✓ Completed";
      completeBtn.classList.remove("btn-success");
      completeBtn.classList.add("btn-ghost");
    }
  });
  const prevBtn = root.querySelector(".nav-prev");
  if (prevBtn) prevBtn.addEventListener("click", () => navigate("lesson", { worldId: world.id, lessonId: prev.id }));
  const nextBtn = root.querySelector(".nav-next");
  if (nextBtn) nextBtn.addEventListener("click", () => navigate("lesson", { worldId: world.id, lessonId: nextL.id }));
  const nextWorldBtn = root.querySelector(".nav-next-world");
  if (nextWorldBtn) nextWorldBtn.addEventListener("click", () => {
    const w = WORLDS[WORLDS.indexOf(world) + 1];
    navigate("lesson", { worldId: w.id, lessonId: w.lessons[0].id });
  });
  const examBtn = root.querySelector(".nav-exam");
  if (examBtn) examBtn.addEventListener("click", () => navigate("exam"));

  // highlight active world in sidebar
  document.querySelectorAll(".world-link").forEach((l) => l.classList.toggle("active", l.dataset.world === worldId));
}

/* ---------- ARENA ---------- */
function renderArena(root) {
  const solved = Object.keys(STATE.challengesDone).filter((k) => k.startsWith("ar")).length;
  root.innerHTML = `
    <div class="hero" style="padding:30px 30px">
      <div class="hero-tag">⚔️ Practice Arena</div>
      <h1>Code. Evaluate. Repeat.</h1>
      <p class="lead">Standalone katas across the whole syllabus. Write real Java in the editor, run the live evaluator,
      use hints when stuck, and reveal reference solutions to compare. Each solve earns +25 XP.</p>
      <div class="hero-features">
        <span class="chip">✅ <b>${solved}/${ARENA.length}</b> solved</span>
        <span class="chip">💡 hints on every kata</span>
        <span class="chip">🧾 reference solutions</span>
      </div>
    </div>
    <div class="arena-grid">
      ${ARENA.map((c) => {
        const done = !!STATE.challengesDone[c.id];
        return `<div class="arena-card" id="card-${c.id}">
          <span class="diff diff-${c.diff}">${c.diff}</span>
          <h4>${done ? "✅ " : ""}${c.title}</h4>
          <p>${c.desc}</p>
          <button class="btn btn-small ${done ? "btn-success" : "btn-primary"} open-chal" data-id="${c.id}">${done ? "Review / retry" : "⚔️ Start challenge"}</button>
          <div class="chal-slot" data-slot="${c.id}"></div>
        </div>`;
      }).join("")}
    </div>`;
  root.querySelectorAll(".open-chal").forEach((btn) => {
    btn.addEventListener("click", () => {
      const spec = ARENA.find((c) => c.id === btn.dataset.id);
      const slot = root.querySelector(`[data-slot="${spec.id}"]`);
      if (slot.dataset.open === "1") { slot.innerHTML = ""; slot.dataset.open = "0"; btn.textContent = "⚔️ Start challenge"; return; }
      slot.dataset.open = "1";
      btn.textContent = "🙈 Close";
      slot.innerHTML = `<div class="question" style="margin-top:12px">
        <textarea class="challenge-editor">${spec.starter}</textarea>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-small btn-primary check-btn">▶ Evaluate my code</button>
          <button class="btn btn-small btn-ghost hint-btn">💡 Hint</button>
        </div>
        <div class="hint-box"></div>
        <div class="check-list"></div>
        <div class="feedback"></div>
      </div>`;
      wireChallengeUI(slot.querySelector(".question"), spec, spec.id);
    });
  });
}

/* ---------- GLOSSARY ---------- */
function renderGlossaryView(root) {
  const entries = Object.entries(GLOSSARY).sort((a, b) => a[1][0].localeCompare(b[1][0]));
  root.innerHTML = `
    <div class="hero" style="padding:28px 30px">
      <div class="hero-tag">📖 The Glossary</div>
      <h1>Every term, in plain words.</h1>
      <p class="lead">${entries.length} technical terms explained the way a friend would explain them.
      Hover any <span class="term" data-term="jvm">underlined term</span> in lessons for a quick tooltip — this page is the full dictionary.</p>
    </div>
    <div class="panel" style="margin-bottom:18px">
      <input id="gloss-search" class="fill-input" placeholder="🔎 search a term… (e.g. volatile, heap, lambda)" style="max-width:420px" />
    </div>
    <div class="badge-grid" id="gloss-grid">
      ${entries.map(([k, v]) => `
        <div class="badge-card unlocked gloss-card" data-search="${(v[0] + " " + v[1]).toLowerCase()}" style="text-align:left">
          <h4 style="color:var(--cyan)">${v[0]}</h4>
          <p>${v[1]}</p>
        </div>`).join("")}
    </div>`;
  const search = root.querySelector("#gloss-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    root.querySelectorAll(".gloss-card").forEach((c) => {
      c.style.display = !q || c.dataset.search.includes(q) ? "" : "none";
    });
  });
}

/* ---------- ACHIEVEMENTS ---------- */
function renderAchievements(root) {
  const badges = allBadges();
  root.innerHTML = `
    <div class="hero" style="padding:28px 30px">
      <div class="hero-tag">🥇 Achievements</div>
      <h1>Your trophy wall.</h1>
      <p class="lead">${STATE.badges.length} of ${badges.length} unlocked. Every world grants a badge — plus secret feats
      like streaks, challenges and the Final Gauntlet.</p>
    </div>
    <div class="badge-grid">
      ${badges.map((b) => {
        const has = STATE.badges.includes(b.id);
        return `<div class="badge-card ${has ? "unlocked" : "locked"}">
          <span class="badge-emoji">${b.emoji}</span>
          <h4>${b.name}</h4>
          <p>${b.desc}</p>
          <p class="tiny" style="margin-top:6px">${has ? "✅ unlocked" : "🔒 locked"}</p>
        </div>`;
      }).join("")}
    </div>
    <div class="panel" style="margin-top:22px">
      <h3 style="margin-bottom:8px">📊 Stats</h3>
      <p class="muted">XP: <b>${STATE.xp}</b> · Rank: <b>${levelInfo(STATE.xp).name}</b> · Lessons: <b>${Object.keys(STATE.completed).length}/${allLessons().length}</b> ·
      Challenges: <b>${Object.keys(STATE.challengesDone).length}</b> · Correct answers: <b>${STATE.correctCount}</b> · Best exam: <b>${STATE.examBest == null ? "—" : STATE.examBest + "%"}</b> · Streak: <b>${STATE.streak || 0}🔥</b></p>
    </div>`;
}

/* ---------- FINAL GAUNTLET ---------- */
const EXAM = [
  { type: "mcq", q: "What does the JVM actually execute?", options: ["Your .java source directly", "Bytecode from .class files", "Machine code of the host CPU only", "Pseudo-code interpreted by javac"], answer: 1, explain: "The JVM executes bytecode — the portable middle layer produced by javac." },
  { type: "tf", q: "<code>int x = 5 / 2;</code> results in x being 2 due to integer division.", answer: true, explain: "Both operands are ints → integer division → 2 (the .5 is dropped)." },
  { type: "output", q: "Predict:", code: "int max = Integer.MAX_VALUE;\nSystem.out.println(max + 1);", options: ["2147483648", "-2147483648", "0", "Exception"], answer: 1, explain: "int overflow wraps around to Integer.MIN_VALUE — silently!" },
  { type: "mcq", q: "Which pillar of OOP is 'private fields + controlled public methods'?", options: ["Inheritance", "Polymorphism", "Encapsulation", "Abstraction"], answer: 2, explain: "Encapsulation seals state behind an API with enforced rules." },
  { type: "multi", q: "Which statements about String are true?", options: ["Strings are immutable", "\"a\" == \"a\" is true (pool)", "toUpperCase() mutates the string", "Use equals() to compare content"], answers: [0, 1, 3], explain: "Immutable, pooled literals, content comparison via equals(). toUpperCase returns a NEW string." },
  { type: "fill", q: "A method that reuses a parent's version of an overridden method calls it via the _____ keyword.", answers: ["super"], explain: "super.method() reaches up to the parent implementation." },
  { type: "codefix", q: "Which fix makes this compile and print \"Woof\"?", code: "class Animal {\n    void speak() { System.out.println(\"...\"); }\n}\nclass Dog extends Animal {\n    void speak() { System.out.println(\"Woof\"); }\n}\n// Animal a = new Dog(); a.speak();", options: ["It already works — dynamic dispatch calls Dog.speak()", "Remove the override", "Cast a to Dog first — always", "Mark speak() static"], answer: 0, explain: "This is exactly dynamic dispatch: Animal reference, Dog object → Dog.speak()." },
  { type: "order", q: "Order the object creation lifecycle:", items: ["Heap memory allocated", "Fields default-initialized (0/null/false)", "Constructor runs (super/this first)", "Reference stored in the variable"], explain: "allocate → defaults → construct → link." },
  { type: "mcq", q: "The equals/hashCode contract demands:", options: ["Equal objects may hash differently", "Equal objects MUST share the same hashCode", "hashCode must be unique per object", "equals must use =="], answer: 1, explain: "equals-true ⇒ same hashCode. Break it and HashMap/HashSet misbehave." },
  { type: "tf", q: "Checked exceptions must be caught or declared with throws.", answer: true, explain: "That is what makes them 'checked' — the compiler enforces handling." },
  { type: "mcq", q: "Which collection refuses duplicates?", options: ["List", "ArrayList", "Set", "Queue"], answer: 2, explain: "Set's defining property is uniqueness (via equals/hashCode)." },
  { type: "output", q: "What prints?", code: "Map<String, Integer> m = new HashMap<>();\nm.put(\"a\", 1);\nm.put(\"a\", 2);\nSystem.out.println(m.size() + \" \" + m.get(\"a\"));", options: ["2 2", "1 2", "2 1", "1 1"], answer: 1, explain: "Same key overwrites the value: size 1, value 2." },
  { type: "multi", q: "count++ on a shared field across threads causes…", options: ["Lost updates (race condition)", "Because read-add-write is not atomic", "A checked exception", "Solved by making count volatile alone"], answers: [0, 1], explain: "The classic race — fixed by synchronized, atomics, confinement or immutability (not by volatile alone)." },
  { type: "fill", q: "The keyword _____ on a field guarantees cross-thread visibility but NOT atomicity of compound operations.", answers: ["volatile"], explain: "volatile = visibility + ordering, not atomicity." },
  { type: "mcq", q: "Deadlock requires which set of conditions?", options: ["Only circular wait", "Mutual exclusion + hold-and-wait + no preemption + circular wait", "Two threads + one lock", "High CPU"], answer: 1, explain: "All four Coffman conditions — break any one to prevent it." },
  { type: "tf", q: "Streams execute eagerly when .stream() is called.", answer: false, explain: "Streams are lazy — only the terminal op triggers the pipeline." },
  { type: "output", q: "Result?", code: "List<Integer> r = List.of(1,2,3,4).stream()\n    .filter(n -> n % 2 == 0)\n    .map(n -> n * 10)\n    .collect(Collectors.toList());\nSystem.out.println(r);", options: ["[10, 20, 30, 40]", "[20, 40]", "[2, 4]", "[1, 2, 3, 4]"], answer: 1, explain: "Evens 2,4 → ×10 → [20, 40]." },
  { type: "mcq", q: "Where do objects live in JVM memory?", options: ["On the stack", "On the heap", "In the PC register", "In the classloader"], answer: 1, explain: "All objects are heap-allocated (stacks hold frames and references)." },
  { type: "multi", q: "PreparedStatement is preferred because it…", options: ["Prevents SQL injection", "Caches query plans", "Needs no database driver", "Auto-closes ResultSet only"], answers: [0, 1], explain: "Injection-proof parameters + plan caching. try-with-resources handles closing." },
  { type: "mcq", q: "A record gives you automatically:", options: ["Mutable setters", "Constructor, accessors, equals/hashCode/toString", "Serializable only", "A private constructor"], answer: 1, explain: "Records are immutable data carriers with generated boilerplate — done right." },
];

function renderExam(root) {
  const attempted = STATE.examBest != null;
  root.innerHTML = `
    <div class="exam-banner">
      <div class="hero-tag">🎓 The Final Gauntlet</div>
      <h1 style="font-size:1.9rem;margin:8px 0 10px">Prove your mastery.</h1>
      <p class="lead" style="margin-bottom:12px">${EXAM.length} questions drawn from every world — syntax, OOP, collections,
      concurrency, streams, JDBC and JVM internals. Instant feedback keeps the flow; score 70%+ to unlock your certificate.</p>
      <div class="hero-features">
        <span class="chip">🎯 pass mark: <b>70%</b></span>
        <span class="chip">📊 best score: <b>${attempted ? STATE.examBest + "%" : "not attempted"}</b></span>
        <span class="chip">⚡ <b>+10 XP</b> per correct answer</span>
      </div>
      <button class="btn btn-amber" id="start-exam">${attempted ? "↺ Retake the Gauntlet" : "⚔️ Begin the Gauntlet"}</button>
    </div>
    <div id="exam-area">
      <div class="panel center muted">
        <p>When you begin, questions appear one after another with explanations — the flow never breaks.
        Finish all ${EXAM.length} to see your score. 🍀</p>
      </div>
    </div>
    <div id="cert-area"></div>`;

  root.querySelector("#start-exam").addEventListener("click", () => {
    const area = root.querySelector("#exam-area");
    area.innerHTML = "";
    const container = document.createElement("div");
    container.className = "quiz";
    container.innerHTML = `<div class="quiz-head"><span class="quiz-badge">🎓 Final Gauntlet</span>
      <span class="q-count"><b id="exam-progress">0</b>/${EXAM.length} answered</span></div>`;
    const qDivs = EXAM.map((q, i) => renderQuestion(q, "exam-q" + i, i));
    qDivs.forEach((div) => {
      const obs = new MutationObserver(() => {
        const attempted = qDivs.filter((d) => d.dataset.attempted === "1").length;
        const prog = container.querySelector("#exam-progress");
        if (prog) prog.textContent = attempted;
        // all correct → auto-finish
        if (qDivs.every((d) => d.dataset.done === "1") && !container.dataset.finished) {
          container.dataset.finished = "1";
          finishExam(EXAM.length);
          return;
        }
        // all attempted → offer explicit finish (wrong ones can still be retried first!)
        if (attempted === EXAM.length && !container.querySelector(".finish-exam-btn")) {
          const btn = document.createElement("button");
          btn.className = "btn btn-amber finish-exam-btn";
          btn.style.margin = "14px 0 4px";
          btn.textContent = "🏁 Finish the Gauntlet & see my score";
          btn.addEventListener("click", () => {
            if (container.dataset.finished) return;
            container.dataset.finished = "1";
            const correctNow = qDivs.filter((d) => d.dataset.done === "1").length;
            finishExam(correctNow);
          });
          container.appendChild(btn);
        }
      });
      obs.observe(div, { attributes: true, attributeFilter: ["data-attempted", "data-done"] });
      container.appendChild(div);
    });
    area.appendChild(container);
    area.scrollIntoView({ behavior: "smooth" });
    applyGlossary(area);

    function finishExam(correct) {
      const pct = Math.round((correct / EXAM.length) * 100);
      if (pct > (STATE.examBest || 0)) { STATE.examBest = pct; saveState(); }
      awardXP(correct * 10, "Final Gauntlet completed");
      checkBadges();
      const cert = root.querySelector("#cert-area");
      const passed = pct >= 70;
      cert.innerHTML = `
        <div class="certificate">
          <div class="seal">${passed ? "🏆" : "📜"}</div>
          <h1>${passed ? "Certificate of Mastery" : "Certificate of Attempt"}</h1>
          <p class="muted">${passed ? "This certifies that" : "Awarded to the brave explorer"}</p>
          <div class="who">
            <input id="learner-name" placeholder="type your name here…"
              value="${escHtml(STATE.learnerName)}"
              style="background:transparent;border:none;border-bottom:2px solid var(--gold);color:var(--text);font-size:1.35rem;text-align:center;font-family:var(--font);width:min(420px,80%);outline:none" />
          </div>
          <p class="muted">has completed the <b>Java Quest</b> journey — from the first <code>Hello World</code>
          to race conditions, JVM internals and beyond — scoring <b style="color:var(--gold)">${pct}%</b> on the Final Gauntlet.</p>
          <p class="tiny" style="margin-top:10px">${new Date().toDateString()} · XP earned: ${STATE.xp} · Rank: ${levelInfo(STATE.xp).name}</p>
          <div class="btn-row" style="justify-content:center;margin-top:18px">
            <button class="btn btn-ghost" onclick="window.print()">🖨 Print certificate</button>
            <button class="btn btn-primary" id="keep-learning">📚 Keep learning</button>
          </div>
        </div>`;
      const nameInput = cert.querySelector("#learner-name");
      nameInput.addEventListener("input", () => { STATE.learnerName = nameInput.value; saveState(); });
      cert.querySelector("#keep-learning").addEventListener("click", () => navigate("arena"));
      if (passed) confetti(70);
      cert.scrollIntoView({ behavior: "smooth" });
    }
  });
}

/* ------------------------------------------------------------
   GLOBAL WIRING
   ------------------------------------------------------------ */
function init() {
  touchStreak();
  refreshHUD();
  renderSidebar();

  document.getElementById("brand-home").addEventListener("click", () => navigate("home"));
  document.querySelectorAll(".side-link").forEach((l) =>
    l.addEventListener("click", (e) => { e.preventDefault(); navigate(l.dataset.view); })
  );
  document.getElementById("world-nav").addEventListener("click", (e) => {
    const link = e.target.closest(".world-link");
    if (!link) return;
    e.preventDefault();
    const w = WORLDS.find((x) => x.id === link.dataset.world);
    const lesson = w.lessons.find((l) => !STATE.completed[l.id]) || w.lessons[0];
    navigate("lesson", { worldId: w.id, lessonId: lesson.id });
  });
  document.getElementById("sidebar-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
  document.getElementById("reset-progress").addEventListener("click", () => {
    if (confirm("Reset ALL progress (XP, badges, completions)? This cannot be undone.")) {
      localStorage.removeItem(STORE_KEY);
      STATE = loadState();
      saveState();
      navigate("home");
      toast("↺", "Progress reset", "A fresh quest begins!", "green");
    }
  });

  navigate("home");
  checkBadges();
}

document.addEventListener("DOMContentLoaded", init);
