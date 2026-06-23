require("dotenv").config();

const mongoose = require("mongoose");
const User = require("../models/User");

const DEMO_PASSWORD =
    process.env.DEMO_SEED_PASSWORD ||
    "demo";

const DEMO_USERS = [
    {
        username: "demo.maya.northcott",
        email: "maya.northcott@cmcen-demo.invalid",
        accountName: "Maya Northcott (Demo)",
        role: "subscriber",
        contentAreas: []
    },
    {
        username: "demo.rowan.mercer",
        email: "rowan.mercer@cmcen-demo.invalid",
        accountName: "MCpl Rowan Mercer (Demo)",
        role: "contributor",
        contentAreas: ["association"]
    },
    {
        username: "demo.gabriel.quinn",
        email: "gabriel.quinn@cmcen-demo.invalid",
        accountName: "Sgt Gabriel Quinn (Demo)",
        role: "contributor",
        contentAreas: [
            "branch",
            "association"
        ]
    },
    {
        username: "demo.elise.caron",
        email: "elise.caron@cmcen-demo.invalid",
        accountName: "Capt Élise Caron (Demo)",
        role: "author",
        contentAreas: [
            "branch",
            "foundation"
        ]
    },
    {
        username: "demo.isabelle.marchand",
        email:
            "isabelle.marchand@cmcen-demo.invalid",
        accountName:
            "CWO Isabelle Marchand (Demo)",
        role: "author",
        contentAreas: [
            "association",
            "museum"
        ]
    },
    {
        username: "demo.adrian.vale",
        email: "adrian.vale@cmcen-demo.invalid",
        accountName: "Maj Adrian Vale (Demo)",
        role: "editor",
        contentAreas: [
            "branch",
            "association",
            "foundation",
            "museum"
        ]
    },
    {
        username: "demo.claire.montrose",
        email:
            "claire.montrose@cmcen-demo.invalid",
        accountName:
            "LCol Claire Montrose (Demo)",
        role: "administrator",
        contentAreas: [
            "branch",
            "association",
            "foundation",
            "museum"
        ]
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

async function seedDemoUsers() {
    try {
        assertSeedAllowed();

        await mongoose.connect(
            process.env.MONGO_URI
        );

        const savedUsers = [];

        for (const seed of DEMO_USERS) {
            let user = await User.findOne({
                $or: [
                    { email: seed.email },
                    { username: seed.username }
                ]
            });

            if (!user) {
                user = new User();
            }

            user.username = seed.username;
            user.email = seed.email;
            user.accountName = seed.accountName;
            user.role = seed.role;
            user.contentAreas =
                seed.contentAreas;

            // The User model's pre-save hook
            // should hash this value.
            user.password = DEMO_PASSWORD;

            await user.save();

            savedUsers.push(user);
        }

        console.table(
            savedUsers.map(user => ({
                username: user.username,
                email: user.email,
                accountName: user.accountName,
                role: user.role,
                contentAreas:
                    user.contentAreas.join(", ") ||
                    "—"
            }))
        );

        console.log(
            `\nSeeded ${savedUsers.length} demo users.`
        );

        console.log(
            `Demo password: ${DEMO_PASSWORD}`
        );
    } catch (error) {
        console.error(
            "Could not seed demo users:",
            error.message
        );

        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedDemoUsers();