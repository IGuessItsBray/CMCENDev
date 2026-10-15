const { stripHtml } = require('./wordpress');

// Pure mapping of reviewed public event references. Does not connect, fetch,
// inspect bookings, change an existing event or enable registration.
function mapPublicEventDetails(
  sources,
  references,
  { reviewedContactIds = [] } = {},
) {
  const text = (value) => stripHtml(String(value || ''));
  const terms = new Map(
    references.wp_terms.map((row) => [String(row.term_id), row]),
  );
  const taxonomy = new Map(
    references.wp_term_taxonomy.map((row) => [
      String(row.term_id),
      row.taxonomy,
    ]),
  );
  const meta = new Map();
  for (const row of references.wp_termmeta) {
    if (!meta.has(String(row.term_id))) meta.set(String(row.term_id), {});
    meta.get(String(row.term_id))[row.meta_key] = row.meta_value;
  }
  const location = { en: '', fr: '' },
    registration = { en: '', fr: '' };
  const sourceReferences = [],
    issues = [];
  for (const source of sources) {
    if (!['en', 'fr'].includes(source.language))
      throw new Error('Reviewed event language required');
    const lang = source.language;
    const values = Object.fromEntries(
      source.metadata.map((row) => [row.meta_key, row.meta_value]),
    );
    const venueId = String(values.mec_location_id || ''),
      organizerId = String(values.mec_organizer_id || '');
    if (taxonomy.get(venueId) === 'mec_location') {
      location[lang] = [
        text(terms.get(venueId)?.name),
        text(meta.get(venueId)?.address),
      ]
        .filter(Boolean)
        .join(' — ');
      if (location[lang].length > 500)
        throw new Error('Public venue exceeds Event location limit');
    } else if (venueId && venueId !== '0')
      issues.push({
        sourceId: source.sourceId,
        code: 'unresolved-public-venue',
        termId: venueId,
      });
    const lines = [
      lang === 'fr'
        ? 'Événement historique — les inscriptions sont closes.'
        : 'Historical event — registration is closed.',
    ];
    if (taxonomy.get(organizerId) === 'mec_organizer') {
      lines.push(
        (lang === 'fr' ? 'Organisateur : ' : 'Organizer: ') +
          text(terms.get(organizerId)?.name),
      );
      const contact = meta.get(organizerId) || {};
      // Public display of retained contact details requires an explicit review,
      // separate from knowing that the term contains an email/phone value.
      if (reviewedContactIds.map(String).includes(organizerId)) {
        if (contact.email)
          lines.push(
            (lang === 'fr' ? 'Courriel : ' : 'Email: ') + text(contact.email),
          );
        if (contact.tel)
          lines.push(
            (lang === 'fr' ? 'Téléphone : ' : 'Phone: ') + text(contact.tel),
          );
      } else if (contact.email || contact.tel)
        issues.push({
          sourceId: source.sourceId,
          code: 'public-organizer-contact-review-required',
          termId: organizerId,
        });
    }
    registration[lang] = lines.join('\n');
    sourceReferences.push({
      sourceId: source.sourceId,
      language: lang,
      venueId,
      organizerId,
    });
  }
  return {
    location,
    registration,
    rsvpEnabled: false,
    sourceReferences,
    issues,
  };
}

module.exports = { mapPublicEventDetails };
