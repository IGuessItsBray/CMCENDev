const fs = require('fs');

function parseCsvLine(line) {
  const values = [];
  let buffer = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        buffer += '"';
        index += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      buffer += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      values.push(buffer);
      buffer = '';
      continue;
    }

    buffer += char;
  }

  values.push(buffer);
  return values;
}

function parseCsv(filePath) {
  const lines = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .filter(line => line.trim());

  const headers = parseCsvLine(lines.shift() || '');

  return lines.map(line => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    return row;
  });
}

module.exports = {
  parseCsv
};
