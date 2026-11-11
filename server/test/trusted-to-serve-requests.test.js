const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const {
  getTrustedToServeRequest,
} = require('../services/trusted-to-serve-requests');
const CertificateRequest = require('../models/CertificateRequest');

const payload = (changes = {}) => ({
  award: {
    firstName: 'Alex',
    lastName: 'Hoyt',
    fullRankEn: 'Master Corporal',
    postNominals: '',
    presentationDate: '2026-11-13',
    frPronoun: 'il',
    reviewed: true,
    ...changes,
  },
  neededByDate: '2026-11-12',
  mailingAddress: {
    line1: '1 Test St',
    city: 'Ottawa',
    province: 'ON',
    postalCode: 'K1A 0A1',
    country: 'Canada',
  },
  requesterRelationship: 'Supervisor',
  requestId: 'cde9af02-f68e-4ae8-99cc-271c67922454',
});

test('default and explicit Student submissions preserve legacy fingerprints while Instructor changes identity', () => {
  const body = payload();
  const legacy = getTrustedToServeRequest(body);
  const { awardRole, ...preRoleAward } = legacy.trustedToServe;
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        certificateType: 'trusted_to_serve',
        trustedToServe: preRoleAward,
        neededByDate: body.neededByDate,
        mailingAddress: legacy.mailingAddress,
        relationship: legacy.relationship,
      }),
    )
    .digest('hex');
  assert.equal(awardRole, 'student');
  assert.equal(legacy.fingerprint, fingerprint);
  assert.deepEqual(
    getTrustedToServeRequest(payload({ awardRole: 'student' })),
    legacy,
  );
  const instructor = getTrustedToServeRequest(
    payload({ awardRole: 'instructor' }),
  );
  assert.equal(instructor.trustedToServe.awardRole, 'instructor');
  assert.notEqual(instructor.fingerprint, fingerprint);
  assert.equal(
    getTrustedToServeRequest(
      payload({ awardRole: 'instructor', firstName: ' Alex ' }),
    ).fingerprint,
    instructor.fingerprint,
  );
});

test('submission role rejects malformed values without accepting arbitrary award text', () => {
  for (const awardRole of [
    null,
    '',
    'Instructor',
    'teacher',
    'student ',
    false,
    1,
    [],
    {},
    '__proto__',
  ])
    assert.throws(() => getTrustedToServeRequest(payload({ awardRole })), {
      status: 422,
    });
  assert.throws(
    () => getTrustedToServeRequest(payload({ bodyEn: 'Unapproved claim' })),
    { status: 422 },
  );
});

test('saved award schema defaults old records to Student and validates both role values', async () => {
  const trustedToServe = getTrustedToServeRequest(payload()).trustedToServe;
  const document = (award) => new CertificateRequest({ trustedToServe: award });
  const { awardRole: _awardRole, ...legacy } = trustedToServe;
  assert.equal(document(legacy).trustedToServe.awardRole, 'student');
  for (const awardRole of ['student', 'instructor']) {
    const saved = document({ ...legacy, awardRole });
    assert.equal(saved.trustedToServe.awardRole, awardRole);
    await saved.trustedToServe.validate();
  }
  for (const awardRole of [null, '', 'teacher', 'Instructor', [], {}])
    await assert.rejects(
      document({ ...legacy, awardRole }).trustedToServe.validate(),
    );
});
