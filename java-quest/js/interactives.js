/* ============================================================
   JAVA QUEST — Interactive visual simulators
   Each demo: DEMOS[name](rootElement, options?) → wires its own DOM.
   ============================================================ */
const DEMOS = {};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ============================================================
   1) RACE CONDITION SIMULATOR  (flagship demo)
   ============================================================ */
DEMOS.raceSim = (root) => {
  // Precomputed schedules. Unsynchronized: classic lost update. Sync: atomic increments.
  const schedules = {
    unsync: [
      { t: 1, act: "read",  local: 0, shared: 0, note: "Thread-1 reads shared counter (0) into its local copy." },
      { t: 2, act: "read",  local: 0, shared: 0, note: "Thread-2 ALSO reads 0 — before Thread-1 wrote its result! 💥" },
      { t: 1, act: "add",   local: 1, shared: 0, note: "Thread-1 adds 1 to its local copy → local = 1." },
      { t: 1, act: "write", local: 1, shared: 1, note: "Thread-1 writes local (1) back to shared counter." },
      { t: 2, act: "add",   local: 1, shared: 1, note: "Thread-2 adds 1 to ITS local copy → local = 1 (built from stale 0!)." },
      { t: 2, act: "write", local: 1, shared: 1, note: "Thread-2 writes local (1) back… OVERWRITING Thread-1's work. 💀" },
      { t: 1, act: "read",  local: 1, shared: 1, note: "Round 2: Thread-1 reads 1." },
      { t: 2, act: "read",  local: 1, shared: 1, note: "Thread-2 reads 1 (same problem again)." },
      { t: 1, act: "add",   local: 2, shared: 1, note: "Thread-1 local = 2." },
      { t: 1, act: "write", local: 2, shared: 2, note: "Thread-1 writes 2." },
      { t: 2, act: "add",   local: 2, shared: 2, note: "Thread-2 local = 2 (from stale 1)." },
      { t: 2, act: "write", local: 2, shared: 2, note: "Thread-2 overwrites → 2. Another update LOST." },
      { t: 1, act: "read",  local: 2, shared: 2, note: "Round 3: Thread-1 reads 2." },
      { t: 2, act: "read",  local: 2, shared: 2, note: "Thread-2 reads 2." },
      { t: 1, act: "add",   local: 3, shared: 2, note: "Thread-1 local = 3." },
      { t: 1, act: "write", local: 3, shared: 3, note: "Thread-1 writes 3." },
      { t: 2, act: "add",   local: 3, shared: 2, note: "Thread-2 local = 3 — computed from a stale read." },
      { t: 2, act: "write", local: 3, shared: 3, note: "Thread-2 writes 3. FINAL = 3, but we ran 6 increments!" },
    ],
    sync: [
      { t: 1, act: "lock",  local: 0, shared: 0, note: "Thread-1 enters synchronized increment() — acquires the object's lock. 🔒" },
      { t: 1, act: "read",  local: 0, shared: 0, note: "Thread-1 reads 0. Nobody else CAN be inside — they wait at the door." },
      { t: 1, act: "add",   local: 1, shared: 0, note: "Thread-1 local = 1." },
      { t: 1, act: "write", local: 1, shared: 1, note: "Thread-1 writes 1 back." },
      { t: 1, act: "unlock",local: 1, shared: 1, note: "Thread-1 releases the lock. 🔓 Its write is now guaranteed visible to others." },
      { t: 2, act: "lock",  local: 1, shared: 1, note: "Thread-2 acquires the lock and (thanks to happens-before) reads the LATEST value." },
      { t: 2, act: "read",  local: 1, shared: 1, note: "Thread-2 reads 1 — fresh, not stale!" },
      { t: 2, act: "add",   local: 2, shared: 1, note: "Thread-2 local = 2." },
      { t: 2, act: "write", local: 2, shared: 2, note: "Thread-2 writes 2." },
      { t: 2, act: "unlock",local: 2, shared: 2, note: "Lock released. 🔓" },
      { t: 1, act: "lock",  local: 2, shared: 2, note: "Thread-1 locks again (round 2)…" },
      { t: 1, act: "read",  local: 2, shared: 2, note: "Reads 2." },
      { t: 1, act: "add",   local: 3, shared: 2, note: "local = 3." },
      { t: 1, act: "write", local: 3, shared: 3, note: "Writes 3." },
      { t: 1, act: "unlock",local: 3, shared: 3, note: "Released." },
      { t: 2, act: "lock",  local: 3, shared: 3, note: "Thread-2 round 2 locks…" },
      { t: 2, act: "read",  local: 3, shared: 3, note: "Reads 3." },
      { t: 2, act: "add",   local: 4, shared: 3, note: "local = 4." },
      { t: 2, act: "write", local: 4, shared: 4, note: "Writes 4." },
      { t: 2, act: "unlock",local: 4, shared: 4, note: "Released." },
      { t: 1, act: "lock",  local: 4, shared: 4, note: "Thread-1 round 3 locks…" },
      { t: 1, act: "read",  local: 4, shared: 4, note: "Reads 4." },
      { t: 1, act: "add",   local: 5, shared: 4, note: "local = 5." },
      { t: 1, act: "write", local: 5, shared: 5, note: "Writes 5." },
      { t: 1, act: "unlock",local: 5, shared: 5, note: "Released." },
      { t: 2, act: "lock",  local: 5, shared: 5, note: "Thread-2 round 3 locks…" },
      { t: 2, act: "read",  local: 5, shared: 5, note: "Reads 5." },
      { t: 2, act: "add",   local: 6, shared: 5, note: "local = 6." },
      { t: 2, act: "write", local: 6, shared: 6, note: "Writes 6." },
      { t: 2, act: "unlock",local: 6, shared: 6, note: "FINAL = 6 — every increment counted. ✅" },
    ],
  };

  let mode = "unsync", idx = -1, timer = null;

  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-act="step">▶ Next step</button>
        <button class="btn btn-small btn-success" data-act="auto">⏩ Auto-run</button>
        <button class="btn btn-small btn-ghost" data-act="reset">↺ Reset</button>
        <span style="flex:1"></span>
        <button class="btn btn-small btn-rose" data-act="mode">Mode: <b class="mode-label">RACE (no lock)</b></button>
      </div>
      <div class="shared-box">
        <div class="tiny">shared <code>counter</code> (lives on the HEAP — shared by both threads)</div>
        <div class="counter-val">0</div>
        <div class="lock-chip lock-free">🔓 monitor lock: free</div>
        <div class="lock-chip lock-free">🎯 goal: both threads do <code>counter++</code> three times → expect <b>6</b></div>
      </div>
      <div class="race-grid">
        <div class="thread-lane t1">
          <h5><span class="lane-dot"></span> Thread-1 <span class="tiny">(its own STACK: local copy)</span></h5>
          <div class="op-steps" data-lane="1"></div>
          <div class="tiny" style="margin-top:8px">local1 = <b class="loc">0</b></div>
        </div>
        <div class="thread-lane t2">
          <h5><span class="lane-dot"></span> Thread-2 <span class="tiny">(its own STACK: local copy)</span></h5>
          <div class="op-steps" data-lane="2"></div>
          <div class="tiny" style="margin-top:8px">local2 = <b class="loc">0</b></div>
        </div>
      </div>
      <div class="demo-note" style="min-height:52px">💡 Press <b>Next step</b> to watch the two threads interleave. In RACE mode the same instruction sequence ends at the wrong answer — that is a race condition.</div>
      <div class="race-verdict"></div>
    </div>`;

  const stepsFor = () => schedules[mode];
  const counterVal = $(".counter-val", root);
  const verdict = $(".race-verdict", root);
  const noteBox = $(".demo-note", root);

  function laneSteps(t) {
    return stepsFor().map((s, i) => {
      if (s.t !== t) return "";
      const label =
        s.act === "lock" ? "🔒 LOCK" :
        s.act === "unlock" ? "🔓 UNLOCK" :
        s.act === "read" ? "local = counter" :
        s.act === "add" ? "local = local + 1" :
        "counter = local";
      return `<div class="op-step" data-i="${i}">thread-${t}: ${label}</div>`;
    }).join("");
  }

  function render() {
    $("[data-lane='1']", root).innerHTML = laneSteps(1);
    $("[data-lane='2']", root).innerHTML = laneSteps(2);
    counterVal.textContent = "0";
    $$(".loc", root).forEach((n) => (n.textContent = "0"));
    verdict.className = "race-verdict";
    verdict.classList.remove("show");
    $(".mode-label", root).textContent = mode === "unsync" ? "RACE (no lock)" : "SYNCHRONIZED 🔒";
    $("[data-act='mode']", root).className = "btn btn-small " + (mode === "unsync" ? "btn-rose" : "btn-success");
    noteBox.innerHTML = `💡 Press <b>Next step</b> to watch the two threads interleave. ${mode === "unsync" ? "In RACE mode the same instruction sequence ends at the wrong answer — that is a race condition." : "With synchronized, each read-add-write is one atomic critical section — the result is always correct."}`;
    idx = -1;
  }

  function finish() {
    const final = Number(counterVal.textContent);
    const good = final === 6;
    verdict.className = "race-verdict show " + (good ? "verdict-good" : "verdict-bad");
    verdict.innerHTML = good
      ? `✅ <b>Final counter = 6.</b> Correct! The <code>synchronized</code> critical section made each <code>counter++</code> atomic — no lost updates. This is what "fixing the race condition" means in practice.`
      : `💥 <b>Final counter = ${final}, expected 6.</b> ${6 - final} update(s) were <b>lost</b> — Thread-2 wrote results built from stale reads. This is a <b>race condition</b>: the answer depends on the exact timing of thread interleaving. Switch the mode to SYNCHRONIZED and run again.`;
  }

  function step() {
    const steps = stepsFor();
    idx++;
    if (idx >= steps.length) { idx = steps.length - 1; finish(); return false; }
    const s = steps[idx];
    $$(".op-step", root).forEach((n) => {
      const i = Number(n.dataset.i);
      n.classList.toggle("active", i === idx);
      n.classList.toggle("done", i < idx);
    });
    counterVal.textContent = String(s.shared);
    counterVal.classList.remove("bump");
    void counterVal.offsetWidth;
    counterVal.classList.add("bump");
    const locs = $$(".loc", root);
    locs[s.t - 1].textContent = String(s.local);
    const chips = $$(".lock-chip", root);
    const locked = s.act === "lock" || (s.act !== "unlock" && steps.slice(0, idx + 1).reverse().find((x) => x.act === "lock" || x.act === "unlock")?.act === "lock");
    chips[0].className = "lock-chip " + (locked ? "lock-held" : "lock-free");
    chips[0].textContent = locked ? "🔒 monitor lock: HELD by Thread-" + s.t : "🔓 monitor lock: free";
    noteBox.innerHTML = "🧠 <b>Step " + (idx + 1) + ":</b> " + s.note;
    if (idx === steps.length - 1) finish();
    return true;
  }

  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "step") { if (timer) { clearInterval(timer); timer = null; } step(); }
    if (act === "reset") { if (timer) { clearInterval(timer); timer = null; } render(); }
    if (act === "mode") { mode = mode === "unsync" ? "sync" : "unsync"; if (timer) { clearInterval(timer); timer = null; } render(); }
    if (act === "auto") {
      if (timer) { clearInterval(timer); timer = null; btn.textContent = "⏩ Auto-run"; return; }
      if (idx >= stepsFor().length - 1) render();
      btn.textContent = "⏸ Pause";
      timer = setInterval(() => { if (!step()) { clearInterval(timer); timer = null; btn.textContent = "⏩ Auto-run"; } }, 850);
    }
  });
  render();
};

/* ============================================================
   2) JVM MEMORY MODEL — stack vs heap walkthrough
   ============================================================ */
DEMOS.memoryModel = (root) => {
  const steps = [
    { code: "int x = 5;", stack: [{ n: "x", v: "5", k: "stack" }], heap: [], say: "Primitives live directly on the thread's STACK. Fast, private to the method, gone when the method ends." },
    { code: "Person p = new Person(\"Ava\");", stack: [{ n: "x", v: "5", k: "stack" }, { n: "p", v: "→ 0x1a2b", k: "stack" }], heap: [{ n: "Person #0x1a2b", v: 'name="Ava", age=0', k: "heap" }], say: "The OBJECT goes to the HEAP (shared memory). The variable p is just a REFERENCE (a remote control) on the stack pointing to it." },
    { code: "p = new Person(\"Zoe\");", stack: [{ n: "x", v: "5", k: "stack" }, { n: "p", v: "→ 0x9c3d", k: "stack" }], heap: [{ n: "Person #0x1a2b", v: 'name="Ava"  ← NOBODY points here now', k: "heap", gone: true }, { n: "Person #0x9c3d", v: 'name="Zoe"', k: "heap" }], say: "p now points to a NEW object. The old Ava object still exists… but nothing references it → it becomes garbage the GC can collect." },
    { code: "p.name.toUpperCase();", stack: [{ n: "x", v: "5", k: "stack" }, { n: "p", v: "→ 0x9c3d", k: "stack" }], heap: [{ n: "Person #0x1a2b", v: 'garbage — awaiting GC', k: "heap", gone: true }, { n: "Person #0x9c3d", v: 'name="Zoe"', k: "heap" }, { n: "String \"ZOE\"", v: 'returned by toUpperCase()', k: "heap" }], say: "Methods run on the stack; objects they create/use live on the heap. String methods return NEW strings (immutability) — another heap object appears." },
    { code: "method ends →", stack: [], heap: [{ n: "Person #0x1a2b", v: 'unreachable garbage', k: "heap", gone: true }, { n: "Person #0x9c3d", v: 'unreachable garbage', k: "heap", gone: true }, { n: "String \"ZOE\"", v: 'unreachable garbage', k: "heap", gone: true }], say: "When the method returns, its STACK FRAME vanishes — locals x and p disappear. Everything they pointed to is now unreachable and will be garbage-collected. Stack cleans instantly; heap cleans lazily via GC." },
  ];
  let i = 0;
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-a="next">▶ Next statement</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
        <span class="tiny" style="margin-left:8px">now executing: <code class="cur-code"></code></span>
      </div>
      <div class="mem-grid">
        <div class="mem-region"><h5>📚 STACK (per-thread, method locals & references)</h5><div class="stack-area"></div></div>
        <div class="mem-region"><h5>🏗️ HEAP (shared by ALL threads — all objects)</h5><div class="heap-area"></div></div>
      </div>
      <div class="demo-note mm-say"></div>
    </div>`;
  const render = () => {
    const s = steps[i];
    $(".cur-code", root).textContent = s.code;
    $(".stack-area", root).innerHTML = s.stack.map((o) => `<div class="mem-obj ${o.k} ${o.gone ? "gone" : ""}"><span>${o.n}</span><span class="addr">${o.v}</span></div>`).join("") || `<div class="tiny">— empty —</div>`;
    $(".heap-area", root).innerHTML = s.heap.map((o) => `<div class="mem-obj ${o.k} ${o.gone ? "gone" : ""}"><span>${o.n}</span><span class="addr">${o.v}</span></div>`).join("") || `<div class="tiny">— empty —</div>`;
    $(".mm-say", root).innerHTML = "🧠 " + s.say;
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    if (b.dataset.a === "next") { i = (i + 1) % steps.length; render(); }
    else { i = 0; render(); }
  });
  render();
};

