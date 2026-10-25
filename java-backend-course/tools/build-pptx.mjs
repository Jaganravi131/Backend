#!/usr/bin/env node
// Builds one PowerPoint deck per module from the same content the website uses.
//   npm run build:pptx   ->   downloads/Module-<n>-<title>.pptx
// Each content slide becomes a PPT slide (title, bullets, code, tables, diagrams,
// labs, quizzes) with the detailed notes as speaker notes (quiz answers included).
import fs from 'node:fs';
import path from 'node:path';
import pptxgen from 'pptxgenjs';
import JSZip from 'jszip';
import { ROOT, loadCourse } from './load-course.mjs';

const { COURSE, MD, DG } = loadCourse();
const OUT = path.join(ROOT, 'downloads');
fs.mkdirSync(OUT, { recursive: true });

const W = 13.333, H = 7.5;                    // LAYOUT_WIDE
const FONT = 'Calibri', MONO = 'Consolas';
const INK = '1F2A24', MUTED = '5B6B60', CODE_BG = 'F3F6F4', LINE = 'D5DDD7';
const TYPE_COLORS = { theory: '4C8DFF', practical: '22A06B', lab: 'E8892E', quiz: '9B6BF0', summary: 'C99A2E', project: 'E05A72' };

const hex = (c) => c.replace('#', '').toUpperCase();
const slug = (m) => 'Module-' + m.no + '-' + m.title.replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (s) => MD.strip(String(s ?? '')).replace(/\s+/g, ' ').trim();

/** Inline markdown -> pptxgenjs text runs (bold, italic, code). */
function runs(text, base = {}) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|==[^=]+==|\[[^\]]+\]\([^)]+\)|(?<![\w*])\*[^*\s][^*]*\*(?![\w*]))/g;
  let last = 0, m;
  const s = String(text ?? '');
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), options: { ...base } });
    const t = m[0];
    if (t.startsWith('`')) out.push({ text: t.slice(1, -1), options: { ...base, fontFace: MONO, color: 'B4235A' } });
    else if (t.startsWith('**')) out.push({ text: t.slice(2, -2), options: { ...base, bold: true } });
    else if (t.startsWith('==')) out.push({ text: t.slice(2, -2), options: { ...base, bold: true } });
    else if (t.startsWith('[')) out.push({ text: t.replace(/\[([^\]]+)\]\([^)]+\)/, '$1'), options: { ...base } });
    else out.push({ text: t.slice(1, -1), options: { ...base, italic: true } });
    last = m.index + t.length;
  }
  if (last < s.length) out.push({ text: s.slice(last), options: { ...base } });
  return out.length ? out : [{ text: '', options: { ...base } }];
}

/** Paragraph list -> one addText() payload. items: [{text, level, bullet}] */
function paragraphs(items, fontSize) {
  const payload = [];
  items.forEach((it) => {
    const para = { fontSize: it.size || fontSize, color: it.color || INK, paraSpaceAfter: 4,
      bullet: it.bullet === false ? false : (it.numbered ? { type: 'number' } : { indent: 14 }), indentLevel: it.level || 0 };
    const r = runs(it.text, para);
    r[r.length - 1].options.breakLine = true;
    payload.push(...r);
  });
  return payload;
}

function flattenPoints(points, level = 0, acc = []) {
  (points || []).forEach((p, i) => {
    if (Array.isArray(p)) return;
    acc.push({ text: p, level });
    if (Array.isArray(points[i + 1])) flattenPoints(points[i + 1], level + 1, acc);
  });
  return acc;
}

/** Choose a font size so that the estimated wrapped line count fits the box. */
function fitSize(texts, widthIn, heightIn, max = 18, min = 10) {
  for (let f = max; f >= min; f--) {
    const charsPerLine = Math.max(10, Math.floor((widthIn * 72) / (f * 0.52)));
    const lines = texts.reduce((a, t) => a + Math.max(1, Math.ceil(plain(t).length / charsPerLine)), 0);
    if (lines * f * 1.45 / 72 + texts.length * 0.05 <= heightIn) return f;
  }
  return min;
}

function notesText(s, extra = []) {
  const blocks = [].concat(s.notes || []).map((b) => plain(String(b).replace(/^\s*[-•]\s+/, '• ')));
  return blocks.concat(extra).join('\n\n');
}

