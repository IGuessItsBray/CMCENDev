const {
  CERTIFICATE_DECORATIONS,
  CERTIFICATE_FAMILY_RELATIONSHIPS,
} = require('../config/certificate-requests');
const { cleanString, parseBoolean, parseDateOnly } = require('./content-utils');

const ALLOWED_RANK_LANGUAGES = ['en', 'fr'];

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
      cafEnrollmentDate: parseDateOnly(member.cafEnrollmentDate),
      releaseDate: parseDateOnly(member.releaseDate),
      ceBranchEnrollmentDate: parseDateOnly(member.ceBranchEnrollmentDate),
      neededByDate: parseDateOnly(member.neededByDate),
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
    !member.decorations.length ||
    member.decorations.some(
      (decoration) => !CERTIFICATE_DECORATIONS.includes(decoration),
    )
  ) {
    return 'Select at least one valid decoration or post-nominal';
  }

  if (!member.lastUnit) {
    return 'The member’s last unit is required';
  }

  if (
    !member.cafEnrollmentDate ||
    !member.releaseDate ||
    !member.neededByDate
  ) {
    return 'All required certificate dates must be provided';
  }

  if (!payload.hasDwdParadeRequested) {
    return 'The Depart With Dignity parade preference is required';
  }

  if (!payload.hasFamilyMembersArray) {
    return 'The certificate family members are invalid';
  }

  for (const familyMember of familyMembers) {
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
    !mailingAddress.line2 ||
    !mailingAddress.city ||
    !mailingAddress.province ||
    !mailingAddress.postalCode ||
    !mailingAddress.country
  ) {
    return 'Every certificate mailing address field is required';
  }

  return '';
}

module.exports = {
  getCleanCertificateRequestPayload,
  validateCertificateRequestPayload,
};
