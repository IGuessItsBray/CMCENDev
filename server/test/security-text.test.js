const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getPasswordValidationError } = require('../services/password-policy');
const { encodeCsvText } = require('../services/csv');

test('password policy counts Unicode characters and rejects bcrypt truncation', () => {
  for (const value of [
    null,
    {},
    123456789012,
    'short',
    '😀'.repeat(11),
    'a'.repeat(73),
    '😀'.repeat(19),
  ]) {
    assert.ok(getPasswordValidationError(value));
  }
  for (const value of [
    'a'.repeat(12),
    'a'.repeat(72),
    '😀'.repeat(18),
    'a long memorable passphrase',
  ]) {
    assert.equal(getPasswordValidationError(value), '');
  }
});

test('CSV encoder neutralizes formula and control prefixes while preserving quoted text', () => {
  for (const value of [
    '=1+1',
    '+cmd',
    '-1',
    '@SUM(A1)',
    '  =1',
    '\t=1',
    '\r=1',
    '\n=1',
    '\u0000=1',
    '\u00a0=1',
    '\ttext',
  ]) {
    const encoded = encodeCsvText(value);
    assert.ok(
      encoded.startsWith("'") || encoded.startsWith('"\''),
      JSON.stringify(value),
    );
  }
  assert.equal(
    encodeCsvText('First, "Second"\nThird'),
    '"First, ""Second""\nThird"',
  );
  assert.equal(encodeCsvText('normal text'), 'normal text');
  assert.equal(encodeCsvText(0), '0');
  assert.equal(encodeCsvText(null), '');

  // Use an independent CSV reader to prove quoting contains embedded row and
  // column delimiters, while the formula/control prefix remains plain text.
  const XLSX = require('xlsx');
  const values = [
    '=HYPERLINK("https://example.test","a,b")\n@cmd',
    '\t=SUM(A1)',
    'text, with "quotes"\r\nand newline',
  ];
  const workbook = XLSX.read(values.map(encodeCsvText).join(','), {
    type: 'string',
    raw: true,
  });
  assert.deepEqual(
    XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
      header: 1,
      raw: true,
    }),
    [[`'${values[0]}`, `'${values[1]}`, values[2]]],
  );
});
