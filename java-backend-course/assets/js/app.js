/* Java Backend Course — interactive slide/notes engine.
 * Vanilla JS, no build step. Works from a static server or file://.
 *
 * Routes:
 *   #/                home            #/syllabus   syllabus coverage map
 *   #/projects        projects        #/print/N    printable notes for module N
 *   #/m/N             module N cover  #/m/N/end    module wrap-up
 *   #/s/N             session cover   #/s/N/K      slide K of session N        */
(function () {
  'use strict';
  var C = window.COURSE, MD = window.MD, DG = window.DG;
  var inl = MD.inline, esc = MD.esc;
  var app = document.getElementById('app');
  var PRINT = false;
  var codeSeq = 0;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }

  /* ------------------------------------------------------------ storage */
  var KEY = 'jbc-progress-v1';
  function fresh() { return { viewed: {}, quiz: {}, labs: {}, notes: true, side: true, theme: null }; }
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
    var t = { slides: 0, code: 0, labs: 0, quizQ: 0, diagrams: 0, theory: 0, practical: 0, sessions: C.sessions.length };
    C.sessions.forEach(function (s) {
      s.slides.forEach(function (sl) {
        t.slides++;
        if (sl.code) t.code += [].concat(sl.code).length;
        if (sl.diagram) t.diagrams += [].concat(sl.diagram).length;
        if (sl.steps) t.labs++;
        if (sl.quiz) t.quizQ += sl.quiz.length;
        if (sl.type === 'theory') t.theory++;
        if (sl.type === 'practical') t.practical++;
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
      h += '<div class="qz" data-q="' + qi + '"><p class="qz-q"><b>Q' + (qi + 1) + '.</b> ' + inl(q.q) + '</p><div class="qz-opts">' +
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

  /* ------------------------------------------------------------ slides */
  function contentSlide(e) {
    var s = e.slide, T = C.types[s.type] || { label: s.type, icon: '' };
    var h = '<div class="sl-meta"><span class="badge t-' + s.type + '">' + T.icon + ' ' + T.label + '</span>' +
      '<span class="sl-ref">Session ' + e.session.no + ' \u00B7 ' + esc(e.session.short || e.session.title) + ' \u00B7 ' + e.idx + '/' + e.session.slides.length + '</span></div>';
    h += '<h2 class="sl-title">' + inl(s.title) + '</h2>';
    if (s.lead) h += '<p class="sl-lead">' + inl(s.lead) + '</p>';
    var main = s.points ? MD.points(s.points) : '';
    var visual = (s.diagram ? DG.render(s.diagram) : '') + (s.code ? codeHTML(s.code) : '');
    var split = main && visual && s.layout !== 'stack' &&
      (s.layout === 'split' || (!(s.diagram && DG.isWide(s.diagram)) && !(s.code && codeIsWide(s.code))));
    h += split ? '<div class="sl-split"><div class="sl-main">' + main + '</div><div class="sl-visual">' + visual + '</div></div>' : main + visual;
    if (s.table) h += tableHTML(s.table);
    if (s.callout) h += [].concat(s.callout).map(calloutHTML).join('');
    if (s.steps) h += labHTML(s.steps, e.key);
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
      L('#/projects', 'Projects', 'projects') + '</nav>' + tools() + '</header>';
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
      '<p>Your progress (viewed slides, quiz answers, lab checklists) is stored only in this browser. <button class="link" data-act="reset-progress">Reset progress</button></p></footer>';
  }
  function view(html, active, title) {
    cur = null;
    document.body.classList.remove('present', 'side-on');
    app.innerHTML = header(active) + '<main class="page" id="main">' + html + '</main>' + footer();
    window.scrollTo(0, 0);
    document.title = (title ? title + ' \u00B7 ' : '') + 'Java Backend \u2014 Interactive Course Notes';
  }

  /* ------------------------------------------------------------ pages */
  function home() {
    var B = C.brochure, t = totals();
    var h = '<section class="hero"><div class="hero-l"><span class="pill">' + esc(B.provider) + ' \u00B7 ' + esc(B.title) + '</span>' +
      '<h1>Become an industry-ready <em>Java Backend Developer</em> from the ground up.</h1><p class="hero-p">' + esc(B.summary) + '</p>' +
      '<p class="hero-sub">This site turns the official 24-session syllabus into <b>interactive slide decks with detailed notes</b> \u2014 every session pairs <b>theory</b> (concepts, diagrams, internals) with <b>practice</b> (working code, labs, quizzes).</p>' +
      '<div class="cta"><a class="btn primary" href="#/m/1">\u25B6 Start Module 1</a><a class="btn" href="#/syllabus">\u{1F4CB} Syllabus coverage map</a><a class="btn" href="#/projects">\u{1F3D7}\uFE0F Projects</a></div>' +
      '<div class="stats">' + [[t.sessions, 'sessions'], [4, 'modules'], [t.slides, 'slides'], [t.code, 'code examples'], [t.diagrams, 'diagrams'], [t.quizQ, 'quiz questions']].map(function (x) {
        return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>';
      }).join('') + '</div></div>' +
      '<div class="hero-r" aria-hidden="true"><div class="mock"><div class="mock-h"><i></i><i></i><i></i><span>Session 9 \u00B7 RESTful API design</span></div>' +
      '<pre><code class="hljs">' + highlight('@RestController\n@RequestMapping("/api/v1/expenses")\n@RequiredArgsConstructor\npublic class ExpenseController {\n\n  private final ExpenseService service;\n\n  @PostMapping\n  public ResponseEntity<ExpenseDto> create(\n      @Valid @RequestBody CreateExpense req) {\n    ExpenseDto saved = service.create(req);\n    return ResponseEntity\n        .created(URI.create("/api/v1/expenses/" + saved.id()))\n        .body(saved);\n  }\n}', 'java') +
      '</code></pre><div class="mock-f"><span class="badge t-practical">\u{1F4BB} Practical</span><span class="badge t-theory">\u{1F4D8} Theory</span><span class="badge t-quiz">\u2753 Quiz</span></div></div></div></section>';

    h += '<section class="sec"><h2 class="sec-h">How to use these notes</h2><div class="how">' + [
      ['\u{1F5BC}\uFE0F', 'Slides + detailed notes', 'Each module is a PowerPoint-style deck. The panel under every slide holds the full explanation you would hear in class.'],
      ['\u2696\uFE0F', 'Theory \u2194 practical', 'Concept slides (\u{1F4D8}) explain the why and internals; practical slides (\u{1F4BB}) show working code with expected output.'],
      ['\u{1F9EA}', 'Labs & quizzes', 'Every session ends with a hands-on lab checklist and a quiz with explanations, so you can practise and self-check.'],
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
      h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Brochure topic (verbatim)</th><th>Taught in</th><th>\u{1F4D8} Theory</th><th>\u{1F4BB} Practical</th><th>\u{1F9EA} Lab</th><th>\u2753 Quiz Qs</th></tr></thead><tbody>' +
        m.topics.map(function (tp, i) {
          var ss = sessionsCovering(m, i), c = { theory: 0, practical: 0, lab: 0, q: 0 };
          ss.forEach(function (s) { s.slides.forEach(function (sl) { if (c[sl.type] != null) c[sl.type]++; if (sl.quiz) c.q += sl.quiz.length; }); });
          return '<tr class="' + (ss.length ? '' : 'missing') + '"><td>' + (i + 1) + '</td><td>' + esc(tp) + '</td><td>' +
            (ss.length ? ss.map(function (s) { return '<a class="pill-link" href="#/s/' + s.no + '">S' + s.no + '</a>'; }).join(' ') : '<em>pending</em>') +
            '</td><td>' + c.theory + '</td><td>' + c.practical + '</td><td>' + c.lab + '</td><td>' + c.q + '</td></tr>';
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
    if (act && act.scrollIntoView) {
      var side = $('#side'), r = act.getBoundingClientRect(), sr = side.getBoundingClientRect();
      if (r.top < sr.top || r.bottom > sr.bottom) act.scrollIntoView({ block: 'center' });
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
    if (S.notes) { var n = $('.notes'); if (n && cur) n.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
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
    var on = $('.ov-t.on'); if (on) on.scrollIntoView({ block: 'center' });
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
          (s.cards || []).map(function (c) { return c.join(' '); })).join(' \u00B7 ');
        var raw = MD.strip(body);
        IDX.push({ e: e, title: MD.strip(s.title), t: MD.strip(s.title).toLowerCase(), b: raw.toLowerCase(), raw: raw,
          c: [].concat(s.code || []).map(function (c) { return c.src; }).join('\n').toLowerCase() });
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
    var o = overlay('Search all notes', '<input type="search" class="search-in" placeholder="e.g. HashMap resize, @Transactional, circuit breaker, OAuth scopes\u2026" aria-label="Search">' +
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
        items[sel].scrollIntoView({ block: 'nearest' });
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
  window.JBC = { decks: DECKS, route: route, search: runSearch, show: function (p) { show(p); }, state: function () { return S; } };
})();
