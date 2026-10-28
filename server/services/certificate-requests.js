const {
  CERTIFICATE_DECORATIONS,
  CERTIFICATE_FAMILY_RELATIONSHIPS,
} = require('../config/certificate-requests');
const { cleanString, parseBoolean, parseDateOnly } = require('./content-utils');

const ALLOWED_RANK_LANGUAGES = ['en', 'fr'];
const { FAMILY_WORDING_OPTIONS } = require('../config/certificate-wording');

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseCertificateDate(value) {
  const date = parseDateOnly(value);
  if (date) date.setUTCHours(0, 0, 0, 0);
  return date;
}

function getCleanCertificateRequestPayload(value) {
  const request = isRecord(value) ? value : {};
  const member = isRecord(request.member) ? request.member : {};
  const mailingAddress = isRecord(request.mailingAddress)
    ? request.mailingAddress
    : {};
  const familyMembers = Array.isArray(request.familyMembers)
    ? request.familyMembers.filter(isRecord).map((familyMember) => ({
        relationship: cleanString(familyMember.relationship),
        relationshipOther: cleanString(familyMember.relationshipOther),
        memberRelationshipToRecipient: cleanString(
          familyMember.memberRelationshipToRecipient,
        ),
        fullName: cleanString(familyMember.fullName),
      }))
    : [];

  return {
    isValidObject: isRecord(value),
    hasDwdParadeRequested: Object.hasOwn(member, 'dwdParadeRequested'),
    hasFamilyMembersArray: Array.isArray(request.familyMembers),
    member: {
      fullName: cleanString(member.fullName),
      rankLanguage: cleanString(member.rankLanguage),
      decorations: Array.isArray(member.decorations)
        ? [...new Set(member.decorations.map(cleanString).filter(Boolean))]
        : [],
      lastUnit: cleanString(member.lastUnit),
      releaseDate: parseCertificateDate(member.releaseDate),
      ceBranchEnrollmentDate: parseCertificateDate(
        member.ceBranchEnrollmentDate,
      ),
      neededByDate: parseCertificateDate(member.neededByDate),
      dwdParadeRequested: parseBoolean(member.dwdParadeRequested),
    },
    familyMembers,
    mailingAddress: {
      line1: cleanString(mailingAddress.line1),
      line2: cleanString(mailingAddress.line2),
      city: cleanString(mailingAddress.city),
      province: cleanString(mailingAddress.province),
      postalCode: cleanString(mailingAddress.postalCode),
      country: cleanString(mailingAddress.country),
    },
  };
}

function validateCertificateRequestPayload(payload) {
  if (!payload?.isValidObject) {
    return 'The certificate request is invalid';
  }

  const { member, familyMembers, mailingAddress } = payload;

  if (!member.fullName) {
    return 'The certificate member full name is required';
  }

  if (!ALLOWED_RANK_LANGUAGES.includes(member.rankLanguage)) {
    return 'The certificate rank language is invalid';
  }

  if (
    member.decorations.some(
      (decoration) => !CERTIFICATE_DECORATIONS.includes(decoration),
    )
  ) {
    return 'A certificate decoration or post-nominal is invalid';
  }

  if (!member.lastUnit) {
    return 'The member’s last unit is required';
  }

  if (
    !member.ceBranchEnrollmentDate ||
    !member.releaseDate ||
    !member.neededByDate
  ) {
    return 'All required certificate dates must be provided';
  }
  if (member.ceBranchEnrollmentDate > member.releaseDate) {
    return 'The release date must follow the C&E Branch enrollment date';
  }

  if (!payload.hasDwdParadeRequested) {
    return 'The Depart With Dignity parade preference is required';
  }

  if (!payload.hasFamilyMembersArray) {
    return 'The certificate family members are invalid';
  }

  for (const familyMember of familyMembers) {
    if (
      !FAMILY_WORDING_OPTIONS.some(
        (item) => item.key === familyMember.memberRelationshipToRecipient,
      )
    ) {
      return 'Specify how the retiring member is related to each family certificate recipient using a supported certificate relationship';
    }
    if (!CERTIFICATE_FAMILY_RELATIONSHIPS.includes(familyMember.relationship)) {
      return 'A certificate family relationship is invalid';
    }

    if (!familyMember.fullName) {
      return 'Each certificate family member needs a full name';
    }

    if (
      familyMember.relationship === 'other' &&
      !familyMember.relationshipOther
    ) {
      return 'Specify each other certificate family relationship';
    }
  }

  if (
    !mailingAddress.line1 ||
    !mailingAddress.city ||
    !mailingAddress.province ||
    !mailingAddress.postalCode ||
    !mailingAddress.country
  ) {
    return 'Required certificate mailing address fields are missing';
  }

  return '';
}

module.exports = {
  getCleanCertificateRequestPayload,
  validateCertificateRequestPayload,
};
