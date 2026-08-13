const express = require('express');
const Event = require('../models/Event');
const {
  EVENT_ORGANIZING_ENTITIES,
  EVENT_TYPES,
  CANADIAN_REGIONS,
  CANADIAN_TIMEZONES,
} = require('../config/content');

const {
  authMiddleware,
  requireMinimumRole,
  requirePermission,
} = require('../middleware/auth');

const { getUserPermissions } = require('../config/permissions');
const { writeAuditLog } = require('../services/audit-log');
const { sendMail } = require('../services/mailer');
const { getEventSnapshot } = require('../services/content-snapshots');
const {
  cleanLocalizedText,
  cleanString,
  getValidationErrorMessage,
  parseBoolean,
} = require('../services/content-utils');
const { linkMediaAssetToSource } = require('../services/media-assets');

const router = express.Router();

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function getBaseUrl(req) {
  const configuredBaseUrl = String(process.env.APP_BASE_URL || '').trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/u, '');
  }

  return `${req.protocol}://${req.get('host')}`;
}

function getLocalizedValue(value) {
  return value?.en || value?.fr || '';
}

function getEventTitle(event) {
  return getLocalizedValue(event?.title) || 'Untitled event';
}

async function linkEventImageToMediaAsset(event) {
  await linkMediaAssetToSource({
    mediaUrl: event.imagePath,
    sourceType: 'event',
    context: 'event',
    sourceModel: 'Event',
    sourceId: event._id,
    sourceField: 'imagePath',
    sourceUrl: `/event?id=${encodeURIComponent(String(event._id))}`,
    inferredName: getEventTitle(event),
  });
}

function formatEventDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function getEventAccountHolderEmail(event, accountUser) {
  if (accountUser?.email) {
    return String(accountUser.email).trim().toLowerCase();
  }

  if (event?.createdBy?.email) {
    return String(event.createdBy.email).trim().toLowerCase();
  }

  return String(event?.submitter?.email || '')
    .trim()
    .toLowerCase();
}

function getEventAccountHolderName(event, accountUser) {
  return (
    accountUser?.accountName ||
    accountUser?.firstName ||
    event?.createdBy?.accountName ||
    event?.createdBy?.username ||
    event?.submitter?.firstName ||
    'there'
  );
}

function renderEventPublishedEmail({ accountName, event, eventUrl }) {
  const title = getEventTitle(event);
  const startDate = formatEventDate(event.startDate);
  const city = String(event.city || '').trim();
  const location = getLocalizedValue(event.location);

  return `
        <p>Hello ${escapeHtml(accountName)},</p>
        <p>Your event submission has been approved and published on CMCEN / RCMCE.</p>
        <p><strong>${escapeHtml(title)}</strong></p>
        ${startDate ? `<p><strong>Date:</strong> ${escapeHtml(startDate)}</p>` : ''}
        ${city ? `<p><strong>City:</strong> ${escapeHtml(city)}</p>` : ''}
        ${location ? `<p><strong>Location:</strong> ${escapeHtml(location)}</p>` : ''}
        <p><a href="${escapeHtml(eventUrl)}">View the published event</a></p>
    `;
}

async function notifyEventPublished(event, req, options = {}) {
  try {
    const { accountUser = null } = options;

    if (!accountUser && !event?.createdBy?.email && event?.populate) {
      await event.populate('createdBy', 'username accountName firstName email');
    }

    const to = getEventAccountHolderEmail(event, accountUser);

    if (!to) {
      console.warn(
        'Could not send event publication email: no recipient',
        event?._id,
      );
      return;
    }

    const eventUrl = `${getBaseUrl(req)}/event?id=${encodeURIComponent(String(event._id))}`;
    const title = getEventTitle(event);

    await sendMail({
      to,
      subject: `Event published: ${title}`,
      html: renderEventPublishedEmail({
        accountName: getEventAccountHolderName(event, accountUser),
        event,
        eventUrl,
      }),
    });
  } catch (error) {
    console.error('Could not send event publication email:', error);
  }
}

function cleanSubmitter(submitter = {}) {
  return {
    rank: cleanString(submitter.rank),
    firstName: cleanString(submitter.firstName),
    lastName: cleanString(submitter.lastName),
    unitRole: cleanString(submitter.unitRole),
    email: cleanString(submitter.email).toLowerCase(),
    phone: cleanString(submitter.phone),
  };
}