/* ============================================================
   3) POLYMORPHISM — dynamic dispatch visualizer
   ============================================================ */
DEMOS.dispatch = (root) => {
  const animals = [
    { name: "Dog (actual object)", cls: "Dog", sound: "Woof! 🐕", src: "Dog.speak() — the OVERRIDDEN version runs" },
    { name: "Cat (actual object)", cls: "Cat", sound: "Meow! 🐈", src: "Cat.speak() — the OVERRIDDEN version runs" },
    { name: "Bird (actual object)", cls: "Bird", sound: "Tweet! 🐦", src: "Bird.speak() — the OVERRIDDEN version runs" },
    { name: "Animal (plain object)", cls: "Animal", sound: "…generic animal noise", src: "Animal.speak() — no override, base version runs" },
  ];
  let i = 0;
  root.innerHTML = `
    <div class="demo-body">
      <div class="diagram">
        <div class="d-node">class Animal <span class="sub">void speak() → "generic noise"</span></div>
        <div class="d-arrow">▲ &nbsp; extends &nbsp;▲ &nbsp; extends &nbsp;▲</div>
        <div class="d-row">
          <div class="d-node">class Dog<br><span class="sub">overrides speak()</span></div>
          <div class="d-node">class Cat<br><span class="sub">overrides speak()</span></div>
          <div class="d-node">class Bird<br><span class="sub">overrides speak()</span></div>
        </div>
      </div>
      <div class="panel" style="margin:14px 0">
        <code>Animal pet = pets[i]; &nbsp; pet.speak(); &nbsp;&nbsp; // ONE call site, MANY behaviors</code>
      </div>
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-a="call">▶ Call pet.speak() on next object</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
      </div>
      <div class="shared-box">
        <div class="tiny">reference type: <b>Animal</b> (same for all) &nbsp;|&nbsp; actual object: <b class="act-obj">—</b></div>
        <div class="counter-val" style="font-size:1.6rem" class="sound">—</div>
        <div class="tiny src-note" style="margin-top:8px"></div>
      </div>
      <div class="demo-note">💡 The compiler only checks that <code>speak()</code> exists on Animal. At RUNTIME, Java looks at the <b>actual object</b> and calls its override. That is <b>dynamic dispatch</b> — the engine of polymorphism.</div>
    </div>`;
  const doCall = () => {
    const a = animals[i];
    $(".act-obj", root).textContent = a.cls;
    const snd = $(".counter-val", root);
    snd.textContent = a.sound;
    snd.classList.remove("bump"); void snd.offsetWidth; snd.classList.add("bump");
    $(".src-note", root).innerHTML = "🔎 dispatched to → " + a.src;
    i = (i + 1) % animals.length;
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    if (b.dataset.a === "call") doCall(); else { i = 0; $(".act-obj", root).textContent = "—"; $(".counter-val", root).textContent = "—"; $(".src-note", root).textContent = ""; }
  });
};

