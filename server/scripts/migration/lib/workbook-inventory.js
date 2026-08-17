const path = require('path');
const XLSX = require('xlsx');

const REQUIRED_SHEETS = Object.freeze([
  'Inventory',
  'English Messages',
  'French Messages',
  'Media & Comments',
]);

function cleanString(value) {
  return String(value || '').trim();
}

function parseList(value, separator) {
  return cleanString(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePostIds(value) {
  return parseList(value, '|')
    .map((item) => Number(item))
    .filter((item) => Number.isSafeInteger(item) && item > 0);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function parseComments(value) {
  return parseList(value, '||').map((entry, index) => {
    const match = entry.match(
      /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+—\s+([^:]+):\s*(.+)$/u,
    );

    if (!match) {
      return { index, raw: entry, parsed: false };
    }

    return {
      index,
      parsed: true,
      publishedAt: match[1].replace(' ', 'T'),
      authorName: cleanString(match[2]),
      body: cleanString(match[3]),
      raw: entry,
    };
  });
}

function getRows(workbook, name) {
  const sheet = workbook.Sheets[name];

  if (!sheet) {
    throw new Error(`Workbook is missing the required "${name}" sheet.`);
  }

  return XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: false,
    blankrows: false,
  });
}

function indexRows(rows, sheetName) {
  const byId = new Map();

  for (const row of rows) {
    if (row.record_id === null || row.record_id === '') {
      const hasValues = Object.entries(row).some(
        ([key, value]) => key !== '__EMPTY' && value !== null && value !== '',
      );

      if (!hasValues) {
        continue;
      }

      throw new Error(`${sheetName} has a populated row without a record_id.`);
    }

    const recordId = Number(row.record_id);

    if (!Number.isSafeInteger(recordId) || recordId < 1) {
      throw new Error(`${sheetName} has an invalid record_id.`);
    }

    if (byId.has(recordId)) {
      throw new Error(`${sheetName} has duplicate record_id ${recordId}.`);
    }

    byId.set(recordId, row);
  }

  return byId;
}

function buildCandidate({ inventory, english, french, media }) {
  const messages = {
    en: cleanString(english.message_english),
    fr: cleanString(french.message_french),
  };
  const primaryLanguage = messages.en ? 'en' : 'fr';
  const sourcePostIds = parsePostIds(inventory.source_post_ids);
  const mediaLinks = [
    ...parseList(media.media_links, '|'),
    ...parseList(english.media_links, '|'),
    ...parseList(french.media_links, '|'),
  ].filter(
    (value, index, values) =>
      value !== 'NULL' && values.indexOf(value) === index,
  );

  if (!messages.en && !messages.fr) {
    throw new Error(`Record ${inventory.record_id} has no message content.`);
  }

  if (!['retirement', 'last-post'].includes(inventory.type)) {
    throw new Error(`Record ${inventory.record_id} has an unsupported type.`);
  }

  if (!sourcePostIds.length) {
    throw new Error(`Record ${inventory.record_id} has no source post ID.`);
  }

  return {
    recordId: Number(inventory.record_id),
    type: inventory.type,
    recordClass: cleanString(inventory.record_class),
    publishedDate: cleanString(inventory.date),
    sourcePostIds,
    translationGroup: cleanString(media.translation_group),
    identity: {
      rank: cleanString(inventory.rank),
      firstName: cleanString(inventory.first_name),
      lastName: cleanString(inventory.last_name),
      trade: cleanString(inventory.trade),
    },
    titles: {
      en: cleanString(inventory.source_title_english || english.source_title),
      fr: cleanString(inventory.source_title_french || french.source_title),
    },
    messages,
    primaryLanguage,
    bilingual: Boolean(messages.en && messages.fr),
    needsTranslation: !(messages.en && messages.fr),
    sourceUrls: {
      en: cleanString(english.source_url),
      fr: cleanString(french.source_url),
    },
    mediaLinks: mediaLinks.filter(isHttpUrl),
    skippedMediaLinks: mediaLinks.filter((value) => !isHttpUrl(value)),
    comments: parseComments(media.comments),
    notes: cleanString(inventory.notes || media.notes),
  };
}

function readWorkbookInventory(inputPath) {
  const workbook = XLSX.readFile(path.resolve(inputPath), {
    raw: false,
    cellDates: false,
  });

  for (const name of REQUIRED_SHEETS) {
    if (!workbook.SheetNames.includes(name)) {
      throw new Error(`Workbook is missing the required "${name}" sheet.`);
    }
  }

  const inventoryRows = getRows(workbook, 'Inventory');
  const englishRows = getRows(workbook, 'English Messages');
  const frenchRows = getRows(workbook, 'French Messages');
  const mediaRows = getRows(workbook, 'Media & Comments');
  const inventoryById = indexRows(inventoryRows, 'Inventory');
  const englishById = indexRows(englishRows, 'English Messages');
  const frenchById = indexRows(frenchRows, 'French Messages');
  const mediaById = indexRows(mediaRows, 'Media & Comments');
  const recordIds = [...inventoryById.keys()].sort(
    (left, right) => left - right,
  );
  const sourcePostIds = new Set();
  const translationGroups = new Set();

  recordIds.forEach((recordId, index) => {
    if (recordId !== index + 1) {
      throw new Error('Inventory record_id values must be sequential from 1.');
    }

    for (const [name, rows] of [
      ['English Messages', englishById],
      ['French Messages', frenchById],
      ['Media & Comments', mediaById],
    ]) {
      if (!rows.has(recordId)) {
        throw new Error(`${name} is missing record_id ${recordId}.`);
      }
    }

    const inventory = inventoryById.get(recordId);
    const media = mediaById.get(recordId);
    const ids = parsePostIds(inventory.source_post_ids);

    if (media.source_post_ids !== inventory.source_post_ids) {
      throw new Error(`Record ${recordId} has mismatched source_post_ids.`);
    }

    for (const postId of ids) {
      if (sourcePostIds.has(postId)) {
        throw new Error(
          `Source post ID ${postId} appears in more than one record.`,
        );
      }

      sourcePostIds.add(postId);
    }

    const group = cleanString(media.translation_group);
    if (!group || translationGroups.has(group)) {
      throw new Error(`Record ${recordId} has an invalid translation_group.`);
    }

    translationGroups.add(group);
  });

  const candidates = recordIds.map((recordId) =>
    buildCandidate({
      inventory: inventoryById.get(recordId),
      english: englishById.get(recordId),
      french: frenchById.get(recordId),
      media: mediaById.get(recordId),
    }),
  );

  return {
    inputPath: path.resolve(inputPath),
    candidates,
    summary: {
      records: candidates.length,
      bilingual: candidates.filter((candidate) => candidate.bilingual).length,
      needsTranslation: candidates.filter(
        (candidate) => candidate.needsTranslation,
      ).length,
      retirements: candidates.filter(
        (candidate) => candidate.type === 'retirement',
      ).length,
      lastPosts: candidates.filter(
        (candidate) => candidate.type === 'last-post',
      ).length,
      sourcePostIds: sourcePostIds.size,
    },
  };
}

module.exports = {
  isHttpUrl,
  parseComments,
  parseList,
  parsePostIds,
  readWorkbookInventory,
};
