#!/usr/bin/env node
// Content validator: structure, syllabus coverage, theory+practical balance,
// the FAANG interview track (deep dives, coding/design rounds, Q&A, hard quiz),
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
const arr = (x, n) => Array.isArray(x) && x.length >= n;
const need = (w, cond, msg) => { if (!cond) err(`${w}: ${msg}`); };
const flatPts = (a) => (a || []).flatMap((x) => (Array.isArray(x) ? flatPts(x) : [x]));
const normOut = (x) => MD.strip(String(x)).replace(/\s+/g, ' ').trim();
const LEVELS = [1, 2, 3];
const DIFF = ['Medium', 'Hard'];
const T = COURSE.track;
const PAT = new Set(((T && T.patterns) || []).map((p) => p.id));
const packsMissing = [];

/** Every code tab on a slide, wherever it lives, as [label, tab]. */
function codeTabs(sl) {
  const out = [];
  [].concat(sl.code || []).forEach((c, k) => out.push([`code[${k}]`, c]));
  (sl.qa || []).forEach((x, i) => [].concat(x.code || []).forEach((c, k) => out.push([`qa[${i}].code[${k}]`, c])));
  (sl.stages || []).forEach((x, i) => [].concat(x.code || []).forEach((c, k) => out.push([`stages[${i}].code[${k}]`, c])));
  (sl.quiz || []).forEach((q, i) => {
    if (q.code) out.push([`quiz[${i}].code`, typeof q.code === 'string' ? { lang: 'java', src: q.code } : { lang: 'java', ...q.code }]);
  });
  return out;
}
function lintCode(w, k, c) {
  if (!c || !strOk(c.src)) { err(`${w}: ${k} missing src`); return; }
  if (!strOk(c.lang)) err(`${w}: ${k} missing lang`);
  if (/\t/.test(c.src)) warn(`${w}: ${k} contains tab characters`);
  if (typeof c.out === 'string' && /^[ \t]*\n/.test(c.out)) err(`${w}: ${k} out starts with a blank line \u2014 write it with the code tag (out: code\`...\`) so it is dedented`);
  if (!c.legacy && c.lint !== false) for (const [re, msg] of LINT) if (re.test(c.src)) err(`${w}: ${k} ${msg}`);
}
const HAS_MAIN = /static\s+void\s+main\s*\(/;
function checkCoding(w, s) {
  need(w, DIFF.includes(s.difficulty), `coding round difficulty must be ${DIFF.join(' or ')}`);
  need(w, s.minutes >= 15 && s.minutes <= 90, 'coding round needs minutes (15-90)');
  need(w, arr(s.pattern, 1) && s.pattern.every((x) => PAT.has(x)), `coding round patterns must be ids from track.patterns (unknown: ${(s.pattern || []).filter((x) => !PAT.has(x)).join(', ') || 'none given'})`);
  need(w, s.problem && [].concat(s.problem).join(' ').length >= 120, 'coding round needs a problem statement (>= 120 chars)');
  need(w, arr(s.examples, 1) && s.examples.every((x) => strOk(x.in) && strOk(x.out)), 'coding round needs examples [{in, out}]');
  need(w, arr(s.constraints, 1), 'coding round needs constraints');
  need(w, arr(s.hints, 2), 'coding round needs >= 2 progressive hints');
  need(w, arr(s.approaches, 2) && s.approaches.every((a) => strOk(a.name) && strOk(a.idea) && strOk(a.time) && strOk(a.space)),
    'coding round needs >= 2 approaches with name/idea/time/space');
  need(w, [].concat(s.code || []).some((t) => t.out && (t.lang === 'sql' || (t.lang === 'java' && HAS_MAIN.test(t.src)))),
    'coding round needs a runnable reference solution with its expected output (out)');
  need(w, arr(s.pitfalls, 2), 'coding round needs >= 2 pitfalls');
  need(w, arr(s.followUps, 2) && s.followUps.every((f) => strOk(f.q) && f.a && [].concat(f.a).join(' ').length > 40), 'coding round needs >= 2 follow-ups with answers');
  need(w, arr(s.rubric, 3), 'coding round needs a rubric (>= 3 items)');
  if (s.lc != null) need(w, Number.isInteger(s.lc) && s.lc > 0, 'lc must be a LeetCode problem number');
}
function checkDesign(w, s) {
  need(w, ['HLD', 'LLD'].includes(s.kind), 'design round kind must be HLD or LLD');
  need(w, DIFF.includes(s.difficulty), `design round difficulty must be ${DIFF.join(' or ')}`);
  need(w, s.minutes >= 30 && s.minutes <= 120, 'design round needs minutes (30-120)');
  need(w, strOk(s.prompt), 'design round needs a prompt');
  need(w, arr(s.stages, 5), 'design round needs >= 5 stages');
  (s.stages || []).forEach((st, k) => {
    need(w, strOk(st.t), `stage ${k + 1} needs a title`);
    need(w, st.points || st.diagram || st.table || st.code, `stage ${k + 1} needs content`);
    if (st.diagram) { try { DG.render(st.diagram); } catch (e) { err(`${w}: stage ${k + 1} diagram error ${e.message}`); } }
    if (st.table) st.table.rows.forEach((r, j) => { if (r.length !== st.table.head.length) err(`${w}: stage ${k + 1} table row ${j} has ${r.length} cells`); });
  });
  need(w, (s.stages || []).some((st) => st.diagram), 'design round needs at least one diagram');
  need(w, arr(s.followUps, 3), 'design round needs >= 3 follow-ups');
  need(w, arr(s.rubric, 3), 'design round needs a rubric (>= 3 items)');
}
function checkInterview(w, s) {
  need(w, arr(s.qa, 8), `interview slide needs >= 8 questions (has ${(s.qa || []).length})`);
  (s.qa || []).forEach((x, k) => {
    need(w, strOk(x.q), `Q${k + 1} missing question`);
    need(w, LEVELS.includes(x.level), `Q${k + 1} level must be 1, 2 or 3`);
    need(w, x.a && [].concat(x.a).join(' ').length >= 200, `Q${k + 1} model answer too short (< 200 chars)`);
    if (x.follow) need(w, arr(x.follow, 1), `Q${k + 1} follow must be a non-empty array`);
    if (x.flags) need(w, arr(x.flags, 1), `Q${k + 1} flags must be a non-empty array`);
  });
  const lv = (s.qa || []).map((x) => x.level);
  need(w, lv.filter((l) => l >= 2).length >= 4, 'interview slide needs >= 4 SDE-2/Senior questions');
  need(w, lv.filter((l) => l === 3).length >= 2, 'interview slide needs >= 2 Senior questions');
}
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
    flatPts(sl.points).forEach((p) => { if (!strOk(p)) err(`${w}: empty point`); else checkInline(w, p); });
    codeTabs(sl).forEach(([k, c]) => lintCode(w, k, c));
    [].concat(sl.problem || [], sl.hints || [], sl.constraints || [], sl.pitfalls || [], sl.rubric || [], sl.stretch || [], sl.prompt || [],
      (sl.examples || []).map((x) => x.why).filter(Boolean),
      (sl.approaches || []).flatMap((a) => [a.name, a.idea]),
      (sl.followUps || []).flatMap((f) => [f.q, ...[].concat(f.a)]),
      (sl.stages || []).flatMap((st) => [st.t, st.ask, ...flatPts(st.points)].filter((x) => x != null)),
      (sl.qa || []).flatMap((x) => [x.q, ...[].concat(x.a), ...(x.follow || []), ...(x.flags || [])])
    ).forEach((x) => { if (!strOk(x)) err(`${w}: empty text in interview content`); else checkInline(w, x); });
    if (sl.type === 'deep') need(w, sl.points || sl.table || sl.diagram, 'deep dive needs points, a table or a diagram');
    if (sl.type === 'coding') checkCoding(w, sl);
    if (sl.type === 'design') checkDesign(w, sl);
    if (sl.type === 'interview') checkInterview(w, sl);
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
        if (q.level != null && !LEVELS.includes(q.level)) err(`${w}: quiz ${k} level must be 1, 2 or 3`);
        if (q.code) {
          const c = typeof q.code === 'string' ? { src: q.code } : q.code;
          if (!strOk(c.src)) err(`${w}: quiz ${k} code missing src`);
          if (c.out != null && Array.isArray(q.options)) {
            const o = normOut(c.out);
            if (o !== normOut(q.options[q.answer])) err(`${w}: quiz ${k} code.out "${o}" does not match the answer option "${normOut(q.options[q.answer])}"`);
            q.options.forEach((x, j) => { if (j !== q.answer && normOut(x) === o) err(`${w}: quiz ${k} option ${j} also equals the real output`); });
          }
        }
      });
    }
    if (sl.steps && (!Array.isArray(sl.steps) || !sl.steps.every(strOk))) err(`${w}: steps must be non-empty strings`);
    if (sl.cards && !sl.cards.every((c) => Array.isArray(c) && c.length === 2)) err(`${w}: cards must be [front, back] pairs`);
    if (sl.callout) [].concat(sl.callout).forEach((c) => { if (!strOk(c.text)) err(`${w}: callout missing text`); });
  });
  for (const t of ['theory', 'practical', 'quiz', 'summary']) if (!counts[t]) err(`${where}: needs at least one ${t} slide`);
  if (!(s.slides || []).some((x) => x.steps)) err(`${where}: needs a hands-on lab (slide with steps)`);
  if (s.prep) {
    need(where, counts.deep >= 1, 'interview pack needs >= 1 deep-dive slide');
    need(where, counts.coding >= 1, 'interview pack needs >= 1 coding round');
    need(where, counts.interview >= 1, 'interview pack needs an interview Q&A slide');
    const qs = (s.slides || []).filter((x) => x.quiz).flatMap((x) => x.quiz);
    need(where, qs.length >= 10, `quiz needs >= 10 questions once the interview pack is added (has ${qs.length})`);
    need(where, qs.filter((q) => q.prep && q.level >= 2).length >= 4, 'interview pack needs >= 4 SDE-2/Senior quiz questions');
    need(where, arr(s.prep.stretch, 2), 'interview pack needs >= 2 lab stretch goals');
  } else packsMissing.push(s.no);
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