function drawFlow(slide, d, x, y, w, h) {
  const nodes = d.nodes.slice(0, 7);
  const vertical = d.dir === 'v';
  const gap = 0.35;
  if (vertical) {
    const bh = Math.min(0.62, (h - gap * (nodes.length - 1)) / nodes.length);
    nodes.forEach((n, i) => {
      const ny = y + i * (bh + gap);
      const t = typeof n === 'string' ? n : n.t, sub = typeof n === 'string' ? '' : (n.s || '');
      slide.addText([{ text: plain(t), options: { bold: true, fontSize: 12, breakLine: !!sub } }].concat(sub ? [{ text: plain(sub), options: { fontSize: 9.5, color: MUTED } }] : []),
        { x, y: ny, w, h: bh, shape: 'roundRect', rectRadius: 0.08, fill: { color: 'EEF4F0' }, line: { color: '9FB8A8', width: 1 }, align: 'center', valign: 'middle', fontFace: FONT, color: INK });
      if (i < nodes.length - 1) slide.addShape('line', { x: x + w / 2, y: ny + bh, w: 0, h: gap, line: { color: '6F8276', width: 1.25, endArrowType: 'triangle' } });
    });
    return;
  }
  const bw = Math.min(2.2, (w - gap * (nodes.length - 1)) / nodes.length);
  const total = bw * nodes.length + gap * (nodes.length - 1);
  const x0 = x + (w - total) / 2;
  nodes.forEach((n, i) => {
    const nx = x0 + i * (bw + gap);
    const t = typeof n === 'string' ? n : n.t, sub = typeof n === 'string' ? '' : (n.s || '');
    slide.addText([{ text: plain(t), options: { bold: true, fontSize: 11.5, breakLine: !!sub } }].concat(sub ? [{ text: plain(sub), options: { fontSize: 9, color: MUTED } }] : []),
      { x: nx, y, w: bw, h: Math.min(h, 1.0), shape: 'roundRect', rectRadius: 0.08, fill: { color: 'EEF4F0' }, line: { color: '9FB8A8', width: 1 }, align: 'center', valign: 'middle', fontFace: FONT, color: INK });
    if (i < nodes.length - 1) slide.addShape('line', { x: nx + bw, y: y + Math.min(h, 1.0) / 2, w: gap, h: 0, line: { color: '6F8276', width: 1.25, endArrowType: 'triangle' } });
  });
}

function addTable(slide, t, x, y, w, maxH) {
  const rows = [t.head.map((c) => ({ text: plain(c), options: { bold: true, color: 'FFFFFF', fill: { color: '2F6F4E' } } }))]
    .concat(t.rows.slice(0, 9).map((r) => r.map((c) => ({ text: plain(c) }))));
  const fs = t.rows.length > 6 || t.head.length > 4 ? 10 : 11.5;
  slide.addTable(rows, { x, y, w, fontFace: FONT, fontSize: fs, color: INK, border: { type: 'solid', color: LINE, pt: 0.75 },
    fill: { color: 'FFFFFF' }, valign: 'middle', margin: 0.05, rowH: Math.min(0.42, maxH / rows.length) });
}

function codeBlock(slide, c, x, y, w, h) {
  const tab = [].concat(c)[0];
  const maxLines = Math.max(6, Math.floor((h - 0.35) / 0.2));
  let lines = tab.src.split('\n');
  const truncated = lines.length > maxLines;
  if (truncated) lines = lines.slice(0, maxLines - 1).concat(['// … full listing in the web notes']);
  const longest = Math.max(...lines.map((l) => l.length));
  const fs = Math.max(7.5, Math.min(11, (w * 72) / (longest * 0.6), ((h - 0.35) * 72) / (lines.length * 1.3)));
  slide.addText(plain(tab.file || tab.label || tab.lang) + ([].concat(c).length > 1 ? `  (+${[].concat(c).length - 1} more in the web notes)` : ''),
    { x, y, w, h: 0.3, fontFace: MONO, fontSize: 9, color: MUTED, bold: true, fill: { color: 'E6ECE8' }, margin: 0.06 });
  slide.addText(lines.join('\n'), { x, y: y + 0.3, w, h: h - 0.3, fontFace: MONO, fontSize: fs, color: '24292F', fill: { color: CODE_BG },
    valign: 'top', margin: 0.08, line: { color: LINE, width: 0.75 } });
}

