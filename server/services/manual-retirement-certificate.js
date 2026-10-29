const {
  CertificateDocumentError,
  getMemberCertificateData,
  getFamilyCertificateData,
} = require('./certificate-documents');
const { catalogue } = require('../public/person-rank-options');
const {
  CERTIFICATE_FAMILY_RELATIONSHIPS,
} = require('../config/certificate-requests');

// A document-only input adapter: no request, publication or mailing record is created.
function getManualRetirementRequest(input) {
  const invalid = () => {
    throw new CertificateDocumentError(
      'certificate_data_invalid',
      'Enter a valid member name, rank, post-nominals and service dates.',
    );
  };
  const keys = [
    'firstName',
    'lastName',
    'postNominals',
    'fullRankEn',
    'rankLanguage',
    'ceBranchEnrollmentDate',
    'releaseDate',
    'reviewed',
    'familyMembers',
    'documentKind',
    'familyIndex',
  ];
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    invalid();
  const name = (key) => {
    if (typeof input[key] !== 'string') invalid();
    const value = input[key].trim().normalize('NFC');
    if (!value || value.length > 100 || /[\p{Cc}\p{Cf}]/u.test(value))
      invalid();
    return value;
  };
  if (!catalogue.some((rank) => rank.en === input.fullRankEn)) invalid();
  if (
    typeof input.ceBranchEnrollmentDate !== 'string' ||
    typeof input.releaseDate !== 'string'
  )
    invalid();
  if (input.reviewed !== undefined && typeof input.reviewed !== 'boolean')
    invalid();
  const postNominals = input.postNominals ?? '';
  if (
    typeof postNominals !== 'string' ||
    postNominals.length > 120 ||
    /[\p{Cc}\p{Cf}]/u.test(postNominals)
  )
    invalid();
  const request = {
    certificateType: 'retirement',
    familyMembers: [],
    member: {
      fullName: `${name('firstName')} ${name('lastName')}`,
      rank: input.fullRankEn,
      rankLanguage: input.rankLanguage,
      decorations: postNominals.trim()
        ? postNominals.split(',').map((value) => value.trim())
        : [],
      ceBranchEnrollmentDate: input.ceBranchEnrollmentDate,
      releaseDate: input.releaseDate,
    },
  };
  getMemberCertificateData(request);
  const families = input.familyMembers ?? [];
  if (!Array.isArray(families) || families.length > 20) invalid();
  for (const family of families) {
    if (
      !family ||
      typeof family !== 'object' ||
      Array.isArray(family) ||
      Object.keys(family).some(
        (key) =>
          ![
            'fullName',
            'relationship',
            'relationshipOther',
            'memberRelationshipToRecipient',
          ].includes(key),
      )
    )
      invalid();
    if (
      !CERTIFICATE_FAMILY_RELATIONSHIPS.includes(family.relationship) ||
      typeof family.fullName !== 'string' ||
      typeof family.memberRelationshipToRecipient !== 'string'
    )
      invalid();
    const other = family.relationshipOther ?? '';
    if (
      typeof other !== 'string' ||
      other.length > 80 ||
      /[\p{Cc}\p{Cf}]/u.test(other) ||
      (family.relationship === 'other' && !other.trim())
    )
      invalid();
    request.familyMembers.push({
      fullName: family.fullName.trim().normalize('NFC'),
      relationship: family.relationship,
      relationshipOther: other.trim(),
      memberRelationshipToRecipient: family.memberRelationshipToRecipient,
    });
    getFamilyCertificateData(request, request.familyMembers.length - 1);
  }
  const kind = input.documentKind ?? 'member';
  if (!['member', 'family', 'packet'].includes(kind)) invalid();
  if (kind === 'family') {
    if (!Number.isInteger(input.familyIndex)) invalid();
    getFamilyCertificateData(request, input.familyIndex);
  } else if (input.familyIndex !== undefined) invalid();
  return request;
}

module.exports = { getManualRetirementRequest };
