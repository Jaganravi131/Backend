/* Java Backend Course — interactive slide/notes engine.
 * Vanilla JS, no build step. Works from a static server or file://.
 *
 * Routes:
 *   #/                home            #/syllabus   syllabus coverage map
 *   #/projects        projects        #/print/N    printable notes for module N
 *   #/m/N             module N cover  #/m/N/end    module wrap-up
 *   #/s/N             session cover   #/s/N/K      slide K of session N
 *   #/interview[/tab] FAANG interview track: coding, design, bank, mock, patterns, behavioral */
(function () {
  'use strict';
  var C = window.COURSE, MD = window.MD, DG = window.DG;
  var inl = MD.inline, esc = MD.esc;
  var app = document.getElementById('app');
  var PRINT = false;
  var codeSeq = 0;

  function $(s, el) { return (el || document).querySelector(s); }
  function scrollTo(el, opts) { if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView(opts); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  /* ------------------------------------------------------------ storage */
  var KEY = 'jbc-progress-v1';
  function fresh() { return { viewed: {}, quiz: {}, labs: {}, rounds: {}, iq: {}, scratch: {}, mock: null, notes: true, side: true, theme: null }; }
  var S = (function () {
    try { var x = JSON.parse(localStorage.getItem(KEY) || 'null'); return x ? Object.assign(fresh(), x) : fresh(); }
    catch (e) { return fresh(); }
  })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

  /* ------------------------------------------------------------ theme */
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
  function currentTheme() {
    return S.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
  applyTheme(currentTheme());

  /* ------------------------------------------------------------ decks */
  var DECKS = C.modules.map(function (m) {
    var sess = C.sessions.filter(function (s) { return s.no >= m.sessions[0] && s.no <= m.sessions[1]; });
    var list = [{ kind: 'mcover', key: 'm' + m.no, href: '#/m/' + m.no, title: 'Module overview', module: m }];
    sess.forEach(function (s) {
      list.push({ kind: 'scover', key: s.id, href: '#/s/' + s.no, title: 'Session overview', session: s, module: m });
      s.slides.forEach(function (sl, i) {
        list.push({ kind: 'slide', key: s.id + ':' + (i + 1), href: '#/s/' + s.no + '/' + (i + 1),
          title: sl.title, slide: sl, idx: i + 1, session: s, module: m });
      });
    });
    list.push({ kind: 'mend', key: 'm' + m.no + ':end', href: '#/m/' + m.no + '/end', title: 'Module wrap-up', module: m });
    list.forEach(function (e, i) { e.pos = i; });
    return { module: m, sessions: sess, list: list,
      content: list.filter(function (e) { return e.kind === 'slide'; }) };
  });
  var BYKEY = {};
  DECKS.forEach(function (d) { d.list.forEach(function (e) { BYKEY[e.key] = { deck: d, entry: e }; }); });

  function typeCounts(slides) {
    var c = {};
    slides.forEach(function (s) { c[s.type] = (c[s.type] || 0) + 1; });
    return c;
  }
  function sessionsCovering(m, ti) {
    return C.sessions.filter(function (s) {
      return s.no >= m.sessions[0] && s.no <= m.sessions[1] && (s.covers || []).indexOf(ti) >= 0;
    });
  }
  function totals() {
    var t = { slides: 0, code: 0, labs: 0, quizQ: 0, diagrams: 0, theory: 0, practical: 0, sessions: C.sessions.length,
      deep: 0, coding: 0, codingHard: 0, design: 0, qa: 0, hardQ: 0 };
    C.sessions.forEach(function (s) {
      s.slides.forEach(function (sl) {
        t.slides++;
        if (sl.code) t.code += [].concat(sl.code).length;
        if (sl.diagram) t.diagrams += [].concat(sl.diagram).length;
        if (sl.steps) t.labs++;
        if (sl.quiz) {
          t.quizQ += sl.quiz.length;
          t.hardQ += sl.quiz.filter(function (q) { return q.level >= 2; }).length;
        }
        if (sl.type === 'theory') t.theory++;
        if (sl.type === 'practical') t.practical++;
        if (sl.type === 'deep') t.deep++;
        if (sl.type === 'coding') { t.coding++; if (sl.difficulty === 'Hard') t.codingHard++; }
        if (sl.type === 'design') t.design++;
        if (sl.qa) t.qa += sl.qa.length;
        (sl.stages || []).forEach(function (st) { if (st.diagram) t.diagrams++; if (st.code) t.code += [].concat(st.code).length; });
        (sl.qa || []).forEach(function (x) { if (x.code) t.code++; });
      });
    });
    return t;
  }
  function deckProgress(d) {
    var seen = d.content.filter(function (e) { return S.viewed[e.key]; }).length;
    return { seen: seen, total: d.content.length, pct: d.content.length ? Math.round(100 * seen / d.content.length) : 0 };
  }
  function sessionProgress(s) {
    var n = s.slides.length, seen = 0;
    for (var i = 1; i <= n; i++) if (S.viewed[s.id + ':' + i]) seen++;
    return { seen: seen, total: n, pct: n ? Math.round(100 * seen / n) : 0 };
  }
  function pptxHref(m) {
    return 'downloads/Module-' + m.no + '-' + m.title.replace(/&/g, 'and').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pptx';
  }

  /* ------------------------------------------------------------ components */
  var ALIAS = { yml: 'yaml', sh: 'bash', shell: 'bash', console: 'bash', text: 'plaintext', txt: 'plaintext',
    js: 'javascript', docker: 'dockerfile', promql: 'plaintext', env: 'properties', gitignore: 'plaintext' };
  function highlight(src, lang) {
    var l = ALIAS[lang] || lang || 'plaintext';
    try {
      if (window.hljs && window.hljs.getLanguage(l)) return window.hljs.highlight(src, { language: l, ignoreIllegals: true }).value;
    } catch (e) { /* fall through */ }
    return esc(src);
  }
  function codeIsWide(c) {
    return [].concat(c).some(function (t) {
      var lines = t.src.split('\n');
      return lines.length > 38 || lines.some(function (l) { return l.length > 80; });
    });
  }
  function codeHTML(c) {
    var tabs = [].concat(c), id = 'code' + (++codeSeq);
    var h = '<div class="code" id="' + id + '">';
    if (tabs.length > 1 && !PRINT) {
      h += '<div class="code-tabs" role="tablist">' + tabs.map(function (t, i) {
        return '<button role="tab" aria-selected="' + (i ? 'false' : 'true') + '" class="' + (i ? '' : 'on') + '" data-tab="' + i + '">' +
          esc(t.label || t.file || t.lang) + '</button>';
      }).join('') + '</div>';
    }
    tabs.forEach(function (t, i) {
      h += '<div class="code-pane" data-pane="' + i + '"' + (i && !PRINT ? ' hidden' : '') + '>' +
        '<div class="code-bar"><span class="code-file">' + esc(t.file || t.label || '') + '</span>' +
        '<span class="code-lang">' + esc(t.lang || 'text') + '</span>' +
        (PRINT ? '' : '<button class="code-copy" data-act="copy" title="Copy to clipboard">Copy</button>') + '</div>' +
        '<pre><code class="hljs">' + highlight(t.src, t.lang) + '</code></pre>' +
        (t.out ? '<div class="code-outwrap">' + (PRINT ? '<div class="code-outh">Output</div>' :
          '<button class="code-run" data-act="run">\u25B6 Show output</button>') +
          '<pre class="code-out"' + (PRINT ? '' : ' hidden') + '>' + esc(t.out) + '</pre></div>' : '') +
        '</div>';
    });
    return h + '</div>';
  }
  function tableHTML(t) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + t.head.map(function (x) { return '<th>' + inl(x) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + t.rows.map(function (r) {
        return '<tr>' + r.map(function (x) { return '<td>' + inl(x) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }
  var CALL = { tip: ['\u{1F4A1}', 'Tip'], warn: ['\u26A0\uFE0F', 'Watch out'], info: ['\u2139\uFE0F', 'Note'],
    version: ['\u{1F195}', 'Version note (2026)'], interview: ['\u{1F3AF}', 'Interview corner'],
    pitfall: ['\u{1F41E}', 'Common pitfall'], best: ['\u2705', 'Best practice'] };
  function calloutHTML(c) {
    var k = CALL[c.kind] || CALL.info;
    return '<div class="callout c-' + (c.kind || 'info') + '"><div class="co-h">' + k[0] + ' ' + esc(c.title || k[1]) +
      '</div><div class="co-b">' + inl(c.text) + '</div></div>';
  }
  function labHTML(steps, key) {
    var st = S.labs[key] || [];
    var done = steps.filter(function (_, i) { return st[i]; }).length;
    return '<div class="lab" data-lab="' + key + '"><div class="lab-h"><b>\u{1F9EA} Lab steps</b><span class="lab-prog">' +
      (PRINT ? steps.length + ' steps' : done + ' / ' + steps.length + ' done') + '</span></div><ol>' +
      steps.map(function (s, i) {
        return '<li><label><input type="checkbox" data-act="lab" data-i="' + i + '"' + (st[i] && !PRINT ? ' checked' : '') +
          '><span>' + inl(s) + '</span></label></li>';
      }).join('') + '</ol></div>';
  }
  function quizHTML(qs, key) {
    var h = '<div class="quiz" data-quiz="' + key + '">';
    qs.forEach(function (q, qi) {
      h += '<div class="qz" data-q="' + qi + '"><p class="qz-q"><b>Q' + (qi + 1) + '.</b> ' + lvlBadge(q.level) + inl(q.q) + '</p>' +
        (q.code ? quizCode(q.code) : '') + '<div class="qz-opts">' +
        q.options.map(function (o, oi) {
          return '<button class="qz-o" data-act="answer" data-o="' + oi + '"><span class="qz-l">' + 'ABCDEF'.charAt(oi) +
            '</span><span class="qz-t">' + inl(o) + '</span></button>';
        }).join('') + '</div><div class="qz-why" hidden></div></div>';
    });
    if (!PRINT) h += '<div class="qz-foot"><span class="qz-score"></span><button class="btn ghost sm" data-act="quiz-reset">\u21BA Reset quiz</button></div>';
    return h + '</div>';
  }
  function applyAnswer(qz, q, picked) {
    var opts = $$('.qz-o', qz);
    opts.forEach(function (b, i) {
      b.disabled = true;
      b.classList.toggle('ok', i === q.answer);
      b.classList.toggle('bad', i === picked && picked !== q.answer);
    });
    var why = $('.qz-why', qz);
    var right = picked === q.answer;
    why.hidden = false;
    why.className = 'qz-why ' + (PRINT ? 'show' : right ? 'yes' : 'no');
    why.innerHTML = (PRINT ? '<b>Answer: ' + 'ABCDEF'.charAt(q.answer) + '.</b> ' :
      right ? '<b>\u2705 Correct.</b> ' : '<b>\u274C Not quite \u2014 the answer is ' + 'ABCDEF'.charAt(q.answer) + '.</b> ') + inl(q.why || '');
  }
  function restoreQuiz(root) {
    $$('.quiz', root).forEach(function (qe) {
      var hit = BYKEY[qe.getAttribute('data-quiz')];
      if (!hit) return;
      var qs = hit.entry.slide.quiz, st = S.quiz[hit.entry.key] || {};
      $$('.qz', qe).forEach(function (qz, qi) {
        if (PRINT) applyAnswer(qz, qs[qi], qs[qi].answer);
        else if (st[qi] != null) applyAnswer(qz, qs[qi], st[qi]);
      });
      updateScore(qe, qs, st);
    });
  }
  function updateScore(qe, qs, st) {
    var el = $('.qz-score', qe);
    if (!el) return;
    var answered = 0, right = 0;
    qs.forEach(function (q, i) { if (st[i] != null) { answered++; if (st[i] === q.answer) right++; } });
    el.innerHTML = answered ? 'Score: <b>' + right + ' / ' + qs.length + '</b>' + (answered === qs.length ? (right === qs.length ? ' \u{1F3C6} Perfect!' : ' \u2014 review the notes and retry') : ' (' + (qs.length - answered) + ' left)') : 'Answer all ' + qs.length + ' questions';
  }
  function cardsHTML(cards) {
    return '<div class="flash"><div class="flash-h">\u{1F0CF} Flashcards' + (PRINT ? '' : ' \u2014 click a card to flip') + '</div><div class="flash-grid">' +
      cards.map(function (c) {
        return '<button class="fc" data-act="flip"><span class="fc-in"><span class="fc-f">' + inl(c[0]) + '</span><span class="fc-b">' +
          inl(c[1]) + '</span></span></button>';
      }).join('') + '</div></div>';
  }
  function chips(counts) {
    return Object.keys(C.types).filter(function (k) { return counts[k]; }).map(function (k) {
      return '<span class="chip t-' + k + '">' + C.types[k].icon + ' ' + counts[k] + ' ' + C.types[k].label + '</span>';
    }).join('');
  }
  function bar(p) { return '<div class="pbar" title="' + p.pct + '% viewed"><i style="width:' + p.pct + '%"></i></div>'; }

  /* ------------------------------------------------------------ interview track components */
  var LV = C.levels || { 1: 'SDE-1', 2: 'SDE-2', 3: 'Senior' };
  var PAT = {};
  ((C.track && C.track.patterns) || []).forEach(function (p) { PAT[p.id] = p; });
  function patLabel(id) { return PAT[id] ? PAT[id].name : id; }
  function slug(x) { return MD.strip(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
  /* stable key for self-ratings / notes: survives slides being inserted before it */
  function rkey(e) { return e.session.id + '#' + slug(e.slide.title); }
  function lvlBadge(l) { return l ? '<span class="lvl l' + l + '" title="Expected seniority">' + esc(LV[l] || 'L' + l) + '</span> ' : ''; }
  function diffBadge(d) { return d ? '<span class="diff d-' + esc(String(d).toLowerCase()) + '">' + esc(d) + '</span>' : ''; }
  function allCode(s) {
    var out = [].concat(s.code || []);
    (s.qa || []).forEach(function (x) { if (x.code) out = out.concat(x.code); });
    (s.stages || []).forEach(function (x) { if (x.code) out = out.concat(x.code); });
    (s.quiz || []).forEach(function (x) { if (x.code && typeof x.code === 'object') out.push(x.code); });
    return out;
  }
  function quizCode(c) {
    var t = typeof c === 'string' ? { src: c } : c;
    return codeHTML({ lang: t.lang || 'java', file: t.file || 'Predict the output', src: t.src });
  }
  function stretchHTML(list) {
    return '<div class="stretch"><div class="stretch-h">\u{1F680} Level up \u2014 interview-grade stretch goals</div>' + MD.points(list) + '</div>';
  }
  function revealHTML(label, inner) {
    if (PRINT) return '<div class="rv open"><div class="rv-h">' + label + '</div><div class="rv-c">' + inner + '</div></div>';
    return '<div class="rv"><button class="rv-b" data-act="reveal" aria-expanded="false"><span>\u25B8 ' + label + '</span><small>click to reveal</small></button>' +
      '<div class="rv-c" hidden>' + inner + '</div></div>';
  }

  /* interview clock: one shared ticker updates whichever timer is on screen */
  var TIMERS = {};
  function fmtMs(ms) { var x = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(x / 60) + ':' + ('0' + x % 60).slice(-2); }
  function timerHTML(k, min) {
    if (!min) return '';
    if (PRINT) return '<span class="chip">\u23F1 ' + min + ' min</span>';
    var t = TIMERS[k] || (TIMERS[k] = { total: min * 60000, left: min * 60000, end: null });
    var left = t.end ? t.end - Date.now() : t.left;
    return '<span class="timer' + (t.end ? ' run' : '') + (left <= 0 ? ' up' : '') + '" data-timer="' + esc(k) + '" title="Interview clock (' + min + ' min)">' +
      '<span class="tm-ic" aria-hidden="true">\u23F1</span><span class="tm">' + fmtMs(left) + '</span>' +
      '<button class="tm-b" data-act="timer" aria-label="Start or pause the clock">' + (t.end ? '\u23F8' : '\u25B6') + '</button>' +
      '<button class="tm-b" data-act="timer-reset" aria-label="Reset the clock">\u21BA</button></span>';
  }
  setInterval(function () {
    $$('.timer[data-timer]').forEach(function (el) {
      var t = TIMERS[el.getAttribute('data-timer')];
      if (!t || !t.end) return;
      var left = t.end - Date.now();
      $('.tm', el).textContent = fmtMs(left);
      if (left <= 0) {
        t.left = 0; t.end = null;
        el.classList.remove('run'); el.classList.add('up');
        $('[data-act="timer"]', el).textContent = '\u25B6';
      }
    });
  }, 500);

  var RATE = [['solo', '\u2705 Solved on my own'], ['hints', '\u{1F4A1} Needed hints'], ['revisit', '\u{1F501} Revisit']];
  function rateHTML(k) {
    if (PRINT) return '';
    var v = S.rounds[k];
    return '<div class="rate" data-rate="' + esc(k) + '"><span>How did it go?</span>' + RATE.map(function (r) {
      return '<button class="btn sm' + (v === r[0] ? ' on' : '') + '" data-act="rate" data-v="' + r[0] + '" aria-pressed="' + (v === r[0]) + '">' + r[1] + '</button>';
    }).join('') + '</div>';
  }
  function hintsHTML(hints) {
    if (PRINT) return '<div class="hints open"><b>\u{1F4A1} Hints</b><ol>' + hints.map(function (x) { return '<li>' + inl(x) + '</li>'; }).join('') + '</ol></div>';
    return '<div class="hints"><ol>' + hints.map(function (x) { return '<li hidden>' + inl(x) + '</li>'; }).join('') + '</ol>' +
      '<button class="btn sm" data-act="hint">\u{1F4A1} Show hint 1 of ' + hints.length + '</button></div>';
  }
  function followHTML(list) {
    return '<div class="fups"><div class="fups-h">\u{1F501} Follow-up questions the interviewer will ask</div>' + list.map(function (x) {
      return PRINT ? '<div class="fu open"><p class="fu-q">' + inl(x.q) + '</p><div class="fu-a">' + MD.blocks(x.a) + '</div></div>' :
        '<details class="fu"><summary><span>' + inl(x.q) + '</span></summary><div class="fu-a">' + MD.blocks(x.a) + '</div></details>';
    }).join('') + '</div>';
  }
  function rubricHTML(list) {
    return '<div class="rubric"><div class="rubric-h">\u{1F4CB} What the interviewer is scoring</div>' + MD.points(list) + '</div>';
  }
  function approachesTable(a) {
    return '<div class="apx">' + tableHTML({ head: ['Approach', 'Idea', 'Time', 'Space'], rows: a.map(function (x) {
      return ['**' + x.name + '**', x.idea, '`' + x.time + '`', '`' + x.space + '`'];
    }) }) + '</div>';
  }

  function codingHTML(e) {
    var s = e.slide, k = rkey(e);
    var langs = [].concat(s.code || []).map(function (c) { return c.lang; });
    var h = '<div class="round-h">' + diffBadge(s.difficulty) + (s.lc ? '<span class="chip lc" title="Same problem as LeetCode #' + s.lc + '">LeetCode ' + s.lc + '</span>' : '') +
      (s.pattern || []).map(function (p) { return '<a class="chip pat" href="#/interview/patterns/' + esc(p) + '">' + esc(patLabel(p)) + '</a>'; }).join('') +
      timerHTML(k, s.minutes) + '</div>';
    h += '<div class="prob">' + MD.blocks(s.problem) + '</div>';
    if (s.examples) {
      h += '<div class="exs">' + s.examples.map(function (x, i) {
        return '<div class="ex"><div class="ex-h">Example ' + (i + 1) + '</div><div class="ex-r"><b>Input</b><pre>' + esc(x.in) + '</pre></div>' +
          '<div class="ex-r"><b>Output</b><pre>' + esc(x.out) + '</pre></div>' + (x.why ? '<p class="ex-why">' + inl(x.why) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (s.constraints) h += '<div class="cons"><b>Constraints</b>' + MD.points(s.constraints) + '</div>';
    if (!PRINT) {
      h += '<label class="scratch"><span>\u270D\uFE0F Think out loud first \u2014 clarifying questions, brute force, a better idea, complexity, edge cases (saved in this browser)</span>' +
        '<textarea data-scratch="' + esc(k) + '" rows="4" spellcheck="false" placeholder="Clarify: \u2026&#10;Brute force: \u2026 O(?)&#10;Better: \u2026&#10;Edge cases: \u2026">' + esc(S.scratch[k] || '') + '</textarea></label>';
    }
    if (s.hints) h += hintsHTML(s.hints);
    if (s.approaches) h += revealHTML('Approaches &amp; complexity', approachesTable(s.approaches));
    if (s.code) {
      h += revealHTML('Reference solution (' + (langs.indexOf('sql') >= 0 ? 'SQL' : 'Java') + ', verified by running it)', codeHTML(s.code) +
        (s.pitfalls ? '<div class="pit"><div class="pit-h">\u{1F41E} Edge cases &amp; pitfalls</div>' + MD.points(s.pitfalls) + '</div>' : ''));
    }
    if (s.followUps) h += followHTML(s.followUps);
    if (s.rubric) h += rubricHTML(s.rubric);
    return h + rateHTML(k);
  }

  function designHTML(e) {
    var s = e.slide, k = rkey(e);
    var h = '<div class="round-h"><span class="diff d-' + esc(String(s.kind || 'HLD').toLowerCase()) + '">' + esc(s.kind === 'LLD' ? 'Low-level design' : 'High-level design') + '</span>' +
      diffBadge(s.difficulty) + timerHTML(k, s.minutes) + '</div>';
    h += '<blockquote class="prompt"><b>Interviewer:</b> ' + inl(s.prompt) + '</blockquote>';
    h += '<ol class="stages">' + s.stages.map(function (st, i) {
      var body = (st.points ? MD.points(st.points) : '') + (st.diagram ? DG.render(st.diagram) : '') + (st.table ? tableHTML(st.table) : '') +
        (st.code ? codeHTML(st.code) : '') + (st.callout ? [].concat(st.callout).map(calloutHTML).join('') : '');
      return '<li class="stg' + (PRINT ? ' open' : '') + '"><div class="stg-h"><span class="stg-n">' + (i + 1) + '</span><div class="stg-t"><b>' + inl(st.t) + '</b>' +
        (st.ask ? '<p class="stg-ask">' + inl(st.ask) + '</p>' : '') + '</div>' +
        (PRINT ? '' : '<button class="btn sm" data-act="stage" aria-expanded="false">Reveal</button>') + '</div>' +
        '<div class="stg-b"' + (PRINT ? '' : ' hidden') + '>' + body + '</div></li>';
    }).join('') + '</ol>';
    if (!PRINT) h += '<div class="cta sm"><button class="btn sm" data-act="stage-all">\u{1F441}\uFE0F Reveal every stage</button></div>';
    if (s.followUps) h += followHTML(s.followUps);
    if (s.rubric) h += rubricHTML(s.rubric);
    return h + rateHTML(k);
  }

  function qaSummary(c, n, total) {
    return n ? '\u2713 ' + c[2] + ' nailed \u00B7 ~ ' + c[1] + ' partly \u00B7 \u2717 ' + c[0] + ' missed \u00B7 ' + (total - n) + ' to go' :
      total + ' questions \u2014 answer out loud first, then reveal the model answer and rate yourself';
  }
  function qaSummaryOf(items) {
    var c = [0, 0, 0], n = 0;
    items.forEach(function (it) { var r = (S.iq[it.k] || {})[it.i]; if (r != null) { c[r]++; n++; } });
    return qaSummary(c, n, items.length);
  }
  function refreshQa(scope) {
    var el = scope && $('.qa-sum', scope);
    if (!el) return;
    var c = [0, 0, 0], n = 0, cards = $$('.qa-c', scope);
    if (!cards.length) { el.textContent = ''; return; }
    cards.forEach(function (cd) { var r = cd.getAttribute('data-r'); if (r !== 'u') { c[+r]++; n++; } });
    el.textContent = qaSummary(c, n, cards.length);
  }
  function qaRate(r) {
    return '<span class="qa-rate" role="group" aria-label="Rate your answer">' + [[2, '\u2713 Nailed it'], [1, '~ Partly'], [0, '\u2717 Missed']].map(function (b) {
      return '<button class="rt rt' + b[0] + (r === b[0] ? ' on' : '') + '" data-act="qa-rate" data-v="' + b[0] + '" aria-pressed="' + (r === b[0]) + '">' + b[1] + '</button>';
    }).join('') + '</span>';
  }
  function qaCard(it, n) {
    var x = it.x, r = (S.iq[it.k] || {})[it.i];
    var ans = MD.blocks(x.a) + (x.code ? codeHTML(x.code) : '') +
      (x.follow ? '<div class="qa-fu"><b>\u{1F501} Likely follow-ups</b>' + MD.points(x.follow) + '</div>' : '') +
      (x.flags ? '<div class="qa-flag"><b>\u{1F6A9} Red flags \u2014 answers that sink candidates</b>' + MD.points(x.flags) + '</div>' : '');
    return '<article class="qa-c fi" data-l="' + (x.level || 1) + '" data-m="' + it.e.module.no + '" data-r="' + (r == null ? 'u' : r) + '" data-k="' + esc(it.k) + '" data-i="' + it.i + '">' +
      '<div class="qa-q"><span class="qa-n">Q' + (n + 1) + '</span>' + lvlBadge(x.level) + '<span class="qa-t">' + inl(x.q) + '</span></div>' +
      (it.where ? '<div class="qa-w">' + it.where + '</div>' : '') +
      (PRINT ? '<div class="qa-a">' + ans + '</div>' :
        '<div class="qa-ctl"><button class="btn sm" data-act="qa-toggle" aria-expanded="false">\u{1F441}\uFE0F Model answer</button>' + qaRate(r) + '</div>' +
        '<div class="qa-a" hidden>' + ans + '</div>') + '</article>';
  }
  function segHTML(field, opts) {
    return '<span class="seg" role="group">' + opts.map(function (o, i) {
      return '<button class="' + (i ? '' : 'on') + '" data-act="flt" data-f="' + field + '" data-v="' + esc(o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</span>';
  }
  function interviewHTML(e) {
    var s = e.slide, k = rkey(e);
    var items = s.qa.map(function (x, i) { return { x: x, k: k, i: i, e: e }; });
    var lv = [1, 2, 3].filter(function (l) { return items.some(function (it) { return (it.x.level || 1) === l; }); });
    var bar = PRINT ? '' : '<div class="qa-bar"><span class="qa-sum">' + qaSummaryOf(items) + '</span>' +
      segHTML('l', [['', 'All levels']].concat(lv.map(function (l) { return [String(l), esc(LV[l])]; }))) +
      '<button class="btn sm ghost" data-act="qa-all">\u{1F441}\uFE0F Reveal all</button></div>';
    return bar + '<div class="qa-list">' + items.map(qaCard).join('') + '</div>';
  }
  function applyFilters(scope) {
    if (!scope) return;
    var f = {};
    $$('.seg', scope).forEach(function (seg) { var on = $('button.on', seg); if (on) f[on.getAttribute('data-f')] = on.getAttribute('data-v'); });
    $$('select[data-f]', scope).forEach(function (sel) { f[sel.getAttribute('data-f')] = sel.value; });
    var q = $('.bank-q', scope), terms = q ? q.value.toLowerCase().split(/\s+/).filter(Boolean) : [];
    var items = $$('.fi', scope), shown = 0;
    items.forEach(function (el) {
      var ok = Object.keys(f).every(function (key) {
        var v = f[key];
        return !v || (' ' + (el.getAttribute('data-' + key) || '') + ' ').indexOf(' ' + v + ' ') >= 0;
      });
      if (ok && terms.length) {
        var txt = el.textContent.toLowerCase();
        ok = terms.every(function (t) { return txt.indexOf(t) >= 0; });
      }
      el.hidden = !ok;
      if (ok) shown++;
    });
    var n = $('.flt-n', scope);
    if (n) n.textContent = shown + ' of ' + items.length + ' shown';
  }

  function prepBand(t) {
    if (!t.coding && !t.qa) return '';
    return '<section class="sec prep-band"><div class="prep-in"><span class="eyebrow">FAANG-level interview track</span>' +
      '<h2 class="sec-h">Train for the real loop, not just the syllabus</h2><p class="sec-p">' +
      'Every session now ends with interview-grade material: deep dives into internals, a timed coding round (LeetCode Medium/Hard style, with reference solutions that are compiled and run by the test suite), ' +
      'system-design rounds, 8\u201310 deep-dive questions with model answers, follow-ups and red flags, and harder quiz questions \u2014 graded SDE-1 / SDE-2 / Senior.</p>' +
      '<div class="stats">' + [[t.coding, 'coding rounds'], [t.codingHard, 'of them Hard'], [t.design, 'design rounds'], [t.qa, 'interview Q&As'], [t.hardQ, 'hard quiz Qs'], [t.deep, 'deep dives']].map(function (x) {
        return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
      }).join('') + '</div><div class="cta"><a class="btn primary" href="#/interview">\u{1F3AF} Open the interview track</a>' +
      '<a class="btn" href="#/interview/mock">\u23F1\uFE0F Start a mock interview</a><a class="btn" href="#/interview/coding">\u2328\uFE0F All coding rounds</a></div></div></section>';
  }


  /* ------------------------------------------------------------ slides */
  function contentSlide(e) {
    var s = e.slide, T = C.types[s.type] || { label: s.type, icon: '' };
    var h = '<div class="sl-meta"><span class="badge t-' + s.type + '">' + T.icon + ' ' + T.label + '</span>' +
      '<span class="sl-ref">Session ' + e.session.no + ' \u00B7 ' + esc(e.session.short || e.session.title) + ' \u00B7 ' + e.idx + '/' + e.session.slides.length + '</span></div>';
    h += '<h2 class="sl-title">' + inl(s.title) + '</h2>';
    if (s.lead) h += '<p class="sl-lead">' + inl(s.lead) + '</p>';
    if (s.type === 'coding') return h + codingHTML(e);
    if (s.type === 'design') return h + designHTML(e);
    if (s.type === 'interview') return h + '<div class="qa-scope">' + interviewHTML(e) + '</div>';
    var main = s.points ? MD.points(s.points) : '';
    var visual = (s.diagram ? DG.render(s.diagram) : '') + (s.code ? codeHTML(s.code) : '');
    var split = main && visual && s.layout !== 'stack' &&
      (s.layout === 'split' || (!(s.diagram && DG.isWide(s.diagram)) && !(s.code && codeIsWide(s.code))));
    h += split ? '<div class="sl-split"><div class="sl-main">' + main + '</div><div class="sl-visual">' + visual + '</div></div>' : main + visual;
    if (s.table) h += tableHTML(s.table);
    if (s.callout) h += [].concat(s.callout).map(calloutHTML).join('');
    if (s.steps) h += labHTML(s.steps, e.key);
    if (s.stretch) h += stretchHTML(s.stretch);
    if (s.quiz) h += quizHTML(s.quiz, e.key);
    if (s.cards) h += cardsHTML(s.cards);
    return h;
  }
  function sessionCover(e) {
    var s = e.session, m = e.module;
    var h = '<div class="cover">';
    h += '<div class="sl-meta"><span class="badge t-cover">Session ' + s.no + ' of 24</span><span class="sl-ref">Module ' + m.no + ' \u00B7 ' +
      esc(m.title) + (s.duration ? ' \u00B7 \u23F1 ' + esc(s.duration) : '') + '</span></div>';
    h += '<h2 class="sl-title big">' + inl(s.title) + '</h2>';
    h += '<div class="cover-grid"><div>';
    h += '<h3>\u{1F4CC} Brochure topics covered</h3><ul class="check">' + (s.covers || []).map(function (i) {
      return '<li>' + esc(m.topics[i]) + '</li>';
    }).join('') + (s.extra || []).map(function (x) { return '<li class="extra">' + inl(x) + '</li>'; }).join('') + '</ul>';
    h += '<h3>\u{1F3AF} Learning objectives</h3>' + MD.points(s.objectives || []) + '</div>';
    h += '<div><h3>\u{1F5C2}\uFE0F Agenda</h3><ol class="agenda">' + s.slides.map(function (sl, i) {
      return '<li><a href="#/s/' + s.no + '/' + (i + 1) + '"><span class="ag-ic">' + (C.types[sl.type] || {}).icon + '</span><span>' + inl(sl.title) + '</span></a></li>';
    }).join('') + '</ol><div class="mix">' + chips(typeCounts(s.slides)) + '</div></div></div>';
    if (s.prereq) h += calloutHTML({ kind: 'info', title: 'Before you start', text: s.prereq });
    return h + '</div>';
  }
  function moduleCover(d) {
    var m = d.module;
    var h = '<div class="cover">';
    h += '<div class="sl-meta"><span class="badge t-cover">Module ' + m.no + ' \u00B7 Sessions ' + m.sessions[0] + '\u2013' + m.sessions[1] +
      '</span><span class="sl-ref">' + d.content.length + ' slides \u00B7 ' + d.sessions.length + ' sessions</span></div>';
    h += '<h2 class="sl-title big">' + esc(m.title) + '</h2>';
    h += '<blockquote class="brochure">' + esc(m.blurb) + '<cite>\u2014 GeeksforGeeks brochure, Curriculum Breakdown</cite></blockquote>';
    h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Brochure topic (verbatim)</th><th>Taught in</th></tr></thead><tbody>' +
      m.topics.map(function (t, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + esc(t) + '</td><td>' + sessionsCovering(m, i).map(function (s) {
          return '<a class="pill-link" href="#/s/' + s.no + '">S' + s.no + '</a>';
        }).join(' ') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    if (m.project) h += calloutHTML({ kind: 'best', title: 'Project in this module', text: m.project });
    h += '<div class="sess-grid">' + d.sessions.map(function (s) {
      var p = sessionProgress(s);
      return '<a class="sess-card" href="#/s/' + s.no + '"><span class="sess-no">S' + s.no + '</span><span class="sess-t">' + esc(s.title) +
        '</span><span class="sess-m">' + s.slides.length + ' slides' + (s.duration ? ' \u00B7 ' + esc(s.duration) : '') + '</span>' + bar(p) + '</a>';
    }).join('') + '</div>';
    if (!PRINT) h += '<p class="hint">Use <kbd>\u2192</kbd>/<kbd>\u2190</kbd> to move, <kbd>N</kbd> notes, <kbd>O</kbd> overview, <kbd>F</kbd> present, <kbd>/</kbd> search.</p>';
    return h + '</div>';
  }
  function moduleEnd(d) {
    var m = d.module, p = deckProgress(d), right = 0, answered = 0, total = 0;
    d.content.forEach(function (e) {
      if (!e.slide.quiz) return;
      var st = S.quiz[e.key] || {};
      e.slide.quiz.forEach(function (q, i) { total++; if (st[i] != null) { answered++; if (st[i] === q.answer) right++; } });
    });
    var next = DECKS[m.no];
    var h = '<div class="cover end">';
    h += '<div class="sl-meta"><span class="badge t-cover">Module ' + m.no + ' wrap-up</span></div>';
    h += '<h2 class="sl-title big">\u{1F389} ' + esc(m.title) + ' \u2014 done!</h2>';
    h += '<div class="end-stats"><div><b>' + p.seen + '/' + p.total + '</b><span>slides viewed</span></div><div><b>' + right + '/' + total +
      '</b><span>quiz answers correct</span></div><div><b>' + d.sessions.length + '</b><span>sessions</span></div></div>';
    h += '<h3>Session checklist</h3><ul class="check">' + d.sessions.map(function (s) {
      var sp = sessionProgress(s);
      return '<li class="' + (sp.pct === 100 ? '' : 'todo') + '"><a href="#/s/' + s.no + '">S' + s.no + ' \u00B7 ' + esc(s.title) + '</a> <small>' + sp.pct + '% viewed</small></li>';
    }).join('') + '</ul>';
    if (!PRINT) {
      h += '<div class="cta">' + (next ? '<a class="btn primary" href="#/m/' + next.module.no + '">Next: Module ' + next.module.no + ' \u2014 ' + esc(next.module.title) + ' \u2192</a>' :
        '<a class="btn primary" href="#/">\u{1F3C1} Course complete \u2014 back to home</a>') +
        '<a class="btn" href="#/print/' + m.no + '">\u{1F5A8}\uFE0F Printable notes</a><a class="btn" href="' + pptxHref(m) + '" download>\u2B07\uFE0F Download .pptx</a></div>';
    }
    return h + '</div>';
  }
  function slideHTML(e, d) {
    if (e.kind === 'mcover') return moduleCover(d);
    if (e.kind === 'scover') return sessionCover(e);
    if (e.kind === 'mend') return moduleEnd(d);
    return contentSlide(e);
  }
  function notesHTML(e) {
    if (!e.slide || !e.slide.notes) return '';
    return '<section class="notes' + (S.notes ? '' : ' closed') + '"><button class="notes-h" data-act="notes" aria-expanded="' + !!S.notes + '">' +
      '<span>\u{1F4DD} Detailed notes</span><span class="notes-k"><kbd>N</kbd> ' + (S.notes ? 'hide' : 'show') + '</span></button>' +
      '<div class="notes-b">' + MD.blocks(e.slide.notes) + '</div></section>';
  }

  /* ------------------------------------------------------------ chrome */
  function header(active) {
    function L(href, label, key) { return '<a href="' + href + '" class="' + (active === key ? 'on' : '') + '">' + label + '</a>'; }
    return '<header class="site-h"><a class="brand" href="#/"><span class="logo" aria-hidden="true">{J}</span><span class="brand-t"><b>Java Backend</b><small>Interactive Course Notes</small></span></a>' +
      '<nav class="site-nav">' + L('#/', 'Home', 'home') + L('#/syllabus', 'Syllabus map', 'syllabus') +
      C.modules.map(function (m) { return L('#/m/' + m.no, 'Module ' + m.no, 'm' + m.no); }).join('') +
      L('#/projects', 'Projects', 'projects') + L('#/interview', '\u{1F3AF} Interview prep', 'interview') + '</nav>' + tools() + '</header>';
  }
  function tools() {
    return '<div class="tools"><button class="icon-btn" data-act="search" title="Search all notes (Ctrl+K or /)"><span aria-hidden="true">\u{1F50D}</span><span class="kbd-h">Search</span></button>' +
      '<button class="icon-btn" data-act="theme" title="Toggle light/dark theme (T)" aria-label="Toggle theme">\u25D0</button>' +
      '<button class="icon-btn" data-act="help" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">?</button></div>';
  }
  function footer() {
    var st = C.stack;
    return '<footer class="site-f"><p><b>Syllabus source:</b> ' + esc(C.brochure.provider) + ' \u2014 \u201C' + esc(C.brochure.title) +
      '\u201D brochure (24 sessions, 4 modules, 3 projects). This site is an independent study companion built strictly on that syllabus; it is not an official GeeksforGeeks or IBM publication.</p>' +
      '<p><b>Versions used in code:</b> ' + esc([st.java, st.boot, st.cloud, st.db, st.redis, st.kafka].join(' \u00B7 ')) + ' \u2014 verified ' + esc(st.verified) + '.</p>' +
      '<p>Your progress (viewed slides, quiz answers, lab checklists, interview self-ratings and notes) is stored only in this browser. <button class="link" data-act="reset-progress">Reset progress</button></p></footer>';
  }
  function view(html, active, title) {
    cur = null;
    document.body.classList.remove('present', 'side-on');
    app.innerHTML = header(active) + '<main class="page" id="main">' + html + '</main>' + footer();
    try { window.scrollTo(0, 0); } catch (e) { /* non-browser */ }
    document.title = (title ? title + ' \u00B7 ' : '') + 'Java Backend \u2014 Interactive Course Notes';
  }

  /* ------------------------------------------------------------ pages */
  function home() {
    var B = C.brochure, t = totals();
    var h = '<section class="hero"><div class="hero-l"><span class="pill">' + esc(B.provider) + ' \u00B7 ' + esc(B.title) + '</span>' +
      '<h1>Become an industry-ready <em>Java Backend Developer</em> from the ground up.</h1><p class="hero-p">' + esc(B.summary) + '</p>' +
      '<p class="hero-sub">This site turns the official 24-session syllabus into <b>interactive slide decks with detailed notes</b> \u2014 every session pairs <b>theory</b> (concepts, diagrams, internals) with <b>practice</b> (working code, labs, quizzes).</p>' +
      '<div class="cta"><a class="btn primary" href="#/m/1">\u25B6 Start Module 1</a><a class="btn" href="#/interview">\u{1F3AF} FAANG interview track</a><a class="btn" href="#/syllabus">\u{1F4CB} Syllabus coverage map</a></div>' +
      '<div class="stats">' + [[t.sessions, 'sessions'], [4, 'modules'], [t.slides, 'slides'], [t.code, 'code examples'], [t.diagrams, 'diagrams'], [t.quizQ, 'quiz questions']].map(function (x) {
        return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="hero-r" aria-hidden="true"><div class="mock"><div class="mock-h"><i></i><i></i><i></i><span>Session 9 \u00B7 RESTful API design</span></div>' +
      '<pre><code class="hljs">' + highlight('@RestController\n@RequestMapping("/api/v1/expenses")\n@RequiredArgsConstructor\npublic class ExpenseController {\n\n  private final ExpenseService service;\n\n  @PostMapping\n  public ResponseEntity<ExpenseDto> create(\n      @Valid @RequestBody CreateExpense req) {\n    ExpenseDto saved = service.create(req);\n    return ResponseEntity\n        .created(URI.create("/api/v1/expenses/" + saved.id()))\n        .body(saved);\n  }\n}', 'java') +
      '</code></pre><div class="mock-f"><span class="badge t-practical">\u{1F4BB} Practical</span><span class="badge t-theory">\u{1F4D8} Theory</span><span class="badge t-quiz">\u2753 Quiz</span></div></div></div></section>';

    h += prepBand(t);
    h += '<section class="sec"><h2 class="sec-h">How to use these notes</h2><div class="how">' + [
      ['\u{1F5BC}\uFE0F', 'Slides + detailed notes', 'Each module is a PowerPoint-style deck. The panel under every slide holds the full explanation you would hear in class.'],
      ['\u2696\uFE0F', 'Theory \u2194 practical', 'Concept slides (\u{1F4D8}) explain the why and internals; practical slides (\u{1F4BB}) show working code with expected output.'],
      ['\u{1F9EA}', 'Labs, quizzes & interview rounds', 'Every session ends with a lab (plus stretch goals), a timed coding round, deep-dive interview questions with model answers and a quiz with explanations.'],
      ['\u{1F4C8}', 'Progress, print & PPTX', 'Progress is saved locally. Print any module to PDF, or download it as a .pptx with speaker notes.']
    ].map(function (x) { return '<div class="how-c"><div class="how-i">' + x[0] + '</div><b>' + x[1] + '</b><p>' + x[2] + '</p></div>'; }).join('') +
      '</div><p class="hint center">Shortcuts: <kbd>\u2192</kbd> next \u00B7 <kbd>\u2190</kbd> previous \u00B7 <kbd>N</kbd> notes \u00B7 <kbd>O</kbd> overview \u00B7 <kbd>F</kbd> present \u00B7 <kbd>/</kbd> search \u00B7 <kbd>T</kbd> theme</p></section>';

    h += '<section class="sec"><span class="eyebrow">Roadmap</span><h2 class="sec-h">Curriculum Breakdown</h2><p class="sec-p">' + esc(B.curriculumIntro) + '</p><div class="road">' +
      DECKS.map(function (d) {
        var m = d.module, p = deckProgress(d);
        return '<article class="mod" style="--mod:' + m.color + '"><div class="mod-n">' + m.no + '</div><div class="mod-b">' +
          '<span class="mod-s">Sessions ' + m.sessions[0] + '\u2013' + m.sessions[1] + '</span><h3>' + esc(m.title) + '</h3><p>' + esc(m.blurb) + '</p>' +
          '<ul class="mod-topics">' + m.topics.map(function (tp, i) {
            var ss = sessionsCovering(m, i);
            return '<li><span>' + esc(tp) + '</span>' + ss.map(function (s) { return '<a class="pill-link" href="#/s/' + s.no + '">S' + s.no + '</a>'; }).join('') + '</li>';
          }).join('') + '</ul>' + (m.project ? '<p class="mod-proj">\u{1F4C1} ' + esc(m.project) + '</p>' : '') +
          '<div class="mod-f">' + bar(p) + '<span class="mod-pct">' + p.seen + '/' + p.total + ' slides viewed</span></div>' +
          '<div class="cta sm"><a class="btn primary" href="#/m/' + m.no + '">Open slides \u2192</a><a class="btn" href="#/print/' + m.no + '">\u{1F5A8}\uFE0F Print notes</a>' +
          '<a class="btn" href="' + pptxHref(m) + '" download>\u2B07\uFE0F .pptx</a></div></div></article>';
      }).join('') + '</div></section>';

    h += '<section class="sec"><span class="eyebrow">The Journey</span><h2 class="sec-h">The Complete Java Backend Journey</h2><p class="sec-p">' + esc(B.journeyIntro) +
      '</p><div class="journey">' + B.journey.map(function (j) {
        return '<div class="jr"><div class="jr-i">' + j.icon + '</div><div><b>' + esc(j.title) + '</b><p>' + esc(j.text) + '</p></div></div>';
      }).join('') + '</div></section>';

    h += '<section class="sec two"><div><h2 class="sec-h">Skills You Will Learn</h2><ul class="skills">' + B.skills.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') +
      '</ul></div><div><h2 class="sec-h">Tech Stack You Will Learn</h2><p class="sec-p">' + esc(B.techNote) + '</p><div class="stack">' +
      B.techStack.map(function (s) { return '<div class="tech"><span>' + s.icon + '</span>' + esc(s.name) + '</div>'; }).join('') + '</div></div></section>';

    h += '<section class="sec"><h2 class="sec-h">Projects Throughout the Course</h2><p class="sec-p">Stop doing toy problems. Build the applications companies are hiring for today.</p><div class="projs">' +
      C.projects.map(projCard).join('') + '</div></section>';
    return h;
  }
  function projCard(p) {
    return '<article class="proj" style="--pc:' + p.color + '"><span class="proj-k">' + esc(p.kind) + ' \u00B7 ' + esc(p.when) + '</span><h3>' + esc(p.title) +
      '</h3><p>' + esc(p.text) + '</p><div class="tags">' + p.tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
      '</div><div class="cta sm">' + p.sessions.map(function (n) { return '<a class="btn sm" href="#/s/' + n + '">Session ' + n + '</a>'; }).join('') + '</div></article>';
  }

  function syllabus() {
    var t = totals(), topicCount = 0, covered = 0;
    C.modules.forEach(function (m) { m.topics.forEach(function (_, i) { topicCount++; if (sessionsCovering(m, i).length) covered++; }); });
    var h = '<section class="sec"><span class="eyebrow">Syllabus coverage map</span><h1 class="sec-h">Every brochure topic \u2192 the session that teaches it</h1>' +
      '<p class="sec-p">Topics are copied <b>verbatim</b> from the GeeksforGeeks brochure (pages 4\u20135). The brochure groups topics by module; this course keeps the brochure\u2019s order and anchors from its FAQ (Session 1 starts with Java architecture & OOP, Spring Boot from Session 8, Splitwise in Sessions 12\u201313 & 17, Airbnb in Sessions 21\u201324).</p>' +
      '<div class="stats wide">' + [[covered + '/' + topicCount, 'brochure topics covered'], [t.sessions + '/24', 'sessions written'], [t.theory, 'theory slides'], [t.practical, 'practical slides'], [t.code, 'code examples'], [t.quizQ, 'quiz questions']].map(function (x) {
        return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
      }).join('') + '</div></section>';
    DECKS.forEach(function (d) {
      var m = d.module;
      h += '<section class="sec syl" style="--mod:' + m.color + '"><h2 class="syl-h"><span class="mod-n sm">' + m.no + '</span>' + esc(m.title) +
        ' <small>Sessions ' + m.sessions[0] + '\u2013' + m.sessions[1] + '</small></h2><blockquote class="brochure">' + esc(m.blurb) + '</blockquote>';
      h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Brochure topic (verbatim)</th><th>Taught in</th><th>\u{1F4D8} Theory</th><th>\u{1F4BB} Practical</th><th>\u{1F9EA} Lab</th><th>\u2753 Quiz Qs</th><th>\u2328\uFE0F Rounds</th><th>\u{1F3AF} Q&amp;As</th></tr></thead><tbody>' +
        m.topics.map(function (tp, i) {
          var ss = sessionsCovering(m, i), c = { theory: 0, practical: 0, lab: 0, q: 0, r: 0, qa: 0 };
          ss.forEach(function (s) {
            s.slides.forEach(function (sl) {
              if (c[sl.type] != null) c[sl.type]++;
              if (sl.quiz) c.q += sl.quiz.length;
              if (sl.type === 'coding' || sl.type === 'design') c.r++;
              if (sl.qa) c.qa += sl.qa.length;
            });
          });
          return '<tr class="' + (ss.length ? '' : 'missing') + '"><td>' + (i + 1) + '</td><td>' + esc(tp) + '</td><td>' +
            (ss.length ? ss.map(function (s) { return '<a class="pill-link" href="#/s/' + s.no + '">S' + s.no + '</a>'; }).join(' ') : '<em>pending</em>') +
            '</td><td>' + c.theory + '</td><td>' + c.practical + '</td><td>' + c.lab + '</td><td>' + c.q + '</td><td>' + c.r + '</td><td>' + c.qa + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      if (m.project) h += calloutHTML({ kind: 'best', title: 'Project (brochure)', text: m.project });
      h += '<div class="plan">' + d.sessions.map(function (s) {
        return '<article class="plan-c"><div class="plan-h"><span class="sess-no">S' + s.no + '</span><div><b>' + esc(s.title) + '</b><div class="mix">' +
          chips(typeCounts(s.slides)) + '</div></div></div><div class="plan-b"><div><h4>Brochure topics</h4><ul class="check">' + (s.covers || []).map(function (i) {
            return '<li>' + esc(m.topics[i]) + '</li>';
          }).join('') + (s.extra || []).map(function (x) { return '<li class="extra">' + inl(x) + '</li>'; }).join('') + '</ul></div><div><h4>Objectives</h4>' +
          MD.points(s.objectives || []) + '</div></div><div class="cta sm"><a class="btn primary sm" href="#/s/' + s.no + '">Open session \u2192</a></div></article>';
      }).join('') + '</div></section>';
    });
    return h;
  }

  function projects() {
    var h = '<section class="sec"><span class="eyebrow">Build real systems</span><h1 class="sec-h">Projects Throughout the Course</h1>' +
      '<p class="sec-p">Stop doing toy problems. Build the applications companies are hiring for today. Each project below links to the exact slides where it is designed and built.</p></section>';
    C.projects.forEach(function (p) {
      h += '<section class="sec">' + projCard(p) + '<div class="plan">' + p.sessions.map(function (n) {
        var s = C.sessions.filter(function (x) { return x.no === n; })[0];
        if (!s) return '';
        var key = s.slides.filter(function (sl) { return sl.type === 'project' || sl.type === 'lab'; });
        return '<article class="plan-c"><div class="plan-h"><span class="sess-no">S' + s.no + '</span><div><b>' + esc(s.title) + '</b></div></div>' +
          '<ul class="agenda">' + s.slides.map(function (sl, i) {
            return key.indexOf(sl) >= 0 || sl.type === 'project' ? '<li><a href="#/s/' + s.no + '/' + (i + 1) + '"><span class="ag-ic">' + C.types[sl.type].icon + '</span><span>' + inl(sl.title) + '</span></a></li>' : '';
          }).join('') + '</ul></article>';
      }).join('') + '</div></section>';
    });
    return h;
  }

  /* ------------------------------------------------------------ interview hub */
  var HUB = [['', '\u{1F3AF} Overview'], ['coding', '\u2328\uFE0F Coding rounds'], ['design', '\u{1F3DB}\uFE0F System design'], ['bank', '\u{1F5C3}\uFE0F Q&amp;A bank'],
    ['mock', '\u23F1\uFE0F Mock interview'], ['patterns', '\u{1F9E9} Patterns'], ['behavioral', '\u{1F5E3}\uFE0F Behavioral']];
  var STATUS = { todo: ['\u25CB', 'To do'], solo: ['\u2705', 'Solved'], hints: ['\u{1F4A1}', 'With hints'], revisit: ['\u{1F501}', 'Revisit'] };
  function prepEntries(type) {
    var r = [];
    DECKS.forEach(function (d) { d.content.forEach(function (e) { if (e.slide.type === type) r.push(e); }); });
    return r;
  }
  function allQa() {
    var r = [];
    prepEntries('interview').forEach(function (e) {
      var k = rkey(e);
      e.slide.qa.forEach(function (x, i) { r.push({ x: x, k: k, i: i, e: e }); });
    });
    return r;
  }
  function whereLink(e) {
    return '<a class="pill-link" style="--mod:' + e.module.color + '" href="' + e.href + '" title="' + esc(e.session.title) + '">S' + e.session.no + '</a>';
  }
  function statusOf(e) { return S.rounds[rkey(e)] || 'todo'; }
  function track() { return C.track || {}; }

  function interviewPage(tab) {
    var T = track();
    var h = '<section class="sec hub-top"><span class="eyebrow">FAANG-level interview track</span><h1 class="sec-h">Crack the backend loop: coding, design &amp; deep-dive rounds</h1>' +
      '<p class="sec-p">' + inl(T.intro || '') + '</p><nav class="hub-tabs" aria-label="Interview track sections">' + HUB.map(function (x) {
        return '<a href="#/interview' + (x[0] ? '/' + x[0] : '') + '" class="' + (x[0] === tab ? 'on' : '') + '">' + x[1] + '</a>';
      }).join('') + '</nav></section>';
    switch (tab) {
      case 'coding': return h + hubCoding();
      case 'design': return h + hubDesign();
      case 'bank': return h + hubBank();
      case 'mock': return h + hubMock();
      case 'patterns': return h + hubPatterns();
      case 'behavioral': return h + hubBehavioral();
      default: return h + hubOverview();
    }
  }

  function hubOverview() {
    var T = track(), t = totals(), cod = prepEntries('coding'), des = prepEntries('design'), qa = allQa();
    var rounds = cod.concat(des);
    var solved = rounds.filter(function (e) { var v = S.rounds[rkey(e)]; return v === 'solo' || v === 'hints'; }).length;
    var nailed = qa.filter(function (it) { return (S.iq[it.k] || {})[it.i] === 2; }).length;
    var h = '<section class="sec"><div class="stats wide">' + [
      [t.coding, 'coding rounds \u00B7 ' + t.codingHard + ' Hard'], [t.design, 'system-design rounds'], [t.qa, 'interview Q&As with model answers'],
      [t.hardQ, 'interview-level quiz questions'], [t.deep, 'deep-dive lessons'], [solved + ' / ' + rounds.length, 'rounds you have solved'], [nailed + ' / ' + qa.length, 'answers you nailed']
    ].map(function (x) { return '<div><b>' + x[0] + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div></section>';
    if (T.loop) {
      h += '<section class="sec"><h2 class="sec-h">The loop you are preparing for</h2><p class="sec-p">' + inl(T.loopIntro || '') + '</p><div class="loop">' + T.loop.map(function (r) {
        return '<article class="loop-c"><div class="loop-i" aria-hidden="true">' + r.icon + '</div><div><span class="loop-t">' + esc(r.time) + '</span><h3>' + esc(r.name) + '</h3>' +
          MD.points(r.what) + (r.tab != null ? '<a class="btn sm" href="#/interview' + (r.tab ? '/' + r.tab : '') + '">Practise \u2192</a>' : '') + '</div></article>';
      }).join('') + '</div></section>';
    }
    if (T.method) {
      h += '<section class="sec"><h2 class="sec-h">How to run each round</h2><div class="method">' + T.method.map(function (m) {
        return '<article class="method-c"><h3>' + m.icon + ' ' + esc(m.name) + '</h3><ol>' + m.steps.map(function (x) { return '<li>' + inl(x) + '</li>'; }).join('') + '</ol></article>';
      }).join('') + '</div></section>';
    }
    if (T.levels) h += '<section class="sec"><h2 class="sec-h">What changes by level</h2><p class="sec-p">' + inl(T.levels.intro || '') + '</p>' + tableHTML(T.levels) + '</section>';
    if (T.plan) h += '<section class="sec"><h2 class="sec-h">' + esc(T.plan.title || 'Study plan') + '</h2><p class="sec-p">' + inl(T.plan.intro || '') + '</p>' + tableHTML(T.plan) + '</section>';
    var rv = rounds.filter(function (e) { return S.rounds[rkey(e)] === 'revisit'; });
    var miss = qa.filter(function (it) { return (S.iq[it.k] || {})[it.i] === 0; });
    h += '<section class="sec"><h2 class="sec-h">Your revisit list</h2>' + (rv.length || miss.length ? '<ul class="revisit">' +
      rv.map(function (e) { return '<li>' + whereLink(e) + ' <a href="' + e.href + '">' + inl(e.slide.title) + '</a> <small>' + C.types[e.slide.type].label + '</small></li>'; }).join('') +
      miss.map(function (it) { return '<li>' + whereLink(it.e) + ' <a href="' + it.e.href + '">' + inl(it.x.q) + '</a> <small>Q&amp;A</small></li>'; }).join('') + '</ul>' :
      '<p class="hint">Rate rounds \u{1F501} <b>Revisit</b> and answers \u2717 <b>Missed</b> while you practise \u2014 they collect here so you can drill your weak spots.</p>') + '</section>';
    return h;
  }

  function hubCoding() {
    var list = prepEntries('coding'), pats = {};
    list.forEach(function (e) { (e.slide.pattern || []).forEach(function (p) { pats[p] = 1; }); });
    var h = '<section class="sec flt-scope"><div class="flt">' + segHTML('d', [['', 'All'], ['Medium', 'Medium'], ['Hard', 'Hard']]) +
      segHTML('s', [['', 'Any status'], ['todo', 'To do'], ['done', 'Solved'], ['revisit', 'Revisit']]) +
      '<select data-f="p" aria-label="Filter by pattern"><option value="">All patterns</option>' + Object.keys(pats).sort(function (a, b) {
        return patLabel(a).localeCompare(patLabel(b));
      }).map(function (p) { return '<option value="' + esc(p) + '">' + esc(patLabel(p)) + '</option>'; }).join('') + '</select><span class="flt-n"></span></div>';
    h += '<div class="tbl-wrap"><table class="tbl rounds"><thead><tr><th>#</th><th>Problem</th><th>Level</th><th>Patterns</th><th>Session</th><th>Clock</th><th>Status</th></tr></thead><tbody>' +
      list.map(function (e, i) {
        var s = e.slide, st = statusOf(e);
        return '<tr class="fi" data-d="' + esc(s.difficulty) + '" data-s="' + (st === 'solo' || st === 'hints' ? 'done' : st) + '" data-p="' + esc((s.pattern || []).join(' ')) + '">' +
          '<td>' + (i + 1) + '</td><td><a href="' + e.href + '"><b>' + inl(s.title) + '</b></a>' + (s.lc ? ' <small class="lc">LC ' + s.lc + '</small>' : '') + '</td>' +
          '<td>' + diffBadge(s.difficulty) + '</td><td>' + (s.pattern || []).map(function (p) { return '<span class="chip">' + esc(patLabel(p)) + '</span>'; }).join(' ') + '</td>' +
          '<td>' + whereLink(e) + '</td><td>' + (s.minutes || 45) + '\u2032</td><td>' + STATUS[st][0] + ' ' + STATUS[st][1] + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    return h;
  }

  function hubDesign() {
    return '<section class="sec"><div class="dcards">' + prepEntries('design').map(function (e) {
      var s = e.slide, st = statusOf(e);
      return '<a class="dcard" href="' + e.href + '" style="--mod:' + e.module.color + '"><span class="dcard-m"><span class="diff d-' + esc(String(s.kind || 'HLD').toLowerCase()) + '">' +
        esc(s.kind || 'HLD') + '</span>' + diffBadge(s.difficulty) + '<span class="chip">\u23F1 ' + (s.minutes || 45) + ' min</span><span class="chip">S' + e.session.no + '</span></span>' +
        '<b>' + inl(s.title) + '</b><span class="dcard-p">' + inl(s.prompt) + '</span><span class="dcard-s">' + STATUS[st][0] + ' ' + STATUS[st][1] + '</span></a>';
    }).join('') + '</div></section>';
  }

  function hubBank() {
    var qa = allQa();
    return '<section class="sec qa-scope bank"><div class="flt"><input type="search" class="bank-q" placeholder="Search ' + qa.length + ' questions and answers\u2026 e.g. volatile, N+1, idempotency" aria-label="Search questions">' +
      segHTML('l', [['', 'All levels'], ['1', LV[1]], ['2', LV[2]], ['3', LV[3]]]) +
      segHTML('m', [['', 'All modules']].concat(C.modules.map(function (m) { return [String(m.no), 'M' + m.no]; }))) +
      segHTML('r', [['', 'Any rating'], ['u', 'Unrated'], ['0', '\u2717 Missed'], ['1', '~ Partly'], ['2', '\u2713 Nailed']]) +
      '<button class="btn sm ghost" data-act="qa-all">\u{1F441}\uFE0F Reveal all</button><span class="flt-n"></span></div>' +
      '<p class="qa-sum hint">' + qaSummaryOf(qa) + '</p><div class="qa-list">' + qa.map(function (it, n) {
        it.where = whereLink(it.e) + ' <span>' + esc(it.e.session.short || it.e.session.title) + '</span>';
        return qaCard(it, n);
      }).join('') + '</div></section>';
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  /* Random selection that favours what you have not solved yet (then revisit, then everything else). */
  function pickMock(f) {
    var items = [], used = {};
    var prioR = function (e) { var v = S.rounds[rkey(e)]; return v === 'revisit' ? 0 : !v ? 1 : v === 'hints' ? 2 : 3; };
    var prioQ = function (it) { var r = (S.iq[it.k] || {})[it.i]; return r === 0 ? 0 : r == null ? 1 : r === 1 ? 2 : 3; };
    f.parts.forEach(function (p) {
      if (p.type === 'coding' || p.type === 'design') {
        var pool = prepEntries(p.type).filter(function (e) {
          return (!p.difficulty || e.slide.difficulty === p.difficulty) && (!p.kind || e.slide.kind === p.kind) &&
            (!p.pattern || (e.slide.pattern || []).indexOf(p.pattern) >= 0) && !used[e.key];
        });
        shuffle(pool).sort(function (a, b) { return prioR(a) - prioR(b); });
        pool.slice(0, p.count).forEach(function (e) { used[e.key] = 1; items.push({ t: p.type, key: e.key }); });
      } else if (p.type === 'qa') {
        var qs = allQa().filter(function (it) { return (it.x.level || 1) >= (p.minLevel || 1) && !used[it.k + '/' + it.i]; });
        shuffle(qs).sort(function (a, b) { return prioQ(a) - prioQ(b); });
        qs.slice(0, p.count).forEach(function (it) { used[it.k + '/' + it.i] = 1; items.push({ t: 'qa', key: it.e.key, i: it.i }); });
      } else if (p.type === 'behavioral') {
        var bs = (track().behavioral || {}).prompts || [];
        shuffle(bs.map(function (_, i) { return i; })).slice(0, p.count).forEach(function (i) { items.push({ t: 'beh', i: i }); });
      }
    });
    return { fmt: f.id, at: Date.now(), items: items };
  }
  function behCard(b, label) {
    return '<article class="beh-c"><div class="qa-q"><span class="qa-n">' + label + '</span>' + (b.theme ? '<span class="lvl l2">' + esc(b.theme) + '</span> ' : '') +
      '<span class="qa-t">' + inl(b.q) + '</span></div>' + revealHTML('What they are probing for', MD.points(b.probe || []) +
      (b.story ? '<p class="beh-s">\u{1F4A1} <b>Build your story from this course:</b> ' + inl(b.story) + '</p>' : '')) + '</article>';
  }
  function mockItemHTML(it, n) {
    if (it.t === 'beh') {
      var b = ((track().behavioral || {}).prompts || [])[it.i];
      return b ? behCard(b, 'B') : '';
    }
    var hit = BYKEY[it.key];
    if (!hit) return '<p class="hint">This item no longer exists \u2014 re-roll the mock.</p>';
    var e = hit.entry, s = e.slide;
    if (it.t === 'qa') {
      var x = s.qa && s.qa[it.i];
      return x ? qaCard({ x: x, k: rkey(e), i: it.i, e: e, where: whereLink(e) + ' <span>' + esc(e.session.short || '') + '</span>' }, n) : '';
    }
    return '<a class="mock-r" href="' + e.href + '"><span class="badge t-' + s.type + '">' + C.types[s.type].icon + ' ' + C.types[s.type].label + '</span>' +
      (s.kind ? '<span class="diff d-' + esc(s.kind.toLowerCase()) + '">' + esc(s.kind) + '</span>' : '') + diffBadge(s.difficulty) +
      '<b>' + inl(s.title) + '</b><span class="hint">Session ' + e.session.no + ' \u00B7 ' + (s.minutes || 45) + ' min \u2192 open the round</span></a>';
  }
  function hubMock() {
    var T = track(), fm = T.mocks || [];
    var h = '<section class="sec"><p class="sec-p">' + inl(T.mockIntro || 'Pick a format; the generator favours rounds you have not solved and answers you missed.') + '</p><div class="mocks">' +
      fm.map(function (f) {
        return '<article class="mock-c"><h3>' + esc(f.name) + '</h3><span class="chip">\u23F1 ' + f.minutes + ' min</span><p>' + inl(f.desc) + '</p>' +
          '<button class="btn primary sm" data-act="mock-new" data-fmt="' + esc(f.id) + '">\u25B6 Generate</button></article>';
      }).join('') + '</div></section>';
    var M = S.mock, f = M && fm.filter(function (x) { return x.id === M.fmt; })[0];
    if (M && f) {
      h += '<section class="sec mock-run qa-scope"><div class="mock-h"><h2 class="sec-h">' + esc(f.name) + '</h2>' + timerHTML('mock:' + M.at, f.minutes) +
        '<button class="btn sm" data-act="mock-new" data-fmt="' + esc(f.id) + '">\u{1F3B2} Re-roll</button><button class="btn sm ghost" data-act="mock-clear">\u2715 End mock</button></div>' +
        (f.rules ? '<p class="hint">' + inl(f.rules) + '</p>' : '') + '<p class="qa-sum hint"></p>' +
        '<ol class="mock-items">' + (function () {
          var q = 0;
          return M.items.map(function (it) { return '<li>' + mockItemHTML(it, it.t === 'qa' ? q++ : 0) + '</li>'; }).join('');
        })() + '</ol></section>';
    }
    return h;
  }

  function hubPatterns() {
    var T = track(), cod = prepEntries('coding');
    return '<section class="sec"><p class="sec-p">' + inl(T.patternsIntro || '') + '</p><div class="pats">' + (T.patterns || []).map(function (p) {
      var probs = cod.filter(function (e) { return (e.slide.pattern || []).indexOf(p.id) >= 0; });
      return '<article class="pat-c" id="pat-' + esc(p.id) + '"><h3>' + esc(p.name) + '</h3><div class="pat-g"><div><b>Reach for it when</b>' + MD.points(p.signals) +
        (p.complexity ? '<p class="pat-cx"><b>Typical cost:</b> ' + inl(p.complexity) + '</p>' : '') + (p.pitfalls ? '<b>Pitfalls</b>' + MD.points(p.pitfalls) : '') +
        (probs.length ? '<b>Practise it in this course</b><ul class="pat-p">' + probs.map(function (e) {
          return '<li>' + whereLink(e) + ' <a href="' + e.href + '">' + inl(e.slide.title) + '</a> ' + diffBadge(e.slide.difficulty) + '</li>';
        }).join('') + '</ul>' : '') + '</div><div>' + (p.template ? codeHTML(p.template) : '') + '</div></div></article>';
    }).join('') + '</div></section>';
  }

  function hubBehavioral() {
    var B = track().behavioral || {};
    var h = '<section class="sec"><p class="sec-p">' + inl(B.intro || '') + '</p><div class="method">' +
      (B.star ? '<article class="method-c"><h3>\u2B50 Structure every story: STAR + L</h3><ol>' + B.star.map(function (x) { return '<li>' + inl(x) + '</li>'; }).join('') + '</ol></article>' : '') +
      (B.tips ? '<article class="method-c"><h3>\u{1F4A1} What separates strong answers</h3>' + MD.points(B.tips) + '</article>' : '') + '</div></section>';
    if (B.prompts) {
      h += '<section class="sec"><h2 class="sec-h">Practice prompts</h2><div class="beh">' + B.prompts.map(function (b, i) { return behCard(b, 'B' + (i + 1)); }).join('') + '</div></section>';
    }
    if (B.ask) h += '<section class="sec"><h2 class="sec-h">Questions to ask your interviewer</h2>' + MD.points(B.ask) + '</section>';
    return h;
  }


  function notFound() {
    return '<section class="sec center"><h1 class="sec-h">Page not found</h1><p class="sec-p">That slide or page does not exist (yet).</p><a class="btn primary" href="#/">\u2190 Home</a></section>';
  }

  /* ------------------------------------------------------------ deck */
  var cur = null, skipHash = null;

  function deckShell(d) {
    var m = d.module;
    return '<div class="deck" style="--mod:' + m.color + '">' +
      '<header class="topbar"><button class="icon-btn side-btn" data-act="side" title="Toggle slide list (S)" aria-label="Toggle slide list">\u2630</button>' +
      '<a class="brand" href="#/"><span class="logo" aria-hidden="true">{J}</span></a><div class="deck-t"><span class="deck-m">Module ' + m.no + '</span><b>' + esc(m.title) + '</b></div>' +
      '<nav class="mod-switch" aria-label="Modules">' + C.modules.map(function (x) {
        return '<a href="#/m/' + x.no + '" class="' + (x.no === m.no ? 'on' : '') + '" style="--c:' + x.color + '" title="' + esc(x.title) + '">M' + x.no + '</a>';
      }).join('') + '</nav>' + tools() + '</header>' +
      '<aside class="side" id="side" aria-label="Slides">' + sideHTML(d) + '</aside>' +
      '<section class="stage" id="stage"><div class="stage-inner" id="stage-inner" aria-live="polite"></div></section>' +
      '<footer class="ctrl"><button class="btn nav" data-act="prev" aria-label="Previous slide">\u2039 <span>Prev</span></button>' +
      '<div class="ctrl-mid"><div class="pbar big"><i id="deck-bar"></i></div><span id="count" class="count"></span></div>' +
      '<div class="ctrl-tools"><button class="icon-btn" data-act="overview" title="Slide overview (O)">\u25A6<span class="lbl">Overview</span></button>' +
      '<button class="icon-btn" data-act="notes" title="Toggle notes (N)">\u{1F4DD}<span class="lbl">Notes</span></button>' +
      '<button class="icon-btn" data-act="present" title="Presentation mode (F)">\u26F6<span class="lbl">Present</span></button>' +
      '<a class="icon-btn" href="#/print/' + m.no + '" title="Printable notes / PDF">\u{1F5A8}\uFE0F<span class="lbl">Print</span></a></div>' +
      '<button class="btn nav primary" data-act="next" aria-label="Next slide"><span>Next</span> \u203A</button></footer></div>';
  }
  function sideHTML(d) {
    var h = '<div class="side-h">Module ' + d.module.no + ' \u00B7 ' + d.content.length + ' slides</div>';
    h += '<a class="side-i cov" href="#/m/' + d.module.no + '" data-pos="0">\u{1F4D6} Module overview</a>';
    d.sessions.forEach(function (s) {
      var first = BYKEY[s.id].entry.pos;
      h += '<details class="side-s" data-s="' + s.no + '"><summary><span class="sess-no sm">S' + s.no + '</span><span class="side-st">' + esc(s.short || s.title) + '</span></summary>' +
        '<a class="side-i cov" href="#/s/' + s.no + '" data-pos="' + first + '">\u{1F4CB} Session overview</a>' +
        s.slides.map(function (sl, i) {
          var k = s.id + ':' + (i + 1);
          return '<a class="side-i' + (S.viewed[k] ? ' seen' : '') + '" href="#/s/' + s.no + '/' + (i + 1) + '" data-pos="' + (first + i + 1) + '" data-key="' + k + '">' +
            '<span class="si-ic">' + (C.types[sl.type] || {}).icon + '</span><span class="si-t">' + (i + 1) + '. ' + inl(sl.title) + '</span></a>';
        }).join('') + '</details>';
    });
    h += '<a class="side-i cov" href="#/m/' + d.module.no + '/end" data-pos="' + (d.list.length - 1) + '">\u{1F3C1} Module wrap-up</a>';
    return h;
  }
  function openDeck(key) {
    var hit = BYKEY[key];
    if (!hit) return view(notFound(), '', 'Not found');
    if (!cur || cur.deck !== hit.deck || !$('.deck')) {
      app.innerHTML = deckShell(hit.deck);
      cur = { deck: hit.deck, pos: -1 };
      document.body.classList.toggle('side-off', !S.side);
      bindSwipe($('#stage'));
    }
    show(hit.entry.pos);
  }
  function show(pos) {
    var d = cur.deck;
    pos = Math.max(0, Math.min(d.list.length - 1, pos));
    var e = d.list[pos];
    cur.pos = pos;
    var inner = $('#stage-inner');
    var type = e.kind === 'slide' ? e.slide.type : 'cover';
    inner.innerHTML = '<article class="slide k-' + e.kind + ' ty-' + type + '">' + slideHTML(e, d) + '</article>' + notesHTML(e);
    $('#stage').scrollTop = 0;
    if (location.hash !== e.href) replaceHash(e.href);
    if (e.kind === 'slide' && !S.viewed[e.key]) { S.viewed[e.key] = 1; save(); }
    restoreQuiz(inner);
    // chrome
    $('#count').textContent = (pos + 1) + ' / ' + d.list.length;
    $('#deck-bar').style.width = Math.round(100 * (pos + 1) / d.list.length) + '%';
    $('[data-act="prev"]').disabled = pos === 0;
    var nx = $('[data-act="next"]');
    nx.disabled = pos === d.list.length - 1;
    $$('.side-i').forEach(function (a) {
      var on = +a.getAttribute('data-pos') === pos;
      a.classList.toggle('on', on);
      var k = a.getAttribute('data-key');
      if (k && S.viewed[k]) a.classList.add('seen');
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
    var sNo = e.session ? e.session.no : null;
    $$('.side-s').forEach(function (det) { if (+det.getAttribute('data-s') === sNo) det.open = true; });
    var act = $('.side-i.on');
    if (act) {
      var side = $('#side'), r = act.getBoundingClientRect(), sr = side.getBoundingClientRect();
      if (r.top < sr.top || r.bottom > sr.bottom) scrollTo(act, { block: 'center' });
    }
    document.title = (e.kind === 'slide' ? MD.strip(e.slide.title) + ' \u00B7 S' + e.session.no : e.title + ' \u00B7 Module ' + d.module.no) + ' \u00B7 Java Backend Notes';
    if (window.innerWidth < 960) document.body.classList.remove('side-on');
  }
  function replaceHash(h) {
    skipHash = h;
    try { history.replaceState(null, '', h); } catch (err) { location.replace(h); }
  }
  function nav(step) { if (cur) show(cur.pos + step); }
  function toggleNotes() {
    S.notes = !S.notes; save();
    $$('.notes').forEach(function (n) {
      n.classList.toggle('closed', !S.notes);
      var b = $('.notes-h', n); if (b) b.setAttribute('aria-expanded', S.notes);
      var k = $('.notes-k', n); if (k) k.innerHTML = '<kbd>N</kbd> ' + (S.notes ? 'hide' : 'show');
    });
    if (S.notes && cur) scrollTo($('.notes'), { behavior: 'smooth', block: 'nearest' });
  }
  function toggleSide() {
    if (window.innerWidth < 960) { document.body.classList.toggle('side-on'); return; }
    S.side = !S.side; save();
    document.body.classList.toggle('side-off', !S.side);
  }
  function togglePresent(on) {
    if (!cur) return;
    var want = on == null ? !document.body.classList.contains('present') : on;
    document.body.classList.toggle('present', want);
    var el = document.documentElement;
    try {
      if (want && el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(function () {});
      if (!want && document.fullscreenElement) document.exitFullscreen().catch(function () {});
    } catch (err) { /* ignore */ }
  }
  document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement) document.body.classList.remove('present'); });

  function bindSwipe(el) {
    var sx = 0, sy = 0, tgt = null;
    el.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) return;
      sx = ev.touches[0].clientX; sy = ev.touches[0].clientY; tgt = ev.target;
    }, { passive: true });
    el.addEventListener('touchend', function (ev) {
      if (!tgt) return;
      var dx = ev.changedTouches[0].clientX - sx, dy = ev.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy) && !(tgt.closest && tgt.closest('pre, .dg-scroll, .tbl-wrap, .code-tabs, .flash-grid'))) nav(dx < 0 ? 1 : -1);
      tgt = null;
    });
  }

  /* ------------------------------------------------------------ print */
  function printView(no) {
    var d = DECKS[no - 1];
    if (!d) return view(notFound(), '', 'Not found');
    PRINT = true;
    var h = '<div class="print-bar no-print"><a class="btn" href="#/m/' + no + '">\u2190 Back to slides</a><button class="btn primary" data-act="print">\u{1F5A8}\uFE0F Print / Save as PDF</button>' +
      '<span>Tip: choose \u201CSave as PDF\u201D and enable \u201CBackground graphics\u201D.</span></div><div class="print-doc" style="--mod:' + d.module.color + '">' +
      '<section class="print-title"><span class="eyebrow">' + esc(C.brochure.title) + '</span><h1>Module ' + no + ': ' + esc(d.module.title) + '</h1><p>Detailed notes \u00B7 Sessions ' +
      d.module.sessions[0] + '\u2013' + d.module.sessions[1] + ' \u00B7 ' + d.content.length + ' slides</p><ol class="toc">' + d.sessions.map(function (s) {
        return '<li>Session ' + s.no + ' \u2014 ' + esc(s.title) + '</li>';
      }).join('') + '</ol></section>';
    d.list.forEach(function (e) {
      var type = e.kind === 'slide' ? e.slide.type : 'cover';
      h += '<section class="print-page"><article class="slide k-' + e.kind + ' ty-' + type + '">' + slideHTML(e, d) + '</article>' +
        (e.kind === 'slide' && e.slide.notes ? '<div class="print-notes"><h4>\u{1F4DD} Notes</h4>' + MD.blocks(e.slide.notes) + '</div>' : '') + '</section>';
    });
    h += '</div>';
    view(h, 'm' + no, 'Printable notes \u00B7 Module ' + no);
    document.body.classList.add('printing');
    restoreQuiz(app);
    PRINT = false;
  }

  /* ------------------------------------------------------------ overlays */
  function overlay(title, html, cls) {
    closeOverlays();
    var o = document.createElement('div');
    o.className = 'ovl';
    o.setAttribute('role', 'dialog');
    o.setAttribute('aria-modal', 'true');
    o.setAttribute('aria-label', title);
    o.innerHTML = '<div class="ovl-box ' + (cls || '') + '"><header class="ovl-h"><h3>' + title + '</h3><button class="icon-btn" data-act="close" aria-label="Close">\u2715</button></header><div class="ovl-b">' + html + '</div></div>';
    o.addEventListener('mousedown', function (ev) { if (ev.target === o) closeOverlays(); });
    document.body.appendChild(o);
    return o;
  }
  function closeOverlays() { $$('.ovl').forEach(function (o) { o.remove(); }); }
  function overlayOpen() { return !!$('.ovl'); }

  function openHelp() {
    var rows = [['\u2192  /  PageDown  /  Space', 'Next slide'], ['\u2190  /  PageUp', 'Previous slide'], ['Home / End', 'First / last slide'],
      ['N', 'Show / hide detailed notes'], ['O', 'Slide overview grid'], ['S', 'Show / hide slide list'], ['F', 'Presentation (fullscreen) mode'],
      ['/  or  Ctrl+K', 'Search all notes'], ['T', 'Toggle light / dark theme'], ['Esc', 'Close dialog / exit presentation'], ['Swipe \u2190 \u2192', 'Navigate on touch devices']];
    overlay('Keyboard shortcuts', '<table class="tbl keys">' + rows.map(function (r) { return '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>');
  }
  function openOverview() {
    if (!cur) return;
    var d = cur.deck, h = '<div class="ov">';
    var group = function (title, entries) {
      return '<div class="ov-g"><h4>' + title + '</h4><div class="ov-grid">' + entries.map(function (e) {
        var ic = e.kind === 'slide' ? C.types[e.slide.type].icon : '\u{1F4CB}';
        return '<a class="ov-t' + (e.pos === cur.pos ? ' on' : '') + (S.viewed[e.key] ? ' seen' : '') + '" href="' + e.href + '"><span class="ov-n">' + (e.pos + 1) +
          '</span><span class="ov-ic">' + ic + '</span><span class="ov-title">' + inl(e.title) + '</span></a>';
      }).join('') + '</div></div>';
    };
    h += group('Module ' + d.module.no, [d.list[0]]);
    d.sessions.forEach(function (s) {
      h += group('Session ' + s.no + ' \u00B7 ' + esc(s.short || s.title), d.list.filter(function (e) { return e.session === s; }));
    });
    h += group('Wrap-up', [d.list[d.list.length - 1]]) + '</div>';
    overlay('Slide overview \u2014 Module ' + d.module.no, h, 'wide');
    scrollTo($('.ov-t.on'), { block: 'center' });
  }

  var IDX = null;
  function flat(a) { return (a || []).reduce(function (x, y) { return x.concat(Array.isArray(y) ? flat(y) : [y]); }, []); }
  function buildIndex() {
    IDX = [];
    DECKS.forEach(function (d) {
      d.content.forEach(function (e) {
        var s = e.slide;
        var body = [s.lead || ''].concat(flat(s.points), [].concat(s.notes || []), DG.text(s.diagram),
          s.table ? s.table.rows.map(function (r) { return r.join(' '); }) : [],
          [].concat(s.callout || []).map(function (c) { return c.text; }), s.steps || [],
          (s.quiz || []).map(function (q) { return q.q + ' ' + q.options.join(' '); }),
          (s.cards || []).map(function (c) { return c.join(' '); }),
          [].concat(s.problem || []), s.hints || [], s.stretch || [], s.prompt || '',
          (s.pattern || []).map(patLabel),
          (s.approaches || []).map(function (a) { return a.name + ' ' + a.idea; }),
          (s.followUps || []).map(function (f) { return f.q + ' ' + [].concat(f.a).join(' '); }),
          (s.stages || []).map(function (st) { return st.t + ' ' + (st.ask || '') + ' ' + flat(st.points).join(' '); }),
          (s.qa || []).map(function (x) { return x.q + ' ' + [].concat(x.a).join(' ') + ' ' + (x.follow || []).join(' '); })).join(' \u00B7 ');
        var raw = MD.strip(body);
        IDX.push({ e: e, title: MD.strip(s.title), t: MD.strip(s.title).toLowerCase(), b: raw.toLowerCase(), raw: raw,
          c: allCode(s).map(function (c) { return c.src; }).join('\n').toLowerCase() });
      });
    });
  }
  function runSearch(q) {
    if (!IDX) buildIndex();
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var res = [];
    IDX.forEach(function (it) {
      var score = 0;
      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], sc = 0;
        if (it.t.indexOf(t) >= 0) sc += 10;
        if (it.b.indexOf(t) >= 0) sc += 3;
        if (it.c.indexOf(t) >= 0) sc += 2;
        if (!sc) return;
        score += sc;
      }
      res.push({ it: it, score: score });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res.slice(0, 40).map(function (r) { return r.it; });
  }
  function snippet(it, terms) {
    var low = it.b, at = -1;
    terms.some(function (t) { at = low.indexOf(t); return at >= 0; });
    var start = Math.max(0, at - 70), txt = it.raw.substr(start, 180);
    var h = esc((start ? '\u2026' : '') + txt + (start + 180 < it.raw.length ? '\u2026' : ''));
    terms.forEach(function (t) {
      if (t.length < 2) return;
      h = h.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return h;
  }
  function openSearch() {
    var o = overlay('Search all notes', '<input type="search" class="search-in" placeholder="e.g. HashMap resize, LRU cache, idempotency, circuit breaker\u2026" aria-label="Search">' +
      '<div class="search-res" role="listbox"><p class="hint">Search titles, bullets, notes and code across all 24 sessions.</p></div>', 'search');
    var input = $('.search-in', o), box = $('.search-res', o), sel = 0;
    function draw() {
      var q = input.value.trim(), terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!q) { box.innerHTML = '<p class="hint">Search titles, bullets, notes and code across all 24 sessions.</p>'; return; }
      var r = runSearch(q);
      sel = 0;
      box.innerHTML = r.length ? r.map(function (it, i) {
        var e = it.e;
        return '<a class="sr' + (i === 0 ? ' on' : '') + '" href="' + e.href + '" role="option"><span class="sr-m"><span class="badge t-' + e.slide.type + '">' + C.types[e.slide.type].icon + ' ' +
          C.types[e.slide.type].label + '</span> Module ' + e.module.no + ' \u00B7 Session ' + e.session.no + ' \u00B7 slide ' + e.idx + '</span><b>' + esc(it.title) + '</b><span class="sr-s">' + snippet(it, terms) + '</span></a>';
      }).join('') : '<p class="hint">No matches for \u201C' + esc(q) + '\u201D.</p>';
    }
    input.addEventListener('input', draw);
    input.addEventListener('keydown', function (ev) {
      var items = $$('.sr', box);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (!items.length) return;
        sel = (sel + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (a, i) { a.classList.toggle('on', i === sel); });
        scrollTo(items[sel], { block: 'nearest' });
      } else if (ev.key === 'Enter' && items[sel]) {
        ev.preventDefault();
        location.hash = items[sel].getAttribute('href');
      }
    });
    setTimeout(function () { input.focus(); }, 0);
  }

  /* ------------------------------------------------------------ events */
  function copyText(txt, btn) {
    function done(ok) { btn.textContent = ok ? 'Copied \u2713' : 'Press Ctrl+C'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove(); done(ok);
    }
  }

  document.addEventListener('click', function (ev) {
    var tab = ev.target.closest('.code-tabs button');
    if (tab) {
      var box = tab.closest('.code'), i = tab.getAttribute('data-tab');
      $$('.code-tabs button', box).forEach(function (b) { var on = b === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      $$('.code-pane', box).forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== i; });
      return;
    }
    var a = ev.target.closest('[data-act]');
    if (!a) return;
    var act = a.getAttribute('data-act');
    switch (act) {
      case 'copy': copyText($('code', a.closest('.code-pane')).textContent, a); break;
      case 'run': {
        var out = a.nextElementSibling; out.hidden = !out.hidden;
        a.textContent = out.hidden ? '\u25B6 Show output' : '\u25BC Hide output';
        break;
      }
      case 'answer': {
        var qe = a.closest('.quiz'), qz = a.closest('.qz'), hit = BYKEY[qe.getAttribute('data-quiz')];
        var qi = +qz.getAttribute('data-q'), picked = +a.getAttribute('data-o'), q = hit.entry.slide.quiz[qi];
        var st = S.quiz[hit.entry.key] = S.quiz[hit.entry.key] || {};
        st[qi] = picked; save();
        applyAnswer(qz, q, picked);
        updateScore(qe, hit.entry.slide.quiz, st);
        break;
      }
      case 'quiz-reset': {
        var qe2 = a.closest('.quiz'), k = qe2.getAttribute('data-quiz');
        delete S.quiz[k]; save();
        $$('.qz', qe2).forEach(function (qz2) {
          $$('.qz-o', qz2).forEach(function (b) { b.disabled = false; b.classList.remove('ok', 'bad'); });
          var w = $('.qz-why', qz2); w.hidden = true; w.innerHTML = '';
        });
        updateScore(qe2, BYKEY[k].entry.slide.quiz, {});
        break;
      }
      case 'hint': {
        var hb = a.closest('.hints'), lis = $$('li', hb), hid = lis.filter(function (li) { return li.hidden; });
        if (hid.length) hid[0].hidden = false;
        var left = hid.length - 1;
        a.textContent = left > 0 ? '\u{1F4A1} Show hint ' + (lis.length - left + 1) + ' of ' + lis.length : '\u{1F4A1} All hints shown';
        a.disabled = left <= 0;
        break;
      }
      case 'reveal': {
        var rc = a.nextElementSibling, open = rc.hidden, lab = $('span', a);
        rc.hidden = !open;
        a.setAttribute('aria-expanded', open);
        lab.textContent = (open ? '\u25BE ' : '\u25B8 ') + lab.textContent.slice(2);
        $('small', a).textContent = open ? 'click to hide' : 'click to reveal';
        break;
      }
      case 'rate': {
        var rb = a.closest('.rate'), rk = rb.getAttribute('data-rate'), rv = a.getAttribute('data-v');
        if (S.rounds[rk] === rv) delete S.rounds[rk]; else S.rounds[rk] = rv;
        save();
        $$('button', rb).forEach(function (b) { var on = S.rounds[rk] === b.getAttribute('data-v'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        break;
      }
      case 'qa-toggle': {
        var card = a.closest('.qa-c'), ans = $('.qa-a', card);
        ans.hidden = !ans.hidden;
        a.setAttribute('aria-expanded', !ans.hidden);
        a.textContent = ans.hidden ? '\u{1F441}\uFE0F Model answer' : '\u{1F648} Hide answer';
        break;
      }
      case 'qa-all': {
        var sc = a.closest('.qa-scope'), cards = $$('.qa-c', sc).filter(function (c) { return !c.hidden; });
        var anyHidden = cards.some(function (c) { return $('.qa-a', c).hidden; });
        cards.forEach(function (c) {
          $('.qa-a', c).hidden = !anyHidden;
          var tb = $('[data-act="qa-toggle"]', c);
          if (tb) { tb.textContent = anyHidden ? '\u{1F648} Hide answer' : '\u{1F441}\uFE0F Model answer'; tb.setAttribute('aria-expanded', anyHidden); }
        });
        a.textContent = anyHidden ? '\u{1F648} Hide all' : '\u{1F441}\uFE0F Reveal all';
        break;
      }
      case 'qa-rate': {
        var qc = a.closest('.qa-c'), qk = qc.getAttribute('data-k'), qi2 = qc.getAttribute('data-i'), qv = +a.getAttribute('data-v');
        var qm = S.iq[qk] = S.iq[qk] || {};
        if (qm[qi2] === qv) delete qm[qi2]; else qm[qi2] = qv;
        save();
        qc.setAttribute('data-r', qm[qi2] == null ? 'u' : qm[qi2]);
        $$('.rt', qc).forEach(function (b) { var on = qm[qi2] === +b.getAttribute('data-v'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
        refreshQa(a.closest('.qa-scope'));
        break;
      }
      case 'flt': {
        $$('button', a.closest('.seg')).forEach(function (b) { b.classList.toggle('on', b === a); });
        applyFilters(a.closest('.flt-scope, .qa-scope'));
        break;
      }
      case 'stage': {
        var stg = a.closest('.stg'), body = $('.stg-b', stg);
        body.hidden = !body.hidden;
        stg.classList.toggle('open', !body.hidden);
        a.textContent = body.hidden ? 'Reveal' : 'Hide';
        a.setAttribute('aria-expanded', !body.hidden);
        break;
      }
      case 'stage-all': {
        $$('.stg', a.closest('.slide') || document).forEach(function (st) {
          $('.stg-b', st).hidden = false;
          st.classList.add('open');
          var b = $('[data-act="stage"]', st);
          if (b) { b.textContent = 'Hide'; b.setAttribute('aria-expanded', 'true'); }
        });
        break;
      }
      case 'timer': {
        var te = a.closest('.timer'), ts = TIMERS[te.getAttribute('data-timer')];
        if (!ts) break;
        if (ts.end) { ts.left = Math.max(0, ts.end - Date.now()); ts.end = null; }
        else { if (ts.left <= 0) ts.left = ts.total; ts.end = Date.now() + ts.left; te.classList.remove('up'); }
        te.classList.toggle('run', !!ts.end);
        a.textContent = ts.end ? '\u23F8' : '\u25B6';
        break;
      }
      case 'timer-reset': {
        var te2 = a.closest('.timer'), ts2 = TIMERS[te2.getAttribute('data-timer')];
        if (!ts2) break;
        ts2.end = null; ts2.left = ts2.total;
        te2.classList.remove('run', 'up');
        $('.tm', te2).textContent = fmtMs(ts2.left);
        $('[data-act="timer"]', te2).textContent = '\u25B6';
        break;
      }
      case 'mock-new': {
        var fmt = (track().mocks || []).filter(function (x) { return x.id === a.getAttribute('data-fmt'); })[0];
        if (fmt) {
          S.mock = pickMock(fmt); save();
          view(interviewPage('mock'), 'interview', 'Mock interview');
          refreshQa($('.mock-run'));
          scrollTo($('.mock-run'), { block: 'start' });
        }
        break;
      }
      case 'mock-clear': S.mock = null; save(); view(interviewPage('mock'), 'interview', 'Mock interview'); break;

      case 'flip': a.classList.toggle('flipped'); break;
      case 'notes': toggleNotes(); break;
      case 'prev': nav(-1); break;
      case 'next': nav(1); break;
      case 'overview': openOverview(); break;
      case 'present': togglePresent(); break;
      case 'side': toggleSide(); break;
      case 'search': openSearch(); break;
      case 'help': openHelp(); break;
      case 'close': closeOverlays(); break;
      case 'print': window.print(); break;
      case 'theme': S.theme = currentTheme() === 'dark' ? 'light' : 'dark'; save(); applyTheme(S.theme); break;
      case 'reset-progress':
        if (window.confirm('Reset all saved progress (viewed slides, quiz answers, lab checklists)?')) {
          var th = S.theme; S = fresh(); S.theme = th; save(); route();
        }
        break;
    }
  });
  document.addEventListener('change', function (ev) {
    var cb = ev.target;
    if (!cb.matches || !cb.matches('[data-act="lab"]')) return;
    var lab = cb.closest('.lab'), k = lab.getAttribute('data-lab');
    var st = S.labs[k] = S.labs[k] || [];
    st[+cb.getAttribute('data-i')] = cb.checked; save();
    var boxes = $$('[data-act="lab"]', lab), done = boxes.filter(function (b) { return b.checked; }).length;
    $('.lab-prog', lab).textContent = done + ' / ' + boxes.length + ' done' + (done === boxes.length ? ' \u{1F389}' : '');
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.matches && t.matches('select[data-f]')) applyFilters(t.closest('.flt-scope, .qa-scope'));
  });
  var scratchTimer = null;
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t.matches) return;
    if (t.matches('textarea[data-scratch]')) {
      S.scratch[t.getAttribute('data-scratch')] = t.value;
      clearTimeout(scratchTimer);
      scratchTimer = setTimeout(save, 300);
    } else if (t.matches('.bank-q')) applyFilters(t.closest('.qa-scope'));
  });
  document.addEventListener('keydown', function (ev) {
    var tg = ev.target, tag = (tg.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || tg.isContentEditable;
    var k = ev.key;
    if ((ev.ctrlKey || ev.metaKey) && k && k.toLowerCase() === 'k') { ev.preventDefault(); openSearch(); return; }
    if (k === 'Escape') {
      if (overlayOpen()) closeOverlays();
      else if (document.body.classList.contains('present')) togglePresent(false);
      else document.body.classList.remove('side-on');
      return;
    }
    if (typing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (k === '/') { ev.preventDefault(); openSearch(); return; }
    if (k === '?') { openHelp(); return; }
    if (k === 't' || k === 'T') { S.theme = currentTheme() === 'dark' ? 'light' : 'dark'; save(); applyTheme(S.theme); return; }
    if (!cur || overlayOpen()) return;
    switch (k) {
      case 'ArrowRight': case 'PageDown': case 'l': ev.preventDefault(); nav(1); break;
      case 'ArrowLeft': case 'PageUp': case 'h': ev.preventDefault(); nav(-1); break;
      case ' ': if (tag === 'button' || tag === 'a') return; ev.preventDefault(); nav(ev.shiftKey ? -1 : 1); break;
      case 'Home': ev.preventDefault(); show(0); break;
      case 'End': ev.preventDefault(); show(cur.deck.list.length - 1); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'f': case 'F': togglePresent(); break;
      case 'o': case 'O': case 'g': openOverview(); break;
      case 's': case 'S': toggleSide(); break;
    }
  });

  /* ------------------------------------------------------------ router */
  function route() {
    if (skipHash && location.hash === skipHash) { skipHash = null; return; }
    skipHash = null;
    closeOverlays();
    document.body.classList.remove('printing');
    var p = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/').filter(Boolean);
    if (!p.length) return view(home(), 'home');
    switch (p[0]) {
      case 'syllabus': return view(syllabus(), 'syllabus', 'Syllabus map');
      case 'projects': return view(projects(), 'projects', 'Projects');
      case 'interview': {
        view(interviewPage(p[1] || '', p[2]), 'interview', 'Interview prep');
        $$('.flt-scope, .qa-scope.bank').forEach(applyFilters);
        $$('.qa-scope').forEach(refreshQa);
        if (p[1] === 'patterns' && p[2]) scrollTo(document.getElementById('pat-' + p[2]), { block: 'start' });
        return;
      }
      case 'print': return printView(+p[1]);
      case 'm': return openDeck(p[2] === 'end' ? 'm' + p[1] + ':end' : 'm' + p[1]);
      case 's': return openDeck(p[2] ? 's' + p[1] + ':' + p[2] : 's' + p[1]);
      case 'module': location.replace('#/m/' + p[1]); return;
      default: return view(notFound(), '', 'Not found');
    }
  }
  window.addEventListener('hashchange', route);
  route();

  /* exposed for tests */
  window.JBC = { decks: DECKS, route: route, search: runSearch, show: function (p) { show(p); }, state: function () { return S; },
    rkey: rkey, pickMock: pickMock, totals: totals };
})();
