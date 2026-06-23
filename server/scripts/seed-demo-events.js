require("dotenv").config();

const mongoose = require("mongoose");
const Event = require("../models/Event");
const User = require("../models/User");

const DAY_IN_MS =
    24 * 60 * 60 * 1000;

const REQUIRED_DEMO_USERS = [
    "demo.rowan.mercer",
    "demo.gabriel.quinn",
    "demo.elise.caron",
    "demo.isabelle.marchand",
    "demo.adrian.vale",
    "demo.claire.montrose"
];

const DEMO_PROFILES = {
    "demo.rowan.mercer": {
        rank: "MCpl",
        firstName: "Rowan",
        lastName: "Mercer",
        unitRole:
            "Association Events Coordinator",
        phone: "+1 613 555 0101"
    },

    "demo.gabriel.quinn": {
        rank: "Sgt",
        firstName: "Gabriel",
        lastName: "Quinn",
        unitRole:
            "Unit Communications Representative",
        phone: "+1 780 555 0102"
    },

    "demo.elise.caron": {
        rank: "Capt",
        firstName: "Élise",
        lastName: "Caron",
        unitRole:
            "Professional Development Officer",
        phone: "+1 514 555 0103"
    },

    "demo.isabelle.marchand": {
        rank: "CWO",
        firstName: "Isabelle",
        lastName: "Marchand",
        unitRole:
            "C&E Heritage Coordinator",
        phone: "+1 613 555 0104"
    },

    "demo.adrian.vale": {
        rank: "Maj",
        firstName: "Adrian",
        lastName: "Vale",
        unitRole:
            "National Events Editor",
        phone: "+1 613 555 0105"
    },

    "demo.claire.montrose": {
        rank: "LCol",
        firstName: "Claire",
        lastName: "Montrose",
        unitRole:
            "CMCEN Administrator",
        phone: "+1 613 555 0106"
    }
};

