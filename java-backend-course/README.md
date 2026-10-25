# Java Backend Development — Interactive Course Notes

Interactive, PowerPoint-style slide decks with detailed notes for the **24-session
"Java Backend Development Course With IBM Certification" syllabus** published by
GeeksforGeeks. Every brochure topic is taught with **theory** (concepts, diagrams,
internals) **and practice** (working code with expected output, hands-on labs,
quizzes), session by session, in the brochure's order.

> Independent study companion built from the public course brochure. It is **not** an
> official GeeksforGeeks or IBM publication, and uses no GeeksforGeeks branding.

| | |
|---|---|
| **Modules** | 4 decks: Core Java & OOP · Spring Boot, REST & Databases · Testing, Security & Microservices Intro · Microservices, Messaging & Major Project |
| **Sessions** | 24, with **300 content slides** (+ module and session cover slides) |
| **Theory / practice** | 118 theory, 104 practical, 24 labs, 24 quizzes (123 questions), 24 summaries with flashcards, 6 project slides |
| **Code** | 220 code examples; **48 runnable Java programs compiled and executed, 44 with output verified** against the slides |
| **Diagrams** | 85 (flows, sequence diagrams, state machines, ERDs, architecture tiers, hash buckets…) |
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
- Progress (viewed slides, quiz answers, lab checklists) is stored only in your browser (`localStorage`).

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
│   └── module-1 … module-4/   # one file per session: s01-*.js … s24-*.js
├── downloads/                 # generated .pptx decks (npm run build:pptx)
└── tools/
    ├── validate.mjs           # structure, syllabus coverage, theory+practice balance, API lint
    ├── render-test.mjs        # jsdom: renders every page and slide, exercises widgets
    ├── verify-java.mjs        # compiles & runs Java examples, diffs output with the slides
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
npm run build:pptx             # regenerates downloads/*.pptx
```

The **API lint** in `validate.mjs` rejects code samples that use removed or outdated APIs
(`@MockBean`, `WebSecurityConfigurerAdapter`, `antMatchers`, `javax.*`,
`spring-boot-starter-web`, ZooKeeper, `spring.cloud.gateway.routes`, `@HystrixCommand`
outside legacy examples, …). Opt out per block with `legacy: true` or `lint: false`.

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
