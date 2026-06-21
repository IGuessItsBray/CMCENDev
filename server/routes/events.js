const express = require('express');
const Event = require('../models/Event');
const {
    EVENT_ORGANIZING_ENTITIES,
    EVENT_TYPES,
    CANADIAN_REGIONS,
    CANADIAN_TIMEZONES
} = require('../config/content');


const {
    authMiddleware,
    requireMinimumRole,
    requirePermission
} = require('../middleware/auth');

const {
    getUserPermissions
} = require('../config/permissions');

const router = express.Router();

function cleanLocalizedText(value) {
    return {
        en: typeof value?.en === 'string'
            ? value.en.trim()
            : '',

        fr: typeof value?.fr === 'string'
            ? value.fr.trim()
            : ''
    };
}

function cleanString(
    value,
    fallback = ''
) {
    return typeof value === 'string'
        ? value.trim()
        : fallback;
}

function cleanSubmitter(
    value,
    authenticatedUser
) {
    return {
        rank: cleanString(value?.rank),
        firstName: cleanString(value?.firstName),
        lastName: cleanString(value?.lastName),
        unitRole: cleanString(value?.unitRole),


        email: cleanString(
            value?.email,
            authenticatedUser.email || ''
        ).toLowerCase(),

        phone: cleanString(value?.phone)
    };


}

function isAllowedOption(
    value,
    allowedValues
) {
    return (
        value === '' ||
        allowedValues.includes(value)
    );
}

function parseBoolean(
    value,
    fallback = false
) {
    if (typeof value === 'boolean') {
        return value;
    }


    if (value === 'true') {
        return true;
    }

    if (value === 'false') {
        return false;
    }

    return fallback;


}


function getDatePartsInTimezone(
    date,
    timezone
) {
    const formatter =
        new Intl.DateTimeFormat(
            'en-CA-u-ca-gregory',
            {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hourCycle: 'h23'
            }
        );

    const parts = {};

    formatter
        .formatToParts(date)
        .forEach(part => {
            if (part.type !== 'literal') {
                parts[part.type] =
                    part.value;
            }
        });

    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        second: Number(parts.second)
    };
}

function zonedDateTimeToUtc(value, timezone) {
    const match = value.match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
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
        second: Number(match[6] || 0)
    };

    const desiredTimestamp = Date.UTC(
        desiredParts.year,
        desiredParts.month - 1,
        desiredParts.day,
        desiredParts.hour,
        desiredParts.minute,
        desiredParts.second
    );

    let candidate =
        new Date(desiredTimestamp);

    for (
        let attempt = 0;
        attempt < 4;
        attempt += 1
    ) {
        const actualParts =
            getDatePartsInTimezone(
                candidate,
                timezone
            );

        const actualTimestamp = Date.UTC(
            actualParts.year,
            actualParts.month - 1,
            actualParts.day,
            actualParts.hour,
            actualParts.minute,
            actualParts.second
        );

        const difference =
            desiredTimestamp -
            actualTimestamp;

        if (difference === 0) {
            break;
        }

        candidate = new Date(
            candidate.getTime() +
            difference
        );
    }

    const finalParts =
        getDatePartsInTimezone(
            candidate,
            timezone
        );

    const matchesRequestedTime =
        finalParts.year ===
        desiredParts.year &&
        finalParts.month ===
        desiredParts.month &&
        finalParts.day ===
        desiredParts.day &&
        finalParts.hour ===
        desiredParts.hour &&
        finalParts.minute ===
        desiredParts.minute &&
        finalParts.second ===
        desiredParts.second;

    if (!matchesRequestedTime) {
        return null;
    }

    return candidate;
}

function parseEventDate(
    value,
    allDay,
    timezone
) {
    if (
        typeof value !== 'string' ||
        !value.trim()
    ) {
        return null;
    }

    const cleanValue = value.trim();

    if (
        allDay &&
        /^\d{4}-\d{2}-\d{2}$/.test(
            cleanValue
        )
    ) {
        return new Date(
            `${cleanValue}T12:00:00.000Z`
        );
    }

    if (!timezone) {
        return null;
    }

    return zonedDateTimeToUtc(
        cleanValue,
        timezone
    );
}

// only published events are returned publically
router.get('/', async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0, 0, 0, 0);

        const events = await Event.find({
            status: 'published',

            // Include future events and multi-day events still underway.
            $or: [
                {
                    endDate: { $gte: startOfToday }
                },
                {
                    endDate: null,
                    startDate: { $gte: startOfToday }
                }
            ]
        })
            .select(
                [
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
                    'contentArea'
                ].join(' ')
            )
            .sort({
                startDate: 1,
                createdAt: 1
            })
            .limit(100)
            .lean();

        res.json({ events });
    } catch (error) {
        console.error('Could not load public events:', error);

        res.status(500).json({
            error: 'Could not load events'
        });
    }
});

