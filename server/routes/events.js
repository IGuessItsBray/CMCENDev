const express = require('express');
const Event = require('../models/Event');

const {
    authMiddleware,
    requireMinimumRole
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

function parseEventDate(value, allDay) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    /*
     * HTML date inputs return YYYY-MM-DD.
     * Parsing that directly creates midnight UTC, which can display as the
     * previous day in Canadian time zones. Noon UTC avoids that for an
     * all-day Canadian event.
     */
    if (
        allDay &&
        /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return new Date(`${value}T12:00:00.000Z`);
    }

    return new Date(value);
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
                startDate,
                endDate,
                allDay = true,
                contentArea = 'general',
                publishNow = false
            } = req.body;

            const cleanTitle = cleanLocalizedText(title);
            const cleanDescription =
                cleanLocalizedText(description);
            const cleanLocation =
                cleanLocalizedText(location);

            if (!cleanTitle.en && !cleanTitle.fr) {
                return res.status(400).json({
                    error:
                        'An English or French event title is required'
                });
            }

            const parsedStartDate =
                parseEventDate(startDate, allDay);

            const parsedEndDate = endDate
                ? parseEventDate(endDate, allDay)
                : null;

            if (
                !parsedStartDate ||
                Number.isNaN(parsedStartDate.getTime())
            ) {
                return res.status(400).json({
                    error: 'A valid event start date is required'
                });
            }

            if (
                parsedEndDate &&
                Number.isNaN(parsedEndDate.getTime())
            ) {
                return res.status(400).json({
                    error: 'The event end date is invalid'
                });
            }

            if (
                parsedEndDate &&
                parsedEndDate < parsedStartDate
            ) {
                return res.status(400).json({
                    error:
                        'End date cannot be earlier than start date'
                });
            }

            const cleanContentArea =
                typeof contentArea === 'string' &&
                    contentArea.trim()
                    ? contentArea.trim()
                    : 'general';

            const permissions =
                getUserPermissions(req.user);

            const mayPublishAnything =
                permissions.canReviewAndPublish === true;

            const mayPublishOwnArea =
                permissions.canPublishOwnContent === true &&
                req.user.contentAreas.includes(cleanContentArea);

            const mayPublish =
                mayPublishAnything || mayPublishOwnArea;

            if (publishNow && !mayPublish) {
                return res.status(403).json({
                    error:
                        'You do not have permission to publish in this content area'
                });
            }

            const status = publishNow
                ? 'published'
                : 'pending';

            const event = new Event({
                title: cleanTitle,
                description: cleanDescription,
                location: cleanLocation,

                startDate: parsedStartDate,
                endDate: parsedEndDate,
                allDay: Boolean(allDay),

                contentArea: cleanContentArea,
                status,

                createdBy: req.user._id,
                updatedBy: req.user._id,

                publishedBy:
                    status === 'published'
                        ? req.user._id
                        : null,

                publishedAt:
                    status === 'published'
                        ? new Date()
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

            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    error: Object.values(error.errors)
                        .map(item => item.message)
                        .join(', ')
                });
            }

            return res.status(500).json({
                error: 'Could not create event'
            });
        }
    }
);

module.exports = router;