#!/usr/bin/env node
// Compiles and runs every self-contained Java example in the course and checks
// the real program output against the "out" shown on the slide.
//
//   JAVAC="javac --release 21" JAVA=java node tools/verify-java.mjs [--session 5] [--jobs 2]
//
// Where code lives: slide `code` (theory/practical/lab/deep-dive slides and the
// reference solution of a coding round), interview answers (`qa[].code`), design
// stages (`stages[].code`) and predict-the-output quiz questions (`quiz[].code`).
// A group is verified when its Java tabs contain a `main` method and only import
// JDK packages. All Java tabs of a group are compiled together; every tab with
// `main` is run and compared with its own `out`.
// Per-tab options in the content files:
//   verify: false      -> leave this tab out (fragments, pseudo-code)
//   verify: 'run'      -> compile + run, but don't compare output (it varies per run);
//                         the program must still exit cleanly (exit code 0, no timeout)
//   verify: 'compile'  -> compile only, never run (needs an outside service, e.g. MySQL)
// A tab with `main` but no `out` is treated like verify: 'run'.
// For quiz questions the expected output is `quiz[].code.out`; tools/validate.mjs
// checks separately that it matches the option marked as the answer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { loadCourse } from './load-course.mjs';

const JAVAC = (process.env.JAVAC || 'javac --release 21').split(/\s+/);
const JAVA = (process.env.JAVA || 'java').split(/\s+/);
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = arg('--session') ? +arg('--session') : null;
const JOBS = Math.max(1, +(arg('--jobs') || process.env.JOBS || Math.min(2, os.cpus().length)));
const { COURSE } = loadCourse({ partial: true });

const JDK_PKG = /^(java|javax\.(crypto|net|security))\./;
const EXTERNAL = { test: (src) => [...src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)].some((m) => !JDK_PKG.test(m[1])) };
const HAS_MAIN = /static\s+void\s+main\s*\(/;
const groups = [];
function addGroup(where, code) {
  const tabs = [].concat(code).filter((t) => t && t.lang === 'java' && t.verify !== false);
  const mains = tabs.filter((t) => HAS_MAIN.test(t.src));
  if (!mains.length || tabs.some((t) => EXTERNAL.test(t.src))) return;
  groups.push({ where, tabs, mains });
}
for (const s of COURSE.sessions) {
  if (only && s.no !== only) continue;
  s.slides.forEach((sl, i) => {
    const w = `S${s.no} slide ${i + 1} (${sl.title})`;
    if (sl.code) addGroup(w, sl.code);
    (sl.qa || []).forEach((x, k) => { if (x.code) addGroup(`${w} Q${k + 1}`, x.code); });
    (sl.stages || []).forEach((x, k) => { if (x.code) addGroup(`${w} stage ${k + 1}`, x.code); });
    (sl.quiz || []).forEach((q, k) => {
      if (q.code && typeof q.code === 'object' && (q.code.lang || 'java') === 'java') addGroup(`${w} quiz Q${k + 1}`, { lang: 'java', ...q.code });
    });
  });
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    let out = '', done = false;
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { if (!done) p.kill('SIGKILL'); }, opts.timeout || 60000);
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', (error) => { done = true; clearTimeout(timer); resolve({ status: null, error, out }); });
    p.on('close', (status, signal) => { done = true; clearTimeout(timer); resolve({ status, signal, out }); });
  });
}

const norm = (x) => x.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();

/** Compile + run one group; returns { lines: [...], ok, unchecked, compiledOnly, fail, runs }. */
async function verify(g) {
  const res = { lines: [], ok: 0, unchecked: 0, compiledOnly: 0, fail: 0, runs: 0 };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'));
  try {
    const files = g.tabs.map((t, k) => {
      const cls = (t.src.match(/public\s+(?:final\s+|abstract\s+|sealed\s+)*(?:class|interface|record|enum)\s+(\w+)/) || [])[1];
      const name = t.file && t.file.endsWith('.java') ? path.basename(t.file) : (cls ? cls + '.java' : `Snippet${k}.java`);
      fs.writeFileSync(path.join(dir, name), t.src);
      return name;
    });
    const c = await run(JAVAC[0], [...JAVAC.slice(1), '-d', 'out', ...files], { cwd: dir, timeout: 120000 });
    if (c.status !== 0) {
      res.fail++;
      res.lines.push(`\u274C ${g.where}: compile error\n${norm(c.out || String(c.error || '')).split('\n').slice(0, 25).join('\n')}\n`);
      return res;
    }
    for (const mainTab of g.mains) {
      res.runs++;
      const mainName = (mainTab.src.match(/public\s+(?:final\s+)?class\s+(\w+)/) || [])[1] || path.basename(mainTab.file || '', '.java');
      const pkg = (mainTab.src.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1];
      const label = g.mains.length > 1 ? `${g.where} [${mainName}]` : g.where;
      if (mainTab.verify === 'compile') {
        res.compiledOnly++;
        res.lines.push(`\u2611\uFE0F  ${label}: compiled (not run \u2014 needs an outside service)`);
        continue;
      }
      const r = await run(JAVA[0], [...JAVA.slice(1), '-cp', 'out', pkg ? `${pkg}.${mainName}` : mainName],
        { cwd: dir, timeout: 30000, env: { ...process.env, LANG: 'C.UTF-8' } });
      const actual = norm(r.out || '');
      const expectTab = mainTab.out ? mainTab : (g.mains.length === 1 ? g.tabs.find((t) => t.out) : null);
      if (mainTab.verify === 'run' || !expectTab) {
        if (r.status !== 0) {
          res.fail++;
          const why = r.error ? (r.error.code || r.error.message) : r.signal ? `killed by ${r.signal}` : `exit code ${r.status}`;
          res.lines.push(`\u274C ${label}: run failed (${why})\n${actual.split('\n').slice(0, 15).join('\n')}\n`);
          continue;
        }
        res.unchecked++;
        const reason = mainTab.verify === 'run' ? 'output varies per run' : 'no expected output on the slide';
        res.lines.push(`\u2611\uFE0F  ${label}: compiled & ran cleanly (not compared \u2014 ${reason})` + (process.env.SHOW ? '\n' + actual + '\n' : ''));
        continue;
      }
      const expected = norm(expectTab.out);
      if (actual === expected && r.status === 0) { res.ok++; res.lines.push(`\u2705 ${label}`); }
      else {
        res.fail++;
        res.lines.push(`\u274C ${label}: ${actual === expected ? `exit code ${r.status}` : 'output differs'}\n--- expected\n${expected}\n--- actual\n${actual}\n`);
      }
    }
    return res;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// run with a small worker pool, print in content order
const results = new Array(groups.length);
let next = 0, printed = 0;
const flush = () => {
  while (printed < groups.length && results[printed]) { results[printed].lines.forEach((l) => console.log(l)); printed++; }
};
await Promise.all(Array.from({ length: Math.min(JOBS, groups.length || 1) }, async () => {
  while (next < groups.length) {
    const k = next++;
    results[k] = await verify(groups[k]);
    flush();
  }
}));
flush();
const sum = (f) => results.reduce((a, r) => a + (r ? r[f] : 0), 0);
console.log(`\n${sum('runs')} programs in ${groups.length} groups: ${sum('ok')} output-verified, ${sum('unchecked')} run-only (ran cleanly, output not compared), ` +
  `${sum('compiledOnly')} compile-only (need an outside service), ${sum('fail')} failed`);
process.exit(sum('fail') ? 1 : 0);