router.post(
    '/',
    authMiddleware,
    requireMinimumRole('contributor'),
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
                submitter,
                publicationPermissionConfirmed = false,
                contentArea = 'general',
                publishNow = false
            } = req.body;

            const cleanTitle =
                cleanLocalizedText(title);

            const cleanDescription =
                cleanLocalizedText(description);

            const cleanLocation =
                cleanLocalizedText(location);

            const cleanRegistration =
                cleanLocalizedText(registration);

            const cleanCity =
                cleanString(city);

            const cleanProvinceRegion =
                cleanString(provinceRegion);

            const cleanOrganizingEntity =
                cleanString(organizingEntity);

            const cleanEventType =
                cleanString(eventType);

            const cleanTimezone =
                cleanString(timezone);

            const cleanSubmitterData =
                cleanSubmitter(
                    submitter,
                    req.user
                );

            const requiredSubmitterFields = [
                ['rank', 'Submitter rank'],
                ['firstName', 'Submitter first name'],
                ['lastName', 'Submitter last name'],
                ['unitRole', 'Submitter unit or role'],
                ['email', 'Submitter email']
            ];

            for (
                const [
                    field,
                    label
                ] of requiredSubmitterFields
            ) {
                if (!cleanSubmitterData[field]) {
                    return res.status(400).json({
                        error:
                            `${label} is required`
                    });
                }
            }

            const isAllDay =
                parseBoolean(allDay, true);

            const wantsImmediatePublication =
                parseBoolean(
                    publishNow,
                    false
                );

            const permissionConfirmed =
                parseBoolean(
                    publicationPermissionConfirmed,
                    false
                );

            if (!permissionConfirmed) {
                return res.status(400).json({
                    error:
                        'Chain-of-command permission confirmation is required'
                });
            }

            if (
                !cleanTitle.en &&
                !cleanTitle.fr
            ) {
                return res.status(400).json({
                    error:
                        'An English or French event title is required'
                });
            }

            if (
                !isAllowedOption(
                    cleanProvinceRegion,
                    CANADIAN_REGIONS
                )
            ) {
                return res.status(400).json({
                    error:
                        'The selected province or region is invalid'
                });
            }

            if (
                !isAllowedOption(
                    cleanOrganizingEntity,
                    EVENT_ORGANIZING_ENTITIES
                )
            ) {
                return res.status(400).json({
                    error:
                        'The selected organizing entity is invalid'
                });
            }

            if (
                !isAllowedOption(
                    cleanEventType,
                    EVENT_TYPES
                )
            ) {
                return res.status(400).json({
                    error:
                        'The selected event type is invalid'
                });
            }

            if (
                !isAllowedOption(
                    cleanTimezone,
                    CANADIAN_TIMEZONES
                )
            ) {
                return res.status(400).json({
                    error:
                        'The selected event timezone is invalid'
                });
            }

            if (
                !isAllDay &&
                !cleanTimezone
            ) {
                return res.status(400).json({
                    error:
                        'A timezone is required for a timed event'
                });
            }

            const parsedStartDate =
                parseEventDate(
                    startDate,
                    isAllDay,
                    cleanTimezone
                );

            const parsedEndDate =
                endDate
                    ? parseEventDate(
                        endDate,
                        isAllDay,
                        cleanTimezone
                    )
                    : null;

            if (
                !parsedStartDate ||
                Number.isNaN(
                    parsedStartDate.getTime()
                )
            ) {
                return res.status(400).json({
                    error:
                        'A valid event start date is required'
                });
            }

            if (
                parsedEndDate &&
                Number.isNaN(
                    parsedEndDate.getTime()
                )
            ) {
                return res.status(400).json({
                    error:
                        'The event end date is invalid'
                });
            }

            if (
                !isAllDay &&
                !parsedEndDate
            ) {
                return res.status(400).json({
                    error:
                        'A timed event requires an end date and time'
                });
            }

            if (
                parsedEndDate &&
                (
                    isAllDay
                        ? parsedEndDate <
                        parsedStartDate
                        : parsedEndDate <=
                        parsedStartDate
                )
            ) {
                return res.status(400).json({
                    error:
                        isAllDay
                            ? 'End date cannot be earlier than start date'
                            : 'A timed event must end after it starts'
                });
            }

            const cleanContentArea =
                cleanString(
                    contentArea,
                    'general'
                ) || 'general';

            const permissions =
                getUserPermissions(req.user);

            const mayPublishAnything =
                permissions
                    .canReviewAndPublish === true;

            const userContentAreas =
                Array.isArray(
                    req.user.contentAreas
                )
                    ? req.user.contentAreas
                    : [];

            const mayPublishOwnArea =
                permissions
                    .canPublishOwnContent === true &&
                userContentAreas.includes(
                    cleanContentArea
                );

            const mayPublish =
                mayPublishAnything ||
                mayPublishOwnArea;

            if (
                wantsImmediatePublication &&
                !mayPublish
            ) {
                return res.status(403).json({
                    error:
                        'You do not have permission to publish in this content area'
                });
            }

            const status =
                wantsImmediatePublication
                    ? 'published'
                    : 'pending';

            const now = new Date();

            const event = new Event({
                title: cleanTitle,
                description:
                    cleanDescription,
                location:
                    cleanLocation,
                registration:
                    cleanRegistration,

                city:
                    cleanCity,
                provinceRegion:
                    cleanProvinceRegion,
                organizingEntity:
                    cleanOrganizingEntity,
                eventType:
                    cleanEventType,
                timezone:
                    cleanTimezone,

                startDate:
                    parsedStartDate,
                endDate:
                    parsedEndDate,
                allDay:
                    isAllDay,

                submitter:
                    cleanSubmitterData,

                publicationPermission: {
                    confirmed:
                        permissionConfirmed,

                    confirmedAt:
                        permissionConfirmed
                            ? now
                            : null,

                    confirmedBy:
                        permissionConfirmed
                            ? req.user._id
                            : null
                },

                contentArea:
                    cleanContentArea,
                status,

                createdBy:
                    req.user._id,
                updatedBy:
                    req.user._id,

                lastSubmittedAt:
                    now,

                reviewedBy:
                    status === 'published'
                        ? req.user._id
                        : null,

                reviewedAt:
                    status === 'published'
                        ? now
                        : null,

                publishedBy:
                    status === 'published'
                        ? req.user._id
                        : null,

                publishedAt:
                    status === 'published'
                        ? now
                        : null
            });

            await event.save();

            return res.status(201).json({
                message:
                    status === 'published'
                        ? 'Event published successfully'
                        : 'Event submitted for review',

                event
            });
        } catch (error) {
            console.error(
                'Event creation failed:',
                error
            );

            if (
                error.name ===
                'ValidationError'
            ) {
                return res.status(400).json({
                    error:
                        Object.values(
                            error.errors
                        )
                            .map(
                                item =>
                                    item.message
                            )
                            .join(', ')
                });
            }

            return res.status(500).json({
                error:
                    'Could not create event'
            });
        }
    }

);


