#!/usr/bin/env node
// Runs the SQL interview rounds against an in-memory SQLite database (node:sqlite,
// built into Node 22.13+) and compares each result table with the `out` on the slide.
//
//   node --no-warnings tools/verify-sql.mjs [--session 10]
//
// Opt-in: only groups that contain a `setup: true` tab are run (other SQL on the
// slides targets MySQL directly). Convention for SQL tabs (slide `code`, `qa[].code`, `stages[].code`):
//   setup: true   -> schema + sample data, executed first (in tab order)
//   out: '...'    -> a single query; its result must equal `out`, written as a header
//                    line "col_a | col_b" followed by one line per row (NULL -> null).
//                    Cells are compared trimmed, so columns may be padded for alignment.
// The queries are written in portable SQL that MySQL 8 runs unchanged (window
// functions, CTEs, CASE); SQLite is only the test bench.
import { DatabaseSync } from 'node:sqlite';
import { loadCourse } from './load-course.mjs';

const only = process.argv.includes('--session') ? +process.argv[process.argv.indexOf('--session') + 1] : null;
const { COURSE } = loadCourse({ partial: true });
const cells = (line) => line.split('|').map((c) => c.trim()).join(' | ');
const norm = (x) => String(x).replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).map(cells).join('\n');

let ok = 0, fail = 0;
for (const s of COURSE.sessions) {
  if (only && s.no !== only) continue;
  s.slides.forEach((sl, i) => {
    const w = `S${s.no} slide ${i + 1} (${sl.title})`;
    const groups = [];
    if (sl.code) groups.push([w, sl.code]);
    (sl.qa || []).forEach((x, k) => { if (x.code) groups.push([`${w} Q${k + 1}`, x.code]); });
    (sl.stages || []).forEach((x, k) => { if (x.code) groups.push([`${w} stage ${k + 1}`, x.code]); });
    for (const [where, code] of groups) {
      const tabs = [].concat(code).filter((t) => t && t.lang === 'sql' && t.verify !== false);
      const queries = tabs.filter((t) => !t.setup && t.out);
      if (!queries.length || !tabs.some((t) => t.setup)) continue;   // opt-in: needs a setup tab
      const db = new DatabaseSync(':memory:');
      try {
        tabs.filter((t) => t.setup).forEach((t) => db.exec(t.src));
        for (const q of queries) {
          const label = `${where} [${q.file || q.label || 'query'}]`;
          try {
            const stmt = db.prepare(q.src);
            const rows = stmt.all();
            const cols = stmt.columns().map((c) => c.name);
            const actual = [cols.join(' | '), ...rows.map((r) => cols.map((c) => (r[c] === null ? 'null' : String(r[c]))).join(' | '))].join('\n');
            if (norm(actual) === norm(q.out)) { ok++; console.log(`\u2705 ${label}`); }
            else { fail++; console.log(`\u274C ${label}: result differs\n--- expected\n${norm(q.out)}\n--- actual\n${norm(actual)}\n`); }
          } catch (e) {
            fail++;
            console.log(`\u274C ${label}: ${e.message}\n`);
          }
        }
      } catch (e) {
        fail++;
        console.log(`\u274C ${where}: setup failed: ${e.message}\n`);
      } finally {
        db.close();
      }
    }
  });
}
console.log(`\n${ok + fail} SQL queries: ${ok} verified, ${fail} failed`);
process.exit(fail ? 1 : 0);
