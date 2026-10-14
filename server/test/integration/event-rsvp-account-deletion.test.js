const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'rsvp-deletion-test-only',
  APP_BASE_URL: 'http://localhost:3000',
  DISABLE_EMAIL_SENDING: 'false',
  TRUST_PROXY: '127.0.0.1,::1',
  MINIO_ENDPOINT: 'http://127.0.0.1:9000',
  MINIO_BUCKET_NAME: 'test',
  MINIO_ACCESS_KEY: 'test',
  MINIO_SECRET_KEY: 'test',
  CDN_PUBLIC_BASE_URL: 'https://cdn.example.test/test',
});
require('nodemailer').createTransport = () => ({
  sendMail: async () => {
    throw new Error('Unexpected email send');
  },
});
const mongoose = require('mongoose');
const request = require('supertest');
const speakeasy = require('speakeasy');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../server');
const User = require('../../models/User');
const Event = require('../../models/Event');
const EventRsvp = require('../../models/EventRsvp');
const AuditLog = require('../../models/AuditLog');
const { createSessionToken } = require('../../services/auth-session');
const {
  cancelUpcomingAccountRsvps,
} = require('../../services/event-rsvp-cancellation');
let mongo;
let sequence = 0;
const day = 86400000;
const secret = speakeasy.generateSecret().base32;
const auth = (user) => `Bearer ${createSessionToken(user)}`;
const mfa = () => ({
  mfaMethod: 'totp',
  mfaCode: speakeasy.totp({ secret, encoding: 'base32' }),
});
async function user(overrides = {}) {
  sequence += 1;
  return User.create({
    username: `rsvp-delete-${sequence}@example.test`,
    email: `rsvp-delete-${sequence}@example.test`,
    password: 'Synthetic-Account-Phrase!',
    ...overrides,
  });
}
async function fixture(member, organizer) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const at = (offset) => new Date(today.getTime() + offset);
  const events = [
    { startDate: at(2 * day), endDate: null },
    { startDate: at(-2 * day), endDate: at(day) },
    { startDate: at(0), endDate: null },
    {
      startDate: at(3 * day),
      endDate: null,
      status: 'hidden',
      rsvpEnabled: false,
    },
    { startDate: at(4 * day), endDate: null },
    { startDate: at(-3 * day), endDate: at(-1) },
  ].map((event) => ({
    _id: new mongoose.Types.ObjectId(),
    title: { en: 'RSVP privacy test' },
    createdBy: organizer._id,
    allDay: true,
    timezone: '',
    status: 'published',
    rsvpEnabled: true,
    ...event,
  }));
  await Event.collection.insertMany(events);
  await EventRsvp.create(
    events.map((event, index) => ({
      event: event._id,
      user: member._id,
      response: index === 4 ? 'declined' : 'accepted',
      firstName: 'Private attendee',
      email: member.email,
      phone: '555-private-phone',
    })),
  );
  return { future: events.slice(0, 5), past: events[5] };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('self deletion cancels current/future RSVPs, retains private history and rejects public access', async () => {
  const member = await user({ totp: { enabled: true, secret } });
  const staff = await user({ role: 'administrator' });
  const other = await user();
  const { future, past } = await fixture(member, staff);
  await EventRsvp.create({
    event: future[0]._id,
    user: other._id,
    response: 'accepted',
    email: other.email,
  });
  await request(app).delete('/api/profile').expect(401);
  await request(app)
    .delete('/api/profile')
    .set('Authorization', auth(member))
    .send({ mfaCode: 'bad' })
    .expect(403);
  assert.equal(await EventRsvp.countDocuments({ user: member._id }), 6);
  const oldToken = auth(member);
  await request(app)
    .delete('/api/profile')
    .set('Authorization', oldToken)
    .send(mfa())
    .expect(200);
  assert.equal(await User.exists({ _id: member._id }), null);
  assert.equal(await EventRsvp.countDocuments({ user: member._id }), 1);
  assert.equal(await EventRsvp.countDocuments({ user: other._id }), 1);
  const retained = await EventRsvp.findOne({ user: member._id }).lean();
  assert.equal(String(retained.event), String(past._id));
  assert.equal(retained.email, member.email);
  assert.equal(retained.phone, '555-private-phone');
  const cancellations = await AuditLog.find({
    action: 'event.rsvp_cancelled',
    'metadata.userId': String(member._id),
  }).lean();
  assert.equal(cancellations.length, 5);
  assert.ok(
    cancellations.every((log) => log.metadata.reason === 'account_deleted'),
  );
  assert.equal(
    (
      await cancelUpcomingAccountRsvps({
        req: { user: staff },
        userId: member._id,
      })
    ).cancelled,
    0,
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'event.rsvp_cancelled',
      'metadata.userId': String(member._id),
    }),
    5,
  );
  for (const suffix of ['rsvps', 'rsvps.csv']) {
    const path = `/api/events/${past._id}/${suffix}`;
    await request(app).get(path).expect(401);
    await request(app).get(path).set('Authorization', auth(other)).expect(403);
    const permitted = await request(app)
      .get(path)
      .set('Authorization', auth(staff))
      .expect(200);
    assert.ok(permitted.text.includes(member.email));
  }
  for (const path of [
    '/api/events',
    `/api/events/${past._id}`,
    `/api/events/${past._id}/calendar.ics`,
  ]) {
    const response = await request(app).get(path).expect(200);
    assert.equal(response.text.includes(member.email), false);
    assert.equal(response.text.includes('555-private-phone'), false);
  }
  await request(app)
    .get(`/api/events/${past._id}/rsvps`)
    .set('Authorization', oldToken)
    .expect(401);
  await request(app)
    .post(`/api/events/${future[0]._id}/rsvp`)
    .set('Authorization', oldToken)
    .send({ response: 'accepted' })
    .expect(401);
});