/* ============================================================
   4) HASHMAP — hashing, buckets, collisions, resize
   ============================================================ */
DEMOS.hashMap = (root) => {
  const words = ["dog", "cat", "owl", "ant", "cow", "ape", "elk", "ox", "hen", "yak"];
  let table = Array.from({ length: 8 }, () => []);
  let size = 0;
  const bucketCount = () => table.length;
  const hashTo = (key) => Math.abs(key.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % bucketCount();
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-a="put">➕ put(next key)</button>
        <button class="btn btn-small btn-amber" data-a="resize">↕ resize (grow ×2 & rehash)</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
        <span class="tiny">next key: <b class="next-key"></b> &nbsp;|&nbsp; size: <b class="hm-size">0</b> / buckets: <b class="hm-b">8</b></span>
      </div>
      <div class="hm-table"></div>
      <div class="demo-note hm-say">💡 <b>put("key")</b> → compute hashCode → pick bucket <code>hash % 8</code> → if occupied, attach a chain (a small linked list). This is exactly how Java's HashMap works (plus treeifying chains ≥ 8 into red-black trees).</div>
    </div>`;
  const draw = () => {
    $(".hm-table", root).innerHTML = table.map((b, i) => `
      <div class="mem-obj heap" style="align-items:center">
        <span class="addr">bucket[${i}]</span>
        <span>${b.length === 0 ? '<span class="tiny">empty</span>' : b.map((k, j) => ` <span class="lock-chip ${j === 0 ? "lock-free" : "lock-held"}" style="margin:2px">"${k}"<span class="tiny"> h=${hashTo(k)}</span></span>${j < b.length - 1 ? " →" : ""}`).join("")}</span>
      </div>`).join("");
    $(".hm-size", root).textContent = size;
    $(".hm-b", root).textContent = bucketCount();
    $(".next-key", root).textContent = words[size] ? `"${words[size]}"` : "—";
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "put" && words[size]) {
      const k = words[size], idx = hashTo(k);
      const collided = table[idx].length > 0;
      table[idx].push(k); size++;
      $(".hm-say", root).innerHTML = `🧠 put("${k}") → hashCode ≈ ${k.split("").reduce((a, c) => a + c.charCodeAt(0), 0)} → bucket <b>${idx}</b>. ` + (collided ? `💥 <b>Collision!</b> That bucket was taken — "${k}" chains onto the existing entry. Lookups walk the chain with equals().` : `✅ clean insert, no collision.`);
      draw();
    } else if (a === "resize") {
      const old = table.flat(); table = Array.from({ length: bucketCount() * 2 }, () => []);
      old.forEach((k) => table[hashTo(k)].push(k));
      $(".hm-say", root).innerHTML = `🧠 <b>Resize!</b> ${old.length} entries rehashed into ${bucketCount()} buckets (load factor 0.75 triggered growth). Chains get shorter → faster lookups. This rehash is why resizing is costly — and why hinting initial capacity is a pro move.`;
      draw();
    } else if (a === "reset") {
      table = Array.from({ length: 8 }, () => []); size = 0; draw();
      $(".hm-say", root).innerHTML = `💡 <b>put("key")</b> → compute hashCode → pick bucket <code>hash % 8</code> → if occupied, attach a chain. This is exactly how Java's HashMap works.`;
    }
  });
  draw();
};