// interview track hub (content/interview/track.js)
if (!T) err('content/interview/track.js did not set COURSE.track');
else {
  const ids = new Set();
  (T.patterns || []).forEach((p, k) => {
    const w = `track.patterns[${k}] ${p.id}`;
    need(w, strOk(p.id) && !ids.has(p.id), 'missing or duplicate id');
    ids.add(p.id);
    need(w, strOk(p.name), 'needs a name');
    need(w, arr(p.signals, 2), 'needs >= 2 signals');
    need(w, p.template && strOk(p.template.src), 'needs a code template');
    if (p.template) lintCode(w, 'template', p.template);
    [...(p.signals || []), ...(p.pitfalls || []), p.complexity || ''].filter(Boolean).forEach((x) => checkInline(w, x));
  });
  need('track', arr(T.patterns, 12), 'needs >= 12 patterns');
  need('track', arr(T.loop, 4) && T.loop.every((r) => strOk(r.name) && arr(r.what, 1)), 'needs the interview loop (>= 4 rounds with name + what)');
  need('track', arr(T.method, 2), 'needs >= 2 round methods');
  need('track', arr(T.mocks, 3), 'needs >= 3 mock formats');
  (T.mocks || []).forEach((m) => {
    const w = `track.mocks ${m.id}`;
    need(w, strOk(m.id) && strOk(m.name) && m.minutes > 0 && arr(m.parts, 1), 'needs id, name, minutes and parts');
    (m.parts || []).forEach((x) => need(w, ['coding', 'design', 'qa', 'behavioral'].includes(x.type) && x.count > 0, `bad part ${JSON.stringify(x)}`));
  });
  const B = T.behavioral || {};
  need('track.behavioral', arr(B.prompts, 8) && B.prompts.every((b) => strOk(b.q) && arr(b.probe, 2)), 'needs >= 8 prompts with >= 2 probes each');
  [T.levels, T.plan].filter(Boolean).forEach((t, k) => t.rows.forEach((r, j) => { if (r.length !== t.head.length) err(`track table ${k} row ${j} has ${r.length} cells`); }));
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
{
  const n = (t) => all.filter((x) => x.type === t).length;
  const coding = all.filter((x) => x.type === 'coding');
  const qaN = all.reduce((a, x) => a + (x.qa ? x.qa.length : 0), 0);
  const hardQ = all.reduce((a, x) => a + (x.quiz ? x.quiz.filter((q) => q.level >= 2).length : 0), 0);
  console.log(`Interview track: packs ${COURSE.sessions.length - packsMissing.length}/24 \u00B7 deep dives ${n('deep')} \u00B7 coding rounds ${coding.length} ` +
    `(${coding.filter((x) => x.difficulty === 'Hard').length} Hard) \u00B7 design rounds ${n('design')} \u00B7 Q&As ${qaN} \u00B7 interview-level quiz Qs ${hardQ}`);
  if (!packsMissing.length && n('design') < 10) err(`the interview track needs >= 10 design rounds (has ${n('design')})`);
}
if (packsMissing.length) warn(`interview packs missing for sessions: ${packsMissing.join(', ')}`);
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
