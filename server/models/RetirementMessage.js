const mongoose = require("mongoose");

const retirementMessageSchema =
    new mongoose.Schema(
        {
            retiree: {
                rank: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 40
                },

                firstName: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 80
                },

                lastName: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 80
                },

                tradeRole: {
                    type: String,
                    trim: true,
                    maxlength: 120,
                    default: ""
                },

                yearsOfService: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 60
                },

                retirementDate: {
                    type: Date,
                    required: true
                }
            },

            message: {
                type: String,
                required: true,
                trim: true,
                minlength: 100,
                maxlength: 10000
            },

            messageLanguage: {
                type: String,
                enum: ["en", "fr"],
                required: true
            },

            photoUrl: {
                type: String,
                trim: true,
                maxlength: 2000,
                default: ""
            },

            submitter: {
                firstName: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 80
                },

                lastName: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 80
                },

                relationship: {
                    type: String,
                    enum: [
                        "self",
                        "colleague",
                        "family",
                        "other"
                    ],
                    required: true
                },

                email: {
                    type: String,
                    required: true,
                    trim: true,
                    lowercase: true,
                    maxlength: 254
                },

                unit: {
                    type: String,
                    required: true,
                    trim: true,
                    maxlength: 160
                }
            },

            publicationConsent: {
                confirmed: {
                    type: Boolean,
                    required: true,
                    validate: {
                        validator(value) {
                            return value === true;
                        },
                        message:
                            "Publication consent must be confirmed"
                    }
                },

                confirmedAt: {
                    type: Date,
                    required: true
                }
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
                type:
                    mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null
            },

            reviewedAt: {
                type: Date,
                default: null
            },

            publishedBy: {
                type:
                    mongoose.Schema.Types.ObjectId,
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
            }
        },
        {
            timestamps: true
        }
    );

retirementMessageSchema.index({
    status: 1,
    publishedAt: -1
});

retirementMessageSchema.index({
    "retiree.retirementDate": -1
});

module.exports = mongoose.model(
    "RetirementMessage",
    retirementMessageSchema
);
