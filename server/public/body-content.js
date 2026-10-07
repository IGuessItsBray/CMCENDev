(function (root) {
  'use strict';
  const colors = ['default', 'red', 'blue', 'green'];
  function safeUrl(value, image = false) {
    if (typeof value !== 'string' || value.length > 2000 || /[\\\u0000-\u0020\u007f]/u.test(value)) return '';
    if (value.startsWith('/') && !value.startsWith('//')) {
      if (/^\/%(?:2f|5c)/i.test(value)) return '';
      return !image || /^\/(?:assets\/images|images)\//.test(value) ? value : '';
    }
    try {
      const url = new URL(value);
      if (url.username || url.password) return '';
      if (image) return url.protocol === 'https:' ? value : '';
      if (['https:', 'http:'].includes(url.protocol)) return value;
      if (url.protocol === 'mailto:' && !url.search && !url.hash && /^[^\s@?,;:%]+@[^\s@?,;:%]+\.[a-z]{2,}$/i.test(url.pathname)) return value;
    } catch { /* Invalid links remain text. */ }
    return '';
  }
  function normalizeBlocks(value, maxText = 30000) {
    const fail = () => { throw new Error('Invalid formatted body'); };
    const text = (v, max = maxText) => { if (typeof v !== 'string' || v.length > max) fail(); return v; };
    const url = (v, image) => { if (!safeUrl(v, image)) fail(); return v; };
    let count = 0;
    const inline = (nodes, depth = 0) => {
      if (!Array.isArray(nodes) || depth > 6) fail();
      return nodes.map((node) => {
        if (++count > 5000) fail();
        if (typeof node === 'string') return text(node);
        if (!node || typeof node !== 'object') fail();
        if (node.type === 'br') return { type: 'br' };
        if (!['strong', 'em', 'underline', 'color', 'link'].includes(node.type)) fail();
        const clean = { type: node.type, children: inline(node.children, depth + 1) };
        if (node.type === 'link') clean.href = url(node.href);
        if (node.type === 'color') {
          if (!colors.includes(node.color)) fail();
          clean.color = node.color;
        }
        return clean;
      });
    };
    if (!Array.isArray(value) || value.length > 200 || JSON.stringify(value).length > 250000) fail();
    const blocks = value.map((block) => {
      if (!block || typeof block !== 'object') fail();
      let clean;
      if (block.type === 'paragraph') clean = { type: block.type, children: inline(block.children) };
      else fail();
      if (block.align !== undefined) {
        if (!['left', 'center', 'right'].includes(block.align)) fail();
        clean.align = block.align;
      }
      return clean;
    });
    if (plainText(blocks).length > maxText) fail();
    return blocks;
  }
  const inlineText = (nodes) => (nodes || []).map((node) => typeof node === 'string' ? node : node.type === 'br' ? '\n' : inlineText(node.children)).join('');
  function plainText(blocks) {
    return (blocks || []).map((b) => inlineText(b.children)).join('\n\n').trim();
  }
  function fromText(text) {
    const inline = (part) => {
      const nodes = [];
      const pattern = /<a\b[^>]*>[\s\S]*?<\/a\s*>|<[^>]*>|\b(?:javascript|vbscript|data|file|ftp):[^\s<>"']*|(?:https?:\/\/|www\.)[^\s<>"']+|(?:mailto:)?[A-Z0-9.!#$%&*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}/gi;
      let cursor = 0;
      for (const match of part.matchAll(pattern)) {
        if (match[0].startsWith('<') || /[\w:/@]/.test(part[match.index - 1] || '')) continue;
        let label = match[0].replace(/[.,;:!?]+$/, '');
        for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
          while (label.endsWith(close) && label.split(close).length > label.split(open).length) label = label.slice(0, -1);
        }
        const target = /^(?:https?:\/\/|mailto:)/i.test(label) ? label : /^www\./i.test(label) ? `https://${label}` : `mailto:${label}`;
        if (!safeUrl(target)) continue;
        if (match.index > cursor) nodes.push(part.slice(cursor, match.index));
        nodes.push({ type: 'link', href: target, children: [label] });
        cursor = match.index + label.length;
      }
      if (cursor < part.length) nodes.push(part.slice(cursor));
      return nodes.flatMap((node) => typeof node === 'string' ? node.split(/(\n)/).map((s) => s === '\n' ? { type: 'br' } : s) : node);
    };
    return String(text || '').split(/\n{2,}/).filter(Boolean).map((part) => ({ type: 'paragraph', children: inline(part) }));
  }
  function blocksFor(content, language, text) {
    const body = content?.formattedBody?.[language];
    if (body?.version === 1 && body.text === String(text || '')) {
      try { return normalizeBlocks(body.blocks); } catch { /* Fall back to current text. */ }
    }
    return fromText(text);
  }
  function withoutColors(nodes) {
    return nodes.flatMap((node) => {
      if (typeof node === 'string') return [node];
      if (node.type === 'color') return withoutColors(node.children);
      return [{ ...node, ...(node.children ? { children: withoutColors(node.children) } : {}) }];
    });
  }
  function inline(parent, nodes, doc = document, ignoreColors = false) {
    for (const node of nodes || []) {
      if (typeof node === 'string') { parent.append(doc.createTextNode(node)); continue; }
      if (ignoreColors && node.type === 'color') { inline(parent, node.children, doc, true); continue; }
      const tag = { br: 'br', strong: 'strong', em: 'em', underline: 'u', color: 'span', link: 'a' }[node.type];
      if (!tag) continue;
      const el = doc.createElement(tag);
      if (node.type === 'link') {
        const href = safeUrl(node.href);
        if (!href) { inline(parent, node.children, doc, ignoreColors); continue; }
        el.href = href;
        if (!href.startsWith('mailto:')) { el.target = '_blank'; el.rel = 'noopener noreferrer'; }
      }
      if (node.type === 'color' && colors.includes(node.color)) el.className = `body-color-${node.color}`;
      inline(el, node.children, doc, ignoreColors);
      parent.append(el);
    }
  }
  function noticeStyle(type) {
    if (type === 'lastPost') return { align: 'center', transform: 'none' };
    if (type === 'retirementMessage') return { align: 'left', transform: 'uppercase' };
    return null;
  }
  function render(element, content, language, text, fallback, noticeType) {
    const style = noticeStyle(noticeType);
    if (style) {
      element.style.textAlign = style.align;
      element.style.textTransform = style.transform;
    }
    element.classList.remove('formatted-body');
    const body = content?.formattedBody?.[language];
    if (body?.version !== 1 || body.text !== String(text || '')) { fallback(element, text); return false; }
    let blocks;
    try { blocks = normalizeBlocks(body.blocks); } catch { fallback(element, text); return false; }
    const doc = element.ownerDocument || document;
    element.replaceChildren();
    element.classList.add('formatted-body');
    for (const block of blocks) {
      const el = doc.createElement('p');
      el.className = `body-align-${style?.align || block.align || 'left'}`;
      if (style) el.style.textAlign = style.align;
      inline(el, block.children, doc, Boolean(style));
      element.append(el);
    }
    return true;
  }
  function languageFor(values, language, text) {
    return values?.[language] ? language : values?.en === text ? 'en' : 'fr';
  }
  function mediaReferences(content) {
    const refs = [];
    const visit = (value, field, depth = 0) => {
      if (!value || typeof value !== 'object' || depth > 16) return;
      if (Array.isArray(value)) { value.forEach((item, i) => visit(item, `${field}.${i}`, depth + 1)); return; }
      if (value.type === 'link' && typeof value.href === 'string') refs.push({ url: value.href, field: `${field}.href` });
      for (const key of ['children', 'items', 'blocks']) visit(value[key], `${field}.${key}`, depth + 1);
    };
    for (const language of ['en', 'fr']) visit(content.formattedBody?.[language], `formattedBody.${language}`);
    return refs;
  }
  const api = { colors, safeUrl, normalizeBlocks, plainText, fromText, blocksFor, inline, withoutColors, render, noticeStyle, languageFor, mediaReferences };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BodyContent = api;
})(typeof window !== 'undefined' ? window : globalThis);