const EVENT_SEEDS = [
    {
        creator: "demo.rowan.mercer",
        reviewer: "demo.adrian.vale",
        status: "published",

        title: {
            en: "National C&E Summer Gathering",
            fr: "Rassemblement estival national des C et E"
        },

        description: {
            en:
                "An informal summer gathering for serving members, veterans, families, and friends of the C&E community. The evening will include a barbecue, branch updates, and opportunities to reconnect.",
            fr:
                "Un rassemblement estival informel pour les militaires en service, les vétérans, les familles et les amis de la communauté des C et E. La soirée comprendra un barbecue, des nouvelles de la Branche et des occasions de renouer."
        },

        location: {
            en: "C&E Association National Office Grounds",
            fr: "Terrain du bureau national de l’Association des C et E"
        },

        registration: {
            en:
                "Advance registration requested at https://events.cmcen-demo.invalid/summer-gathering",
            fr:
                "Inscription préalable demandée à https://events.cmcen-demo.invalid/rassemblement-estival"
        },

        city: "Ottawa",
        provinceRegion: "ON",
        organizingEntity: "association",
        eventType: "social",
        contentArea: "association",

        schedule: {
            offsetDays: 7,
            startTime: "17:30",
            durationMinutes: 180,
            timezone: "America/Toronto"
        }
    },

    {
        creator: "demo.isabelle.marchand",
        reviewer: "demo.claire.montrose",
        status: "published",

        title: {
            en: "Signals Heritage Open House",
            fr: "Journée portes ouvertes du patrimoine des transmissions"
        },

        description: {
            en:
                "A public open house featuring restored communications equipment, guided gallery tours, archival displays, and demonstrations led by museum volunteers.",
            fr:
                "Une journée portes ouvertes présentant du matériel de communications restauré, des visites guidées, des expositions d’archives et des démonstrations animées par les bénévoles du musée."
        },

        location: {
            en: "C&E Museum",
            fr: "Musée des C et E"
        },

        registration: {
            en:
                "Admission is free. Group visits may be arranged at https://museum.cmcen-demo.invalid/open-house",
            fr:
                "L’entrée est gratuite. Les visites de groupe peuvent être organisées à https://museum.cmcen-demo.invalid/portes-ouvertes"
        },

        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "museum",
        eventType: "other",
        contentArea: "museum",

        schedule: {
            offsetDays: 14,
            allDay: true
        }
    },

    {
        creator: "demo.gabriel.quinn",
        reviewer: "demo.adrian.vale",
        status: "published",

        title: {
            en: "Western Region C&E Professional Development Day",
            fr: "Journée de perfectionnement professionnel des C et E de la région de l’Ouest"
        },

        description: {
            en:
                "A regional professional development day focused on tactical communications, spectrum awareness, leadership, and lessons identified from recent exercises.",
            fr:
                "Une journée régionale de perfectionnement professionnel portant sur les communications tactiques, la connaissance du spectre, le leadership et les leçons tirées d’exercices récents."
        },

        location: {
            en: "Jefferson Armoury Conference Centre",
            fr: "Centre de conférences du manège militaire Jefferson"
        },

        registration: {
            en:
                "Unit representatives should register through https://branch.cmcen-demo.invalid/western-pd",
            fr:
                "Les représentants des unités doivent s’inscrire à https://branch.cmcen-demo.invalid/perfectionnement-ouest"
        },

        city: "Edmonton",
        provinceRegion: "AB",
        organizingEntity: "branch",
        eventType: "training",
        contentArea: "branch",

        schedule: {
            offsetDays: 22,
            startTime: "08:30",
            durationMinutes: 450,
            timezone: "America/Edmonton"
        }
    },

    {
        creator: "demo.elise.caron",
        status: "pending",

        title: {
            en: "C&E Foundation Scholarship Information Session",
            fr: "Séance d’information sur les bourses de la Fondation des C et E"
        },

        description: {
            en:
                "An online information session for students, families, and mentors interested in the Foundation’s education awards and application process.",
            fr:
                "Une séance d’information en ligne pour les étudiants, les familles et les mentors qui souhaitent en savoir plus sur les bourses d’études de la Fondation et le processus de demande."
        },

        location: {
            en: "Online presentation",
            fr: "Présentation en ligne"
        },

        registration: {
            en:
                "Registration link: https://foundation.cmcen-demo.invalid/scholarships",
            fr:
                "Lien d’inscription : https://foundation.cmcen-demo.invalid/bourses"
        },

        city: "Ottawa",
        provinceRegion: "ON",
        organizingEntity: "foundation",
        eventType: "conference",
        contentArea: "foundation",

        schedule: {
            offsetDays: 30,
            startTime: "19:00",
            durationMinutes: 60,
            timezone: "America/Toronto"
        }
    },

    {
        creator: "demo.rowan.mercer",
        reviewer: "demo.adrian.vale",
        status: "published",

        title: {
            en: "Atlantic Signals Mess Dinner",
            fr: "Dîner régimentaire des transmissions de l’Atlantique"
        },

        description: {
            en:
                "A formal mess dinner recognizing the service of Atlantic-region C&E members and welcoming recently posted personnel to the community.",
            fr:
                "Un dîner régimentaire officiel soulignant le service des membres des C et E de la région de l’Atlantique et accueillant les militaires récemment affectés dans la communauté."
        },

        location: {
            en: "Halifax Officers’ Mess",
            fr: "Mess des officiers de Halifax"
        },

        registration: {
            en:
                "Dress and attendance details are available at https://association.cmcen-demo.invalid/atlantic-dinner",
            fr:
                "Les renseignements sur la tenue et la participation sont disponibles à https://association.cmcen-demo.invalid/diner-atlantique"
        },

        city: "Halifax",
        provinceRegion: "NS",
        organizingEntity: "association",
        eventType: "mess-function",
        contentArea: "association",

        schedule: {
            offsetDays: 38,
            startTime: "18:00",
            durationMinutes: 240,
            timezone: "America/Halifax"
        }
    },

    {
        creator: "demo.gabriel.quinn",
        reviewer: "demo.claire.montrose",
        status: "published",

        title: {
            en: "National Day of Remembrance for Signallers",
            fr: "Journée nationale du Souvenir des transmetteurs"
        },

        description: {
            en:
                "A commemorative ceremony honouring members of Canada’s military communications community who died in service. Families, veterans, and serving members are welcome.",
            fr:
                "Une cérémonie commémorative en l’honneur des membres de la communauté canadienne des communications militaires morts en service. Les familles, les vétérans et les militaires en service sont les bienvenus."
        },

        location: {
            en: "C&E Memorial",
            fr: "Monument commémoratif des C et E"
        },

        registration: {
            en:
                "No registration required. Units wishing to lay a wreath should contact remembrance@cmcen-demo.invalid.",
            fr:
                "Aucune inscription requise. Les unités qui souhaitent déposer une couronne doivent communiquer avec souvenir@cmcen-demo.invalid."
        },

        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "branch",
        eventType: "ceremony",
        contentArea: "branch",

        schedule: {
            offsetDays: 46,
            allDay: true
        }
    },

    {
        creator: "demo.elise.caron",
        status: "pending",

        title: {
            en: "Cyber and Tactical Communications Symposium",
            fr: "Symposium sur les cyberopérations et les communications tactiques"
        },

        description: {
            en:
                "A bilingual symposium bringing together operators, technical specialists, veterans, and industry guests for discussions on resilient networks and deployed communications.",
            fr:
                "Un symposium bilingue réunissant des opérateurs, des spécialistes techniques, des vétérans et des invités de l’industrie pour discuter des réseaux résilients et des communications déployées."
        },

        location: {
            en: "Saint-Laurent Conference Centre",
            fr: "Centre de conférences Saint-Laurent"
        },

        registration: {
            en:
                "Registration is required at https://branch.cmcen-demo.invalid/cyber-symposium",
            fr:
                "L’inscription est obligatoire à https://branch.cmcen-demo.invalid/symposium-cyber"
        },

        city: "Montréal",
        provinceRegion: "QC",
        organizingEntity: "branch",
        eventType: "conference",
        contentArea: "branch",

        schedule: {
            offsetDays: 55,
            startTime: "09:00",
            durationMinutes: 450,
            timezone: "America/Toronto"
        }
    },

    {
        creator: "demo.isabelle.marchand",
        reviewer: "demo.adrian.vale",
        status: "published",

        title: {
            en: "Prairie Region C&E Family Barbecue",
            fr: "Barbecue familial des C et E de la région des Prairies"
        },

        description: {
            en:
                "A relaxed afternoon for serving members, veterans, families, and local association members, with children’s activities and a display of historic field communications equipment.",
            fr:
                "Un après-midi décontracté pour les militaires en service, les vétérans, les familles et les membres de l’association locale, avec des activités pour enfants et une exposition de matériel historique de communications de campagne."
        },

        location: {
            en: "Kildonan Community Grounds",
            fr: "Terrain communautaire de Kildonan"
        },

        registration: {
            en:
                "Please confirm attendance at https://association.cmcen-demo.invalid/prairie-bbq",
            fr:
                "Veuillez confirmer votre présence à https://association.cmcen-demo.invalid/barbecue-prairies"
        },

        city: "Winnipeg",
        provinceRegion: "MB",
        organizingEntity: "association",
        eventType: "social",
        contentArea: "association",

        schedule: {
            offsetDays: 64,
            startTime: "11:00",
            durationMinutes: 240,
            timezone: "America/Winnipeg"
        }
    },

    {
        creator: "demo.isabelle.marchand",
        reviewer: "demo.adrian.vale",
        status: "rejected",

        rejectionReason:
            "Please confirm the final room assignment and provide the French-language registration instructions before resubmitting.",

        title: {
            en: "C&E Museum Volunteer Orientation",
            fr: "Séance d’orientation des bénévoles du Musée des C et E"
        },

        description: {
            en:
                "An introductory session for new museum volunteers covering collection handling, visitor engagement, archival procedures, and upcoming exhibit projects.",
            fr:
                "Une séance d’introduction pour les nouveaux bénévoles du musée portant sur la manipulation des collections, l’accueil des visiteurs, les procédures d’archives et les projets d’exposition à venir."
        },

        location: {
            en: "Museum Education Room",
            fr: "Salle éducative du musée"
        },

        registration: {
            en:
                "Contact volunteers@cmcen-demo.invalid for additional information.",
            fr: ""
        },

        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "museum",
        eventType: "training",
        contentArea: "museum",

        schedule: {
            offsetDays: 74,
            startTime: "09:30",
            durationMinutes: 150,
            timezone: "America/Toronto"
        }
    },

    {
        creator: "demo.gabriel.quinn",
        status: "draft",

        title: {
            en: "Fall C&E Leadership Forum",
            fr: "Forum automnal sur le leadership des C et E"
        },

        description: {
            en:
                "A proposed one-day leadership forum for junior and senior C&E leaders featuring facilitated discussions, mentoring sessions, and regional updates.",
            fr:
                "Un forum de leadership proposé d’une journée pour les dirigeants subalternes et supérieurs des C et E, comprenant des discussions animées, des séances de mentorat et des mises à jour régionales."
        },

        location: {
            en: "Citadelle Conference Hall",
            fr: "Salle de conférences de la Citadelle"
        },

        registration: {
            en: "",
            fr: ""
        },

        city: "Québec",
        provinceRegion: "QC",
        organizingEntity: "branch",
        eventType: "conference",
        contentArea: "branch",

        schedule: {
            offsetDays: 84,
            startTime: "08:30",
            durationMinutes: 450,
            timezone: "America/Toronto"
        }
    }
];

