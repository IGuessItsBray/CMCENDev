const { createHash } = require('node:crypto');
const { CertificateDocumentError } = require('./certificate-documents');
const { getTrustedToServeData } = require('./trusted-to-serve-documents');
const { parseCertificateDate } = require('./certificate-requests');
const {
  getManualRetirementRequest,
} = require('./manual-retirement-certificate');
const {
  getCleanCertificateRequestPayload,
  validateCertificateRequestPayload,
} = require('./certificate-requests');

function invalid(message) {
  throw new CertificateDocumentError('certificate_request_invalid', message);
}
function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function text(value, max, label, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string') invalid(`${label} is required.`);
  const result = value.trim().normalize('NFC');
  if (
    (!optional && !result) ||
    result.length > max ||
    /[\p{Cc}\p{Cf}]/u.test(result)
  )
    invalid(`${label} is invalid.`);
  return result;
}
function getDeliveryEnvelope(body) {
  if (
    typeof body.requestId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      body.requestId,
    )
  )
    invalid('A valid request ID is required.');
  if (
    typeof body.neededByDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(body.neededByDate) ||
    !parseCertificateDate(body.neededByDate)
  )
    invalid('A valid needed-by date is required.');
  const address = body.mailingAddress;
  const limits = {
    line1: 160,
    line2: 160,
    city: 100,
    province: 100,
    postalCode: 24,
    country: 100,
  };
  if (
    !record(address) ||
    Object.keys(address).some((key) => !Object.hasOwn(limits, key))
  )
    invalid('The mailing address is invalid.');
  const mailingAddress = Object.fromEntries(
    Object.entries(limits).map(([key, max]) => [
      key,
      text(address[key], max, key, key === 'line2'),
    ]),
  );
  const relationship = text(
    body.requesterRelationship,
    80,
    'Requester relationship',
  );
  return {
    mailingAddress,
    relationship,
    submissionKey: body.requestId.toLowerCase(),
  };
}
function getTrustedToServeRequest(body) {
  if (
    !record(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          'award',
          'neededByDate',
          'mailingAddress',
          'requesterRelationship',
          'requestId',
        ].includes(key),
    )
  )
    invalid('The certificate request input is invalid.');
  const { mailingAddress, relationship, submissionKey } =
    getDeliveryEnvelope(body);
  if (
    !record(body.award) ||
    Object.keys(body.award).some(
      (key) =>
        ![
          'firstName',
          'lastName',
          'postNominals',
          'awardRole',
          'fullRankEn',
          'presentationDate',
          'frPronoun',
          'reviewed',
        ].includes(key),
    )
  )
    invalid('The award input is invalid.');
  const award = getTrustedToServeData(body.award);
  if (body.award.reviewed !== true)
    throw new CertificateDocumentError(
      'award_review_required',
      'Review the award recipient, wording and presentation date before submitting.',
    );
  const trustedToServe = {
    firstName: award.firstName,
    lastName: award.lastName,
    postNominals: award.postNominals,
    fullRankEn: award.fullRankEn,
    presentationDate: award.isoDate,
    frPronoun: award.frPronoun,
    // Omit the default from the fingerprint to preserve pre-role student retries.
    ...(award.awardRole === 'instructor' ? { awardRole: award.awardRole } : {}),
  };
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        certificateType: 'trusted_to_serve',
        trustedToServe,
        neededByDate: body.neededByDate,
        mailingAddress,
        relationship,
      }),
    )
    .digest('hex');
  return {
    trustedToServe: { ...trustedToServe, awardRole: award.awardRole },
    mailingAddress,
    relationship,
    fingerprint,
    submissionKey,
    member: {
      fullName: `${award.firstName} ${award.lastName}`,
      rank: award.rankEn,
      neededByDate: parseCertificateDate(body.neededByDate),
    },
  };
}
function getRequester(user, relationship) {
  const requester = {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    unit: user.currentUnit || user.company,
  };
  const limits = { firstName: 80, lastName: 80, email: 254, unit: 160 };
  const missingFields = Object.keys(requester).filter(
    (key) =>
      typeof requester[key] !== 'string' ||
      !requester[key].trim() ||
      requester[key].trim().length > limits[key] ||
      /[\p{Cc}\p{Cf}]/u.test(requester[key]),
  );
  if (
    typeof requester.email === 'string' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(requester.email.trim()) &&
    !missingFields.includes('email')
  )
    missingFields.push('email');
  if (missingFields.length) {
    const error = new CertificateDocumentError(
      'certificate_request_profile_incomplete',
      'Complete your profile name, email and unit/company before submitting a certificate request.',
    );
    error.missingFields = missingFields;
    throw error;
  }
  return {
    ...Object.fromEntries(
      Object.entries(requester).map(([key, value]) => [key, value.trim()]),
    ),
    email: requester.email.trim().toLowerCase(),
    relationship,
  };
}
function getRetirementRequest(body) {
  if (
    !record(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          'retirement',
          'lastUnit',
          'tradeRole',
          'dwdParadeRequested',
          'neededByDate',
          'mailingAddress',
          'requesterRelationship',
          'requestId',
        ].includes(key),
    )
  )
    invalid('The retirement request input is invalid.');
  if (
    !record(body.retirement) ||
    Object.keys(body.retirement).some((key) =>
      ['documentKind', 'familyIndex'].includes(key),
    )
  )
    invalid('The retirement details are invalid.');
  const retirement = getManualRetirementRequest(body.retirement);
  if (body.retirement.reviewed !== true)
    throw new CertificateDocumentError(
      'certificate_review_required',
      'Review the retirement and family details before submitting.',
    );
  // Reuse the same validated delivery and idempotency envelope for both types.
  const envelope = getDeliveryEnvelope(body);
  if (typeof body.dwdParadeRequested !== 'boolean')
    invalid('Choose whether a Depart With Dignity parade is requested.');
  const lastUnit = text(body.lastUnit, 200, 'Last unit');
  const tradeRole = text(body.tradeRole, 120, 'Trade or role');
  if (retirement.member.fullName.length > 160)
    invalid('The member full name must be at most 160 characters.');
  const cleaned = getCleanCertificateRequestPayload({
    member: {
      ...retirement.member,
      lastUnit,
      neededByDate: body.neededByDate,
      dwdParadeRequested: body.dwdParadeRequested,
    },
    familyMembers: retirement.familyMembers,
    mailingAddress: envelope.mailingAddress,
  });
  const error = validateCertificateRequestPayload(cleaned);
  if (error) invalid(error);
  const member = { ...retirement.member, ...cleaned.member, tradeRole };
  // Preserve the existing idempotency hash for submissions made before surname
  // persistence was introduced. The surname is already represented in fullName.
  const { lastName: _lastName, ...fingerprintMember } = member;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        certificateType: 'retirement',
        member: fingerprintMember,
        familyMembers: cleaned.familyMembers,
        mailingAddress: envelope.mailingAddress,
        relationship: envelope.relationship,
      }),
    )
    .digest('hex');
  return {
    ...envelope,
    trustedToServe: undefined,
    member,
    familyMembers: cleaned.familyMembers,
    fingerprint,
  };
}
module.exports = {
  getTrustedToServeRequest,
  getRetirementRequest,
  getRequester,
};
