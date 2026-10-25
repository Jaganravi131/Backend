#!/usr/bin/env node
// Content validator: structure, syllabus coverage, theory+practical balance,
// and a "2026 accuracy" lint for outdated APIs in code samples.
//   node tools/validate.mjs            (full check — all 24 sessions required)
//   node tools/validate.mjs --partial  (while writing: skip missing files)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadCourse, sessionFiles } from './load-course.mjs';

const partial = process.argv.includes('--partial');
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

let loaded;
try {
  loaded = loadCourse({ partial });
} catch (e) {
  console.error('\u274C Failed to load content:\n' + (e.stack || e.message));
  process.exit(1);
}
const { COURSE, MD, DG, missing } = loaded;

// every content file on disk must be listed in index.html
const listed = new Set(sessionFiles());
for (const dir of fs.readdirSync(path.join(ROOT, 'content'))) {
  const full = path.join(ROOT, 'content', dir);
  if (!fs.statSync(full).isDirectory()) continue;
  for (const f of fs.readdirSync(full)) {
    if (f.endsWith('.js') && !listed.has(`content/${dir}/${f}`)) err(`content/${dir}/${f} exists but is not listed in index.html`);
  }
}

const TYPES = Object.keys(COURSE.types);
const LINT = [
  [/spring-boot-starter-web<\/artifactId>/, 'spring-boot-starter-web was renamed spring-boot-starter-webmvc in Boot 4'],
  [/spring-boot-starter-aop\b/, 'spring-boot-starter-aop was renamed spring-boot-starter-aspectj in Boot 4'],
  [/@MockBean\b|@SpyBean\b/, '@MockBean/@SpyBean were removed in Boot 4 \u2014 use @MockitoBean/@MockitoSpyBean'],
  [/WebSecurityConfigurerAdapter/, 'WebSecurityConfigurerAdapter is gone \u2014 use a SecurityFilterChain bean'],
  [/\bantMatchers\(|\bmvcMatchers\(|authorizeRequests\(/, 'use authorizeHttpRequests(...).requestMatchers(...) (lambda DSL)'],
  [/\.and\(\)\s*\./, 'the .and() chaining style is removed in Spring Security 7 \u2014 use the lambda DSL'],
  [/\bjavax\.(persistence|servlet|validation|annotation\.PostConstruct)/, 'use jakarta.* packages'],
  [/spring\.cloud\.gateway\.routes/, 'Gateway 5 binds spring.cloud.gateway.server.webflux.routes'],
  [/kafka\.support\.serializer\.Json(De)?[Ss]erializer\b/, 'use JacksonJsonSerializer/JacksonJsonDeserializer (Spring Kafka 4)'],
  [/GenericJackson2JsonRedisSerializer/, 'use GenericJacksonJsonRedisSerializer (Spring Data Redis 4 / Jackson 3)'],
  [/com\.fasterxml\.jackson\.databind/, 'Jackson 3 lives in tools.jackson.* (annotations stay in com.fasterxml.jackson.annotation)'],
  [/zookeeper/i, 'Kafka 4 runs in KRaft mode \u2014 no ZooKeeper'],
  [/^version:\s*['"]?3/m, 'the top-level compose "version" key is obsolete'],
  [/@HystrixCommand|spring-cloud-starter-netflix-hystrix/, 'Hystrix is retired \u2014 only allowed in code marked legacy:true'],
  [/@EnableEurekaClient/, '@EnableEurekaClient no longer exists (client auto-registers)'],
  [/new Date\(\)|SimpleDateFormat/, 'prefer java.time (Instant/LocalDate/DateTimeFormatter)']
];

const seen = new Set();
const strOk = (s) => typeof s === 'string' && s.trim().length > 0;
function checkInline(where, s) {
  try { MD.inline(s); } catch (e) { err(`${where}: markdown error ${e.message}`); }
  if (/\$\{/.test(s) && !/`[^`]*\$\{[^`]*`/.test(s)) warn(`${where}: contains \${ outside inline code`);
}

for (const s of COURSE.sessions) {
  const where = `S${s.no}`;
  if (seen.has(s.no)) err(`${where}: duplicate session number`);
  seen.add(s.no);
  const m = COURSE.moduleOf(s.no);
  if (!m) { err(`${where}: no module for session number`); continue; }
  if (!strOk(s.title)) err(`${where}: missing title`);
  if (!strOk(s.short)) err(`${where}: missing short title`);
  if (!Array.isArray(s.objectives) || s.objectives.length < 3) err(`${where}: needs >= 3 objectives`);
  if (!Array.isArray(s.covers) || !s.covers.length) err(`${where}: covers[] empty`);
  (s.covers || []).forEach((i) => { if (!(i >= 0 && i < m.topics.length)) err(`${where}: invalid topic index ${i}`); });
  if (!Array.isArray(s.slides) || s.slides.length < 8) err(`${where}: needs >= 8 slides (has ${s.slides ? s.slides.length : 0})`);
  const counts = {};
  (s.slides || []).forEach((sl, i) => {
    const w = `${where} slide ${i + 1} "${sl && sl.title}"`;
    if (!sl || typeof sl !== 'object') { err(`${w}: not an object`); return; }
    counts[sl.type] = (counts[sl.type] || 0) + 1;
    if (!TYPES.includes(sl.type)) err(`${w}: invalid type ${sl.type}`);
    if (!strOk(sl.title)) err(`${w}: missing title`);
    const notes = [].concat(sl.notes || []).join(' ');
    if (notes.length < 120) err(`${w}: notes too short (${notes.length} chars)`);
    [sl.title, sl.lead, ...[].concat(sl.notes || [])].filter(Boolean).forEach((x) => checkInline(w, x));
    const flatPts = (a) => (a || []).flatMap((x) => (Array.isArray(x) ? flatPts(x) : [x]));
    flatPts(sl.points).forEach((p) => { if (!strOk(p)) err(`${w}: empty point`); else checkInline(w, p); });
    if (sl.code) {
      [].concat(sl.code).forEach((c, k) => {
        if (!c || !strOk(c.src)) { err(`${w}: code[${k}] missing src`); return; }
        if (!strOk(c.lang)) err(`${w}: code[${k}] missing lang`);
        if (/\t/.test(c.src)) warn(`${w}: code[${k}] contains tab characters`);
        if (!c.legacy) for (const [re, msg] of LINT) if (re.test(c.src)) err(`${w}: code[${k}] ${msg}`);
      });
    }
    if (sl.diagram) {
      try { DG.render(sl.diagram); } catch (e) { err(`${w}: diagram error ${e.message}`); }
    }
    if (sl.table) {
      const n = sl.table.head.length;
      sl.table.rows.forEach((r, k) => { if (r.length !== n) err(`${w}: table row ${k} has ${r.length} cells, expected ${n}`); });
    }
    if (sl.quiz) {
      if (sl.quiz.length < 3) err(`${w}: quiz needs >= 3 questions`);
      sl.quiz.forEach((q, k) => {
        if (!strOk(q.q)) err(`${w}: quiz ${k} missing q`);
        if (!Array.isArray(q.options) || q.options.length < 3) err(`${w}: quiz ${k} needs >= 3 options`);
        else if (!(q.answer >= 0 && q.answer < q.options.length)) err(`${w}: quiz ${k} bad answer index`);
        if (!strOk(q.why)) err(`${w}: quiz ${k} missing explanation (why)`);
      });
    }
    if (sl.steps && (!Array.isArray(sl.steps) || !sl.steps.every(strOk))) err(`${w}: steps must be non-empty strings`);
    if (sl.cards && !sl.cards.every((c) => Array.isArray(c) && c.length === 2)) err(`${w}: cards must be [front, back] pairs`);
    if (sl.callout) [].concat(sl.callout).forEach((c) => { if (!strOk(c.text)) err(`${w}: callout missing text`); });
  });
  for (const t of ['theory', 'practical', 'quiz', 'summary']) if (!counts[t]) err(`${where}: needs at least one ${t} slide`);
  if (!(s.slides || []).some((x) => x.steps)) err(`${where}: needs a hands-on lab (slide with steps)`);
}

for (let n = 1; n <= 24; n++) if (!seen.has(n) && !partial) err(`Session ${n} missing`);

// coverage + brochure order
let topics = 0, covered = 0;
for (const m of COURSE.modules) {
  let prevFirst = 0;
  m.topics.forEach((t, i) => {
    topics++;
    const ss = COURSE.sessions.filter((s) => s.no >= m.sessions[0] && s.no <= m.sessions[1] && (s.covers || []).includes(i)).map((s) => s.no);
    if (ss.length) {
      covered++;
      if (Math.min(...ss) < prevFirst) warn(`M${m.no} topic ${i + 1} is taught before topic ${i} (brochure order)`);
      prevFirst = Math.min(...ss);
    } else if (!partial) err(`M${m.no} topic not covered: "${t}"`);
  });
}

// stats
const all = COURSE.sessions.flatMap((s) => s.slides);
const by = {};
all.forEach((x) => { by[x.type] = (by[x.type] || 0) + 1; });
const codeN = all.reduce((a, x) => a + (x.code ? [].concat(x.code).length : 0), 0);
const diagN = all.reduce((a, x) => a + (x.diagram ? [].concat(x.diagram).length : 0), 0);
const quizN = all.reduce((a, x) => a + (x.quiz ? x.quiz.length : 0), 0);
console.log(`Sessions: ${COURSE.sessions.length}/24   Slides: ${all.length}   Code blocks: ${codeN}   Diagrams: ${diagN}   Quiz questions: ${quizN}`);
console.log('Slide types: ' + Object.entries(by).map(([k, v]) => `${k}=${v}`).join('  '));
console.log(`Brochure topics covered: ${covered}/${topics}`);
for (const m of COURSE.modules) {
  const ss = COURSE.sessions.filter((s) => s.no >= m.sessions[0] && s.no <= m.sessions[1]);
  console.log(`  M${m.no}: ${ss.length} sessions, ${ss.reduce((a, s) => a + s.slides.length, 0)} slides`);
}
if (missing.length) console.log(`(partial) missing files: ${missing.length}`);
warns.forEach((w) => console.log('\u26A0\uFE0F  ' + w));
if (errors.length) {
  errors.forEach((e) => console.log('\u274C ' + e));
  console.log(`\n${errors.length} error(s)`);
  process.exit(1);
}
console.log('\u2705 Content OK');