function header(slide, m, sessionNo, typeLabel, typeColor, title, lead) {
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.12, fill: { color: hex(m.color) }, line: { color: hex(m.color) } });
  if (typeLabel) slide.addText(typeLabel.toUpperCase(), { x: 0.5, y: 0.28, w: 1.6, h: 0.32, fontSize: 10, bold: true, color: 'FFFFFF', fill: { color: typeColor }, align: 'center', fontFace: FONT, shape: 'roundRect', rectRadius: 0.06 });
  if (sessionNo) slide.addText(`Session ${sessionNo}`, { x: 2.2, y: 0.28, w: 4, h: 0.32, fontSize: 10.5, color: MUTED, fontFace: FONT });
  slide.addText(plain(title), { x: 0.5, y: 0.62, w: W - 1, h: 0.75, fontSize: plain(title).length > 60 ? 24 : 28, bold: true, color: INK, fontFace: FONT, valign: 'top' });
  let y = 1.38;
  if (lead) {
    slide.addText(runs(lead, { fontSize: 13.5, color: MUTED, italic: false }), { x: 0.5, y, w: W - 1, h: 0.62, fontFace: FONT, valign: 'top' });
    y += 0.68;
  }
  return y;
}

function contentSlide(pptx, m, s, sl) {
  const slide = pptx.addSlide({ masterName: 'BODY' });
  const T = COURSE.types[sl.type] || { label: sl.type };
  let y = header(slide, m, s.no, T.label, TYPE_COLORS[sl.type] || '888888', sl.title, sl.lead);
  const bottom = H - 0.55;
  const notesExtra = [];

  const pts = flattenPoints(sl.points);
  const hasCode = !!sl.code;
  const diagram = sl.diagram && !Array.isArray(sl.diagram) ? sl.diagram : null;
  const reserveForBelow = (sl.table ? 1.9 : 0) + (sl.callout ? 0.65 : 0);

  if (sl.quiz) {
    const items = [];
    sl.quiz.forEach((q, i) => {
      items.push({ text: `Q${i + 1}. ${q.q}`, bullet: false, size: 13 });
      q.options.forEach((o, j) => items.push({ text: `${'ABCDEF'[j]}. ${o}`, level: 1, bullet: false, size: 11.5, color: MUTED }));
      notesExtra.push(`Q${i + 1} answer: ${'ABCDEF'[q.answer]} — ${plain(q.why)}`);
    });
    const fs = fitSize(items.map((i) => i.text), W - 1, bottom - y, 13, 8.5);
    slide.addText(paragraphs(items.map((i) => ({ ...i, size: i.level ? fs - 1 : fs })), fs), { x: 0.5, y, w: W - 1, h: bottom - y, fontFace: FONT, valign: 'top' });
  } else if (sl.steps) {
    const stepItems = sl.steps.map((t) => ({ text: t, numbered: true }));
    const leftW = hasCode ? 6.1 : W - 1;
    const fs = fitSize(sl.steps, leftW, bottom - y, 15, 9);
    slide.addText(paragraphs(stepItems, fs), { x: 0.5, y, w: leftW, h: bottom - y, fontFace: FONT, valign: 'top' });
    if (hasCode) codeBlock(slide, sl.code, 6.8, y, W - 7.3, bottom - y);
  } else {
    const bodyH = bottom - y - reserveForBelow;
    const visual = hasCode || (diagram && ['flow', 'layers', 'tree', 'grid', 'compare', 'pyramid', 'tiers', 'erd', 'seq', 'graph', 'buckets'].includes(diagram.kind));
    const leftW = pts.length && visual ? 5.6 : W - 1;
    if (pts.length) {
      const fs = fitSize(pts.map((p) => p.text), leftW, bodyH, 17, 10);
      slide.addText(paragraphs(pts, fs), { x: 0.5, y, w: leftW, h: bodyH, fontFace: FONT, valign: 'top' });
    }
    const vx = pts.length ? 6.4 : 0.5, vw = pts.length ? W - 6.9 : W - 1;
    if (hasCode && (!diagram || pts.length)) {
      codeBlock(slide, sl.code, vx, y, vw, bodyH);
    } else if (diagram && diagram.kind === 'flow') {
      drawFlow(slide, diagram, vx, y + 0.1, vw, diagram.dir === 'v' ? bodyH - 0.1 : Math.min(1.1, bodyH));
      if (hasCode && diagram.dir !== 'v') codeBlock(slide, sl.code, vx, y + 1.35, vw, bodyH - 1.35);
    } else if (diagram) {
      const lines = DG.text(diagram);
      const fs = fitSize(lines, vw, bodyH, 13, 8);
      slide.addText(paragraphs(lines.map((l) => ({ text: l.replace(/^ +/, ''), level: Math.min(4, Math.floor((l.match(/^ */)[0].length) / 4)) })), fs),
        { x: vx, y, w: vw, h: bodyH, fontFace: FONT, valign: 'top', fill: { color: 'F7F9F8' }, line: { color: LINE, width: 0.75 }, margin: 0.12 });
      if (hasCode && !pts.length) notesExtra.push('(Code for this slide is in the web notes.)');
    }
    if (sl.cards) {
      const cardText = sl.cards.map((c) => `**${c[0]}** — ${c[1]}`);
      const cy = pts.length ? y + Math.min(bodyH, 0.45 * pts.length + 0.6) : y;
      const fs = fitSize(cardText, W - 1, bottom - cy, 13, 9);
      slide.addText(paragraphs(cardText.map((t) => ({ text: t, bullet: true })), fs), { x: 0.5, y: cy, w: W - 1, h: bottom - cy, fontFace: FONT, valign: 'top' });
    }
    let by = bottom - reserveForBelow + 0.05;
    if (sl.table) { addTable(slide, sl.table, 0.5, by, W - 1, 1.8); by += 1.9; }
    if (sl.callout) {
      const c = [].concat(sl.callout)[0];
      slide.addText([{ text: (c.title || (c.kind || 'note').toUpperCase()) + ': ', options: { bold: true } }].concat(runs(c.text)),
        { x: 0.5, y: Math.min(by, bottom - 0.6), w: W - 1, h: 0.58, fontSize: 11, fontFace: FONT, color: INK, fill: { color: 'FFF8E1' }, line: { color: 'E9C46A', width: 0.75 }, margin: 0.08, valign: 'middle' });
    }
  }
  if (sl.code && sl.steps == null && [].concat(sl.code)[0].out) notesExtra.push('Expected output:\n' + [].concat(sl.code)[0].out);
  slide.addNotes(notesText(sl, notesExtra));
}

