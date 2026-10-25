/* Diagram renderers. Each takes a plain object from the content files and
 * returns an HTML/SVG string. No external libraries.
 *
 * kinds: flow, layers, tree, seq, graph, tiers, compare, grid, erd, buckets, pyramid */
(function (root) {
  'use strict';
  var MD = root.MD, esc = MD.esc, inl = MD.inline;
  var uid = 0;

  function tone(t) { return t ? ' tone-' + t : ''; }

  function node(n, extra) {
    if (typeof n === 'string') n = { t: n };
    return '<div class="dg-node' + tone(n.tone) + (extra ? ' ' + extra : '') + '">' +
      (n.icon ? '<span class="dg-ic">' + n.icon + '</span>' : '') +
      '<div class="dg-t">' + inl(n.t) + '</div>' +
      (n.s ? '<div class="dg-s">' + inl(n.s) + '</div>' : '') + '</div>';
  }

  var R = {};

  /* {kind:'flow', dir:'h'|'v', nodes:[...], edges:['label', ...]} */
  R.flow = function (d) {
    var dir = d.dir === 'v' ? 'v' : 'h';
    var h = '<div class="dg dg-flow dg-' + dir + '">';
    d.nodes.forEach(function (n, i) {
      if (i) {
        var lab = d.edges && d.edges[i - 1];
        h += '<div class="dg-arrow">' + (lab ? '<span>' + inl(lab) + '</span>' : '') + '</div>';
      }
      h += node(n);
    });
    return h + '</div>';
  };

  /* {kind:'layers', items:[{t, s, tone, parts:[...]}]} */
  R.layers = function (d) {
    return '<div class="dg dg-layers">' + d.items.map(function (it) {
      return '<div class="dg-layer' + tone(it.tone || 'gray') + '">' +
        '<div class="dg-lh"><div class="dg-t">' + inl(it.t) + '</div>' +
        (it.s ? '<div class="dg-s">' + inl(it.s) + '</div>' : '') + '</div>' +
        (it.parts ? '<div class="dg-parts">' + it.parts.map(function (p) {
          return '<span class="dg-chip">' + inl(p) + '</span>';
        }).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  };

  /* {kind:'tree', layout:'org'|'list', root:{t, s, tone, c:[...]}} */
  function treeItem(n) {
    var kids = n.c || [];
    return '<li><span class="dg-tn' + tone(n.tone || 'gray') + '">' + inl(n.t) +
      (n.s ? ' <small>' + inl(n.s) + '</small>' : '') + '</span>' +
      (kids.length ? '<ul>' + kids.map(treeItem).join('') + '</ul>' : '') + '</li>';
  }
  R.tree = function (d) {
    var org = d.layout === 'org';
    return '<div class="dg dg-tree ' + (org ? 'dg-org dg-scroll' : 'dg-list') + '"><ul>' +
      treeItem(d.root) + '</ul></div>';
  };

  /* Sequence diagram (SVG).
   * {kind:'seq', actors:['A','B'], msgs:[[from,to,'label'], [from,to,'label','r'] (reply), [a,a,'note']]} */
  R.seq = function (d) {
    var id = 'sq' + (++uid);
    var A = d.actors, n = A.length;
    var ix = function (a) { return typeof a === 'number' ? a : A.indexOf(a); };
    var msgs = d.msgs.map(function (m) {
      return { f: ix(m[0]), t: ix(m[1]), l: String(m[2]), r: m[3] === 'r' };
    });
    var colW = 150;
    A.forEach(function (a) { colW = Math.max(colW, a.length * 8 + 30); });
    msgs.forEach(function (m) {
      var span = Math.max(1, Math.abs(m.t - m.f));
      var need = m.f === m.t ? (m.l.length * 6.4 + 24) : (m.l.length * 6.4 + 44) / span;
      if (need > colW) colW = need;
    });
    colW = Math.min(Math.ceil(colW), 300);
    var padX = 10, top = 56, rowH = 38;
    var W = padX * 2 + colW * n, H = top + rowH * msgs.length + 16;
    var x = function (i) { return padX + colW * i + colW / 2; };
    var s = '<div class="dg dg-scroll dg-seqwrap"><svg class="dg-seq" viewBox="0 0 ' + W + ' ' + H +
      '" style="min-width:' + Math.round(W * 0.72) + 'px" role="img" aria-label="Sequence diagram: ' +
      esc(A.join(', ')) + '"><defs><marker id="' + id + 'a" viewBox="0 0 10 10" refX="9" refY="5" ' +
      'markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="sq-head"/></marker></defs>';
    A.forEach(function (a, i) {
      var bw = colW - 24;
      s += '<line class="sq-life" x1="' + x(i) + '" y1="40" x2="' + x(i) + '" y2="' + (H - 6) + '"/>';
      s += '<rect class="sq-actor" x="' + (x(i) - bw / 2) + '" y="6" width="' + bw + '" height="32" rx="8"/>';
      s += '<text class="sq-at" x="' + x(i) + '" y="27" text-anchor="middle">' + esc(a) + '</text>';
    });
    msgs.forEach(function (m, k) {
      var y = top + rowH * k + 18;
      var label = (k + 1) + '. ' + m.l;
      if (m.f === m.t) {
        var w = Math.min(label.length * 6.4 + 18, W - 8);
        var nx = Math.max(4, Math.min(W - w - 4, x(m.f) - w / 2));
        s += '<rect class="sq-note" x="' + nx + '" y="' + (y - 15) + '" width="' + w + '" height="24" rx="6"/>';
        s += '<text class="sq-nt" x="' + (nx + w / 2) + '" y="' + (y + 1) + '" text-anchor="middle">' + esc(label) + '</text>';
      } else {
        var dirn = m.t > m.f ? 1 : -1;
        var x1 = x(m.f) + dirn * 3, x2 = x(m.t) - dirn * 3;
        s += '<line class="sq-msg' + (m.r ? ' sq-reply' : '') + '" x1="' + x1 + '" y1="' + (y + 6) + '" x2="' + x2 +
          '" y2="' + (y + 6) + '" marker-end="url(#' + id + 'a)"/>';
        s += '<text class="sq-ml" x="' + ((x1 + x2) / 2) + '" y="' + (y + 1) + '" text-anchor="middle">' + esc(label) + '</text>';
      }
    });
    return s + '</svg></div>';
  };

  /* Small state/graph diagram (SVG) with explicit grid positions.
   * {kind:'graph', nodes:[{id,t,x,y,tone,s}], edges:[[from,to,'label']], cw, ch} */
  R.graph = function (d) {
    var id = 'gr' + (++uid);
    var cw = d.cw || 190, ch = d.ch || 104, bw = d.bw || 142;
    var byId = {}, maxX = 0, maxY = 0;
    d.nodes.forEach(function (nd) {
      byId[nd.id] = nd; maxX = Math.max(maxX, nd.x); maxY = Math.max(maxY, nd.y);
    });
    var W = (maxX + 1) * cw, H = (maxY + 1) * ch;
    var cx = function (nd) { return nd.x * cw + cw / 2; };
    var cy = function (nd) { return nd.y * ch + ch / 2; };
    var bh = function (nd) { return nd.s ? 52 : 40; };
    var s = '<div class="dg dg-scroll dg-graphwrap"><svg class="dg-graph" viewBox="-6 -6 ' + (W + 12) + ' ' + (H + 12) +
      '" style="min-width:' + Math.round(W * 0.7) + 'px" role="img" aria-label="State diagram"><defs><marker id="' + id +
      'a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M0,0 L10,5 L0,10 z" class="sq-head"/></marker></defs>';
    var has = {};
    d.edges.forEach(function (e) { has[e[0] + '>' + e[1]] = true; });
    var labels = '';
    d.edges.forEach(function (e) {
      var a = byId[e[0]], b = byId[e[1]], lab = e[2] || '';
      if (!a || !b) return;
      if (a === b) {
        var lx = cx(a), ly = cy(a) - bh(a) / 2;
        s += '<path class="gr-edge" d="M' + (lx - 18) + ',' + ly + ' C' + (lx - 30) + ',' + (ly - 40) + ' ' + (lx + 30) + ',' +
          (ly - 40) + ' ' + (lx + 18) + ',' + ly + '" marker-end="url(#' + id + 'a)"/>';
        labels += lbl(lx, ly - 38, lab);
        return;
      }
      var dx = cx(b) - cx(a), dy = cy(b) - cy(a), len = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = has[e[1] + '>' + e[0]] ? 7 : 0;
      var px = -dy / len * off, py = dx / len * off;
      var p1 = clip(cx(a) + px, cy(a) + py, dx, dy, bw / 2 + 3, bh(a) / 2 + 3, 1);
      var p2 = clip(cx(b) + px, cy(b) + py, -dx, -dy, bw / 2 + 3, bh(b) / 2 + 3, 1);
      s += '<line class="gr-edge" x1="' + p1[0] + '" y1="' + p1[1] + '" x2="' + p2[0] + '" y2="' + p2[1] +
        '" marker-end="url(#' + id + 'a)"/>';
      var mx = (p1[0] + p2[0]) / 2 + (off ? px * 2.2 : 0), my = (p1[1] + p2[1]) / 2 + (off ? py * 2.2 : 0);
      if (!off && Math.abs(dy) < 1) my -= 10;
      labels += lbl(mx, my, lab);
    });
    d.nodes.forEach(function (nd) {
      var h = bh(nd);
      s += '<g class="gr-node' + tone(nd.tone || 'gray') + '"><rect x="' + (cx(nd) - bw / 2) + '" y="' + (cy(nd) - h / 2) +
        '" width="' + bw + '" height="' + h + '" rx="10"/><text x="' + cx(nd) + '" y="' + (cy(nd) + (nd.s ? -3 : 5)) +
        '" text-anchor="middle" class="gr-t">' + esc(nd.t) + '</text>' +
        (nd.s ? '<text x="' + cx(nd) + '" y="' + (cy(nd) + 15) + '" text-anchor="middle" class="gr-s">' + esc(nd.s) + '</text>' : '') + '</g>';
    });
    return s + labels + '</svg></div>';

    function clip(x0, y0, dx, dy, hw, hh) {
      var t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return [Math.round((x0 + dx * t) * 10) / 10, Math.round((y0 + dy * t) * 10) / 10];
    }
    function lbl(x, y, t) {
      if (!t) return '';
      var w = t.length * 6.2 + 12;
      return '<g class="gr-lab"><rect x="' + (x - w / 2) + '" y="' + (y - 10) + '" width="' + w + '" height="19" rx="5"/>' +
        '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle">' + esc(t) + '</text></g>';
    }
  };

  /* Architecture rows. {kind:'tiers', tiers:[{label, nodes:[...], via:'label', bus:true}]} */
  R.tiers = function (d) {
    return '<div class="dg dg-tiers">' + d.tiers.map(function (t, i) {
      var arrow = i ? '<div class="dg-down">' + (t.via ? '<span>' + inl(t.via) + '</span>' : '') + '</div>' : '';
      if (t.bus) {
        return arrow + '<div class="dg-bus' + tone(t.tone || 'orange') + '"><b>' + inl(t.label) + '</b>' +
          (t.nodes ? ' <span>' + t.nodes.map(inl).join(' \u00B7 ') + '</span>' : '') + '</div>';
      }
      return arrow + '<div class="dg-tier"><div class="dg-tl">' + inl(t.label) + '</div><div class="dg-row">' +
        t.nodes.map(function (n) { return node(n); }).join('') + '</div></div>';
    }).join('') + '</div>';
  };

  /* {kind:'compare', cols:[{t, icon, tone, points:[...]}]} */
  R.compare = function (d) {
    return '<div class="dg dg-compare" style="--cols:' + d.cols.length + '">' + d.cols.map(function (c) {
      return '<div class="dg-col' + tone(c.tone || 'gray') + '"><div class="dg-ch">' + (c.icon ? c.icon + ' ' : '') +
        inl(c.t) + '</div><ul>' + c.points.map(function (p) { return '<li>' + inl(p) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div>';
  };

  /* {kind:'grid', cols:3, items:[{icon, t, s, tone}]} */
  R.grid = function (d) {
    return '<div class="dg dg-grid" style="--cols:' + (d.cols || 3) + '">' + d.items.map(function (it) {
      return '<div class="dg-card' + tone(it.tone || 'gray') + '">' + (it.icon ? '<div class="dg-ic">' + it.icon + '</div>' : '') +
        '<div class="dg-t">' + inl(it.t) + '</div>' + (it.s ? '<div class="dg-s">' + inl(it.s) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  };

  /* {kind:'erd', entities:[{n:'users', svc:'user-service', f:['id PK', 'group_id FK → groups']}], rels:['...']} */
  R.erd = function (d) {
    return '<div class="dg dg-erd"><div class="dg-ents">' + d.entities.map(function (e) {
      return '<div class="dg-ent' + tone(e.tone || 'blue') + '"><div class="dg-en">' + esc(e.n) +
        (e.svc ? '<small>' + esc(e.svc) + '</small>' : '') + '</div><ul>' + e.f.map(function (f) {
          var cls = (/\bPK\b/.test(f) ? ' pk' : '') + (/\bFK\b/.test(f) ? ' fk' : '');
          return '<li class="' + cls.trim() + '">' + inl(f) + '</li>';
        }).join('') + '</ul></div>';
    }).join('') + '</div>' + (d.rels ? '<div class="dg-rels">' + d.rels.map(function (r) {
      return '<span class="dg-rel">' + inl(r) + '</span>';
    }).join('') + '</div>' : '') + '</div>';
  };

  /* HashMap buckets. {kind:'buckets', buckets:[['0',[]], ['1',['"Ravi"=75','"Sara"=80']], ['5',[...],'tree']]} */
  R.buckets = function (d) {
    return '<div class="dg dg-buckets">' + (d.title ? '<div class="dg-bt">' + inl(d.title) + '</div>' : '') +
      d.buckets.map(function (b) {
        var items = b[1] || [];
        return '<div class="dg-bk"><span class="dg-bi">[' + esc(b[0]) + ']</span>' +
          (items.length ? items.map(function (e) {
            return '<span class="dg-barrow">\u2192</span><span class="dg-entry' + (b[2] === 'tree' ? ' tree' : '') + '">' + inl(e) + '</span>';
          }).join('') : '<span class="dg-null">null</span>') + (b[2] === 'tree' ? '<span class="dg-tag">red-black tree</span>' : '') + '</div>';
      }).join('') + '</div>';
  };

  /* {kind:'pyramid', levels:[{t, s, tone}]}  (top = narrowest) */
  R.pyramid = function (d) {
    var n = d.levels.length;
    return '<div class="dg dg-pyramid">' + d.levels.map(function (l, i) {
      return '<div class="dg-pl' + tone(l.tone || 'gray') + '" style="width:' + Math.round(38 + 62 * (i + 1) / n) + '%"><b>' +
        inl(l.t) + '</b>' + (l.s ? '<span>' + inl(l.s) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  };

  var WIDE = { seq: 1, tiers: 1, erd: 1, compare: 1, grid: 1, buckets: 1, graph: 1 };

  function render(d) {
    if (!d) return '';
    if (Array.isArray(d)) return d.map(render).join('');
    var fn = R[d.kind];
    if (!fn) throw new Error('Unknown diagram kind: ' + d.kind);
    var h = fn(d);
    if (d.caption) h += '<div class="dg-cap">' + inl(d.caption) + '</div>';
    return '<figure class="dg-fig">' + h + '</figure>';
  }

  function isWide(d) {
    if (!d) return false;
    if (Array.isArray(d)) return d.some(isWide);
    if (d.kind === 'flow') return d.dir !== 'v' && d.nodes.length > 4;
    if (d.kind === 'tree') return d.layout === 'org';
    return !!WIDE[d.kind];
  }

  /* Plain-text rendering used by the PPTX exporter and the search index. */
  function text(d) {
    if (!d) return [];
    if (Array.isArray(d)) return d.reduce(function (a, x) { return a.concat(text(x)); }, []);
    var t = function (n) { return typeof n === 'string' ? n : n.t + (n.s ? ' (' + n.s + ')' : ''); };
    switch (d.kind) {
      case 'flow': return [d.nodes.map(t).join('  \u2192  ')];
      case 'layers': return d.items.map(function (it) { return it.t + (it.s ? ': ' + it.s : '') + (it.parts ? ' [' + it.parts.join(', ') + ']' : ''); });
      case 'tree': var out = []; (function walk(n, dep) { out.push(new Array(dep + 1).join('    ') + n.t); (n.c || []).forEach(function (c) { walk(c, dep + 1); }); })(d.root, 0); return out;
      case 'seq': return d.msgs.map(function (m, i) { var A = d.actors, f = typeof m[0] === 'number' ? A[m[0]] : m[0], to = typeof m[1] === 'number' ? A[m[1]] : m[1]; return (i + 1) + '. ' + (f === to ? f + ': ' : f + ' \u2192 ' + to + ': ') + m[2]; });
      case 'graph': var names = {}; d.nodes.forEach(function (nd) { names[nd.id] = nd.t; }); return d.edges.map(function (e) { return names[e[0]] + ' \u2192 ' + names[e[1]] + (e[2] ? '  (' + e[2] + ')' : ''); });
      case 'tiers': return d.tiers.map(function (ti) { return ti.label + (ti.nodes ? ': ' + ti.nodes.map(t).join(' | ') : ''); });
      case 'compare': return d.cols.map(function (c) { return c.t + ': ' + c.points.join('; '); });
      case 'grid': return d.items.map(function (it) { return it.t + (it.s ? ' \u2014 ' + it.s : ''); });
      case 'erd': return d.entities.map(function (e) { return e.n + ' (' + e.f.join(', ') + ')'; }).concat(d.rels || []);
      case 'buckets': return d.buckets.map(function (b) { return '[' + b[0] + '] ' + ((b[1] || []).join(' \u2192 ') || 'null'); });
      case 'pyramid': return d.levels.map(function (l) { return l.t + (l.s ? ' \u2014 ' + l.s : ''); });
      default: return [];
    }
  }

  root.DG = { render: render, isWide: isWide, text: text, kinds: Object.keys(R) };
})(typeof window !== 'undefined' ? window : globalThis);
