const express = require('express');
const RetirementMessage = require('../models/RetirementMessage');
const {
    authMiddleware,
    requirePermission
} = require('../middleware/auth');

const router = express.Router();

const ALLOWED_RELATIONSHIPS = [
    'self',
    'colleague',
    'family',
    'other'
];

const ALLOWED_LANGUAGES = [
    'en',
    'fr'
];

function cleanString(value) {
    return typeof value === 'string'
        ? value.trim()
        : '';
}

function parseBoolean(value) {
    return (
        value === true ||
        value === 'true' ||
        value === 1 ||
        value === '1'
    );
}

function parseDateOnly(value) {
    if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const date =
        new Date(`${value}T12:00:00.000Z`);

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        value
    );
}

router.post(
    '/',
    authMiddleware,
    requirePermission('canSubmitRetirementMessages'),
    async (req, res) => {
    try {
        const {
            retiree = {},
            message,
            messageLanguage,
            photoUrl,
            submitter = {},
            publicationConsentConfirmed,

            // Hidden honeypot field.
            website
        } = req.body;

        /*
         * Bots commonly fill every input. Return the
         * normal success response without storing anything.
         */
        if (cleanString(website)) {
            return res.status(201).json({
                message:
                    'Retirement message submitted for review'
            });
        }

        const cleanRetiree = {
            rank:
                cleanString(retiree.rank),

            firstName:
                cleanString(retiree.firstName),

            lastName:
                cleanString(retiree.lastName),

            tradeRole:
                cleanString(retiree.tradeRole),

            yearsOfService:
                cleanString(retiree.yearsOfService),

            retirementDate:
                parseDateOnly(
                    retiree.retirementDate
                )
        };

        const cleanMessage =
            cleanString(message);

        const cleanPhotoUrl =
            cleanString(photoUrl);

        const cleanSubmitter = {
            firstName:
                cleanString(submitter.firstName),

            lastName:
                cleanString(submitter.lastName),

            relationship:
                cleanString(
                    submitter.relationship
                ),

            email:
                cleanString(
                    submitter.email
                ).toLowerCase(),

            unit:
                cleanString(submitter.unit)
        };

        const consentConfirmed =
            parseBoolean(
                publicationConsentConfirmed
            );

        if (
            !cleanRetiree.rank ||
            !cleanRetiree.firstName ||
            !cleanRetiree.lastName ||
            !cleanRetiree.yearsOfService ||
            !cleanRetiree.retirementDate
        ) {
            return res.status(400).json({
                error:
                    'Required retiree information is missing'
            });
        }

        if (cleanMessage.length < 100) {
            return res.status(400).json({
                error:
                    'The retirement message must contain at least 100 characters'
            });
        }

        if (
            !ALLOWED_LANGUAGES.includes(
                messageLanguage
            )
        ) {
            return res.status(400).json({
                error:
                    'The message language is invalid'
            });
        }

        if (cleanPhotoUrl.length > 2000) {
            return res.status(400).json({
                error:
                    'The photo URL is too long'
            });
        }

        if (
            !cleanSubmitter.firstName ||
            !cleanSubmitter.lastName ||
            !cleanSubmitter.email ||
            !cleanSubmitter.unit
        ) {
            return res.status(400).json({
                error:
                    'Required submitter information is missing'
            });
        }

        if (
            !ALLOWED_RELATIONSHIPS.includes(
                cleanSubmitter.relationship
            )
        ) {
            return res.status(400).json({
                error:
                    'The submitter relationship is invalid'
            });
        }

        if (
            !isValidEmail(
                cleanSubmitter.email
            )
        ) {
            return res.status(400).json({
                error:
                    'A valid submitter email is required'
            });
        }

        if (!consentConfirmed) {
            return res.status(400).json({
                error:
                    'The retiree’s consent must be confirmed'
            });
        }

        const retirementMessage =
            new RetirementMessage({
                retiree: cleanRetiree,

                message:
                    cleanMessage,

                messageLanguage,

                photoUrl:
                    cleanPhotoUrl,

                submitter:
                    cleanSubmitter,

                publicationConsent: {
                    confirmed: true,
                    confirmedAt:
                        new Date()
                },

                status: 'pending'
            });

        await retirementMessage.save();

        return res.status(201).json({
            message:
                'Retirement message submitted for review'
        });
    } catch (error) {
        console.error(
            'Could not submit retirement message:',
            error
        );

        return res.status(500).json({
            error:
                'Could not submit retirement message'
        });
    }
});