/* ============================================================
   5) GARBAGE COLLECTION — reachability visualizer
   ============================================================ */
DEMOS.gcDemo = (root) => {
  let refs = { main: "A", A: "B", B: null, C: "D", D: null, E: null };
  const nodes = ["A", "B", "C", "D", "E"];
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-rose" data-a="drop">✂ drop a random reference</button>
        <button class="btn btn-small btn-success" data-a="run">🧹 run GC</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
      </div>
      <div class="gc-canvas" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:14px 0"></div>
      <div class="demo-note gc-say">💡 GC never collects 'old objects' — it collects <b>unreachable</b> objects. Follow arrows from the GC roots (main's stack frame, static fields): everything you cannot reach is garbage, no matter how recently it was created.</div>
    </div>`;
  const alive = () => {
    const seen = new Set();
    let cur = refs.main;
    while (cur && !seen.has(cur)) { seen.add(cur); cur = refs[cur]; }
    return seen;
  };
  const draw = () => {
    const live = alive();
    $(".gc-canvas", root).innerHTML =
      `<div class="mem-obj stack" style="min-width:120px;justify-content:center"><b>GC ROOT</b><span class="tiny">main's stack</span></div>` +
      `<div class="d-arrow" style="align-self:center">→</div>` +
      nodes.map((n) => `
        <div class="mem-obj heap ${live.has(n) ? "" : "gone"}" style="min-width:110px;flex-direction:column;align-items:center">
          <b>Object ${n}</b><span class="tiny">ref → ${refs[n] ? "Object " + refs[n] : "null"}</span>
          <span class="tiny" style="color:${live.has(n) ? "var(--emerald)" : "var(--rose)"}">${live.has(n) ? "reachable" : "garbage!"}</span>
        </div>`).join("");
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "drop") {
      const keys = Object.keys(refs).filter((k) => refs[k] !== null);
      if (!keys.length) { $(".gc-say", root).innerHTML = "Nothing left to drop!"; return; }
      const k = keys[Math.floor(Math.random() * keys.length)];
      refs[k] = null;
      $(".gc-say", root).innerHTML = `✂ Cut the reference <b>${k} → …</b>. Check which objects just became unreachable (red) — they are now garbage even though they still exist in memory!`;
      draw();
    } else if (a === "run") {
      const live = alive();
      const dead = nodes.filter((n) => !live.has(n));
      $(".gc-say", root).innerHTML = dead.length
        ? `🧹 GC ran a mark-and-sweep: marked ${[...live].join(", ") || "nothing"} as live, then <b>swept ${dead.join(", ")}</b> — their heap memory is reclaimed. No <code>delete</code> keyword needed; that is Java's superpower.`
        : `🧹 GC ran… and found <b>nothing to collect</b> — everything is reachable from GC roots. GC is lazy: it only runs when it wants to (memory pressure, not on a schedule you control).`;
      draw();
    } else { refs = { main: "A", A: "B", B: null, C: "D", D: null, E: null }; draw(); }
  });
  draw();
};

/* ============================================================
   6) DEADLOCK — resource allocation stepper
   ============================================================ */
DEMOS.deadlockSim = (root) => {
  let mode = "bad", step = 0;
  const scripts = {
    bad: [
      { t1: "locks 🔒 Account-A", t2: "waiting…", state: "Thread-1 holds A. Fine so far.", ok: true },
      { t1: "holds A, wants B…", t2: "locks 🔒 Account-B", state: "Thread-2 holds B. Still legal!", ok: true },
      { t1: "⏳ BLOCKED waiting for B", t2: "holds B, wants A…", state: "Thread-1 needs B (held by T2). It parks at the door of B…", ok: true },
      { t1: "⏳ BLOCKED waiting for B", t2: "⏳ BLOCKED waiting for A", state: "💀 <b>DEADLOCK!</b> T1 waits for B, T2 waits for A. Nobody can move — forever. The program hangs with 0% CPU and no error message!", ok: false },
    ],
    good: [
      { t1: "locks 🔒 Account-A", t2: "waiting…", state: "Rule: EVERYONE locks in ID order (lowest id first).", ok: true },
      { t1: "holds A, locks 🔒 B", t2: "waiting for A…", state: "T1 owns both locks in order and completes the transfer, then releases both.", ok: true },
      { t1: "🔓 releases A and B — done ✅", t2: "locks 🔒 A, then 🔒 B", state: "T2 now gets its locks and finishes too. Consistent lock ordering makes circular wait impossible.", ok: true },
    ],
  };
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-a="step">▶ Next step</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
        <span style="flex:1"></span>
        <button class="btn btn-small btn-rose" data-a="mode">Scenario: <b class="dl-mode">No lock ordering</b></button>
      </div>
      <div class="race-grid">
        <div class="thread-lane t1"><h5><span class="lane-dot"></span> Thread-1 (transfer A→B)</h5><div class="dl-t1 op-step">idle</div></div>
        <div class="thread-lane t2"><h5><span class="lane-dot"></span> Thread-2 (transfer B→A)</h5><div class="dl-t2 op-step">idle</div></div>
      </div>
      <div class="shared-box dl-state">▶ press Next step</div>
      <div class="demo-note">💡 Deadlock needs ALL FOUR conditions at once (Coffman): <b>mutual exclusion</b> (locks are exclusive), <b>hold-and-wait</b> (hold one, want another), <b>no preemption</b> (can't steal a lock), <b>circular wait</b> (A→B→A). Break ANY one — easiest is consistent lock ordering — and deadlock dies.</div>
    </div>`;
  const render = () => {
    const s = scripts[mode][step];
    $(".dl-t1", root).textContent = s.t1;
    $(".dl-t2", root).textContent = s.t2;
    $(".dl-t1", root).classList.toggle("active", !s.t1.startsWith("⏳"));
    $(".dl-t2", root).classList.toggle("active", !s.t2.startsWith("⏳"));
    $(".dl-state", root).innerHTML = (s.ok ? "🟢 " : "🔴 ") + s.state;
    $(".dl-state", root).style.borderColor = s.ok ? "var(--emerald)" : "var(--rose)";
    $(".dl-mode", root).textContent = mode === "bad" ? "No lock ordering" : "Consistent lock ordering";
    $("[data-a='mode']", root).className = "btn btn-small " + (mode === "bad" ? "btn-rose" : "btn-success");
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "step") { step = Math.min(step + 1, scripts[mode].length - 1); render(); }
    else if (a === "mode") { mode = mode === "bad" ? "good" : "bad"; step = 0; render(); }
    else { step = 0; render(); }
  });
  render();
};

/* ============================================================
   7) STREAM PIPELINE — data flowing through operations
   ============================================================ */
DEMOS.streamPipe = (root) => {
  let filterEven = true, mapDbl = true, sorted = true;
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary toggle" data-k="filterEven">filter(n % 2 == 0)</button>
        <button class="btn btn-small btn-primary toggle" data-k="mapDbl">map(n * 2)</button>
        <button class="btn btn-small btn-primary toggle" data-k="sorted">sorted()</button>
        <button class="btn btn-small btn-success" data-a="run">▶ collect()</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ reset</button>
      </div>
      <div class="panel" style="font-family:var(--mono);font-size:.9rem;overflow-x:auto">
        <code class="pipe-code"></code>
      </div>
      <div class="pipe-stages" style="display:flex;flex-direction:column;gap:10px;margin:14px 0"></div>
      <div class="demo-note sp-say">💡 Streams are <b>lazy</b>: toggling stages alone does NOTHING to the data. Only the terminal operation (<code>collect</code>) starts the flow. One pass through the pipeline, zero intermediate collections.</div>
    </div>`;
  const nums = [5, 3, 8, 1, 6, 2, 9, 4, 7];
  const stages = () => {
    const out = [];
    let cur = nums;
    out.push({ label: "source: List<Integer>", data: cur });
    if (filterEven) { cur = cur.filter ? cur.filter((n) => n % 2 === 0) : cur.filter((n) => n % 2 === 0); }
    if (filterEven) { cur = cur; }
    // recompute cleanly:
    cur = nums.slice();
    out.length = 0;
    out.push({ label: "source → stream(): " + JSON.stringify(nums), data: cur.slice() });
    if (filterEven) { cur = cur.filter((n) => n % 2 === 0); out.push({ label: "filter(n -> n % 2 == 0)", data: cur.slice() }); }
    if (mapDbl) { cur = cur.map((n) => n * 2); out.push({ label: "map(n -> n * 2)", data: cur.slice() }); }
    if (sorted) { cur = cur.slice().sort((a, b) => a - b); out.push({ label: "sorted()", data: cur.slice() }); }
    out.push({ label: "collect(Collectors.toList())  ← terminal op runs everything", data: cur.slice(), final: true });
    return out;
  };
  const draw = () => {
    $(".pipe-code", root).innerHTML =
      `<span class="kw">List</span>&lt;<span class="ty">Integer</span>&gt; result = nums.<span class="fn">stream</span>()` +
      (filterEven ? `<br>&nbsp;&nbsp;.<span class="fn">filter</span>(n -&gt; n % 2 == 0)` : "") +
      (mapDbl ? `<br>&nbsp;&nbsp;.<span class="fn">map</span>(n -&gt; n * 2)` : "") +
      (sorted ? `<br>&nbsp;&nbsp;.<span class="fn">sorted</span>()` : "") +
      `<br>&nbsp;&nbsp;.<span class="fn">collect</span>(Collectors.<span class="fn">toList</span>());`;
    $(".pipe-stages", root).innerHTML = stages().map((s, i) => `
      <div class="mem-obj ${s.final ? "heap" : "stack"}" style="flex-direction:column;align-items:flex-start;gap:6px">
        <b>${s.label}</b>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${s.data.map((n) => `<span class="lock-chip lock-free" style="margin:0">${n}</span>`).join("") || '<span class="tiny">(empty)</span>'}</div>
      </div>${i < stages().length - 1 ? '<div class="d-arrow center">⬇</div>' : ""}`).join("");
    $$(".toggle", root).forEach((b) => {
      const on = b.dataset.k === "filterEven" ? filterEven : b.dataset.k === "mapDbl" ? mapDbl : sorted;
      b.style.opacity = on ? "1" : "0.42";
    });
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k],[data-a]"); if (!b) return;
    if (b.dataset.k) {
      if (b.dataset.k === "filterEven") filterEven = !filterEven;
      if (b.dataset.k === "mapDbl") mapDbl = !mapDbl;
      if (b.dataset.k === "sorted") sorted = !sorted;
      $(".sp-say", root).innerHTML = "🧪 Pipeline changed — but nothing ran yet! Streams are <b>lazy</b>. Press <b>collect()</b> to actually execute.";
      draw();
    } else if (b.dataset.a === "run") {
      const last = stages().slice(-1)[0];
      $(".sp-say", root).innerHTML = `🏁 <b>Result: [${last.data.join(", ")}]</b> — one pass, no extra lists created. This declarative style ('what', not 'how') is why modern Java code is shorter and safer.`;
      draw();
    } else { filterEven = mapDbl = sorted = true; draw(); }
  });
  draw();
};

/* ============================================================
   8) THREAD LIFECYCLE — state machine
   ============================================================ */
DEMOS.threadLifecycle = (root) => {
  const states = {
    NEW: { d: "Created with new Thread(r) but not started yet.", next: [["▶ start()", "RUNNABLE"]] },
    RUNNABLE: { d: "Ready and running (or waiting for CPU time). The workhorse state.", next: [["🔒 blocked on a lock", "BLOCKED"], ["⏳ wait() / join()", "WAITING"], ["💤 sleep(ms) / wait(ms)", "TIMED_WAITING"], ["🏁 run() finishes", "TERMINATED"]] },
    BLOCKED: { d: "Waiting to ACQUIRE a monitor lock held by another thread.", next: [["🔓 lock becomes free", "RUNNABLE"]] },
    WAITING: { d: "Waiting indefinitely for another thread (wait() without timeout, join(), LockSupport.park()).", next: [["notify() / thread dies", "RUNNABLE"]] },
    TIMED_WAITING: { d: "Sleeping or waiting with a timeout — it WILL wake up on its own eventually.", next: [["⏰ timeout expires", "RUNNABLE"]] },
    TERMINATED: { d: "run() completed or crashed. A thread cannot be restarted!", next: [["↺ create a NEW Thread object", "NEW"]] },
  };
  let cur = "NEW";
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls"><button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button></div>
      <div class="d-row" style="margin:10px 0">${Object.keys(states).map((s) => `<div class="d-node tl-node" data-s="${s}" style="min-width:110px;cursor:pointer">${s}</div>`).join("")}</div>
      <div class="shared-box">
        <div class="tiny">current state</div>
        <div class="counter-val tl-cur" style="font-size:1.9rem">NEW</div>
        <div class="tiny tl-desc" style="margin:8px 0 12px"></div>
        <div class="btn-row" style="justify-content:center" class="tl-btns"></div>
        <div class="tl-btns" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"></div>
      </div>
      <div class="demo-note">💡 Only <b>RUNNABLE</b> threads consume CPU. <b>BLOCKED / WAITING</b> threads exist but pause — that is why 1000 threads can still be slow (context switching) and why deadlocked threads show as BLOCKED in a thread dump.</div>
    </div>`;
  const draw = () => {
    $(".tl-cur", root).textContent = cur;
    $(".tl-desc", root).textContent = states[cur].d;
    $$(".tl-node", root).forEach((n) => {
      n.style.borderColor = n.dataset.s === cur ? "var(--cyan)" : "var(--border)";
      n.style.background = n.dataset.s === cur ? "rgba(34,211,238,.16)" : "var(--panel)";
    });
    $(".tl-btns", root).innerHTML = states[cur].next.map((n) => `<button class="btn btn-small btn-primary" data-next="${n[1]}">${n[0]}</button>`).join("");
  };
  root.addEventListener("click", (e) => {
    const nx = e.target.closest("[data-next]");
    if (nx) { cur = nx.dataset.next; draw(); return; }
    const node = e.target.closest(".tl-node");
    if (node) { cur = node.dataset.s; draw(); return; }
    if (e.target.closest("[data-a='reset']")) { cur = "NEW"; draw(); }
  });
  draw();
};

/* ============================================================
   9) STRING POOL — interning visualizer
   ============================================================ */
DEMOS.stringPool = (root) => {
  root.innerHTML = `
    <div class="demo-body">
      <div class="demo-controls">
        <button class="btn btn-small btn-primary" data-a="literals">run: two LITERAL strings</button>
        <button class="btn btn-small btn-amber" data-a="news">run: new String(\"hi\") twice</button>
        <button class="btn btn-small btn-success" data-a="compare">run: == vs equals()</button>
        <button class="btn btn-small btn-ghost" data-a="reset">↺ Reset</button>
      </div>
      <div class="race-grid">
        <div class="mem-region"><h5>🫧 STRING POOL (inside the heap)</h5><div class="pool-area"></div></div>
        <div class="mem-region"><h5>🏗️ HEAP objects</h5><div class="sp-heap"></div></div>
      </div>
      <div class="panel" style="font-family:var(--mono);font-size:.86rem" id="sp-code"></div>
      <div class="demo-note sp-say">💡 <code>==</code> compares <b>identity</b> (same object?), <code>.equals()</code> compares <b>content</b> (same characters?). With literals, Java reuses pooled objects — that is why <code>==</code> can accidentally work… and then break with <code>new String()</code>.</div>
    </div>`;
  const scenarios = {
    reset: { pool: [], heap: [], code: "// press a button", say: "" },
    literals: {
      pool: ['"hello"  ← one shared object'],
      heap: [],
      code: `String a = "hello";<br>String b = "hello";<br>System.out.println(a == b);  // <b>true</b> — both point to the SAME pooled "hello"`,
      say: "🫧 Both variables reference ONE pooled object. Memory saved, and identity comparison works.",
    },
    news: {
      pool: ['"hello" (maybe)'],
      heap: ['String #1  "hello"', 'String #2  "hello"'],
      code: `String a = <b>new</b> String("hello");<br>String b = <b>new</b> String("hello");<br>System.out.println(a == b);  // <b>false</b> — two different heap objects!`,
      say: "🏗️ new always creates a fresh heap object (even with equal characters). Same content, different identity — use equals().",
    },
    compare: {
      pool: ['"hello"'],
      heap: ['String #1  "hello"  (from new)'],
      code: `String a = "hello";<br>String b = new String("hello");<br>System.out.println(a == b);       // <b>false</b> (different objects)<br>System.out.println(a.equals(b)); // <b>true</b>  (same characters)<br>System.out.println(a == b.<b>intern</b>()); // true — intern() returns the pooled copy`,
      say: "⚖️ Golden rule: NEVER use == for strings in real code (except you know both are literals). equals() is for content; == is for identity.",
    },
  };
  const draw = (key) => {
    const s = scenarios[key];
    $(".pool-area", root).innerHTML = s.pool.map((p) => `<div class="mem-obj heap"><span>${p}</span></div>`).join("") || '<div class="tiny">— empty —</div>';
    $(".sp-heap", root).innerHTML = s.heap.map((p) => `<div class="mem-obj heap"><span>${p}</span></div>`).join("") || '<div class="tiny">— empty —</div>';
    $("#sp-code", root).innerHTML = s.code;
    if (s.say) $(".sp-say", root).innerHTML = "🧠 " + s.say;
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    draw(b.dataset.a);
  });
  draw("reset");
};

/* ============================================================
   10) OOP PILLARS — interactive pillar explorer
   ============================================================ */
DEMOS.oopPillars = (root) => {
  const pillars = [
    { id: "enc", icon: "🔐", name: "Encapsulation", q: "Why hide data with private + getters?",
      demo: `<p>A <code>BankAccount</code> exposes <code>deposit()</code> / <code>getBalance()</code> but keeps <code>balance</code> private. Nobody can set balance to -1,000,000 — the object protects its own rules.</p>
      <pre style="font-family:var(--mono);font-size:.84rem;background:var(--code-bg);padding:12px;border-radius:9px;overflow-x:auto"><code>class BankAccount {
  <b>private</b> double balance;                    // hidden
  public void deposit(double amt) {
    if (amt &gt; 0) balance += amt;               // rules enforced HERE
  }
  public double getBalance() { return balance; } // read-only view
}</code></pre>` },
    { id: "inh", icon: "🌳", name: "Inheritance", q: "Why extend a class?",
      demo: `<p>Common code lives in the parent; children inherit and specialize. <code>ElectricCar</code> gets all of Car's abilities for free and adds <code>charge()</code>.</p>
      <div class="diagram"><div class="d-node">class Car <span class="sub">drive(), brake(), color</span></div><div class="d-arrow">↑ extends</div><div class="d-row"><div class="d-node">ElectricCar <span class="sub">+ charge()</span></div><div class="d-node">SportsCar <span class="sub">+ turboBoost()</span></div></div></div>` },
    { id: "poly", icon: "🎭", name: "Polymorphism", q: "Same call, different behavior?",
      demo: `<p>One <code>notify(user)</code> method on a Notification reference — the runtime picks EmailNotification, SMSNotification, or PushNotification. Add a new channel without touching the caller.</p>
      <pre style="font-family:var(--mono);font-size:.84rem;background:var(--code-bg);padding:12px;border-radius:9px;overflow-x:auto"><code>Notification n = new SMSNotification();
n.notify("ava");   // sends SMS — decided at RUNTIME
n = new EmailNotification();
n.notify("ava");   // sends Email — same call site!</code></pre>` },
    { id: "abst", icon: "🪄", name: "Abstraction", q: "Hide complexity, show the essential?",
      demo: `<p>You press <code>car.start()</code> — you don't manage fuel injection timing. A contract (<code>interface Engine { void start(); }</code>) defines WHAT, while each engine decides HOW.</p>
      <pre style="font-family:var(--mono);font-size:.84rem;background:var(--code-bg);padding:12px;border-radius:9px;overflow-x:auto"><code>interface PaymentGateway {           // the WHAT
  boolean pay(double amount);
}
class StripeGateway implements PaymentGateway {  // the HOW
  public boolean pay(double a) { /* call Stripe API */ }
}</code></pre>` },
  ];
  root.innerHTML = `
    <div class="demo-body">
      <div class="d-row" style="margin-bottom:14px">
        ${pillars.map((p) => `<button class="btn btn-small btn-primary pillar-btn" data-p="${p.id}">${p.icon} ${p.name}</button>`).join("")}
      </div>
      <div class="panel pillar-view"></div>
      <div class="demo-note">💡 Real systems use all four TOGETHER: abstraction defines contracts, encapsulation hides internals, inheritance reuses code, polymorphism lets callers stay dumb while behavior flexes.</div>
    </div>`;
  const show = (id) => {
    const p = pillars.find((x) => x.id === id);
    $(".pillar-view", root).innerHTML = `<h4 style="margin-bottom:8px">${p.icon} ${p.name} — <span class="muted" style="font-size:.92rem">${p.q}</span></h4>${p.demo}`;
    $$(".pillar-btn", root).forEach((b) => (b.style.opacity = b.dataset.p === id ? "1" : "0.5"));
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".pillar-btn"); if (b) show(b.dataset.p);
  });
  show("enc");
};