function getSubmitterFromUser(user = {}) {
  return cleanSubmitter({
    rank: user.rank,
    firstName: user.firstName,
    lastName: user.lastName,
    unitRole: user.currentUnit || user.company,
    email: user.email,
  });
}

function isAllowedOption(value, allowedValues) {
  return value === '' || allowedValues.includes(value);
}

function getDatePartsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = {};

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  });

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zonedDateTimeToUtc(value, timezone) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );

  if (!match) {
    return null;
  }

  const desiredParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };

  const desiredTimestamp = Date.UTC(
    desiredParts.year,
    desiredParts.month - 1,
    desiredParts.day,
    desiredParts.hour,
    desiredParts.minute,
    desiredParts.second,
  );

  let candidate = new Date(desiredTimestamp);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actualParts = getDatePartsInTimezone(candidate, timezone);

    const actualTimestamp = Date.UTC(
      actualParts.year,
      actualParts.month - 1,
      actualParts.day,
      actualParts.hour,
      actualParts.minute,
      actualParts.second,
    );

    const difference = desiredTimestamp - actualTimestamp;

    if (difference === 0) {
      break;
    }

    candidate = new Date(candidate.getTime() + difference);
  }

  const finalParts = getDatePartsInTimezone(candidate, timezone);

  const matchesRequestedTime =
    finalParts.year === desiredParts.year &&
    finalParts.month === desiredParts.month &&
    finalParts.day === desiredParts.day &&
    finalParts.hour === desiredParts.hour &&
    finalParts.minute === desiredParts.minute &&
    finalParts.second === desiredParts.second;

  if (!matchesRequestedTime) {
    return null;
  }

  return candidate;
}

function parseEventDate(value, allDay, timezone) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const cleanValue = value.trim();

  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(cleanValue)) {
    return new Date(`${cleanValue}T12:00:00.000Z`);
  }

  if (!timezone) {
    return null;
  }

  return zonedDateTimeToUtc(cleanValue, timezone);
}

function isEventStartInPast(startDate, allDay, now = new Date()) {
  if (!startDate) {
    return false;
  }

  if (allDay) {
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    return startDate < startOfToday;
  }

  return startDate < now;
}

const PUBLIC_EVENT_FIELDS = [
  'title',
  'description',
  'location',
  'registration',
  'city',
  'provinceRegion',
  'organizingEntity',
  'eventType',
  'timezone',
  'startDate',
  'endDate',
  'allDay',
  'imagePath',
  'contentArea',
].join(' ');

const MAX_PUBLIC_EVENT_RANGE_DAYS = 370;

