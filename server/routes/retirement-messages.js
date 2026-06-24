const express = require('express');
const RetirementMessage = require('../models/RetirementMessage');

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

router.post('/', async (req, res) => {
    try {
        const {
            retiree = {},
            message,
            messageLanguage,
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

module.exports = router;