/* ============================================================
   11) EXCEPTION HIERARCHY explorer
   ============================================================ */
DEMOS.exceptionTree = (root) => {
  const tree = [
    { id: "throwable", n: "Throwable", d: "Root of everything that can be thrown. Rarely used directly — catch Exception or specific types.", ex: "catch (Throwable t) — too broad for most code" },
    { id: "error", n: "↳ Error", d: "Serious problems apps should NOT catch: OutOfMemoryError, StackOverflowError. Fix the bug, don't paper over it.", ex: "StackOverflowError: infinite recursion" },
    { id: "exception", n: "↳ Exception", d: "Problems worth handling: bad input, network failure. This is what your catch blocks usually target.", ex: "IOException, SQLException" },
    { id: "checked", n: "↳↳ Checked (compile-enforced)", d: "The compiler FORCES you to handle or declare these. They represent real-world surprises outside your control.", ex: "FileNotFoundException — must catch or add throws" },
    { id: "runtime", n: "↳↳ RuntimeException (unchecked)", d: "Usually programming bugs. No forcing — fixing the code is the cure, not the catch.", ex: "NullPointerException, ArrayIndexOutOfBoundsException" },
    { id: "custom", n: "↳↳ Your custom exception", d: "Create domain errors: InsufficientFundsException extends Exception. Carry meaning across layers.", ex: "class InsufficientFundsException extends Exception" },
  ];
  root.innerHTML = `
    <div class="demo-body">
      <div class="d-row" style="flex-wrap:wrap">${tree.map((t) => `<button class="btn btn-small btn-ghost ex-btn" data-id="${t.id}" style="text-align:left">${t.n}</button>`).join("")}</div>
      <div class="panel ex-view" style="margin-top:13px"></div>
      <div class="demo-note">💡 Rule of thumb: catch SPECIFIC exceptions, not <code>Exception</code>. Let programming bugs crash loudly in development; handle real-world failures gracefully in production.</div>
    </div>`;
  const show = (id) => {
    const t = tree.find((x) => x.id === id);
    $(".ex-view", root).innerHTML = `<h4 style="margin-bottom:8px">${t.n}</h4><p>${t.d}</p><p class="tiny" style="margin-top:8px">example: <code>${t.ex}</code></p>`;
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest(".ex-btn"); if (b) show(b.dataset.id);
  });
  show("throwable");
};

/* ============================================================
   12) ENCAPSULATION vault demo
   ============================================================ */
DEMOS.vault = (root) => {
  let balance = 1000, log = [];
  root.innerHTML = `
    <div class="demo-body">
      <div class="race-grid">
        <div class="thread-lane t1">
          <h5>🏦 Account (encapsulated)</h5>
          <div class="tiny">private double balance = <b class="bal">1000</b>; <span class="tiny">(nobody outside can touch this directly)</span></div>
          <div class="btn-row" style="margin-top:12px">
            <button class="btn btn-small btn-success" data-a="dep">deposit(500)</button>
            <button class="btn btn-small btn-amber" data-a="wd">withdraw(200)</button>
            <button class="btn btn-small btn-rose" data-a="hack">⚠ balance = -999999</button>
            <button class="btn btn-small btn-ghost" data-a="reset">↺</button>
          </div>
        </div>
        <div class="thread-lane t2">
          <h5>📜 Audit log (what the API allows)</h5>
          <div class="op-steps vault-log"><div class="op-step">— interactions appear here —</div></div>
        </div>
      </div>
      <div class="demo-note v-say">💡 The <code>hack</code> button represents doing <code>account.balance = -999999</code> from outside — in a well-encapsulated class this is a COMPILE ERROR. Only the class's own methods can change state, and they enforce the rules.</div>
    </div>`;
  const draw = () => {
    $(".bal", root).textContent = balance;
    $(".vault-log", root).innerHTML = log.slice(-6).map((l) => `<div class="op-step active">${l}</div>`).join("") || '<div class="op-step">— interactions appear here —</div>';
  };
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-a]"); if (!b) return;
    const a = b.dataset.a;
    if (a === "dep") { balance += 500; log.push("deposit(500) → balance = " + balance + " ✅"); $(".v-say", root).innerHTML = "✅ deposit() validated amt &gt; 0 and updated state — the rules held."; }
    if (a === "wd") {
      if (balance >= 200) { balance -= 200; log.push("withdraw(200) → balance = " + balance + " ✅"); $(".v-say", root).innerHTML = "✅ withdraw() checked funds first. Business rules live INSIDE the object."; }
      else { log.push("withdraw(200) → REJECTED: insufficient funds ⛔"); $(".v-say", root).innerHTML = "⛔ Insufficient funds — the object enforced its invariant."; }
    }
    if (a === "hack") { log.push("account.balance = -999999 → ⛔ COMPILE ERROR (private!)"); $(".v-say", root).innerHTML = "⛔ <b>Compile error:</b> balance has private access. Encapsulation made the invalid state impossible to express."; }
    if (a === "reset") { balance = 1000; log = []; }
    draw();
  });
  draw();
};

/* ============================================================
   Mount helper — called by app.js after rendering a lesson
   ============================================================ */
function mountDemo(name, root, options) {
  if (DEMOS[name]) {
    try { DEMOS[name](root, options); }
    catch (err) { root.innerHTML = `<div class="demo-body tiny">Demo failed to load: ${err.message}</div>`; console.error(err); }
  } else {
    root.innerHTML = `<div class="demo-body tiny">Unknown demo: ${name}</div>`;
  }
}
