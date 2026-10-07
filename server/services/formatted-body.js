const { normalizeBlocks, plainText, withoutColors } = require('../public/body-content');

function setFormattedBody(document, language, blocks, text) {
  if (blocks === undefined) return;
  let clean;
  try { clean = normalizeBlocks(blocks).map((block) => ({ ...block, children: withoutColors(block.children) })); }
  catch (error) { error.status = 400; throw error; }
  if (plainText(clean) !== text) {
    const error = new Error('Formatted message must match the submitted text');
    error.status = 400; throw error;
  }
  document.set(`formattedBody.${language}`, { version: 1, text, blocks: clean });
  document.markModified('formattedBody');
}

// Covers old submit, translation, review and staff edit paths as well as new editors.
// A plain edit invalidates only its language. A later reversal cannot resurrect it.
function installFormattedBody(schema, field, maxText = 30000) {
  schema.add({ formattedBody: { type: Object, default: undefined } });
  schema.pre('validate', function () {
    if (!this.formattedBody) return;
    for (const language of ['en', 'fr']) {
      const body = this.formattedBody[language];
      if (!body) continue;
      if (body.text !== String(this.get(`${field}.${language}`) || '')) {
        delete this.formattedBody[language];
        this.markModified('formattedBody');
        continue;
      }
      try {
        if (body.version !== 1) throw new Error('Unsupported formatted body version');
        body.blocks = normalizeBlocks(body.blocks, maxText);
        if (plainText(body.blocks) !== body.text) throw new Error('Formatted body does not match plain text');
      } catch (error) { this.invalidate(`formattedBody.${language}`, error.message); }
    }
  });
}
module.exports = { installFormattedBody, setFormattedBody };