router.get(
    '/',
    async (req, res) => {
        try {
            const retirementMessages =
                await RetirementMessage.find({
                    status: 'published'
                })
                    .select({
                        retiree: 1,
                        photoUrl: 1,
                        publishedAt: 1
                    })
                    .sort({
                        publishedAt: -1,
                        createdAt: -1
                    })
                    .lean();

            res.json({
                retirementMessages
            });
        } catch (error) {
            console.error(
                'Could not load retirement messages:',
                error
            );

            res.status(500).json({
                error:
                    'Could not load retirement messages'
            });
        }
    }
);

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

            const retirementMessages =
                await RetirementMessage.find({
                    status: requestedStatus
                })
                    .populate(
                        'reviewedBy',
                        'username accountName email role'
                    )
                    .populate(
                        'publishedBy',
                        'username accountName role'
                    )
                    .sort({
                        createdAt: 1
                    })
                    .lean();

            res.json({
                status: requestedStatus,
                retirementMessages
            });
        } catch (error) {
            console.error(
                'Could not load retirement message review queue:',
                error
            );

            res.status(500).json({
                error:
                    'Could not load retirement message review queue'
            });
        }
    }
);

router.get(
    '/:messageId',
    async (req, res) => {
        try {
            const retirementMessage =
                await RetirementMessage.findOne({
                    _id: req.params.messageId,
                    status: 'published'
                })
                    .select({
                        retiree: 1,
                        message: 1,
                        messageLanguage: 1,
                        photoUrl: 1,
                        publishedAt: 1
                    })
                    .lean();

            if (!retirementMessage) {
                return res.status(404).json({
                    error:
                        'Retirement message not found'
                });
            }

            res.json({
                retirementMessage
            });
        } catch (error) {
            console.error(
                'Could not load retirement message:',
                error
            );

            if (error.name === 'CastError') {
                return res.status(400).json({
                    error:
                        'Invalid retirement message ID'
                });
            }

            res.status(500).json({
                error:
                    'Could not load retirement message'
            });
        }
    }
);

router.patch(
    '/:messageId/review',
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
                    error:
                        'Review action must be publish or reject'
                });
            }

            const retirementMessage =
                await RetirementMessage.findById(
                    req.params.messageId
                );

            if (!retirementMessage) {
                return res.status(404).json({
                    error:
                        'Retirement message not found'
                });
            }

            if (retirementMessage.status !== 'pending') {
                return res.status(409).json({
                    error:
                        'Only pending retirement messages can be reviewed'
                });
            }

            const reviewDate = new Date();

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

                retirementMessage.status = 'rejected';
                retirementMessage.rejectionReason =
                    cleanReason;
                retirementMessage.publishedBy = null;
                retirementMessage.publishedAt = null;
            }

            if (action === 'publish') {
                retirementMessage.status = 'published';
                retirementMessage.rejectionReason = null;
                retirementMessage.publishedBy = req.user._id;
                retirementMessage.publishedAt = reviewDate;
            }

            retirementMessage.reviewedBy = req.user._id;
            retirementMessage.reviewedAt = reviewDate;

            await retirementMessage.save();

            await retirementMessage.populate(
                'reviewedBy',
                'username accountName email role'
            );

            await retirementMessage.populate(
                'publishedBy',
                'username accountName role'
            );

            res.json({
                message:
                    action === 'publish'
                        ? 'Retirement message published successfully'
                        : 'Retirement message rejected',

                retirementMessage
            });
        } catch (error) {
            console.error(
                'Could not review retirement message:',
                error
            );

            if (error.name === 'CastError') {
                return res.status(400).json({
                    error:
                        'Invalid retirement message ID'
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
                error:
                    'Could not review retirement message'
            });
        }
    }
);

module.exports = router;
