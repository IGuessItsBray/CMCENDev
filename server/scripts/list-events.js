require('dotenv').config();

const mongoose = require('mongoose');
const Event = require('../models/Event');

require('../models/User');

function formatDate(value) {
    if (!value) {
        return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return 'invalid date';
    }

    return date.toISOString();
}

function getUsername(user) {
    return (
        user?.accountName ||
        user?.username ||
        ''
    );
}

async function listEvents() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI
        );

        const events = await Event.find()
            .populate(
                'createdBy',
                'username accountName role'
            )
            .populate(
                'updatedBy',
                'username accountName role'
            )
            .populate(
                'reviewedBy',
                'username accountName role'
            )
            .populate(
                'publishedBy',
                'username accountName role'
            )
            .populate(
                'publicationPermission.confirmedBy',
                'username accountName role'
            )
            .sort({ createdAt: -1 })
            .lean();

        console.table(
            events.map(event => ({
                id:
                    event._id.toString(),

                titleEn:
                    event.title?.en || '',

                titleFr:
                    event.title?.fr || '',

                city:
                    event.city || '',

                region:
                    event.provinceRegion || '',

                entity:
                    event.organizingEntity || '',

                eventType:
                    event.eventType || '',

                timezone:
                    event.timezone || '',

                start:
                    formatDate(
                        event.startDate
                    ),

                end:
                    formatDate(
                        event.endDate
                    ),

                allDay:
                    event.allDay === true,

                submitterEmail:
                    event.submitter?.email || '',

                permission:
                    event.publicationPermission
                        ?.confirmed === true,

                status:
                    event.status || '',

                createdBy:
                    getUsername(
                        event.createdBy
                    ),

                lastSubmitted:
                    formatDate(
                        event.lastSubmittedAt
                    )
            }))
        );

        if (
            process.argv.includes('--full')
        ) {
            console.log(
                '\nFull event records:\n'
            );

            events.forEach(
                (event, index) => {
                    console.log(
                        `Event ${index + 1}`
                    );

                    console.dir(
                        {
                            id:
                                event._id.toString(),

                            title:
                                event.title,

                            description:
                                event.description,

                            location:
                                event.location,

                            registration:
                                event.registration,

                            city:
                                event.city,

                            provinceRegion:
                                event.provinceRegion,

                            organizingEntity:
                                event.organizingEntity,

                            eventType:
                                event.eventType,

                            timezone:
                                event.timezone,

                            startDate:
                                formatDate(
                                    event.startDate
                                ),

                            endDate:
                                formatDate(
                                    event.endDate
                                ),

                            allDay:
                                event.allDay,

                            imagePath:
                                event.imagePath,

                            contentArea:
                                event.contentArea,

                            submitter:
                                event.submitter,

                            publicationPermission: {
                                confirmed:
                                    event
                                        .publicationPermission
                                        ?.confirmed,

                                confirmedAt:
                                    formatDate(
                                        event
                                            .publicationPermission
                                            ?.confirmedAt
                                    ),

                                confirmedBy:
                                    getUsername(
                                        event
                                            .publicationPermission
                                            ?.confirmedBy
                                    )
                            },

                            status:
                                event.status,

                            rejectionReason:
                                event.rejectionReason,

                            createdBy:
                                getUsername(
                                    event.createdBy
                                ),

                            updatedBy:
                                getUsername(
                                    event.updatedBy
                                ),

                            reviewedBy:
                                getUsername(
                                    event.reviewedBy
                                ),

                            publishedBy:
                                getUsername(
                                    event.publishedBy
                                ),

                            reviewedAt:
                                formatDate(
                                    event.reviewedAt
                                ),

                            publishedAt:
                                formatDate(
                                    event.publishedAt
                                ),

                            lastSubmittedAt:
                                formatDate(
                                    event.lastSubmittedAt
                                ),

                            deleteRequested:
                                event.deleteRequested,

                            deleteRequestReason:
                                event.deleteRequestReason,

                            createdAt:
                                formatDate(
                                    event.createdAt
                                ),

                            updatedAt:
                                formatDate(
                                    event.updatedAt
                                )
                        },
                        {
                            depth: null,
                            colors: true
                        }
                    );

                    console.log('');
                }
            );
        }

        console.log(
            `Total events: ${events.length}`
        );
    } catch (error) {
        console.error(
            'Could not list events:',
            error
        );

        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }


}

listEvents();