function assertSeedAllowed() {
    if (
        process.env.ALLOW_DEMO_SEED !== "true"
    ) {
        throw new Error(
            "Demo seeding is disabled. Run with ALLOW_DEMO_SEED=true."
        );
    }

    if (!process.env.MONGO_URI) {
        throw new Error(
            "MONGO_URI is not configured."
        );
    }
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function getFutureDateString(offsetDays) {
    const date = new Date();

    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(
        date.getUTCDate() + offsetDays
    );

    return [
        date.getUTCFullYear(),
        padNumber(date.getUTCMonth() + 1),
        padNumber(date.getUTCDate())
    ].join("-");
}

function getDatePartsInTimezone(
    date,
    timezone
) {
    const formatter =
        new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23"
        });

    const parts = {};

    formatter
        .formatToParts(date)
        .forEach(part => {
            if (part.type !== "literal") {
                parts[part.type] =
                    Number(part.value);
            }
        });

    return parts;
}

function zonedDateTimeToUtc(
    value,
    timezone
) {
    const match = String(value).match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
    );

    if (!match) {
        throw new Error(
            `Invalid local date-time: ${value}`
        );
    }

    const [
        ,
        year,
        month,
        day,
        hour,
        minute,
        second
    ] = match.map(Number);

    const targetUtc = Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
    );

    let candidate =
        new Date(targetUtc);

    for (
        let attempt = 0;
        attempt < 4;
        attempt += 1
    ) {
        const parts =
            getDatePartsInTimezone(
                candidate,
                timezone
            );

        const representedAsUtc =
            Date.UTC(
                parts.year,
                parts.month - 1,
                parts.day,
                parts.hour,
                parts.minute,
                parts.second
            );

        const difference =
            targetUtc - representedAsUtc;

        candidate =
            new Date(
                candidate.getTime() +
                difference
            );

        if (difference === 0) {
            break;
        }
    }

    return candidate;
}

