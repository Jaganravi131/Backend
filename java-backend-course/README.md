# Java Backend Development — Interactive Course Notes

Interactive, PowerPoint-style slide decks with detailed notes for the **24-session
"Java Backend Development Course With IBM Certification" syllabus** published by
GeeksforGeeks. Every brochure topic is taught with **theory** (concepts, diagrams,
internals) **and practice** (working code with expected output, hands-on labs,
quizzes), session by session, in the brochure's order — plus a **FAANG-level interview
track** layered on top: deep-dive lessons, timed coding rounds with verified solutions,
system-design rounds, interview Q&A with model answers, harder quizzes, mock interviews and
behavioral preparation.

> Independent study companion built from the public course brochure. It is **not** an
> official GeeksforGeeks or IBM publication, and uses no GeeksforGeeks branding.

| | |
|---|---|
| **Modules** | 4 decks: Core Java & OOP · Spring Boot, REST & Databases · Testing, Security & Microservices Intro · Microservices, Messaging & Major Project |
| **Sessions** | 24, with **402 content slides** (+ module and session cover slides) |
| **Theory / practice** | 118 theory, 104 practical, 24 labs (with interview-grade stretch goals), 24 quizzes (244 questions), 24 summaries with flashcards, 6 project slides |
| **Interview track** | 40 deep-dive lessons · 25 coding rounds (11 Hard, 14 Medium) · 13 design rounds (10 HLD, 3 LLD) · 240 interview Q&As graded SDE-1 / SDE-2 / Senior · 121 interview-level quiz questions |
| **Code** | 278 code blocks; **138 runnable Java programs compiled and executed, 134 with output verified** against the slides, plus 4 SQL queries verified on SQLite |
| **Diagrams** | 108 (flows, sequence diagrams, state machines, ERDs, architecture tiers, hash buckets…) |
| **Projects** | Splitwise backend (S12–13), Splitwise + Cursor AI agents (S17), Airbnb backend (S21–24) |
| **Coverage** | 32/32 brochure topics mapped to sessions (see the in-app *Syllabus map*) |

## Run it

No build step and no runtime dependencies — it is a static site.

```bash
# Option 1: open the file directly
open index.html                 # or double-click it

# Option 2: serve the folder (recommended)
python3 -m http.server 8000     # then visit http://localhost:8000
```

### Using the decks

- **Home** → roadmap of the 4 modules, journey, skills, tech stack and projects (from the brochure).
- **Syllabus map** → every brochure topic (verbatim) → the session(s) teaching it, with theory/practical/lab/quiz counts.
- **Module decks** → sidebar per session, detailed notes under every slide, copy buttons and *Show output* on code, quizzes with explanations, lab checklists, flashcards.
- **Keyboard:** `→`/`←` (or Space/PageUp/PageDown) navigate · `N` notes · `O` overview · `F` present (fullscreen) · `S` slide list · `/` or `Ctrl+K` search · `T` theme · `?` help. Swipe on touch devices.
- **Print / PDF:** *Print* in a deck opens a print-optimised view of the whole module (notes expanded, quiz answers shown) → *Save as PDF*.
- **PowerPoint:** each module is also available as a `.pptx` with speaker notes in [`downloads/`](downloads/).
- **Interview prep** (`#/interview`) → the FAANG-level track: the interview loop, how to run each round, level expectations and a 12-week plan; a filterable coding-round tracker; design rounds; a searchable bank of all 240 Q&As; a **mock-interview generator** with a timer; 23 DSA patterns with Java templates; behavioral (STAR) prompts mapped to the course projects.
- Progress (viewed slides, quiz answers, lab checklists, interview self-ratings and scratchpad notes) is stored only in your browser (`localStorage`).

## FAANG-level interview track

Every session ends with interview-grade material, inserted around its lab (the brochure
mapping and the original slides are unchanged):

- **Deep dives** (🔬) before the lab — internals interviewers probe: JIT and object layout, GC,
  HashMap/ConcurrentHashMap, the JMM, virtual threads, Spring proxies, InnoDB MVCC, indexes,
  JPA flushing, Redis, Kafka, OAuth/JWT attacks, sagas, deployments, SRE maths…
- **Coding round** (⌨️) — a timed problem with examples, constraints, progressive hints,
  approaches with complexities, a reference solution (hidden until revealed) that the test
  suite compiles and runs — usually with a randomized comparison against a brute force —
  pitfalls, follow-ups with answers, the interviewer's rubric, and a self-rating.
