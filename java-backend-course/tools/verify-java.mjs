#!/usr/bin/env node
// Compiles and runs every self-contained Java example in the course and checks
// the real program output against the "out" shown on the slide.
//
//   JAVAC="javac --release 21" JAVA=java node tools/verify-java.mjs [--session 5]
//
// A code group is verified when its Java tabs contain a `main` method and only
// import JDK packages. Per-tab options in the content files:
//   verify: false      -> skip entirely
//   verify: 'compile'  -> compile + run, but don't compare output (non-deterministic)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadCourse } from './load-course.mjs';

const JAVAC = (process.env.JAVAC || 'javac --release 21').split(/\s+/);
const JAVA = (process.env.JAVA || 'java').split(/\s+/);
const only = process.argv.includes('--session') ? +process.argv[process.argv.indexOf('--session') + 1] : null;
const { COURSE } = loadCourse({ partial: true });

const EXTERNAL = /^\s*import\s+(static\s+)?(?!java\.|javax\.(crypto|net|security)\.)[\w.]+/m;
const groups = [];
for (const s of COURSE.sessions) {
  if (only && s.no !== only) continue;
  s.slides.forEach((sl, i) => {
    if (!sl.code) return;
    const tabs = [].concat(sl.code).filter((t) => t.lang === 'java');
    if (!tabs.length || tabs.some((t) => t.verify === false)) return;
    const mainTab = tabs.find((t) => /static\s+void\s+main\s*\(/.test(t.src));
    if (!mainTab) return;
    if (tabs.some((t) => EXTERNAL.test(t.src))) return;
    groups.push({ where: `S${s.no} slide ${i + 1} (${sl.title})`, tabs, mainTab });
  });
}

const norm = (x) => x.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
let ok = 0, fail = 0, unchecked = 0;
for (const g of groups) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jv-'));
  const files = g.tabs.map((t, k) => {
    const cls = (t.src.match(/public\s+(?:final\s+|abstract\s+)*(?:class|interface|record|enum)\s+(\w+)/) || [])[1];
    const name = t.file && t.file.endsWith('.java') ? path.basename(t.file) : (cls ? cls + '.java' : `Snippet${k}.java`);
    fs.writeFileSync(path.join(dir, name), t.src);
    return name;
  });
  const mainName = (g.mainTab.src.match(/public\s+(?:final\s+)?class\s+(\w+)/) || [])[1] ||
    path.basename(g.mainTab.file || '', '.java');
  const pkg = (g.mainTab.src.match(/^\s*package\s+([\w.]+)\s*;/m) || [])[1];
  const c = spawnSync(JAVAC[0], [...JAVAC.slice(1), '-d', 'out', ...files], { cwd: dir, encoding: 'utf8' });
  if (c.status !== 0) {
    fail++;
    console.log(`\u274C ${g.where}: compile error\n${(c.stdout + c.stderr).trim().split('\n').slice(0, 25).join('\n')}\n`);
    continue;
  }
  const r = spawnSync(JAVA[0], [...JAVA.slice(1), '-cp', 'out', pkg ? `${pkg}.${mainName}` : mainName],
    { cwd: dir, encoding: 'utf8', timeout: 30000, env: { ...process.env, LANG: 'C.UTF-8' } });
  const actual = norm((r.stdout || '') + (r.stderr ? r.stderr : ''));
  const expectTab = g.tabs.find((t) => t.out);
  if (g.tabs.some((t) => t.verify === 'compile') || !expectTab) {
    unchecked++;
    console.log(`\u2611\uFE0F  ${g.where}: compiled & ran (output not compared)`);
    if (process.env.SHOW) console.log(actual + '\n');
    continue;
  }
  const expected = norm(expectTab.out);
  if (actual === expected) { ok++; console.log(`\u2705 ${g.where}`); }
  else {
    fail++;
    console.log(`\u274C ${g.where}: output differs\n--- expected\n${expected}\n--- actual\n${actual}\n`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${groups.length} runnable examples: ${ok} output-verified, ${unchecked} run-only, ${fail} failed`);
process.exit(fail ? 1 : 0);
