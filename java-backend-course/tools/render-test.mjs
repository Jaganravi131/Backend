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

// FAANG interview track: coding / design / interview widgets and the hub
const entries = window.JBC.decks.flatMap((d) => d.list).filter((e) => e.kind === 'slide');
const firstOf = (t) => entries.find((e) => e.slide.type === t);
const within = (el, sel) => [...el.querySelectorAll(sel)];
const coding = firstOf('coding');
expect(!!coding, 'no coding round found');
if (coding) {
  go(coding.href);
  $('[data-act="hint"]').click();
  expect(within($('.hints'), 'li').filter((li) => !li.hidden).length === 1, 'first hint not revealed');
  const rv = $('.rv-b');
  rv.click();
  expect(!rv.nextElementSibling.hidden, 'reveal panel did not open');
  $('[data-act="timer"]').click();
  expect($('.timer').classList.contains('run'), 'interview clock did not start');
  $('[data-act="timer-reset"]').click();
  expect(!$('.timer').classList.contains('run'), 'interview clock did not reset');
  $('[data-act="rate"][data-v="solo"]').click();
  expect(window.JBC.state().rounds[window.JBC.rkey(coding)] === 'solo', 'round self-rating not saved');
  const ta = $('textarea[data-scratch]');
  ta.value = 'two structures: map + list';
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  expect(window.JBC.state().scratch[window.JBC.rkey(coding)] === 'two structures: map + list', 'scratchpad not saved');
}
const iv = firstOf('interview');
expect(!!iv, 'no interview Q&A slide found');
if (iv) {
  go(iv.href);
  const card = $('.qa-c');
  card.querySelector('[data-act="qa-toggle"]').click();
  expect(!card.querySelector('.qa-a').hidden, 'model answer not revealed');
  card.querySelector('.rt2').click();
  expect(card.getAttribute('data-r') === '2', 'Q&A self-rating not applied');
  expect(/1 nailed/.test($('.qa-sum').textContent), 'Q&A summary not updated');
  const senior = $$('.qa-bar .seg button').find((b) => b.getAttribute('data-v') === '3');
  senior.click();
  expect($$('.qa-c').every((c) => c.hidden === (c.getAttribute('data-l') !== '3')), 'level filter failed');
  $('[data-act="qa-all"]').click();
  expect($$('.qa-c').filter((c) => !c.hidden).every((c) => !c.querySelector('.qa-a').hidden), 'reveal-all failed');
}
const ds = firstOf('design');
if (ds) {
  go(ds.href);
  $('[data-act="stage"]').click();
  expect(!$('.stg-b').hidden, 'design stage did not reveal');
  $('[data-act="stage-all"]').click();
  expect($$('.stg-b').every((b) => !b.hidden), 'reveal-all stages failed');
}
const lab = entries.find((e) => e.slide.stretch);
if (lab) { go(lab.href); expect(!!$('.stretch'), 'lab stretch goals not rendered'); }
const hard = entries.find((e) => e.slide.quiz && e.slide.quiz.some((q) => q.code));
if (hard) { go(hard.href); expect($$('.qz .code').length > 0 && !$('.qz .code-run'), 'predict-the-output code must render without an output button'); }
for (const h of ['#/interview', '#/interview/coding', '#/interview/design', '#/interview/bank', '#/interview/mock', '#/interview/patterns', '#/interview/behavioral']) {
  go(h);
  expect($('.hub-tabs a.on') && $('#main').textContent.length > 400, `interview hub page ${h} did not render`);
}
go('#/interview/bank');
const bq = $('.bank-q');
bq.value = 'treeify';
bq.dispatchEvent(new window.Event('input', { bubbles: true }));
const shown = $$('.bank .qa-c').filter((c) => !c.hidden).length;
expect(shown > 0 && shown < $$('.bank .qa-c').length, `bank search did not filter (${shown} shown)`);
go('#/interview/coding');
const hardBtn = $$('.seg button').find((b) => b.getAttribute('data-v') === 'Hard');
hardBtn.click();
expect($$('tr.fi').every((r) => r.hidden === (r.getAttribute('data-d') !== 'Hard')), 'coding difficulty filter failed');
go('#/interview/mock');
for (const b of $$('[data-act="mock-new"]').map((x) => x.getAttribute('data-fmt'))) {
  $(`[data-act="mock-new"][data-fmt="${b}"]`).click();
  expect($('.mock-run') && $$('.mock-items > li').length > 0, `mock "${b}" generated nothing`);
}
$('[data-act="mock-clear"]').click();
expect(!$('.mock-run') && window.JBC.state().mock === null, 'mock not cleared');
go('#/interview/patterns/heap');
expect(!!$('#pat-heap'), 'pattern deep link target missing');
go('#/');
expect(!!$('.prep-band'), 'home page is missing the interview-track band');

console.log(`Rendered ${slides} content slides (+ covers), ${quizzes} quiz slides answered, ${codeBlocks} code blocks, ${diagrams} diagrams.`);
if (errors.length) {
  console.log(errors.slice(0, 30).join('\n'));
  console.log(`\n\u274C ${errors.length} problem(s)`);
  process.exit(1);
}
console.log('\u2705 Render test passed');
window.close();