function coverSlide(pptx, m, s) {
  const slide = pptx.addSlide({ masterName: 'BODY' });
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.12, fill: { color: hex(m.color) }, line: { color: hex(m.color) } });
  slide.addText(`SESSION ${s.no} OF 24  ·  MODULE ${m.no}`, { x: 0.5, y: 0.45, w: 8, h: 0.35, fontSize: 12, bold: true, color: hex(m.color), fontFace: FONT });
  slide.addText(plain(s.title), { x: 0.5, y: 0.85, w: W - 1, h: 1.1, fontSize: 30, bold: true, color: INK, fontFace: FONT, valign: 'top' });
  const topics = (s.covers || []).map((i) => ({ text: '✓ ' + m.topics[i], bullet: false })).concat((s.extra || []).map((x) => ({ text: '+ ' + x, bullet: false })));
  slide.addText('Brochure topics covered', { x: 0.5, y: 2.1, w: 6, h: 0.35, fontSize: 13, bold: true, color: MUTED, fontFace: FONT });
  slide.addText(paragraphs(topics, 14), { x: 0.5, y: 2.45, w: 6.1, h: 1.6, fontFace: FONT, valign: 'top' });
  slide.addText('Learning objectives', { x: 0.5, y: 4.1, w: 6, h: 0.35, fontSize: 13, bold: true, color: MUTED, fontFace: FONT });
  slide.addText(paragraphs((s.objectives || []).map((o) => ({ text: o })), 12.5), { x: 0.5, y: 4.45, w: 6.1, h: 2.5, fontFace: FONT, valign: 'top' });
  slide.addText('Agenda', { x: 7, y: 2.1, w: 5.8, h: 0.35, fontSize: 13, bold: true, color: MUTED, fontFace: FONT });
  const agenda = s.slides.map((sl) => ({ text: `${(COURSE.types[sl.type] || {}).label}: ${plain(sl.title)}`, numbered: true }));
  slide.addText(paragraphs(agenda, fitSize(agenda.map((a) => a.text), 5.8, 4.5, 12.5, 9)), { x: 7, y: 2.45, w: 5.8, h: 4.5, fontFace: FONT, valign: 'top' });
  slide.addNotes(`Session ${s.no}: ${plain(s.title)}.${s.prereq ? '\n\nBefore you start: ' + plain(s.prereq) : ''}`);
}

