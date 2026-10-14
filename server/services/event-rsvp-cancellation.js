const Event = require('../models/Event');
const EventRsvp = require('../models/EventRsvp');
const { writeAuditLog } = require('./audit-log');

async function cancelEventRsvp({ req, userId, eventId, reason }) {
  // Only the request that removes the row records a cancellation.
  const removed = await EventRsvp.findOneAndDelete({
    event: eventId,
    user: userId,
  });
  if (!removed) return false;
  await writeAuditLog({
    req,
    action: 'event.rsvp_cancelled',
    actor: req.user,
    targetType: 'event',
    target: eventId,
    metadata: reason ? { reason, userId: String(userId) } : {},
  });
  return true;
}

async function cancelUpcomingAccountRsvps({
  req,
  userId,
  now = new Date(),
  includeEventIds = [],
}) {
  // Match the existing calendar's current/future window, including ongoing
  // multi-day and today's all-day events. Publication/deadline changes must
  // not leave a deleted account booked into a future event.
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);
  const eventIds = await EventRsvp.distinct('event', { user: userId });
  const events = await Event.find({
    _id: { $in: eventIds },
    $or: [
      { endDate: { $gte: startOfToday } },
      { endDate: null, startDate: { $gte: startOfToday } },
    ],
  })
    .select('_id')
    .lean();
  let cancelled = 0;
  const eligible = new Map(
    [...includeEventIds, ...events.map((event) => event._id)].map((id) => [
      String(id),
      id,
    ]),
  );
  for (const eventId of eligible.values()) {
    if (
      await cancelEventRsvp({
        req,
        userId,
        eventId,
        reason: 'account_deleted',
      })
    )
      cancelled += 1;
  }
  return { cancelled, eventIds: [...eligible.values()] };
}

module.exports = { cancelEventRsvp, cancelUpcomingAccountRsvps };
