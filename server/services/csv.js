// CSV quoting alone does not prevent spreadsheet formula evaluation. Prefix
// dangerous text, including formulas hidden behind whitespace/control bytes.
function encodeCsvText(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

module.exports = { encodeCsvText };
