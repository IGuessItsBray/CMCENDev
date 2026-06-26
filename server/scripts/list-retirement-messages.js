require("dotenv").config();

const mongoose = require("mongoose");
const RetirementMessage =
    require("../models/RetirementMessage");

require('../models/User');

const showFullRecords =
    process.argv.includes("--full");

function formatDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toISOString();
}

function formatUser(user) {
    if (!user) {
        return "—";
    }

    if (typeof user === "string") {
        return user;
    }

    return (
        user.accountName ||
        user.username ||
        user.email ||
        String(user._id || "—")
    );
}

function truncate(value, maxLength = 70) {
    const text =
        typeof value === "string"
            ? value.replace(/\s+/g, " ").trim()
            : "";

    if (text.length <= maxLength) {
        return text || "—";
    }

    return `${text.slice(0, maxLength - 1)}…`;
}

function printFullRecord(message, index) {
    console.log(
        `\n${"=".repeat(72)}`
    );

    console.log(
        `RETIREMENT MESSAGE ${index + 1}`
    );

    console.log(
        `${"=".repeat(72)}`
    );

    console.log({
        id: String(message._id),

        retiree: {
            rank:
                message.retiree?.rank || "—",

            firstName:
                message.retiree?.firstName || "—",

            lastName:
                message.retiree?.lastName || "—",

            postNominals:
                message.retiree?.postNominals || "—",

            tradeRole:
                message.retiree?.tradeRole || "—",

            retirementDate:
                formatDate(
                    message.retiree?.retirementDate
                )
        },

        message: message.message,
        messageLanguage:
            message.messageLanguage,

        photoUrl: message.photoUrl,

        submitter: {
            firstName:
                message.submitter?.firstName || "—",

            lastName:
                message.submitter?.lastName || "—",

            relationship:
                message.submitter?.relationship || "—",

            email:
                message.submitter?.email || "—",

            unit:
                message.submitter?.unit || "—"
        },

        publicationConsent: {
            confirmed:
                message.publicationConsent
                    ?.confirmed === true,

            confirmedAt:
                formatDate(
                    message.publicationConsent
                        ?.confirmedAt
                )
        },

        memberReviewConfirmation: {
            confirmed:
                message.memberReviewConfirmation
                    ?.confirmed === true,

            confirmedAt:
                formatDate(
                    message.memberReviewConfirmation
                        ?.confirmedAt
                )
        },

        status: message.status,

        review: {
            reviewedBy:
                formatUser(message.reviewedBy),

            reviewedAt:
                formatDate(message.reviewedAt),

            rejectionReason:
                message.rejectionReason || "—"
        },

        publication: {
            publishedBy:
                formatUser(message.publishedBy),

            publishedAt:
                formatDate(message.publishedAt)
        },

        createdAt:
            formatDate(message.createdAt),

        updatedAt:
            formatDate(message.updatedAt)
    });
}

async function listRetirementMessages() {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error(
                "MONGO_URI is not configured."
            );
        }

        await mongoose.connect(
            process.env.MONGO_URI
        );

        const messages =
            await RetirementMessage.find()
                .populate(
                    "reviewedBy",
                    "username accountName email role"
                )
                .populate(
                    "publishedBy",
                    "username accountName email role"
                )
                .sort({
                    createdAt: -1
                });

        if (!messages.length) {
            console.log(
                "No retirement messages found."
            );

            return;
        }

        console.table(
            messages.map(message => ({
                id:
                    String(message._id).slice(-8),

                retiree: [
                    message.retiree?.rank,
                    message.retiree?.firstName,
                    message.retiree?.lastName
                ]
                    .filter(Boolean)
                    .join(" ") +
                    (
                        message.retiree?.postNominals
                            ? `, ${message.retiree.postNominals}`
                            : ""
                    ),

                postNominals:
                    message.retiree
                        ?.postNominals || "—",

                retirement:
                    message.retiree
                        ?.retirementDate
                        ? new Date(
                            message.retiree.retirementDate
                        )
                            .toISOString()
                            .slice(0, 10)
                        : "—",

                language:
                    message.messageLanguage,

                status:
                    message.status,

                submitter: [
                    message.submitter?.firstName,
                    message.submitter?.lastName
                ]
                    .filter(Boolean)
                    .join(" "),

                message:
                    truncate(message.message),

                submitted:
                    message.createdAt
                        ? new Date(message.createdAt)
                            .toISOString()
                            .slice(0, 10)
                        : "—"
            }))
        );

        console.log(
            `\nTotal: ${messages.length}`
        );

        if (showFullRecords) {
            messages.forEach(
                printFullRecord
            );
        } else {
            console.log(
                "\nRun with --full to view complete records."
            );
        }
    } catch (error) {
        console.error(
            "Could not list retirement messages:",
            error
        );

        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

listRetirementMessages();
