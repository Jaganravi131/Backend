/* Tiny, dependency-free markdown subset used by the slide engine.
 * Inline: `code`, **bold**, *italic*, ==highlight==, [text](url)
 * Blocks (arrays of strings): "- bullet", "1. numbered", "> quote", "### heading", paragraph */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(s) {
    if (s == null) return '';
    var codes = [];
    var out = String(s).replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    out = esc(out)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
      .replace(/==([^=\s](?:[^=]*[^=\s])?)==/g, '<mark>$1</mark>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
        var safe = /^(https?:|#|\.|\/)/.test(u) ? u : '#';
        var ext = /^https?:/.test(safe) ? ' target="_blank" rel="noopener"' : '';
        return '<a href="' + safe + '"' + ext + '>' + t + '</a>';
      });
    return out.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return '<code>' + esc(codes[+i]) + '</code>';
    });
  }

  /* Slide bullets: array of strings; a nested array = sub-bullets of the previous item. */
  function points(arr, cls) {
    if (!arr || !arr.length) return '';
    var h = '<ul class="' + (cls || 'pts') + '">';
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (Array.isArray(p)) continue;
      h += '<li>' + inline(p);
      if (Array.isArray(arr[i + 1])) h += points(arr[i + 1], 'pts sub');
      h += '</li>';
    }
    return h + '</ul>';
  }

  /* Notes / long-form text: array of block strings (or a single string). */
  function blocks(arr) {
    if (!arr) return '';
    if (typeof arr === 'string') arr = arr.split(/\n\s*\n/);
    var h = '', list = null;
    function close() { if (list) { h += '</' + list + '>'; list = null; } }
    arr.forEach(function (b) {
      b = String(b);
      var m;
      if ((m = b.match(/^\s*[-•]\s+([\s\S]*)$/))) {
        if (list !== 'ul') { close(); h += '<ul>'; list = 'ul'; }
        h += '<li>' + inline(m[1]) + '</li>';
      } else if ((m = b.match(/^\s*\d+[.)]\s+([\s\S]*)$/))) {
        if (list !== 'ol') { close(); h += '<ol>'; list = 'ol'; }
        h += '<li>' + inline(m[1]) + '</li>';
      } else if ((m = b.match(/^\s*>\s?([\s\S]*)$/))) {
        close(); h += '<blockquote>' + inline(m[1]) + '</blockquote>';
      } else if ((m = b.match(/^\s*#{2,4}\s+([\s\S]*)$/))) {
        close(); h += '<h4>' + inline(m[1]) + '</h4>';
      } else if (b.trim()) {
        close(); h += '<p>' + inline(b) + '</p>';
      }
    });
    close();
    return h;
  }

  function strip(s) {
    return String(s == null ? '' : s).replace(/[`*=]|\[([^\]]+)\]\([^)]*\)/g, '$1');
  }

  root.MD = { esc: esc, inline: inline, points: points, blocks: blocks, strip: strip };
})(typeof window !== 'undefined' ? window : globalThis);