function parsePublicEventRangeDate(value, parameterName) {
  const normalizedValue = String(value || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalizedValue)) {
    const error = new Error(
      `The ${parameterName} parameter must use YYYY-MM-DD`,
    );

    error.status = 400;
    throw error;
  }

  const date = new Date(`${normalizedValue}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalizedValue
  ) {
    const error = new Error(
      `The ${parameterName} parameter must be a valid date`,
    );

    error.status = 400;
    throw error;
  }

  return date;
}

function getPublicEventRange(query = {}) {
  const fromValue = String(query.from || '').trim();
  const toValue = String(query.to || '').trim();

  if (!fromValue && !toValue) {
    return null;
  }

  if (!fromValue || !toValue) {
    const error = new Error('The from and to parameters must be used together');

    error.status = 400;
    throw error;
  }

  const startDate = parsePublicEventRangeDate(fromValue, 'from');
  const endDate = parsePublicEventRangeDate(toValue, 'to');

  if (endDate < startDate) {
    const error = new Error('The to parameter must not be earlier than from');

    error.status = 400;
    throw error;
  }

  const rangeDuration =
    (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000);

  if (rangeDuration > MAX_PUBLIC_EVENT_RANGE_DAYS) {
    const error = new Error(
      `The requested event range cannot exceed ${MAX_PUBLIC_EVENT_RANGE_DAYS} days`,
    );

    error.status = 400;
    throw error;
  }

  const endDateExclusive = new Date(endDate);

  endDateExclusive.setUTCDate(endDateExclusive.getUTCDate() + 1);

  return {
    startDate,
    endDateExclusive,
  };
}

function getPublicEventFilterValue(query, parameterName, allowedValues) {
  const rawValue = query?.[parameterName];

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return '';
  }

  const value = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (!value || !allowedValues.includes(value)) {
    const error = new Error(`The ${parameterName} parameter is invalid`);

    error.status = 400;
    throw error;
  }

  return value;
}

function getPublicEventFilters(query = {}) {
  return {
    eventType: getPublicEventFilterValue(query, 'eventType', EVENT_TYPES),
    organizingEntity: getPublicEventFilterValue(
      query,
      'organizingEntity',
      EVENT_ORGANIZING_ENTITIES,
    ),
    provinceRegion: getPublicEventFilterValue(
      query,
      'provinceRegion',
      CANADIAN_REGIONS,
    ),
  };
}

function getPublicEventsQuery(range, filters = {}) {
  let query;

  if (range) {
    query = {
      status: 'published',

      // Include events that begin in the requested dates and
      // multi-day events still underway when the range begins.
      $or: [
        {
          startDate: {
            $gte: range.startDate,
            $lt: range.endDateExclusive,
          },
        },
        {
          startDate: {
            $lt: range.startDate,
          },
          endDate: {
            $gte: range.startDate,
          },
        },
      ],
    };
  } else {
    const startOfToday = new Date();

    startOfToday.setUTCHours(0, 0, 0, 0);

    query = {
      status: 'published',

      // Preserve the legacy public list: future events and multi-day
      // events still underway.
      $or: [
        {
          endDate: { $gte: startOfToday },
        },
        {
          endDate: null,
          startDate: { $gte: startOfToday },
        },
      ],
    };
  }

  if (filters.eventType) {
    query.eventType = filters.eventType;
  }

  if (filters.organizingEntity) {
    query.organizingEntity = filters.organizingEntity;
  }

  if (filters.provinceRegion) {
    query.provinceRegion = filters.provinceRegion;
  }

  return query;
}

// Only published events are returned publicly.
router.get('/', async (req, res) => {
  try {
    const range = getPublicEventRange(req.query);
    const filters = getPublicEventFilters(req.query);

    const events = await Event.find(getPublicEventsQuery(range, filters))
      .select(PUBLIC_EVENT_FIELDS)
      .sort({
        startDate: 1,
        createdAt: 1,
      })
      .limit(range ? 250 : 100)
      .lean();

    res.json({ events });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({
        error: error.message,
      });
    }

    console.error('Could not load public events:', error);

    res.status(500).json({
      error: 'Could not load events',
    });
  }
});

router.post(
  '/',
  authMiddleware,
  requirePermission('canCreateDrafts'),
  async (req, res) => {
    try {
      const {
        title,
        description,
        location,
        registration,
        city,
        provinceRegion,
        organizingEntity,
        eventType,
        timezone,
        startDate,
        endDate,
        allDay = true,
        imagePath,
        publicationPermissionConfirmed = false,
        contentArea = 'general',
        publishNow = false,
      } = req.body;

      const cleanTitle = cleanLocalizedText(title);

      const cleanDescription = cleanLocalizedText(description);

      const cleanLocation = cleanLocalizedText(location);

      const cleanRegistration = cleanLocalizedText(registration);

      const cleanCity = cleanString(city);

      const cleanProvinceRegion = cleanString(provinceRegion);

      const cleanOrganizingEntity = cleanString(organizingEntity);

      const cleanEventType = cleanString(eventType);

      const cleanTimezone = cleanString(timezone);

      const cleanImagePath = cleanString(imagePath);

      const cleanSubmitterData = getSubmitterFromUser(req.user);

      const requiredSubmitterFields = [
        ['rank', 'Submitter rank'],
        ['firstName', 'Submitter first name'],
        ['lastName', 'Submitter last name'],
        ['unitRole', 'Submitter unit or role'],
        ['email', 'Submitter email'],
      ];

      for (const [field, label] of requiredSubmitterFields) {
        if (!cleanSubmitterData[field]) {
          return res.status(400).json({
            error: `Complete your profile before submitting an event: ${label} is required`,
          });
        }
      }

      const isAllDay = parseBoolean(allDay, true);

      const wantsImmediatePublication = parseBoolean(publishNow, false);

      const permissionConfirmed = parseBoolean(
        publicationPermissionConfirmed,
        false,
      );

      if (!permissionConfirmed) {
        return res.status(400).json({
          error: 'Chain-of-command permission confirmation is required',
        });
      }

      if (!cleanTitle.en && !cleanTitle.fr) {
        return res.status(400).json({
          error: 'An English or French event title is required',
        });
      }

      if (!isAllowedOption(cleanProvinceRegion, CANADIAN_REGIONS)) {
        return res.status(400).json({
          error: 'The selected province or region is invalid',
        });
      }

      if (!isAllowedOption(cleanOrganizingEntity, EVENT_ORGANIZING_ENTITIES)) {
        return res.status(400).json({
          error: 'The selected organizing entity is invalid',
        });
      }

      if (!isAllowedOption(cleanEventType, EVENT_TYPES)) {
        return res.status(400).json({
          error: 'The selected event type is invalid',
        });
      }

      if (!isAllowedOption(cleanTimezone, CANADIAN_TIMEZONES)) {
        return res.status(400).json({
          error: 'The selected event timezone is invalid',
        });
      }

      if (!isAllDay && !cleanTimezone) {
        return res.status(400).json({
          error: 'A timezone is required for a timed event',
        });
      }

      const parsedStartDate = parseEventDate(
        startDate,
        isAllDay,
        cleanTimezone,
      );

      const parsedEndDate = endDate
        ? parseEventDate(endDate, isAllDay, cleanTimezone)
        : null;

      if (!parsedStartDate || Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          error: 'A valid event start date is required',
        });
      }

      if (isEventStartInPast(parsedStartDate, isAllDay)) {
        return res.status(400).json({
          error: 'Event start date cannot be in the past',
        });
      }

      if (parsedEndDate && Number.isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          error: 'The event end date is invalid',
        });
      }

      if (!isAllDay && !parsedEndDate) {
        return res.status(400).json({
          error: 'A timed event requires an end date and time',
        });
      }

      if (
        parsedEndDate &&
        (isAllDay
          ? parsedEndDate < parsedStartDate
          : parsedEndDate <= parsedStartDate)
      ) {
        return res.status(400).json({
          error: isAllDay
            ? 'End date cannot be earlier than start date'
            : 'A timed event must end after it starts',
        });
      }

      const cleanContentArea = cleanString(contentArea, 'general') || 'general';

      const permissions = getUserPermissions(req.user);

      const mayPublishAnything = permissions.canReviewAndPublish === true;

      const userContentAreas = Array.isArray(req.user.contentAreas)
        ? req.user.contentAreas
        : [];

      const mayPublishOwnArea =
        permissions.canPublishOwnContent === true &&
        userContentAreas.includes(cleanContentArea);

      const mayPublish = mayPublishAnything || mayPublishOwnArea;

      if (wantsImmediatePublication && !mayPublish) {
        return res.status(403).json({
          error: 'You do not have permission to publish in this content area',
        });
      }

      const status = wantsImmediatePublication ? 'published' : 'pending';

      const now = new Date();

      const event = new Event({
        title: cleanTitle,
        description: cleanDescription,
        location: cleanLocation,
        registration: cleanRegistration,

        city: cleanCity,
        provinceRegion: cleanProvinceRegion,
        organizingEntity: cleanOrganizingEntity,
        eventType: cleanEventType,
        timezone: cleanTimezone,

        startDate: parsedStartDate,
        endDate: parsedEndDate,
        allDay: isAllDay,
        imagePath: cleanImagePath,

        submitter: cleanSubmitterData,

        publicationPermission: {
          confirmed: permissionConfirmed,

          confirmedAt: permissionConfirmed ? now : null,

          confirmedBy: permissionConfirmed ? req.user._id : null,
        },

        contentArea: cleanContentArea,
        status,

        createdBy: req.user._id,
        updatedBy: req.user._id,

        lastSubmittedAt: now,

        reviewedBy: status === 'published' ? req.user._id : null,

        reviewedAt: status === 'published' ? now : null,

        publishedBy: status === 'published' ? req.user._id : null,

        publishedAt: status === 'published' ? now : null,
      });

      await event.save();
      await linkEventImageToMediaAsset(event);

      await writeAuditLog({
        req,
        action: 'content.created',
        actor: req.user,
        targetType: 'event',
        target: event._id,
        targetSnapshot: getEventSnapshot(event),
        metadata: { status: event.status },
      });

      if (event.status === 'published') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'event',
          target: event._id,
          targetSnapshot: getEventSnapshot(event),
          metadata: { source: 'create' },
        });

        await notifyEventPublished(event, req, { accountUser: req.user });
      }

      return res.status(201).json({
        message:
          status === 'published'
            ? 'Event published successfully'
            : 'Event submitted for review',

        event,
      });
    } catch (error) {
      console.error('Event creation failed:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      return res.status(500).json({
        error: 'Could not create event',
      });
    }
  },
);

// list the events awaiting review
router.get(
  '/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const allowedStatuses = ['pending', 'rejected', 'published'];

      const requestedStatus =
        typeof req.query.status === 'string' ? req.query.status : 'pending';

      if (!allowedStatuses.includes(requestedStatus)) {
        return res.status(400).json({
          error: 'Invalid review status',
        });
      }

      const events = await Event.find({
        status: requestedStatus,
      })
        .populate('createdBy', 'username accountName email role')
        .populate('publishedBy', 'username accountName role')
        .populate(
          'publicationPermission.confirmedBy',
          'username accountName email role',
        )
        .sort({
          createdAt: 1,
        })
        .lean();

      res.json({
        status: requestedStatus,
        events,
      });
    } catch (error) {
      console.error('Could not load review queue:', error);

      res.status(500).json({
        error: 'Could not load review queue',
      });
    }
  },
);

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const permissions = getUserPermissions(req.user);

    if (permissions.canCreateDrafts !== true) {
      return res.status(403).json({
        error: 'You do not have permission to submit or manage events',
      });
    }

    const events = await Event.find({
      createdBy: req.user._id,
    })
      .select(
        [
          'title',
          'city',
          'provinceRegion',
          'organizingEntity',
          'eventType',
          'timezone',
          'startDate',
          'endDate',
          'allDay',
          'status',
          'rejectionReason',
          'deleteRequested',
          'createdAt',
          'updatedAt',
          'lastSubmittedAt',
          'createdBy',
        ].join(' '),
      )
      .sort({
        updatedAt: -1,
      })
      .lean();

    return res.json({
      events,
    });
  } catch (error) {
    console.error('Could not load user events:', error);

    return res.status(500).json({
      error: 'Could not load your events',
    });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findOne({
      _id: req.params.id,
      status: 'published',
    })
      .select(PUBLIC_EVENT_FIELDS)
      .lean();

    if (!event) {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    return res.json({ event });
  } catch (error) {
    if (error?.name === 'CastError') {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    console.error('Could not load public event:', error);

    return res.status(500).json({
      error: 'Could not load event',
    });
  }
});

router.get('/:id/edit', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).lean();

    if (!event) {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    const permissions = getUserPermissions(req.user);

    const isOwner =
      event.createdBy && String(event.createdBy) === String(req.user._id);

    const canReview = permissions.canReviewAndPublish === true;

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this event',
      });
    }

    return res.json({
      event,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    console.error('Could not load event for editing:', error);

    return res.status(500).json({
      error: 'Could not load event for editing',
    });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    const permissions = getUserPermissions(req.user);

    const previousStatus = event.status;

    const isOwner =
      event.createdBy && String(event.createdBy) === String(req.user._id);

    const canReview = permissions.canReviewAndPublish === true;

    const userContentAreas = Array.isArray(req.user.contentAreas)
      ? req.user.contentAreas
      : [];

    const mayPublishOwnArea =
      permissions.canPublishOwnContent === true &&
      userContentAreas.includes(event.contentArea || 'general');

    const mayPublish = canReview || mayPublishOwnArea;

    const wantsImmediatePublication = parseBoolean(req.body.publishNow);

    if (!isOwner && !canReview) {
      return res.status(403).json({
        error: 'You do not have permission to edit this event',
      });
    }

    if (wantsImmediatePublication && !mayPublish) {
      return res.status(403).json({
        error: 'You do not have permission to publish in this content area',
      });
    }

    const {
      title,
      description,
      location,
      registration,
      city,
      provinceRegion,
      organizingEntity,
      eventType,
      timezone,
      startDate,
      endDate,
      allDay,
      imagePath,
      publicationPermissionConfirmed,
    } = req.body;

    const isAllDay = parseBoolean(allDay);

    if (
      !isAllowedOption(provinceRegion, CANADIAN_REGIONS) ||
      !isAllowedOption(organizingEntity, EVENT_ORGANIZING_ENTITIES) ||
      !isAllowedOption(eventType, EVENT_TYPES) ||
      (!isAllDay && !isAllowedOption(timezone, CANADIAN_TIMEZONES))
    ) {
      return res.status(400).json({
        error: 'One or more event options are invalid',
      });
    }

    const parsedStartDate = parseEventDate(startDate, isAllDay, timezone);

    const parsedEndDate = endDate
      ? parseEventDate(endDate, isAllDay, timezone)
      : null;

    if (
      !parsedStartDate ||
      Number.isNaN(parsedStartDate.getTime()) ||
      (parsedEndDate && Number.isNaN(parsedEndDate.getTime()))
    ) {
      return res.status(400).json({
        error: 'The event dates are invalid',
      });
    }

    if (isEventStartInPast(parsedStartDate, isAllDay)) {
      return res.status(400).json({
        error: 'Event start date cannot be in the past',
      });
    }

    if (parsedEndDate && parsedEndDate < parsedStartDate) {
      return res.status(400).json({
        error: 'The end date cannot be before the start date',
      });
    }

    if (!isAllDay && parsedEndDate && parsedEndDate <= parsedStartDate) {
      return res.status(400).json({
        error: 'A timed event must end after it starts',
      });
    }

    if (parseBoolean(publicationPermissionConfirmed) !== true) {
      return res.status(400).json({
        error: 'Publication permission must be confirmed',
      });
    }

    event.title = {
      en: cleanString(title?.en),
      fr: cleanString(title?.fr),
    };

    event.description = {
      en: cleanString(description?.en),
      fr: cleanString(description?.fr),
    };

    event.location = {
      en: cleanString(location?.en),
      fr: cleanString(location?.fr),
    };

    event.registration = {
      en: cleanString(registration?.en),
      fr: cleanString(registration?.fr),
    };

    event.city = cleanString(city);
    event.provinceRegion = provinceRegion;
    event.organizingEntity = organizingEntity;
    event.eventType = eventType;
    event.timezone = isAllDay ? '' : timezone;

    event.startDate = parsedStartDate;
    event.endDate = parsedEndDate;
    event.allDay = isAllDay;
    if (Object.prototype.hasOwnProperty.call(req.body, 'imagePath')) {
      event.imagePath = cleanString(imagePath);
    }

    event.publicationPermission = {
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy: req.user._id,
    };

    event.updatedBy = req.user._id;
    event.lastSubmittedAt = new Date();

    event.status = wantsImmediatePublication ? 'published' : 'pending';

    if (event.status === 'published') {
      event.publishedBy = req.user._id;
      event.publishedAt = new Date();
      event.reviewedBy = req.user._id;
      event.reviewedAt = new Date();
    } else {
      event.status = 'pending';
      event.reviewedBy = undefined;
      event.reviewedAt = undefined;
      event.publishedBy = undefined;
      event.publishedAt = undefined;
    }

    event.rejectionReason = '';

    await event.save();
    await linkEventImageToMediaAsset(event);

    if (event.status === 'published' && previousStatus !== 'published') {
      await writeAuditLog({
        req,
        action: 'content.published',
        actor: req.user,
        targetType: 'event',
        target: event._id,
        targetSnapshot: getEventSnapshot(event),
        metadata: { source: 'update' },
      });

      await notifyEventPublished(event, req, {
        accountUser: isOwner ? req.user : null,
      });
    }

    return res.json({
      message:
        event.status === 'published'
          ? 'Event updated and published'
          : 'Event updated and submitted for review',
      event,
    });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(404).json({
        error: 'Event not found',
      });
    }

    console.error('Could not update event:', error);

    return res.status(500).json({
      error: 'Could not update event',
    });
  }
});

// update the event copy for one language while it is awaiting review
router.patch(
  '/:eventId/review-content',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const { language, content } = req.body;
      const editableFields = [
        'title',
        'location',
        'description',
        'registration',
      ];

      if (!['en', 'fr'].includes(language)) {
        return res.status(400).json({
          error: 'Review content language must be English or French',
        });
      }

      if (
        !content ||
        typeof content !== 'object' ||
        Array.isArray(content) ||
        editableFields.some((field) => typeof content[field] !== 'string')
      ) {
        return res.status(400).json({
          error:
            'Review content must include title, location, description, and registration text',
        });
      }

      const event = await Event.findById(req.params.eventId);

      if (!event) {
        return res.status(404).json({
          error: 'Event not found',
        });
      }

      if (event.status !== 'pending') {
        return res.status(409).json({
          error: 'Only pending events can have review content updated',
        });
      }

      editableFields.forEach((field) => {
        event.set(`${field}.${language}`, cleanString(content[field]));
      });
      event.updatedBy = req.user._id;

      await event.save();

      await writeAuditLog({
        req,
        action: 'content.review_content_updated',
        actor: req.user,
        targetType: 'event',
        target: event._id,
        targetSnapshot: getEventSnapshot(event),
        metadata: {
          source: 'review-content',
          language,
          fields: editableFields,
        },
      });

      return res.json({
        message: 'Event review content updated',
        event,
      });
    } catch (error) {
      console.error('Could not update event review content:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          error: 'Invalid event ID',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      return res.status(500).json({
        error: 'Could not update event review content',
      });
    }
  },
);

// publish or reject an event
router.patch(
  '/:eventId/review',
  authMiddleware,
  requirePermission('canReviewAndPublish'),
  async (req, res) => {
    try {
      const { action, rejectionReason } = req.body;

      if (!['publish', 'reject'].includes(action)) {
        return res.status(400).json({
          error: 'Review action must be publish or reject',
        });
      }

      const event = await Event.findById(req.params.eventId);

      if (!event) {
        return res.status(404).json({
          error: 'Event not found',
        });
      }

      if (event.status !== 'pending') {
        return res.status(409).json({
          error: 'Only pending events can be reviewed',
        });
      }

      if (action === 'reject') {
        const cleanReason =
          typeof rejectionReason === 'string' ? rejectionReason.trim() : '';

        if (!cleanReason) {
          return res.status(400).json({
            error: 'A rejection reason is required',
          });
        }

        event.status = 'rejected';
        event.rejectionReason = cleanReason;
        event.publishedBy = null;
        event.publishedAt = null;
      }

      if (action === 'publish') {
        event.status = 'published';
        event.rejectionReason = null;
        event.publishedBy = req.user._id;
        event.publishedAt = new Date();
      }

      event.updatedBy = req.user._id;
      event.reviewedBy = req.user._id;
      event.reviewedAt = new Date();

      await event.save();

      if (action === 'publish') {
        await writeAuditLog({
          req,
          action: 'content.published',
          actor: req.user,
          targetType: 'event',
          target: event._id,
          targetSnapshot: getEventSnapshot(event),
          metadata: { source: 'review' },
        });

        await notifyEventPublished(event, req);
      }

      if (action === 'reject') {
        await writeAuditLog({
          req,
          action: 'content.rejected',
          actor: req.user,
          targetType: 'event',
          target: event._id,
          targetSnapshot: getEventSnapshot(event),
          metadata: {
            source: 'review',
            rejectionReason: event.rejectionReason,
          },
        });
      }

      await event.populate('createdBy', 'username accountName email role');

      await event.populate('publishedBy', 'username accountName role');

      res.json({
        message:
          action === 'publish'
            ? 'Event published successfully'
            : 'Event rejected',

        event,
      });
    } catch (error) {
      console.error('Could not review event:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          error: 'Invalid event ID',
        });
      }

      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: getValidationErrorMessage(error),
        });
      }

      res.status(500).json({
        error: 'Could not review event',
      });
    }
  },
);

module.exports = router;
