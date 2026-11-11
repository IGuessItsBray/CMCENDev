const { resolve } = require('../public/person-rank-options');
const { createHash } = require('node:crypto');

function boundedFilename(stem, suffix = '') {
  const ending = `${suffix}.pdf`;
  const full = `${stem}${ending}`;
  if (Buffer.byteLength(full, 'utf8') <= 240) return full;
  const hash = `_${createHash('sha256').update(full).digest('hex').slice(0, 12)}`;
  const budget = 240 - Buffer.byteLength(hash + ending, 'utf8');
  let shortened = '';
  for (const character of stem) {
    if (Buffer.byteLength(shortened + character, 'utf8') > budget) break;
    shortened += character;
  }
  return `${shortened}${hash}${ending}`;
}

function component(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/[^\p{L}\p{N}\p{M}'’.-]+/gu, '_')
    .replace(/^[_.-]+|[_.-]+$/gu, '');
}

function certificateTimeZone(value = 'America/Toronto') {
  if (
    typeof value !== 'string' ||
    value.length > 100 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/u.test(value)
  )
    throw new RangeError('Invalid certificate time zone');
  return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
    .timeZone;
}

function certificateFilename(
  request,
  { kind = 'member', familyIndex = 0, now = new Date(), timeZone } = {},
) {
  // Generation day in the requesting staff member's zone, never the event date.
  const partsByType = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: certificateTimeZone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  const date = `${partsByType.year}${partsByType.month}${partsByType.day}`;
  let prefix = `${date}-UU-1000-C&E`;
  let rank, name, postNominals;
  if (request.certificateType === 'trusted_to_serve') {
    const award = request.trustedToServe;
    rank = award.fullRankEn;
    name = award.lastName;
    postNominals = award.postNominals;
  } else {
    const member = request.member;
    const language = member.rankLanguage === 'fr' ? 'fr' : 'en';
    prefix += `-${language.toUpperCase()}`;
    const catalogueRank =
      resolve(member.rank, 'en') || resolve(member.rank, 'fr');
    rank = catalogueRank?.[language] || member.rank;
    // Legacy requests do not identify a surname. Never split compound names.
    name = member.lastName || member.fullName;
    postNominals = (member.decorations || []).join('_');
  }
  const suffix =
    kind === 'family'
      ? `_family-${familyIndex + 1}`
      : kind === 'packet'
        ? '_packet'
        : '';
  const separator = request.certificateType === 'trusted_to_serve' ? '_' : '-';
  const parts = [
    component(rank) || 'Rank',
    component(name) || 'Recipient',
    component(postNominals),
  ].filter(Boolean);
  return boundedFilename(`${prefix}${separator}${parts.join('_')}`, suffix);
}

function certificateDisposition(filename, download) {
  const ascii = filename
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7E]/gu, '_')
    .replace(/["\\]/gu, '_');
  const suffix = ascii.match(/(_family-\d+|_packet)\.pdf$/u)?.[1] || '';
  const fallback = boundedFilename(ascii.slice(0, -4 - suffix.length), suffix);
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${download ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  certificateFilename,
  certificateDisposition,
  certificateTimeZone,
};