for (const contentDisposition of ['keep_and_anonymize', 'delete_all']) {
  test(`admin ${contentDisposition} deletion cancels upcoming RSVPs before removing owned events`, async () => {
    const member = await user();
    const staff = await user({
      role: 'administrator',
      totp: { enabled: true, secret },
    });
    const denied = await user();
    const { future, past } = await fixture(member, staff);
    await Event.updateOne(
      { _id: future[0]._id },
      { $set: { createdBy: member._id } },
    );
    const path = `/api/admin/users/${member._id}`;
    await request(app).delete(path).expect(401);
    await request(app)
      .delete(path)
      .set('Authorization', auth(denied))
      .send({ contentDisposition, ...mfa() })
      .expect(403);
    await request(app)
      .delete(path)
      .set('Authorization', auth(staff))
      .send({ contentDisposition, mfaCode: 'bad' })
      .expect(403);
    assert.equal(await EventRsvp.countDocuments({ user: member._id }), 6);
    await request(app)
      .delete(path)
      .set('Authorization', auth(staff))
      .send({ contentDisposition, ...mfa() })
      .expect(200);
    assert.equal(await EventRsvp.countDocuments({ user: member._id }), 1);
    assert.equal(
      String((await EventRsvp.findOne({ user: member._id })).event),
      String(past._id),
    );
    const record = await AuditLog.findOne({
      action: 'user.deleted',
      target: member._id,
    }).lean();
    assert.equal(record.metadata.cancelledRsvps, 5);
    await request(app)
      .delete(path)
      .set('Authorization', auth(staff))
      .send({ contentDisposition, ...mfa() })
      .expect(404);
    assert.equal(
      await AuditLog.countDocuments({
        action: 'event.rsvp_cancelled',
        'metadata.userId': String(member._id),
      }),
      5,
    );
    assert.equal(
      (await Event.exists({ _id: future[0]._id })) !== null,
      contentDisposition !== 'delete_all',
    );
  });
}

