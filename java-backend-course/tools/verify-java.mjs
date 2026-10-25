#!/usr/bin/env node
// Compiles and runs every self-contained Java example in the course and checks
// the real program output against the "out" shown on the slide.
//
//   JAVAC="javac --release 21" JAVA=java node tools/verify-java.mjs [--session 5]
//
// A slide is verified when its Java tabs contain a `main` method and only
// import JDK packages. All Java tabs of a slide are compiled together; every
// tab with `main` is run and compared with its own `out`.
// Per-tab options in the content files:
//   verify: false      -> leave this tab out (fragments, pseudo-code)
//   verify: 'run'      -> compile + run, but don't compare output (it varies per run);
//                         the program must still exit cleanly (exit code 0, no timeout)
//   verify: 'compile'  -> compile only, never run (needs an outside service, e.g. MySQL)
// A tab with `main` but no `out` on the slide is treated like verify: 'run'.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadCourse } from './load-course.mjs';

const JAVAC = (process.env.JAVAC || 'javac --release 21').split(/\s+/);
const JAVA = (process.env.JAVA || 'java').split(/\s+/);
const only = process.argv.includes('--session') ? +process.argv[process.argv.indexOf('--session') + 1] : null;
const { COURSE } = loadCourse({ partial: true });

const JDK_PKG = /^(java|javax\.(crypto|net|security))\./;
const EXTERNAL = { test: (src) => [...src.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)].some((m) => !JDK_PKG.test(m[1])) };
const HAS_MAIN = /static\s+void\s+main\s*\(/;
const groups = [];
for (const s of COURSE.sessions) {
  if (only && s.no !== only) continue;
  s.slides.forEach((sl, i) => {
    if (!sl.code) return;
    const tabs = [].concat(sl.code).filter((t) => t.lang === 'java' && t.verify !== false);
    const mains = tabs.filter((t) => HAS_MAIN.test(t.src));
    if (!mains.length || tabs.some((t) => EXTERNAL.test(t.src))) return;
    groups.push({ where: `S${s.no} slide ${i + 1} (${sl.title})`, tabs, mains });
  });
}

const norm = (x) => x.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
let ok = 0, fail = 0, unchecked = 0, compiledOnly = 0, runs = 0;
for (const g of groups) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'));
  const files = g.tabs.map((t, k) => {
    const cls = (t.src.match(/public\s+(?:final\s+|abstract\s+|sealed\s+)*(?:class|interface|record|enum)\s+(\w+)/) || [])[1];
    const name = t.file && t.file.endsWith('.java') ? path.basename(t.file) : (cls ? cls + '.java' : `Snippet${k}.java`);
    fs.writeFileSync(path.join(dir, name), t.src);
    return name;
  });
  const c = spawnSync(JAVAC[0], [...JAVAC.slice(1), '-d', 'out', ...files], { cwd: dir, encoding: 'utf8' });
  if (c.status !== 0) {
    fail++;
    console.log(`\u274C ${g.where}: compile error\n${(c.stdout + c.stderr).trim().split('\n').slice(0, 25).join('\n')}\n`);
    fs.rmSync(dir, { recursive: true, force: true });
    continue;
  }
  for (const mainTab of g.mains) {
    runs++;
    const mainName = (mainTab.src.match(/public\s+(?:final\s+)?class\s+(\w+)/) || [])[1] || path.basename(mainTab.file || '', '.java');
    const pkg = (mainTab.src.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1];
    const label = g.mains.length > 1 ? `${g.where} [${mainName}]` : g.where;
    if (mainTab.verify === 'compile') {
      compiledOnly++;
      console.log(`\u2611\uFE0F  ${label}: compiled (not run \u2014 needs an outside service)`);
      continue;
    }
    const r = spawnSync(JAVA[0], [...JAVA.slice(1), '-cp', 'out', pkg ? `${pkg}.${mainName}` : mainName],
      { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, LANG: 'C.UTF-8' } });
    const actual = norm((r.stdout || '') + (r.stderr || ''));
    const expectTab = mainTab.out ? mainTab : (g.mains.length === 1 ? g.tabs.find((t) => t.out) : null);
    if (mainTab.verify === 'run' || !expectTab) {
      if (r.status !== 0) {
        fail++;
        const why = r.error ? (r.error.code || r.error.message) : r.signal ? `killed by ${r.signal}` : `exit code ${r.status}`;
        console.log(`\u274C ${label}: run failed (${why})\n${actual.split('\n').slice(0, 15).join('\n')}\n`);
        continue;
      }
      unchecked++;
      const reason = mainTab.verify === 'run' ? 'output varies per run' : 'no expected output on the slide';
      console.log(`\u2611\uFE0F  ${label}: compiled & ran cleanly (not compared \u2014 ${reason})`);
      if (process.env.SHOW) console.log(actual + '\n');
      continue;
    }
    const expected = norm(expectTab.out);
    if (actual === expected) { ok++; console.log(`\u2705 ${label}`); }
    else {
      fail++;
      console.log(`\u274C ${label}: output differs\n--- expected\n${expected}\n--- actual\n${actual}\n`);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${runs} programs on ${groups.length} slides: ${ok} output-verified, ${unchecked} run-only (ran cleanly, output not compared), ` +
  `${compiledOnly} compile-only (need an outside service), ${fail} failed`);
process.exit(fail ? 1 : 0);
