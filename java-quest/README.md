# ☕ Java Quest — Gamified Java Learning Website

Learn Java **from your first line of code to JVM internals** — in one continuous, gamified flow.
Built as a pure HTML/CSS/JS static site: no build step, no dependencies, no internet required.

## ▶ How to run

Option A — just open it:

```bash
# double-click index.html, or:
open index.html          # macOS
xdg-open index.html      # Linux
```

Option B — serve it (recommended, works everywhere):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

Progress (XP, badges, streak, completions) is saved in your browser's `localStorage`.

## 🗺️ What's inside — the 9 worlds

| # | World | Covers |
|---|-------|--------|
| 0 | ☕ Prologue | what Java is · JVM/JRE/JDK · bytecode · JIT · your first program · how Java runs |
| 1 | 🧱 Foundations | variables · 8 primitive types · casting · overflow · operators · control flow · loops · arrays · algorithms · strings · input |
| 2 | 🏛️ OOP Palace | classes/objects · constructors · **encapsulation** · **inheritance** · **polymorphism** (dynamic dispatch) · **abstraction** · design lab · static/final · equals/hashCode contract |
| 3 | 🧰 Core Toolbox | packages · access control · **exceptions** · wrappers/autoboxing · enums · annotations · **generics** (erasure, PECS) |
| 4 | 🗃️ Collections | List/Set/Queue/Map · ArrayList vs LinkedList · **HashMap internals** (buckets, collisions, resize) · Comparable/Comparator |
| 5 | ⚡ Concurrency | threads · lifecycle · **race conditions (live simulator)** · **synchronization & happens-before** · volatile · wait/notify · **deadlock/livelock/starvation** · executors · atomics/CAS · concurrent collections |
| 6 | 🌊 Modern Java | lambdas · functional interfaces · **streams** · Optional · java.time · records · sealed · text blocks · var · switch expressions |
| 7 | 🧠 JVM Internals | memory model (stack/heap/metaspace) · **garbage collection** · class loading · reflection · file I/O · serialization · performance · SOLID · design patterns |
| 8 | 🏔️ Summit | JDBC & SQL injection · capstone system design · Final Gauntlet + certificate |

## ✨ Features

- **43 story-driven lessons** — every technical term explained inline (173-term glossary with hover tooltips)
- **12 interactive visual simulators**, including:
  - 🔬 **Race Condition Lab** — step through thread interleaving, watch lost updates, flip to `synchronized` and watch the count become correct
  - 🧠 Stack/Heap memory walker · 🎭 dynamic dispatch · #️⃣ HashMap bucket collisions · 🧹 GC reachability · 💀 deadlock formation & prevention · 🌊 stream pipelines · thread lifecycle · string pool · OOP pillars · exception hierarchy · encapsulation vault
- **141 checkpoint questions** in 8 styles: MCQ, multi-select, true/false, fill-in, predict-the-output, code-fix, ordering, and write-code
- **16 implementable coding challenges** with live pattern-based evaluation, hints, and reference solutions
- **Practice Arena** — 12 standalone katas (easy → hard) across the whole syllabus
- **Gamification** — XP, 12 ranks, daily streaks, 19 badges, progress rings, level-up confetti
- **Final Gauntlet** — 20-question exam + printable certificate

## 📁 Structure

```
java-quest/
├── index.html              # app shell
├── css/styles.css          # gamified theme
└── js/
    ├── glossary.js         # 173 plain-English term definitions
    ├── interactives.js     # 12 visual simulators
    ├── content-foundations.js  # Worlds 0–1
    ├── content-oop.js          # World 2 (OOP palace)
    ├── content-core.js         # Worlds 3–4
    ├── content-concurrency.js  # World 5 (races, locks, deadlock)
    ├── content-modern.js       # World 6
    ├── content-internals.js    # Worlds 7–8
    ├── arena.js            # practice katas
    └── app.js              # engine: routing, quizzes, XP, badges
```

Course flow follows the **GeeksforGeeks Java syllabus** plus the essential extras every real
Java developer must know (equals/hashCode contract, happens-before, type erasure/PECS,
HashMap internals, CAS, SOLID, design patterns, JDBC safety).