for (const m of COURSE.modules) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Java Backend Interactive Course Notes';
  pptx.title = `Module ${m.no}: ${m.title}`;
  pptx.subject = COURSE.brochure.title;
  pptx.defineSlideMaster({
    title: 'BODY',
    background: { color: 'FFFFFF' },
    objects: [
      { line: { x: 0.5, y: H - 0.45, w: W - 1, h: 0, line: { color: LINE, width: 0.75 } } },
      { text: { text: `Module ${m.no} · ${m.title}  —  based on the GeeksforGeeks “${COURSE.brochure.title}” syllabus`, options: { x: 0.5, y: H - 0.42, w: W - 2, h: 0.3, fontSize: 9, color: MUTED, fontFace: FONT } } }
    ],
    slideNumber: { x: W - 1.0, y: H - 0.42, w: 0.5, h: 0.3, fontSize: 9, color: MUTED, fontFace: FONT, align: 'right' }
  });

  const sessions = COURSE.sessions.filter((s) => s.no >= m.sessions[0] && s.no <= m.sessions[1]);

  // title slide
  const t = pptx.addSlide();
  t.background = { color: '10251A' };
  t.addShape('rect', { x: 0, y: 0, w: 0.25, h: H, fill: { color: hex(m.color) }, line: { color: hex(m.color) } });
  t.addText(`MODULE ${m.no}  ·  SESSIONS ${m.sessions[0]}–${m.sessions[1]}`, { x: 0.8, y: 1.3, w: 11, h: 0.5, fontSize: 16, bold: true, color: hex(m.color), fontFace: FONT });
  t.addText(m.title, { x: 0.8, y: 1.85, w: 11.5, h: 1.4, fontSize: 44, bold: true, color: 'FFFFFF', fontFace: FONT, valign: 'top' });
  t.addText(m.blurb, { x: 0.8, y: 3.4, w: 11, h: 1.1, fontSize: 18, color: 'C9D8CE', fontFace: FONT, valign: 'top' });
  t.addText('Java Backend Development — Interactive Course Notes', { x: 0.8, y: 5.4, w: 11, h: 0.4, fontSize: 14, color: 'F3EF6B', fontFace: FONT, bold: true });
  t.addText(`Independent study companion based on the ${COURSE.brochure.provider} “${COURSE.brochure.title}” brochure. Code targets ${COURSE.stack.java}, ${COURSE.stack.boot}.`,
    { x: 0.8, y: 5.85, w: 11.5, h: 0.6, fontSize: 11, color: '9FB3A6', fontFace: FONT });
  t.addNotes(`Module ${m.no}: ${m.title}. ${m.blurb}`);

  // agenda slide
  const a = pptx.addSlide({ masterName: 'BODY' });
  header(a, m, null, null, null, 'Module roadmap', 'Brochure topics in order, and the session that teaches each one.');
  a.addTable([[{ text: '#', options: { bold: true, color: 'FFFFFF', fill: { color: '2F6F4E' } } },
    { text: 'Brochure topic (verbatim)', options: { bold: true, color: 'FFFFFF', fill: { color: '2F6F4E' } } },
    { text: 'Session(s)', options: { bold: true, color: 'FFFFFF', fill: { color: '2F6F4E' } } }]]
    .concat(m.topics.map((tp, i) => [{ text: String(i + 1) }, { text: tp },
      { text: sessions.filter((s) => (s.covers || []).includes(i)).map((s) => 'S' + s.no).join(', ') }])),
  { x: 0.5, y: 2.1, w: W - 1, colW: [0.6, 9.6, 2.13], fontFace: FONT, fontSize: 13, color: INK, border: { type: 'solid', color: LINE, pt: 0.75 }, rowH: 0.48 });
  a.addNotes('Roadmap of the module: each brochure topic and where it is taught.' + (m.project ? `\n\nProject: ${m.project}` : ''));

  for (const s of sessions) {
    coverSlide(pptx, m, s);
    for (const sl of s.slides) contentSlide(pptx, m, s, sl);
  }

  const file = path.join(OUT, slug(m) + '.pptx');
  // pptxgenjs stores entries uncompressed; re-zip with DEFLATE (5-10x smaller files)
  const raw = await pptx.write({ outputType: 'nodebuffer' });
  const zipped = await (await JSZip.loadAsync(raw)).generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
  fs.writeFileSync(file, zipped);
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`\u2705 ${path.relative(ROOT, file)}  (${2 + sessions.reduce((acc, s) => acc + 1 + s.slides.length, 0)} slides, ${kb} KB)`);
}
