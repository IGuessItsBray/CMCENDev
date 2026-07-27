const mongoose = require("mongoose");

const retirementCommentSchema =
    new mongoose.Schema(
        {
            retirementMessage: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "RetirementMessage",
                required: true,
                index: true
            },

            author: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
                index: true
            },

            body: {
                type: String,
                required: true,
                trim: true,
                minlength: 2,
                maxlength: 2000
            },

            status: {
                type: String,
                enum: [
                    "pending",
                    "published",
                    "rejected"
                ],
                default: "pending",
                index: true
            },

            reviewedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null
            },

            reviewedAt: {
                type: Date,
                default: null
            },

            publishedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null
            },

            publishedAt: {
                type: Date,
                default: null
            },

            rejectionReason: {
                type: String,
                trim: true,
                maxlength: 2000,
                default: ""
            },

            legacy: {
                type: mongoose.Schema.Types.Mixed,
                default: null
            }
        },
        {
            timestamps: true
        }
    );

retirementCommentSchema.index({
    retirementMessage: 1,
    status: 1,
    publishedAt: 1
});

retirementCommentSchema.index({
    status: 1,
    createdAt: 1
});

retirementCommentSchema.index({
    publishedBy: 1,
    publishedAt: -1
});

module.exports = mongoose.model(
    "RetirementComment",
    retirementCommentSchema
);