- **Design round** (🏛️, 13 sessions) — HLD or LLD prompts revealed stage by stage
  (requirements, estimates, API, data model, architecture, deep dives), with follow-ups and a rubric.
- **Interview Q&A** (🎯) — 10 questions per session with level badges, model answers,
  likely follow-ups and red flags; filter by level, rate yourself, reveal one or all.
- **Harder quiz questions** — including predict-the-output programs whose real output is
  verified to match the marked answer.

| S | Coding round | LeetCode | Level | Design round |
|---|---|---|---|---|
| 1 | Longest consecutive sequence | 128 | Medium | — |
| 2 | Flatten a nested list lazily (iterator) | 341 | Medium | Parking lot (LLD) |
| 3 | Expression calculator with precedence & parentheses | 772 | Hard | — |
| 4 | Merge k sorted lists (+ generic lazy merge) | 23 | Hard | — |
| 5 | LRU cache | 146 | Medium | — |
| 6 | Bounded blocking queue | 1188 | Medium | Thread pool executor (LLD) |
| 7 | Build order for a multi-module project | 210 | Medium | — |
| 8 | HTTP route matcher (trie) | — | Medium | URL shortener |
| 9 | Mini AOP framework (`@Retry`, `@Timed`) · Shortest incident window | — · 76 | Medium · Hard | — |
| 10 | Top three salaries per department (SQL) | 185 | Hard | — |
| 11 | Serialize & deserialize a tree | 297 | Hard | — |
| 12 | Merge duplicate accounts (union-find) | 721 | Medium | Splitwise (LLD) |
| 13 | Optimal account balancing | 465 | Hard | — |
| 14 | Ship packages within D days | 1011 | Medium | — |
| 15 | LFU cache | 460 | Hard | Distributed cache |
| 16 | Thread-safe token-bucket rate limiter | — | Medium | Distributed rate limiter |
| 17 | Minimal line diff (LCS) | — | Medium | — |
| 18 | Effective permissions in a role hierarchy | — | Medium | Auth & SSO for microservices |
| 19 | Network delay (Dijkstra) | 743 | Medium | Monolith → microservices |
| 20 | Sliding-window maximum (+ streaming) | 239 | Hard | Notification system |
| 21 | Room inventory with a sweep line | 732 | Hard | Airbnb search |
| 22 | Maximise host revenue (weighted interval scheduling) | 1235 | Hard | Payment system |
| 23 | Smooth weighted round-robin & power of two choices | — | Medium | API gateway |
| 24 | Running median & mergeable p99 histogram | 295 | Hard | Metrics & alerting platform |

LeetCode numbers mark problems that are the same as (or a direct generalisation of) the
public LeetCode problem; no claims are made about which companies ask which questions.

## Curriculum (suggested session mapping)

The brochure groups topics by module; sessions follow the brochure's topic order and the
anchors stated in its FAQ (Session 1 starts with Java architecture & OOP, Spring Boot from
Session 8, Splitwise in Sessions 12–13 and 17, Airbnb in Sessions 21–24).

| Module | Sessions |
|---|---|
| **1 · Core Java & OOP Fundamentals** | S1 JVM architecture & OOP · S2 Abstract classes, interfaces & exceptions · S3 Singleton, propagation & lambdas · S4 Collections, queues & generics · S5 Streams, HashMap & hashing · S6 Multithreading, executors & Maven |
| **2 · Spring Boot, REST & Databases** | S7 Maven plugins, archetypes & setup · S8 Spring Boot, MVC & HTTP methods · S9 REST design, AOP & Lombok · S10 JDBC, JdbcTemplate & CRUD · S11 Hibernate, Spring Data JPA & relationships · S12 Splitwise Part 1 |
| **3 · Testing, Security & Microservices Intro** | S13 Splitwise Part 2 · S14 JUnit 5, Mockito & MockMvc · S15 Redis caching, cookies & HTTP caches · S16 Spring Security & DB authentication · S17 Splitwise + Cursor AI agents · S18 OAuth 2.0 & GitHub login |
| **4 · Microservices, Messaging & Major Project** | S19 Monolith vs microservices & Feign · S20 Kafka, Spring Cloud & circuit breakers · S21 Airbnb HLSD & data model · S22 Booking workflows & sagas · S23 Gateway, Docker & deployment · S24 Observability, performance & production |

## Technology versions (verified October 2026)

