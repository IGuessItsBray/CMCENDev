require('dotenv').config();

const mongoose = require('mongoose');
const Event = require('../models/Event');
require('../models/User');

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
                'publishedBy',
                'username accountName role'
            )
            .sort({ createdAt: -1 })
            .lean();

        console.table(
            events.map(event => ({
                id: event._id.toString(),

                titleEn:
                    event.title?.en || '',

                titleFr:
                    event.title?.fr || '',

                startDate:
                    event.startDate
                        ?.toISOString()
                        .slice(0, 10),

                status:
                    event.status,

                contentArea:
                    event.contentArea,

                createdBy:
                    event.createdBy?.username ||
                    'unknown',

                publishedBy:
                    event.publishedBy?.username ||
                    '',

                createdAt:
                    event.createdAt
                        ?.toISOString()
            }))
        );

        console.log(
            `\nTotal events: ${events.length}`
        );
    } catch (error) {
        console.error(
            'Could not list events:',
            error.message
        );

        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

listEvents();