test('normal cancellation remains idempotent and account cleanup retries do not duplicate audit records', async () => {
  const member = await user();
  const organizer = await user();
  const { future } = await fixture(member, organizer);
  const path = `/api/events/${future[0]._id}/rsvp`;
  assert.equal(
    (
      await request(app)
        .delete(path)
        .set('Authorization', auth(member))
        .expect(200)
    ).body.cancelled,
    true,
  );
  assert.equal(
    (
      await request(app)
        .delete(path)
        .set('Authorization', auth(member))
        .expect(200)
    ).body.cancelled,
    false,
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'event.rsvp_cancelled',
      target: future[0]._id,
    }),
    1,
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      cancelUpcomingAccountRsvps({ req: { user: member }, userId: member._id }),
    ),
  );
  assert.equal(
    results.reduce((sum, result) => sum + result.cancelled, 0),
    4,
  );
  assert.equal(
    await AuditLog.countDocuments({
      action: 'event.rsvp_cancelled',
      'metadata.userId': String(member._id),
    }),
    4,
  );
});

test('an authenticated RSVP write resumed after account deletion is cancelled and rejected', async (t) => {
  const member = await user({ totp: { enabled: true, secret } });
  const organizer = await user();
  const { future } = await fixture(member, organizer);
  let ready;
  let release;
  const paused = new Promise((resolve) => {
    ready = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const original = EventRsvp.findOneAndUpdate;
  t.mock.method(EventRsvp, 'findOneAndUpdate', function (...args) {
    const query = original.apply(this, args);
    const execute = query.exec;
    query.exec = async function (...options) {
      ready();
      await gate;
      return execute.apply(this, options);
    };
    return query;
  });
  const pending = request(app)
    .post(`/api/events/${future[0]._id}/rsvp`)
    .set('Authorization', auth(member))
    .send({ response: 'accepted' })
    .then((response) => response);
  await paused;
  try {
    await request(app)
      .delete('/api/profile')
      .set('Authorization', auth(member))
      .send(mfa())
      .expect(200);
  } finally {
    release();
  }
  assert.equal((await pending).status, 401);
  assert.equal(
    await EventRsvp.exists({ event: future[0]._id, user: member._id }),
    null,
  );
});

test('the final deletion sweep cancels an RSVP saved after initial cleanup while account still exists', async (t) => {
  const member = await user({ totp: { enabled: true, secret } });
  const organizer = await user();
  const { future } = await fixture(member, organizer);
  let ready;
  let release;
  const paused = new Promise((resolve) => {
    ready = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const original = User.deleteOne;
  t.mock.method(User, 'deleteOne', function (...args) {
    const query = original.apply(this, args);
    const execute = query.exec;
    query.exec = async function (...options) {
      ready();
      await gate;
      return execute.apply(this, options);
    };
    return query;
  });
  const deletion = request(app)
    .delete('/api/profile')
    .set('Authorization', auth(member))
    .send(mfa())
    .then((response) => response);
  await paused;
  try {
    await request(app)
      .post(`/api/events/${future[0]._id}/rsvp`)
      .set('Authorization', auth(member))
      .send({ response: 'accepted' })
      .expect(200);
    assert.ok(
      await EventRsvp.exists({ event: future[0]._id, user: member._id }),
    );
  } finally {
    release();
  }
  assert.equal((await deletion).status, 200);
  assert.equal(
    await EventRsvp.exists({ event: future[0]._id, user: member._id }),
    null,
  );
});

test('a cancellation storage failure stops account deletion and a retry completes cleanup', async (t) => {
  const member = await user({ totp: { enabled: true, secret } });
  const staff = await user();
  await fixture(member, staff);
  t.mock.method(EventRsvp, 'findOneAndDelete', async () => {
    throw new Error('Simulated RSVP storage failure');
  });
  await request(app)
    .delete('/api/profile')
    .set('Authorization', auth(member))
    .send(mfa())
    .expect(500);
  assert.ok(await User.exists({ _id: member._id }));
  assert.equal(await EventRsvp.countDocuments({ user: member._id }), 6);
  t.mock.restoreAll();
  await request(app)
    .delete('/api/profile')
    .set('Authorization', auth(member))
    .send(mfa())
    .expect(200);
  assert.equal(await EventRsvp.countDocuments({ user: member._id }), 1);
});
