const fs = require('fs');

function unescapeSqlString(value) {
  return value.replace(/\\([0btnrZ'"\\%_])/gu, (_match, escaped) => {
    switch (escaped) {
      case '0':
        return '\0';
      case 'b':
        return '\b';
      case 't':
        return '\t';
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 'Z':
        return '\u001A';
      default:
        return escaped;
    }
  });
}

function coerceToken(token) {
  const value = token.trim();

  if (value.toUpperCase() === 'NULL') {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/u.test(value)) {
    return Number(value);
  }

  return value;
}

function parseTuple(tuple) {
  const values = [];
  let buffer = '';
  let inString = false;
  let wasQuoted = false;

  for (let index = 0; index < tuple.length; index += 1) {
    const char = tuple[index];
    const next = tuple[index + 1];

    if (inString) {
      if (char === '\\') {
        buffer += char;
        if (next !== undefined) {
          buffer += next;
          index += 1;
        }
        continue;
      }

      if (char === "'") {
        inString = false;
        wasQuoted = true;
        continue;
      }

      buffer += char;
      continue;
    }

    if (char === "'") {
      if (!buffer.trim()) {
        buffer = '';
      }

      inString = true;
      continue;
    }

    if (wasQuoted && /\s/u.test(char)) {
      continue;
    }

    if (char === ',') {
      values.push(
        wasQuoted ? unescapeSqlString(buffer) : coerceToken(buffer)
      );
      buffer = '';
      wasQuoted = false;
      continue;
    }

    buffer += char;
  }

  values.push(
    wasQuoted ? unescapeSqlString(buffer) : coerceToken(buffer)
  );

  return values;
}

function parseColumns(insertHeader) {
  const start = insertHeader.indexOf('(');
  const end = insertHeader.lastIndexOf(')');

  return insertHeader
    .slice(start + 1, end)
    .split(',')
    .map(column => column.trim().replace(/^`|`$/gu, ''));
}

function parseInsertValues(valuesText, columns) {
  const rows = [];
  let depth = 0;
  let inString = false;
  let tuple = '';

  for (let index = 0; index < valuesText.length; index += 1) {
    const char = valuesText[index];
    const next = valuesText[index + 1];

    if (inString) {
      tuple += char;

      if (char === '\\' && next !== undefined) {
        tuple += next;
        index += 1;
        continue;
      }

      if (char === "'") {
        inString = false;
      }

      continue;
    }

    if (char === "'") {
      inString = true;
      tuple += char;
      continue;
    }

    if (char === '(') {
      depth += 1;

      if (depth === 1) {
        tuple = '';
        continue;
      }
    }

    if (char === ')') {
      depth -= 1;

      if (depth === 0) {
        const values = parseTuple(tuple);
        const row = {};

        columns.forEach((column, columnIndex) => {
          row[column] = values[columnIndex];
        });

        rows.push(row);
        continue;
      }
    }

    if (depth > 0) {
      tuple += char;
    }
  }

  return rows;
}

function findStatementEnd(content, startIndex) {
  let inString = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      if (char === '\\' && next !== undefined) {
        index += 1;
        continue;
      }

      if (char === "'") {
        inString = false;
      }

      continue;
    }

    if (char === "'") {
      inString = true;
      continue;
    }

    if (char === ';') {
      return index;
    }
  }

  return -1;
}

function parseSqlDump(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = [];
  const insertPattern =
    /INSERT INTO\s+`[^`]+`\s+\(([^;]+?)\)\s+VALUES\s*/giu;
  let match;

  while ((match = insertPattern.exec(content)) !== null) {
    const valuesStart = insertPattern.lastIndex;
    const semicolon = findStatementEnd(content, valuesStart);

    if (semicolon === -1) {
      break;
    }

    const header = match[0].slice(0, match[0].lastIndexOf('VALUES'));
    const columns = parseColumns(header);
    const valuesText = content.slice(valuesStart, semicolon);

    rows.push(...parseInsertValues(valuesText, columns));
    insertPattern.lastIndex = semicolon + 1;
  }

  return rows;
}

module.exports = {
  parseSqlDump
};