function buildSchedule(schedule) {
    const date =
        getFutureDateString(
            schedule.offsetDays
        );

    if (schedule.allDay) {
        return {
            startDate:
                new Date(`${date}T12:00:00.000Z`),
            endDate: null,
            allDay: true,
            timezone: ""
        };
    }

    const startDate =
        zonedDateTimeToUtc(
            `${date}T${schedule.startTime}:00`,
            schedule.timezone
        );

    const endDate =
        new Date(
            startDate.getTime() +
            schedule.durationMinutes *
            60 *
            1000
        );

    return {
        startDate,
        endDate,
        allDay: false,
        timezone: schedule.timezone
    };
}

function daysAgo(numberOfDays) {
    return new Date(
        Date.now() -
        numberOfDays * DAY_IN_MS
    );
}

function createSubmitterSnapshot(
    user,
    username
) {
    const profile =
        DEMO_PROFILES[username];

    return {
        rank: profile.rank,
        firstName: profile.firstName,
        lastName: profile.lastName,
        unitRole: profile.unitRole,
        email: user.email,
        phone: profile.phone
    };
}

function createAuditFields(
    seed,
    users,
    index
) {
    const creator =
        users[seed.creator];

    const reviewer =
        seed.reviewer
            ? users[seed.reviewer]
            : null;

    const permissionConfirmed =
        seed.status !== "draft";

    const createdAt =
        daysAgo(12 - Math.min(index, 8));

    const submittedAt =
        permissionConfirmed
            ? daysAgo(5)
            : null;

    const audit = {
        createdBy: creator._id,
        updatedBy: creator._id,

        submitter:
            createSubmitterSnapshot(
                creator,
                seed.creator
            ),

        publicationPermission: {
            confirmed:
                permissionConfirmed,

            confirmedAt:
                permissionConfirmed
                    ? submittedAt
                    : null,

            confirmedBy:
                permissionConfirmed
                    ? creator._id
                    : null
        },

        reviewedBy: null,
        reviewedAt: null,
        publishedBy: null,
        publishedAt: null,

        lastSubmittedAt:
            submittedAt,

        rejectionReason:
            seed.rejectionReason || "",

        deleteRequested: false,
        deleteRequestReason: "",
        deleteRequestedAt: null,

        createdAt,
        updatedAt: daysAgo(1)
    };

    if (seed.status === "published") {
        audit.reviewedBy =
            reviewer._id;

        audit.reviewedAt =
            daysAgo(3);

        audit.publishedBy =
            reviewer._id;

        audit.publishedAt =
            daysAgo(3);

        audit.updatedBy =
            reviewer._id;
    }

    if (seed.status === "rejected") {
        audit.reviewedBy =
            reviewer._id;

        audit.reviewedAt =
            daysAgo(2);

        audit.updatedBy =
            reviewer._id;
    }

    return audit;
}

