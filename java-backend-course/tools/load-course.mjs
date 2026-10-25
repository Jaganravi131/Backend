// Loads the course content exactly like the browser does (same files, same
// order as index.html) inside a Node VM sandbox. Used by validate/build tools.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sessionFiles() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('@sessions:start');
  const end = html.indexOf('@sessions:end');
  if (start < 0 || end < 0) throw new Error('index.html is missing the @sessions:start/@sessions:end markers');
  return [...html.slice(start, end).matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

export function loadCourse({ partial = false } = {}) {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const run = (rel) => {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  };
  run('content/course.js');
  run('assets/js/md.js');
  run('assets/js/diagrams.js');
  const files = sessionFiles();
  const missing = [];
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) {
      missing.push(f);
      continue;
    }
    try {
      run(f);
    } catch (e) {
      e.message = `${f}: ${e.message}`;
      throw e;
    }
  }
  if (missing.length && !partial) {
    throw new Error('Missing session files:\n  ' + missing.join('\n  '));
  }
  return { COURSE: ctx.COURSE, MD: ctx.MD, DG: ctx.DG, files, missing };
}