Java 21 LTS (also runs on 25 LTS) · Spring Boot 4.1.x / Spring Framework 7 · Spring Cloud
2025.1.x · Maven 3.9/3.10 · MySQL 8.4 LTS · Redis 7 · Apache Kafka 4.x in KRaft mode ·
JUnit 6 (Jupiter API) · Testcontainers 2 · Resilience4j 2.4.

The notes call out the Spring Boot 4 changes that trip people up — e.g.
`spring-boot-starter-webmvc` (was `-web`), `spring-boot-starter-aspectj` (was `-aop`),
`@MockitoBean` (replaces `@MockBean`), `spring-boot-starter-webmvc-test`, Jackson 3
(`tools.jackson`), Gateway 5 routes under `spring.cloud.gateway.server.webflux`,
`JacksonJsonSerializer` for Spring Kafka 4, and Hystrix shown only as legacy (circuit
breakers are implemented with Resilience4j).

## Project structure

```
java-backend-course/
├── index.html                 # entry point (loads content + engine; works from file://)
├── assets/
│   ├── css/styles.css         # dark/light themes, deck layout, print styles
│   ├── js/app.js              # router, decks, notes, quizzes, labs, search, print, progress
│   ├── js/diagrams.js         # dependency-free SVG/HTML diagram renderer
│   ├── js/md.js               # tiny markdown subset for slide text
│   └── vendor/highlight/      # highlight.js 11 (BSD-3) for offline syntax highlighting
├── content/
│   ├── course.js              # brochure data (verbatim), modules, topics, projects, versions
│   ├── module-1 … module-4/   # one file per session: s01-*.js … s24-*.js
│   └── interview/             # FAANG track: track.js (hub content) + one pack per session (s01-*.js …)
├── downloads/                 # generated .pptx decks (npm run build:pptx)
└── tools/
    ├── validate.mjs           # structure, syllabus coverage, theory+practice balance, API lint
    ├── render-test.mjs        # jsdom: renders every page and slide, exercises widgets
    ├── verify-java.mjs        # compiles & runs Java examples, diffs output with the slides
    ├── verify-sql.mjs         # runs SQL rounds on in-memory SQLite (node:sqlite), diffs result tables
    ├── build-pptx.mjs         # builds the 4 PowerPoint decks with speaker notes
    └── load-course.mjs        # loads content exactly like the browser (Node VM)
```

## Quality checks

```bash
npm install                    # dev tools only: jsdom, pptxgenjs, jszip
npm run validate               # every topic covered, every session has theory/practical/lab/quiz/summary,
                               # every slide has notes, quizzes valid, no outdated APIs in code samples
npm run test:render            # renders all 4 decks + pages headlessly; fails on any runtime error
npm run verify:java            # needs a JDK on PATH (or JAVAC="javac --release 21" JAVA=java)
npm run verify:sql             # SQL rounds on SQLite (Node 22.13+, no extra install)
npm run check                  # validate + render test + SQL verification
npm run build:pptx             # regenerates downloads/*.pptx (PPTX_OUT=/tmp/x for a dry run)
```

The **API lint** in `validate.mjs` rejects code samples that use removed or outdated APIs
(`@MockBean`, `WebSecurityConfigurerAdapter`, `antMatchers`, `javax.*`,
`spring-boot-starter-web`, ZooKeeper, `spring.cloud.gateway.routes`, `@HystrixCommand`
outside legacy examples, …). Opt out per block with `legacy: true` or `lint: false`.

`verify-java.mjs` compiles every self-contained Java example (a `main` method and JDK-only
imports), runs it and compares the real output with the slide's `out`. Per code tab:
`verify: false` skips it (fragments, pseudo-code); `verify: 'run'` runs it without comparing
the output (it varies per run, e.g. thread races) but it must still exit cleanly;
`verify: 'compile'` only compiles it (it needs an outside service such as MySQL). Spring,
Kafka and Redis samples need Maven dependencies, so this script does not compile them.
It also covers coding-round solutions, code inside interview answers and design stages,
and predict-the-output quiz programs (`quiz[].code.out`); `validate.mjs` checks that such
an output equals the option marked as the answer and that no other option does.
Run it in parallel with `--jobs N`, or for one session with `--session N`.

`verify-sql.mjs` is opt-in: a slide's SQL tabs marked `setup: true` (schema and data) run
first on an in-memory SQLite database, then every SQL tab with an `out` is executed and its
result table compared. The queries are portable SQL that MySQL 8 runs unchanged.

For interview content, `validate.mjs` also checks each pack: at least one deep dive, a coding
round (difficulty, hints, ≥ 2 approaches with complexities, a runnable solution with
expected output, pitfalls, follow-ups, rubric), an interview slide with ≥ 8 questions
(levels, model answers of real length, ≥ 4 SDE-2/Senior and ≥ 2 Senior questions),
≥ 10 quiz questions per session with ≥ 4 interview-level ones, lab stretch goals, design
rounds with ≥ 5 stages and a diagram, and pattern ids that exist in the hub.

## Authoring a slide

Each session file calls `COURSE.session({...})`:

```js
COURSE.session({
  no: 5, short: 'Streams, HashMap & hashing', title: 'Streams API, HashMap Internals & Hashing',
  covers: [5],                         // indexes into the module's brochure topics
  objectives: ['…', '…', '…'],
  slides: [{
    type: 'practical',                 // theory | practical | lab | quiz | summary | project
    title: 'Collectors: grouping & partitioning',
    lead: 'One-sentence takeaway.',
    points: ['bullet with `code` and **bold**', ['sub-bullet']],
    diagram: { kind: 'flow', nodes: ['A', 'B'] },   // flow, layers, tree, seq, graph, tiers, compare, grid, erd, buckets, pyramid
    code: { lang: 'java', file: 'Demo.java', src: code`…`, out: code`…` },   // array = tabs
    table: { head: ['…'], rows: [['…']] },
    callout: { kind: 'tip', text: '…' },             // tip | warn | info | version | interview | pitfall | best
    steps: ['lab step', '…'],                          // persisted checklist
    quiz: [{ q: '…', options: ['…'], answer: 1, why: '…' }],
    cards: [['term', 'definition']],
    notes: ['paragraph', '- bullet']                   // the detailed notes / speaker notes
  }]
});
```

Interview packs live in `content/interview/sNN-*.js` and call `COURSE.prep(no, {...})`
(they are listed after the sessions in `index.html`, between `@prep:start` and `@prep:end`):

```js
COURSE.prep(5, {
  deepDives: [{ title: 'Deep dive: …', points: ['…'], code: {…}, notes: ['…'] }],  // inserted before the lab
  stretch: ['interview-grade lab goal', '…'],                                      // appended to the lab slide
  rounds: [                                                                        // inserted after the lab
    { type: 'coding', title: '…', difficulty: 'Hard', minutes: 40, lc: 146, pattern: ['design', 'hashing'],
      problem: ['…'], examples: [{ in: '…', out: '…', why: '…' }], constraints: ['…'], hints: ['…', '…'],
      approaches: [{ name: '…', idea: '…', time: 'O(n)', space: 'O(1)' }], code: { lang: 'java', src: code`…`, out: code`…` },
      pitfalls: ['…'], followUps: [{ q: '…', a: '…' }], rubric: ['…'], notes: ['…'] },
    { type: 'design', kind: 'HLD', difficulty: 'Hard', minutes: 45, title: '…', prompt: '…',
      stages: [{ t: 'Requirements', ask: '…', points: ['…'], diagram: {…}, table: {…}, code: {…} }],
      followUps: [{ q: '…', a: '…' }], rubric: ['…'], notes: ['…'] },
    { type: 'interview', title: '…', qa: [{ level: 2, q: '…', a: '…', follow: ['…'], flags: ['…'], code: {…} }], notes: ['…'] }
  ],
  quiz: [{ level: 3, q: 'What does this print?', code: { src: code`…`, out: '…' }, options: ['…'], answer: 1, why: '…' }]
});
```

Code blocks use the `code` template tag: text is taken raw (backslashes stay as typed) and
dedented. Write `\${` for a literal `${` and `` \` `` for a backtick. Prose strings use
double quotes so backticks and apostrophes need no escaping.

## Deploying

It is plain static files, so any static host works (GitHub Pages, Netlify, S3 + CloudFront,
nginx). For GitHub Pages, publish this folder with the official *Upload Pages artifact*
workflow (`actions/upload-pages-artifact` with `path: java-backend-course`) or copy the
folder to a `docs/` directory on a publishing branch.

## Credits

- Syllabus, module descriptions, skills, tech stack and project briefs: GeeksforGeeks
  course brochure (quoted verbatim where marked).
- Syntax highlighting: [highlight.js](https://highlightjs.org/) (BSD-3-Clause, see
  `assets/vendor/highlight/LICENSE`).
- PowerPoint export: [PptxGenJS](https://gitbrent.github.io/PptxGenJS/).
