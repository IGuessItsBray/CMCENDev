(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ContentDiff = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  function stringify(value) {
    if (value === undefined) return '';
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  }

  function changes(before, after, prefix = '') {
    const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
    if (object(before) && object(after)) {
      return [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .flatMap((key) => changes(before[key], after[key], prefix ? `${prefix}.${key}` : key));
    }
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{
      field: prefix, before: stringify(before), after: stringify(after),
    }];
  }

  // Preserve whitespace and punctuation. Strip shared edges before the bounded
  // LCS so a one-word correction stays inexpensive even in a long article.
  function words(before, after) {
    const tokenize = (value) => String(value).match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) || [];
    const a = tokenize(before), b = tokenize(after), result = [];
    function add(type, text) {
      if (!text) return;
      if (result.at(-1)?.type === type) result.at(-1).text += text;
      else result.push({ type, text });
    }
    let start = 0, endA = a.length, endB = b.length;
    while (start < endA && start < endB && a[start] === b[start]) start++;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
    add('equal', a.slice(0, start).join(''));
    const rows = endA - start, columns = endB - start;
    if ((rows + 1) * (columns + 1) > 250000) {
      add('remove', a.slice(start, endA).join(''));
      add('add', b.slice(start, endB).join(''));
    } else {
      const width = columns + 1, table = new Uint32Array((rows + 1) * width);
      for (let i = rows - 1; i >= 0; i--) for (let j = columns - 1; j >= 0; j--) {
        table[i * width + j] = a[start + i] === b[start + j]
          ? 1 + table[(i + 1) * width + j + 1]
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
      let i = 0, j = 0;
      while (i < rows || j < columns) {
        if (i < rows && j < columns && a[start + i] === b[start + j]) {
          add('equal', a[start + i++]); j++;
        } else if (i < rows && (j === columns || table[(i + 1) * width + j] >= table[i * width + j + 1])) {
          add('remove', a[start + i++]);
        } else add('add', b[start + j++]);
      }
    }
    add('equal', a.slice(endA).join(''));
    return result;
  }

  function compact(parts) {
    return parts.map((part, index) => {
      if (part.type !== 'equal') return { ...part, text: part.text.length > 2000 ? `${part.text.slice(0, 2000)}…` : part.text };
      if (part.text.length <= 120) return part;
      const first = index === 0, last = index === parts.length - 1;
      const head = part.text.slice(0, 60).replace(/\s+\S*$/u, '');
      const tail = part.text.slice(-60).replace(/^\S*\s/u, '');
      return { ...part, text: `${first ? '' : head} … ${last ? '' : tail}` };
    });
  }

  function render(document, before, after, { getText = (_key, fallback) => fallback, label = (field) => field } = {}) {
    const container = document.createElement('div');
    container.className = 'content-diff';
    const make = (tag, text) => {
      const node = document.createElement(tag);
      node.textContent = text;
      return node;
    };
    const entries = changes(before, after);
    if (!entries.length) {
      container.append(make('p', getText('content_diff_no_changes', 'No changed values.')));
      return container;
    }
    const legend = make('p', `${getText('content_diff_removed', 'Removed')} (−) · ${getText('content_diff_added', 'Added')} (+)`);
    legend.className = 'content-diff-legend';
    container.append(legend);
    for (const change of entries) {
      const section = document.createElement('section');
      section.append(make('h4', label(change.field)));
      const diff = document.createElement('p');
      diff.className = 'content-diff-words';
      for (const part of compact(words(change.before, change.after))) {
        const node = make(part.type === 'remove' ? 'del' : part.type === 'add' ? 'ins' : 'span', part.text);
        if (part.type !== 'equal') node.setAttribute('aria-label', `${getText(part.type === 'remove' ? 'content_diff_removed' : 'content_diff_added', part.type === 'remove' ? 'Removed' : 'Added')}: ${part.text}`);
        diff.append(node);
      }
      const full = document.createElement('details');
      full.append(make('summary', getText('content_diff_full_values', 'Show full before and after')));
      full.append(make('h5', getText('content_workspace_before', 'Before')));
      full.append(make('pre', change.before || getText('content_workspace_empty_value', 'No value')));
      full.append(make('h5', getText('content_workspace_after', 'After')));
      full.append(make('pre', change.after || getText('content_workspace_empty_value', 'No value')));
      section.append(diff, full);
      container.append(section);
    }
    return container;
  }
  return { changes, words, compact, render };
});
