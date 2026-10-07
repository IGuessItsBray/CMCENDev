const { normalizeBlocks, plainText } = require('../../../public/body-content');

// Proposal only. Callers must supply a fresh destination, the exact frozen import
// baseline (including resolved media URLs), and source-hash-bound conversion.
// No database connection, write, status change, or execution entry point.
function planFormattedBodyRepair({ current, importedBaseline, conversions, kind }) {
  const field = kind === 'event' ? 'description' : 'messages';
  const max = kind === 'event' ? 10000 : 30000;
  const set = {};
  const filter = { _id: current._id, updatedAt: current.updatedAt };
  const skipped = [];
  for (const language of ['en', 'fr']) {
    const conversion = conversions[language];
    if (!conversion) continue;
    const skip = (reason) => skipped.push({ language, reason });
    const source = current.legacy?.sourceRecords?.find((r) => r.sourceId === conversion.sourceId && r.language === language);
    if (!source || source.bodySha256 !== conversion.bodySha256 || conversion.issues?.length) {
      skip('source-review-required'); continue;
    }
    const text = current[field]?.[language] || '';
    const baseline = importedBaseline[field]?.[language];
    if (baseline === undefined || text !== baseline) { skip('staff-edited-or-missing-baseline'); continue; }
    let blocks;
    try { blocks = normalizeBlocks(conversion.blocks, max); }
    catch { skip('invalid-conversion'); continue; }
    const body = { version: 1, text: plainText(blocks), blocks };
    if (JSON.stringify(current.formattedBody?.[language]) === JSON.stringify(body)) { skip('already-preserved'); continue; }
    // Never overwrite rich authoring performed after the original text import.
    if (current.formattedBody?.[language]) { skip('existing-rich-content'); continue; }
    filter[`${field}.${language}`] = baseline;
    filter[`formattedBody.${language}`] = { $exists: false };
    filter['legacy.sourceRecords'] = current.legacy.sourceRecords;
    set[`${field}.${language}`] = body.text;
    set[`formattedBody.${language}`] = body;
    if (kind === 'retirement' && current.messageLanguage === language) {
      filter.message = current.message;
      set.message = body.text;
    }
  }
  return { filter, set, skipped, executable: false, requires: ['fresh backup', 'reviewed exact diff', 'compare-and-swap', 'content revision', 'explicit apply authorization'] };
}
module.exports = { planFormattedBodyRepair };
