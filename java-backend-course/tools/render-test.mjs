#!/usr/bin/env node
// Headless smoke test: loads index.html in jsdom with all scripts, renders every
// page and every slide of every deck, and exercises the interactive widgets.
// Fails on any runtime error.   Usage: node tools/render-test.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { ROOT } from './load-course.mjs';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push('jsdom: ' + (e.stack || e.message)); });
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const dom = await JSDOM.fromFile(path.join(ROOT, 'index.html'), {
  url: pathToFileURL(path.join(ROOT, 'index.html')).href,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.error && e.error.stack || e.message)));
await new Promise((resolve) => window.addEventListener('load', resolve));

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
function go(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
}
function expect(cond, msg) { if (!cond) errors.push(msg); }

if (!window.JBC) { console.error('App did not initialise'); process.exit(1); }

// pages
for (const h of ['#/', '#/syllabus', '#/projects', '#/print/1', '#/print/2', '#/print/3', '#/print/4']) {
  go(h);
  expect($('#main') && $('#main').textContent.length > 100, `page ${h} rendered no content`);
}
go('#/no-such-page');
expect(/Page not found/.test($('#main').textContent), 'unknown route should show the not-found page');
go('#/');
expect($$('.mod').length === 4, 'home should show 4 module cards');
go('#/syllabus');
expect(!$('tr.missing'), 'syllabus shows an uncovered brochure topic');

// every slide of every deck
let slides = 0, quizzes = 0, codeBlocks = 0, diagrams = 0;
for (const deck of window.JBC.decks) {
  for (const entry of deck.list) {
    go(entry.href);
    const slide = $('.slide');
    expect(slide && slide.textContent.trim().length > 20, `empty slide ${entry.href}`);
    if (entry.kind === 'slide') {
      slides++;
      expect($('.notes .notes-b') && $('.notes .notes-b').textContent.length > 50, `missing notes ${entry.href}`);
      codeBlocks += $$('.slide .code').length;
      diagrams += $$('.slide .dg-fig').length;
      if (entry.slide.quiz) {
        quizzes++;
        const first = $('.qz .qz-o');
        first.click();
        expect($('.qz-why') && !$('.qz-why').hidden, `quiz feedback not shown ${entry.href}`);
        $('[data-act="quiz-reset"]').click();
      }
    }
  }
}

// widgets
go('#/s/1/2');
const tabs = $$('.code-tabs button');
if (tabs[1]) { tabs[1].click(); expect(!$$('.code-pane')[1].hidden, 'code tab switch failed'); }
const run = $('[data-act="run"]');
if (run) { run.click(); expect(!$('.code-out').hidden, 'output toggle failed'); }
$('[data-act="notes"]').click();
expect($('.notes').classList.contains('closed'), 'notes toggle failed');
$('[data-act="notes"]').click();
$('[data-act="overview"]').click();
expect($$('.ov-t').length > 10, 'overview did not open');
$('[data-act="close"]').click();
$('[data-act="search"]').click();
const input = $('.search-in');
input.value = 'circuit breaker';
input.dispatchEvent(new window.Event('input'));
expect($$('.sr').length > 0, 'search returned no results for "circuit breaker"');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
expect(!$('.ovl'), 'Escape did not close the overlay');
go('#/s/1/12');
const box = $('[data-act="lab"]');
if (box) { box.click(); box.dispatchEvent(new window.Event('change', { bubbles: true })); }
expect(/1 \/ \d+ done/.test($('.lab-prog').textContent), 'lab checkbox progress not updated');
go('#/s/3/1');
window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
expect(window.location.hash === '#/s/3/2', 'ArrowRight did not advance (' + window.location.hash + ')');

console.log(`Rendered ${slides} content slides (+ covers), ${quizzes} quiz slides answered, ${codeBlocks} code blocks, ${diagrams} diagrams.`);
if (errors.length) {
  console.log(errors.slice(0, 30).join('\n'));
  console.log(`\n\u274C ${errors.length} problem(s)`);
  process.exit(1);
}
console.log('\u2705 Render test passed');
window.close();
