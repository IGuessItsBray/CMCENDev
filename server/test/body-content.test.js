const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const body = require('../public/body-content');
const { planFormattedBodyRepair } = require('../scripts/migration/lib/formatted-body-repair');

function convert(html, media = {}, kind) {
  const result = spawnSync('python3', [path.join(__dirname, '../scripts/migration/convert-body.py')], { input: JSON.stringify({ html, media, kind }), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('Heather EN/FR underline variants and per-paragraph alignment survive conversion', () => {
  for (const mark of ['<u>Service Details</u>', '<span style="text-decoration: underline;">Détails du service</span>']) {
    const result = convert(`<p>Body</p><p style="font-weight: 400; text-align: center;">${mark}</p>`);
    assert.deepEqual(result.issues, []);
    const blocks = body.normalizeBlocks(result.blocks);
    assert.equal(blocks[0].align, undefined);
    assert.equal(blocks[1].align, 'center');
    assert.equal(blocks[1].children[0].type, 'underline');
    assert.equal(body.plainText(blocks), result.text);
  }
});

test('notice import drops display color only, retaining source semantics; explicit Event conversion retains color', () => {
  const html = '<span style="color:red"><strong><u><a href="https://example.test/CasePath">Détails</a></u></strong></span>';
  for (const kind of [undefined, 'last-post', 'retirement']) {
    const result = convert(html, {}, kind);
    assert.deepEqual(result.issues, []); assert.equal(result.text, 'Détails');
    const node = result.blocks[0].children[0];
    assert.equal(node.type, 'strong'); assert.equal(node.children[0].type, 'underline');
    assert.equal(node.children[0].children[0].href, 'https://example.test/CasePath');
  }
  assert.equal(convert(html, {}, 'event').blocks[0].children[0].type, 'color');
});

test('Pasnak named links, case-distinct Buck URLs and email targets remain single anchors', () => {
  for (const [label, href] of [
    ['Obituary information for Jeffery Peter Pasnak', 'https://www.speersfuneralchapel.com/obituaries/Jeffery-Pasnak?obId=48451191'],
    ['HTTPS://EXAMPLE.ORG/CasePath', 'https://example.org/CasePath'],
    ['JOEY.PELLETIER@FORCES.GC.CA', 'mailto:Joey.Pelletier@forces.gc.ca'],
  ]) {
    const result = convert(`<a href="${href}">${label}</a>`);
    assert.deepEqual(result.issues, []);
    assert.equal(result.blocks[0].children.length, 1);
    assert.equal(result.blocks[0].children[0].href, href);
    assert.equal(result.text, label);
  }
  const conflict = convert('<a href="mailto:Reaghan.sunstrum@ecn.forces.gc.ca">DEAN.BRUCKSHAW@ECN.FORCES.GC.CA</a>');
  assert.equal(conflict.issues[0].code, 'email-recipient-mismatch');
});

test('archived images and PDFs remain descriptive links, with captions and original positions', () => {
  const source = 'https://cmcen-rcmce.ca/wp-content/uploads/Christine-Stanczyk.png';
  const original = 'https://media.example.test/original.png';
  const result = convert(`<p>Donation paragraph</p><img src="${source}" width="387" height="543"><p>After</p>`, { [source]: original });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.blocks.map((b) => b.type), ['paragraph', 'paragraph', 'paragraph']);
  assert.equal(result.blocks[1].children[0].href, original);
  assert.equal(result.blocks[1].children[0].children[0], 'Christine-Stanczyk.png');
  const coffee = convert(`[caption id="attachment_347929" align="alignnone" width="232"]<img src="${source}" /> Coffee with Veterans Autumn 2024 - 4[/caption]`, { [source]: original });
  assert.deepEqual(coffee.issues, []);
  assert.equal(coffee.blocks[0].children[0].children[0], 'Coffee with Veterans Autumn 2024 - 4');
  const pdf = convert('<a href="https://cmcen-rcmce.ca/wp-content/uploads/Obit-James-Stewart20260114_10082283.pdf">Obit-James Stewart20260114_10082283</a>');
  assert.equal(pdf.blocks[0].type, 'paragraph');
  assert.equal(pdf.blocks[0].children[0].children[0], 'Obit-James Stewart20260114_10082283');
  assert.equal(body.normalizeBlocks(pdf.blocks)[0].type, 'paragraph');
  assert.equal(convert('<img src="https://example.test/unverified.png">').issues[0].code, 'uninventoried-image');
});

test('TGIT emphasis, plain line breaks and bounded palette remain readable', () => {
  const result = convert('Before\n<strong>bold</strong>\n<span style="color: red">Red</span>');
  assert.equal(body.plainText(body.normalizeBlocks(result.blocks)), 'Before\nbold\nRed');
  assert.equal(convert('<span style="color: expression(alert(1))">Text</span>').issues[0].code, 'unsupported-color');
});

test('links and structured nodes reject executable/ambiguous URLs and arbitrary markup/styles', () => {
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,bad', '//evil.test', '/\\evil.test', '/%2f/evil.test', 'https://user:secret@example.test', 'mailto:a@example.test?subject=x', 'mailto:a@example.test%0aBcc:x@example.test', 'https:\\evil.test']) {
    assert.equal(body.safeUrl(value), '', value);
    assert.throws(() => body.normalizeBlocks([{ type: 'document', label: 'Link', href: value }]));
  }
  for (const node of [{ type: 'script', children: ['bad'] }, { type: 'color', color: 'expression(x)', children: ['bad'] }]) {
    assert.throws(() => body.normalizeBlocks([{ type: 'paragraph', children: [node] }]));
  }
  for (const type of ['figure', 'document', 'heading', 'list']) assert.throws(() => body.normalizeBlocks([{ type }]));
  assert.throws(() => body.normalizeBlocks([{ type: 'paragraph', align: 'url(x)', children: ['Text'] }]));
  assert.deepEqual(body.normalizeBlocks([{ type: 'paragraph', children: ['<img onerror=alert(1)>'], style: 'bad', onclick: 'bad' }]), [{ type: 'paragraph', children: ['<img onerror=alert(1)>'] }]);
  assert.equal(convert('<script>alert(1)</script><p>Safe</p>').text, 'Safe');
});

test('plain compatibility conversion retains safe bare links and literal markup', () => {
  const text = 'Email editor@example.test.\nSee https://example.test/path?q=1.\n\n<a href="https://evil.test">literal</a>';
  const blocks = body.fromText(text);
  assert.equal(body.plainText(blocks), text);
  assert.equal(blocks[0].children.filter((n) => n.type === 'link').length, 2);
  assert.equal(blocks[1].children.some((n) => n.type === 'link'), false);
});

test('notice/event model hooks validate formatted bodies and invalidate only edited language', async () => {
  for (const [name, field] of [['Event', 'description'], ['LastPostMessage', 'messages'], ['RetirementMessage', 'messages']]) {
    const Model = require(`../models/${name}`);
    const value = { title: name === 'Event' ? { en: 'Title' } : 'Title', startDate: new Date(), messageLanguage: 'en', legacy: { source: 'https://cmcen-rcmce.ca', originalStatus: 'publish', submissionMetadata: 'historically-unknown', sourcePostIds: [1] }, [field]: { en: 'English', fr: 'Français' } };
    const doc = new Model(value);
    for (const language of ['en', 'fr']) doc.set(`formattedBody.${language}`, { version: 1, text: value[field][language], blocks: body.fromText(value[field][language]) });
    await doc.validate();
    doc.set('status', 'hidden'); await doc.validate();
    assert.equal(doc.formattedBody.en.text, 'English', 'metadata save preserves formatting');
    assert.equal(doc.formattedBody.fr.text, 'Français');
    doc.set(`${field}.en`, 'Staff edit');
    await doc.validate();
    assert.equal(doc.formattedBody.en, undefined);
    assert.equal(doc.formattedBody.fr.text, 'Français');
    doc.set(`${field}.en`, 'English');
    await doc.validate();
    assert.equal(doc.formattedBody.en, undefined, 'reverting plain copy cannot resurrect deleted formatting');
  }
});

test('repair plan skips staff edits/conflicts and binds candidates to exact snapshot', () => {
  const original = { messages: { en: 'Named (https://example.test)', fr: 'Staff revision' } };
  const current = { _id: 'id', updatedAt: new Date(), messageLanguage: 'en', message: original.messages.en, ...original, legacy: { sourceRecords: [{ sourceId: 1, language: 'en', bodySha256: 'hash' }, { sourceId: 2, language: 'fr', bodySha256: 'hash' }] } };
  const conversion = { sourceId: 1, bodySha256: 'hash', issues: [], blocks: [{ type: 'paragraph', children: [{ type: 'link', href: 'https://example.test', children: ['Named'] }] }] };
  const args = { current, importedBaseline: { messages: { en: original.messages.en, fr: 'Original French' } }, kind: 'retirement', conversions: { en: conversion, fr: { ...conversion, sourceId: 2 } } };
  const plan = planFormattedBodyRepair(args);
  assert.equal(plan.executable, false);
  assert.equal(plan.filter['messages.en'], original.messages.en);
  assert.equal(plan.filter.updatedAt, current.updatedAt);
  assert.equal(plan.set.message, 'Named');
  assert.equal(plan.set['messages.fr'], undefined);
  assert.equal(plan.skipped[0].reason, 'staff-edited-or-missing-baseline');
  assert.equal(plan.set.status, undefined);
  assert.equal(planFormattedBodyRepair({ ...args, conversions: { en: { ...conversion, issues: ['source conflict'] } } }).skipped[0].reason, 'source-review-required');
});