// list the events awaiting review
router.get(
    '/review',
    authMiddleware,
    requirePermission('canReviewAndPublish'),
    async (req, res) => {
        try {
            const allowedStatuses = [
                'pending',
                'rejected',
                'published'
            ];

            const requestedStatus =
                typeof req.query.status === 'string'
                    ? req.query.status
                    : 'pending';

            if (!allowedStatuses.includes(requestedStatus)) {
                return res.status(400).json({
                    error: 'Invalid review status'
                });
            }

            const events = await Event.find({
                status: requestedStatus
            })
                .populate(
                    'createdBy',
                    'username accountName email role'
                )
                .populate(
                    'publishedBy',
                    'username accountName role'
                )
                .populate(
                    'publicationPermission.confirmedBy',
                    'username accountName email role'
                )
                .sort({
                    createdAt: 1
                })
                .lean();

            res.json({
                status: requestedStatus,
                events
            });
        } catch (error) {
            console.error(
                'Could not load review queue:',
                error
            );

            res.status(500).json({
                error: 'Could not load review queue'
            });
        }
    }
);

// publish or reject an event
router.patch(
    '/:eventId/review',
    authMiddleware,
    requirePermission('canReviewAndPublish'),
    async (req, res) => {
        try {
            const {
                action,
                rejectionReason
            } = req.body;

            if (!['publish', 'reject'].includes(action)) {
                return res.status(400).json({
                    error: 'Review action must be publish or reject'
                });
            }

            const event = await Event.findById(
                req.params.eventId
            );

            if (!event) {
                return res.status(404).json({
                    error: 'Event not found'
                });
            }

            if (event.status !== 'pending') {
                return res.status(409).json({
                    error:
                        'Only pending events can be reviewed'
                });
            }

            if (action === 'reject') {
                const cleanReason =
                    typeof rejectionReason === 'string'
                        ? rejectionReason.trim()
                        : '';

                if (!cleanReason) {
                    return res.status(400).json({
                        error:
                            'A rejection reason is required'
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

            await event.save();

            await event.populate(
                'createdBy',
                'username accountName email role'
            );

            await event.populate(
                'publishedBy',
                'username accountName role'
            );

            res.json({
                message:
                    action === 'publish'
                        ? 'Event published successfully'
                        : 'Event rejected',

                event
            });
        } catch (error) {
            console.error(
                'Could not review event:',
                error
            );

            if (error.name === 'CastError') {
                return res.status(400).json({
                    error: 'Invalid event ID'
                });
            }

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    error: Object.values(error.errors)
                        .map(item => item.message)
                        .join(', ')
                });
            }

            res.status(500).json({
                error: 'Could not review event'
            });
        }
    }
);

module.exports = router;