async function loadDemoUsers() {
    const users = await User.find({
        username: {
            $in: REQUIRED_DEMO_USERS
        }
    });

    const userMap =
        Object.fromEntries(
            users.map(user => [
                user.username,
                user
            ])
        );

    const missingUsers =
        REQUIRED_DEMO_USERS.filter(
            username => !userMap[username]
        );

    if (missingUsers.length) {
        throw new Error(
            `Missing demo users: ${missingUsers.join(", ")}. Run seed-demo-users.js first.`
        );
    }

    return userMap;
}

async function seedDemoEvents() {
    try {
        assertSeedAllowed();

        await mongoose.connect(
            process.env.MONGO_URI
        );

        const users =
            await loadDemoUsers();

        const demoTitles =
            EVENT_SEEDS.map(
                seed => seed.title.en
            );

        const demoUserIds =
            REQUIRED_DEMO_USERS.map(
                username =>
                    users[username]._id
            );

        const deletionResult =
            await Event.deleteMany({
                createdBy: {
                    $in: demoUserIds
                },
                "title.en": {
                    $in: demoTitles
                }
            });

        const events =
            EVENT_SEEDS.map(
                (seed, index) => ({
                    title: seed.title,
                    description: seed.description,
                    location: seed.location,
                    registration:
                        seed.registration,

                    city: seed.city,
                    provinceRegion:
                        seed.provinceRegion,

                    organizingEntity:
                        seed.organizingEntity,

                    eventType:
                        seed.eventType,

                    contentArea:
                        seed.contentArea,

                    ...buildSchedule(
                        seed.schedule
                    ),

                    imagePath: null,
                    status: seed.status,

                    ...createAuditFields(
                        seed,
                        users,
                        index
                    )
                })
            );

        const insertedEvents =
            await Event.insertMany(events);

        console.table(
            insertedEvents.map(event => ({
                title:
                    event.title.en,

                date:
                    event.startDate
                        .toISOString()
                        .slice(0, 10),

                city:
                    event.city,

                entity:
                    event.organizingEntity,

                status:
                    event.status,

                createdBy:
                    EVENT_SEEDS.find(
                        seed =>
                            seed.title.en ===
                            event.title.en
                    )?.creator
            }))
        );

        console.log(
            `\nRemoved ${deletionResult.deletedCount} previous demo events.`
        );

        console.log(
            `Seeded ${insertedEvents.length} demo events.`
        );
    } catch (error) {
        console.error(
            "Could not seed demo events:",
            error
        );

        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedDemoEvents();