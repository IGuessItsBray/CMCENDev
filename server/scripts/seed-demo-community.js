require("dotenv").config();

const mongoose = require("mongoose");
const Event = require("../models/Event");
const RetirementComment = require("../models/RetirementComment");
const RetirementMessage = require("../models/RetirementMessage");
const User = require("../models/User");

const DEMO_PASSWORD =
    process.env.DEMO_SEED_PASSWORD || "demo";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DEMO_USERS = [
    {
        username: "cmcen.demo.alex.morrison",
        email: "alex.morrison@cmcen-demo.invalid",
        accountName: "WO Alex Morrison (Demo)",
        firstName: "Alex",
        lastName: "Morrison",
        rank: "WO",
        role: "editor",
        contentAreas: ["branch", "association"],
        status: "regular",
        affiliationElement: "army",
        trade: "00383 - SIG OP",
        currentUnit: "76 Communication Regiment",
        city: "Ottawa",
        province: "Ontario",
        postalCode: "K1A 0K2"
    },
    {
        username: "cmcen.demo.brianna.chen",
        email: "brianna.chen@cmcen-demo.invalid",
        accountName: "Capt Brianna Chen (Demo)",
        firstName: "Brianna",
        lastName: "Chen",
        rank: "Capt",
        role: "author",
        contentAreas: ["branch", "foundation"],
        status: "regular",
        affiliationElement: "air_force",
        trade: "00340 - CELE",
        currentUnit: "Canadian Forces Network Operations Centre",
        city: "Borden",
        province: "Ontario",
        postalCode: "L0M 1C0"
    },
    {
        username: "cmcen.demo.caleb.sinclair",
        email: "caleb.sinclair@cmcen-demo.invalid",
        accountName: "Sgt Caleb Sinclair (Demo)",
        firstName: "Caleb",
        lastName: "Sinclair",
        rank: "Sgt",
        role: "contributor",
        contentAreas: ["branch"],
        status: "regular",
        affiliationElement: "army",
        trade: "00384 - LINE TECH",
        currentUnit: "1 Canadian Mechanized Brigade Group Headquarters and Signal Squadron",
        city: "Edmonton",
        province: "Alberta",
        postalCode: "T5J 2R7"
    },
    {
        username: "cmcen.demo.danika.mills",
        email: "danika.mills@cmcen-demo.invalid",
        accountName: "MCpl Danika Mills (Demo)",
        firstName: "Danika",
        lastName: "Mills",
        rank: "MCpl",
        role: "contributor",
        contentAreas: ["association"],
        status: "reserve",
        affiliationElement: "army",
        trade: "00385 - SIG TECH",
        currentUnit: "33 Signal Regiment",
        city: "Kingston",
        province: "Ontario",
        postalCode: "K7K 5L0"
    },
    {
        username: "cmcen.demo.ethan.beaulieu",
        email: "ethan.beaulieu@cmcen-demo.invalid",
        accountName: "Cpl Ethan Beaulieu (Demo)",
        firstName: "Ethan",
        lastName: "Beaulieu",
        rank: "Cpl",
        role: "subscriber",
        contentAreas: [],
        status: "regular",
        affiliationElement: "navy",
        trade: "00299 - NAV COMM",
        currentUnit: "HMCS Halifax",
        city: "Halifax",
        province: "Nova Scotia",
        postalCode: "B3K 5X5"
    },
    {
        username: "cmcen.demo.farah.khan",
        email: "farah.khan@cmcen-demo.invalid",
        accountName: "Maj Farah Khan (Demo)",
        firstName: "Farah",
        lastName: "Khan",
        rank: "Maj",
        role: "administrator",
        contentAreas: ["branch", "association", "foundation", "museum"],
        status: "regular",
        affiliationElement: "air_force",
        trade: "00378 - CYBER OP",
        currentUnit: "Canadian Forces Information Operations Group",
        city: "Ottawa",
        province: "Ontario",
        postalCode: "K2P 1L4"
    },
    {
        username: "cmcen.demo.graham.walsh",
        email: "graham.walsh@cmcen-demo.invalid",
        accountName: "CWO Graham Walsh (Demo)",
        firstName: "Graham",
        lastName: "Walsh",
        rank: "CWO",
        role: "editor",
        contentAreas: ["branch", "museum"],
        status: "regular",
        affiliationElement: "army",
        trade: "00381 - CWO",
        currentUnit: "Canadian Forces School of Communications and Electronics",
        city: "Kingston",
        province: "Ontario",
        postalCode: "K7K 7B4"
    },
    {
        username: "cmcen.demo.hannah.lavoie",
        email: "hannah.lavoie@cmcen-demo.invalid",
        accountName: "Lt(N) Hannah Lavoie (Demo)",
        firstName: "Hannah",
        lastName: "Lavoie",
        rank: "Lt(N)",
        role: "author",
        contentAreas: ["association", "foundation"],
        status: "regular",
        affiliationElement: "navy",
        trade: "00299 - NAV COMM",
        currentUnit: "Naval Fleet School Atlantic",
        city: "Halifax",
        province: "Nova Scotia",
        postalCode: "B3K 2X0"
    },
    {
        username: "cmcen.demo.ian.patel",
        email: "ian.patel@cmcen-demo.invalid",
        accountName: "MWO Ian Patel (Demo)",
        firstName: "Ian",
        lastName: "Patel",
        rank: "MWO",
        role: "contributor",
        contentAreas: ["museum"],
        status: "retired",
        affiliationElement: "army",
        trade: "00383 - SIG OP",
        currentUnit: "C&E Branch Association",
        city: "Winnipeg",
        province: "Manitoba",
        postalCode: "R3C 0V8"
    },
    {
        username: "cmcen.demo.julia.mackenzie",
        email: "julia.mackenzie@cmcen-demo.invalid",
        accountName: "LCol Julia Mackenzie (Demo)",
        firstName: "Julia",
        lastName: "Mackenzie",
        rank: "LCol",
        role: "developer",
        contentAreas: ["branch", "association", "foundation", "museum"],
        status: "regular",
        affiliationElement: "army",
        trade: "00340 - CELE",
        currentUnit: "Directorate of Communications and Electronics",
        city: "Ottawa",
        province: "Ontario",
        postalCode: "K1A 0K2"
    }
];

const RETIREMENT_SEEDS = [
    {
        retiree: {
            rank: "CWO",
            firstName: "Michael",
            lastName: "O'Connell",
            postNominals: "MMM, CD",
            tradeRole: "00381 - CWO",
            retirementDate: "2026-08-28"
        },
        submitter: "cmcen.demo.graham.walsh",
        reviewer: "cmcen.demo.farah.khan",
        en: "After 35 years of steady service to the Communications and Electronics Branch, CWO Michael O'Connell is retiring from the CAF. Mike's career ran from line detachments and field signal troops to schoolhouse leadership in Kingston, where generations of signallers learned from his direct, practical mentorship. His calm voice on a busy net, his insistence on looking after the junior ranks, and his deep respect for branch history have left a mark across the community. We wish Mike and his family fair winds, quiet mornings, and plenty of time at the cottage.",
        fr: "Apres 35 annees de service constant au sein de la Branche des communications et de l'electronique, l'adjuc Michael O'Connell prend sa retraite des FAC. Sa carriere l'a mene des detachements de lignes et des troupes de transmissions de campagne jusqu'au leadership a l'ecole de Kingston, ou des generations de transmetteurs ont profite de son mentorat direct et pratique. Sa voix calme sur un reseau charge, son attention envers les militaires subalternes et son respect de l'histoire de la Branche resteront bien presents. Nous lui souhaitons, ainsi qu'a sa famille, de beaux jours paisibles."
    },
    {
        retiree: {
            rank: "Maj",
            firstName: "Leah",
            lastName: "Thompson",
            postNominals: "CD",
            tradeRole: "00340 - CELE",
            retirementDate: "2026-09-12"
        },
        submitter: "cmcen.demo.brianna.chen",
        reviewer: "cmcen.demo.alex.morrison",
        en: "Maj Leah Thompson is retiring after 27 years of service in uniform, including operational tours, headquarters planning, and years spent translating complex networks into plain language for commanders. Leah built teams that trusted one another, and she had a rare talent for making technical risk understandable without ever making it sound simple. Her colleagues across the C&E Branch will miss her sharp questions, generous coaching, and habit of bringing order to the hardest whiteboard sessions.",
        fr: "La maj Leah Thompson prend sa retraite apres 27 annees de service en uniforme, comprenant des deploiements operationnels, de la planification en quartier general et de nombreuses annees a expliquer des reseaux complexes aux commandants. Leah a bati des equipes fondees sur la confiance et possedait un talent rare pour rendre les risques techniques comprehensibles sans les simplifier a outrance. Ses collegues de la Branche des C et E se souviendront de ses questions precises, de son mentorat genereux et de sa capacite a organiser les discussions les plus complexes."
    },
    {
        retiree: {
            rank: "Sgt",
            firstName: "Andre",
            lastName: "Roy",
            postNominals: "CD",
            tradeRole: "00385 - SIG TECH",
            retirementDate: "2026-07-31"
        },
        submitter: "cmcen.demo.caleb.sinclair",
        reviewer: "cmcen.demo.graham.walsh",
        en: "Sgt Andre Roy is retiring after a career spent keeping radios alive, shelters powered, and teams moving when the weather and timelines were working against them. Andre served in garrison, on exercise, and overseas with the same practical humour and careful workmanship. Many members will remember him crouched beside a rack with a multimeter, talking a junior technician through the fault instead of taking the tool away. The Branch thanks him for his patience, pride in the trade, and dependable friendship.",
        fr: "Le sgt Andre Roy prend sa retraite apres une carriere consacree a garder les radios en service, les abris alimentes et les equipes en mouvement lorsque la meteo et les echeanciers compliquaient tout. Andre a servi en garnison, en exercice et a l'etranger avec le meme humour pratique et le meme souci du travail bien fait. Plusieurs se souviendront de lui pres d'un bati, multimetre en main, expliquant la panne a un jeune technicien plutot que de simplement reprendre l'outil. La Branche le remercie pour sa patience, sa fierte du metier et son amitie fiable."
    },
    {
        retiree: {
            rank: "PO1",
            firstName: "Karen",
            lastName: "MacNeil",
            postNominals: "CD",
            tradeRole: "00299 - NAV COMM",
            retirementDate: "2026-10-03"
        },
        submitter: "cmcen.demo.hannah.lavoie",
        reviewer: "cmcen.demo.farah.khan",
        en: "PO1 Karen MacNeil is retiring after 31 years serving the naval communications community and the wider C&E family. Karen's steady professionalism was felt on ships, in training establishments, and during long nights when message traffic and operational tempo left little room for error. She taught young communicators that precision is a form of care, and she made every team around her better prepared. We wish Karen a joyful retirement close to family, salt air, and a calendar finally under her own control.",
        fr: "La pm 1 Karen MacNeil prend sa retraite apres 31 annees au service de la communaute des communications navales et de la grande famille des C et E. Son professionnalisme constant s'est fait sentir a bord des navires, dans les etablissements d'instruction et pendant les longues nuits ou le trafic de messages et le rythme operationnel laissaient peu de place a l'erreur. Elle a montre aux jeunes communicateurs que la precision est une forme de soin et elle a rendu chaque equipe mieux preparee. Nous lui souhaitons une retraite heureuse pres de sa famille et de l'air salin."
    },
    {
        retiree: {
            rank: "MCpl",
            firstName: "Derek",
            lastName: "Saunders",
            postNominals: "",
            tradeRole: "00384 - LINE TECH",
            retirementDate: "2026-08-15"
        },
        submitter: "cmcen.demo.danika.mills",
        reviewer: "cmcen.demo.alex.morrison",
        en: "MCpl Derek Saunders is retiring after 22 years of service as a line technician, mentor, and the person everyone wanted on the crew when the route was long and the ground was unforgiving. Derek brought patience to the hard jobs and pride to the small details, whether stringing field cable in bad weather or teaching a new member how to plan a clean recovery. His Branch family thanks him for years of grit, humour, and quiet competence.",
        fr: "Le cplc Derek Saunders prend sa retraite apres 22 annees de service comme technicien de lignes, mentor et membre que chacun voulait avoir dans l'equipe lorsque le trace etait long et le terrain difficile. Derek apportait patience aux travaux exigeants et fierte aux petits details, qu'il s'agisse de poser du cable de campagne par mauvais temps ou d'enseigner a un nouveau membre comment planifier une recuperation efficace. Sa famille de la Branche le remercie pour ses annees de determination, d'humour et de competence discrete."
    },
    {
        retiree: {
            rank: "LCol",
            firstName: "Nadia",
            lastName: "Singh",
            postNominals: "MSM, CD",
            tradeRole: "00378 - CYBER OP",
            retirementDate: "2026-11-20"
        },
        submitter: "cmcen.demo.farah.khan",
        reviewer: "cmcen.demo.julia.mackenzie",
        en: "LCol Nadia Singh is retiring after a distinguished CAF career that bridged field communications, information operations, and the maturing cyber profession. Nadia helped build confidence between operators, planners, and technical specialists by keeping mission outcomes at the centre of every conversation. Her leadership was exacting, humane, and future focused. The C&E Branch is stronger because of her work, and her colleagues wish her a retirement filled with travel, reading, and well-earned space to breathe.",
        fr: "La lcol Nadia Singh prend sa retraite apres une carriere remarquable dans les FAC, reliant les communications de campagne, les operations d'information et la profession cyber en pleine maturation. Nadia a aide les operateurs, les planificateurs et les specialistes techniques a mieux se comprendre en gardant les resultats de mission au centre de chaque discussion. Son leadership etait exigeant, humain et tourne vers l'avenir. La Branche des C et E est plus forte grace a son travail, et ses collegues lui souhaitent une retraite remplie de voyages, de lecture et d'espace bien merite."
    },
    {
        retiree: {
            rank: "WO",
            firstName: "Samira",
            lastName: "Haddad",
            postNominals: "CD",
            tradeRole: "00109 - ATIS TECH",
            retirementDate: "2026-09-26"
        },
        submitter: "cmcen.demo.brianna.chen",
        reviewer: "cmcen.demo.graham.walsh",
        en: "WO Samira Haddad is retiring after 29 years supporting air operations, deployed headquarters, and the people who depend on reliable systems. Samira was known for asking the second and third question, the ones that saved time later and kept teams honest about assumptions. She cared deeply about technical standards and even more deeply about the members learning them. Her many friends in the C&E community thank her for her generosity, discipline, and steady example.",
        fr: "L'adj Samira Haddad prend sa retraite apres 29 annees a soutenir les operations aeriennes, les quartiers generaux deployes et les personnes qui dependent de systemes fiables. Samira etait reconnue pour poser la deuxieme et la troisieme question, celles qui faisaient gagner du temps plus tard et qui obligeaient les equipes a verifier leurs hypotheses. Elle tenait beaucoup aux normes techniques et encore plus aux membres qui les apprenaient. Ses nombreux amis de la communaute des C et E la remercient pour sa generosite, sa discipline et son exemple constant."
    },
    {
        retiree: {
            rank: "Capt",
            firstName: "Oliver",
            lastName: "Reid",
            postNominals: "CD",
            tradeRole: "00341 - SIGS",
            retirementDate: "2026-12-05"
        },
        submitter: "cmcen.demo.alex.morrison",
        reviewer: "cmcen.demo.julia.mackenzie",
        en: "Capt Oliver Reid is retiring after 25 years of service to tactical communications, training, and branch volunteer work. Oliver had a gift for making new signallers feel part of something larger than a posting message or a course serial. He kept old stories alive without getting stuck in them, and he pushed younger leaders to make the Branch better than they found it. We are grateful for his service and wish him every success in the next chapter.",
        fr: "Le capt Oliver Reid prend sa retraite apres 25 annees consacrees aux communications tactiques, a l'instruction et au benevolat de la Branche. Oliver avait le don de faire sentir aux nouveaux transmetteurs qu'ils faisaient partie de quelque chose de plus grand qu'un message d'affectation ou un numero de cours. Il preservait les anciennes histoires sans s'y enfermer et encourageait les jeunes leaders a ameliorer la Branche. Nous sommes reconnaissants de son service et lui souhaitons beaucoup de succes pour la suite."
    },
    {
        retiree: {
            rank: "Mr.",
            firstName: "Peter",
            lastName: "Gallant",
            postNominals: "",
            tradeRole: "Civilian",
            retirementDate: "2026-08-02"
        },
        submitter: "cmcen.demo.ian.patel",
        reviewer: "cmcen.demo.graham.walsh",
        en: "Mr. Peter Gallant is retiring after 24 years as a civilian member of the C&E Museum team, where his archival patience and storyteller's ear helped preserve the human side of Branch history. Peter could connect a faded photograph, a field switchboard, and a veteran's memory in a way that made visitors pause. Serving members, families, and former members all benefited from his careful stewardship. We thank Peter for safeguarding the stories that remind us who we are.",
        fr: "M. Peter Gallant prend sa retraite apres 24 annees comme membre civil de l'equipe du Musee des C et E, ou sa patience d'archiviste et son talent de conteur ont aide a preserver le cote humain de l'histoire de la Branche. Peter savait relier une photographie jaunie, un standard de campagne et le souvenir d'un veteran de facon a faire reflechir les visiteurs. Les militaires en service, les familles et les anciens membres ont tous profite de son soin attentif. Nous le remercions d'avoir protege les histoires qui nous rappellent qui nous sommes."
    },
    {
        retiree: {
            rank: "MWO",
            firstName: "Tracy",
            lastName: "Brown",
            postNominals: "CD",
            tradeRole: "00120 - SIGINT SPEC",
            retirementDate: "2026-10-17"
        },
        submitter: "cmcen.demo.julia.mackenzie",
        reviewer: "cmcen.demo.farah.khan",
        en: "MWO Tracy Brown is retiring after 30 years of quiet, exacting service in the signals intelligence community and across the broader C&E Branch. Tracy's work was often unseen, but its value was understood by the teams who counted on her judgement, discretion, and care for the people behind the mission. She mentored with patience, led without noise, and made hard standards feel achievable. We send our sincere thanks and best wishes for a peaceful retirement.",
        fr: "L'adjum Tracy Brown prend sa retraite apres 30 annees de service discret et rigoureux dans la communaute du renseignement d'origine electromagnetique et dans la grande Branche des C et E. Son travail etait souvent invisible, mais sa valeur etait connue des equipes qui comptaient sur son jugement, sa discretion et son attention envers les personnes derriere la mission. Elle a mentore avec patience, dirige sans bruit et rendu les normes exigeantes accessibles. Nous lui offrons nos remerciements sinceres et nos meilleurs voeux pour une retraite paisible."
    }
];

const COMMENT_SEEDS = [
    ["Michael", "cmcen.demo.caleb.sinclair", "Congratulations, CWO. Your range safety brief somehow taught more about leadership than most formal courses. Enjoy the lake."],
    ["Michael", "cmcen.demo.danika.mills", "Thank you for always making time for the junior members. The Branch is better because you never treated mentorship as extra work."],
    ["Leah", "cmcen.demo.farah.khan", "Leah, your planning notes saved more teams than you will ever know. Wishing you a restful and well-earned retirement."],
    ["Leah", "cmcen.demo.graham.walsh", "A superb officer and a kind colleague. Thank you for keeping the technical conversation tied to the mission."],
    ["Andre", "cmcen.demo.alex.morrison", "Andre fixed the kit, but more importantly he taught people how to think through the fault. Bravo Zulu."],
    ["Andre", "cmcen.demo.danika.mills", "I still use the cable recovery checklist you built for us. Congratulations and thank you, Sgt Roy."],
    ["Karen", "cmcen.demo.ethan.beaulieu", "PO1 MacNeil set the standard for calm professionalism on watch. Wishing you fair winds and following seas."],
    ["Derek", "cmcen.demo.caleb.sinclair", "Derek, thanks for proving that good line work is equal parts planning, patience, and stubborn optimism."],
    ["Nadia", "cmcen.demo.brianna.chen", "Your mentorship made space for technical people to grow into confident leaders. Thank you, ma'am."],
    ["Nadia", "cmcen.demo.julia.mackenzie", "A career with real impact across the Branch. Congratulations on a retirement that is richly deserved."],
    ["Samira", "cmcen.demo.farah.khan", "Samira, your insistence on doing the basics properly will keep paying dividends for years."],
    ["Samira", "cmcen.demo.alex.morrison", "Thank you for the coaching, the candour, and the reminders to document the fix before celebrating it."],
    ["Oliver", "cmcen.demo.ian.patel", "Oliver kept the Branch stories alive and made the new members feel welcome. Congratulations, old friend."],
    ["Peter", "cmcen.demo.graham.walsh", "Peter, thank you for treating every artifact as a person-shaped story, not just an object in a case."],
    ["Peter", "cmcen.demo.hannah.lavoie", "My family still talks about your museum tour. Congratulations on a wonderful contribution to the community."],
    ["Tracy", "cmcen.demo.julia.mackenzie", "Tracy, your quiet leadership shaped more careers than any posting plot could show. Thank you."],
    ["Tracy", "cmcen.demo.brianna.chen", "Congratulations, MWO. Wishing you a peaceful next chapter and the satisfaction of knowing how much you mattered."],
    ["Karen", "cmcen.demo.hannah.lavoie", "Thank you for setting such a high standard for naval communicators and for looking after the people on watch."]
];

const EVENT_SEEDS = [
    {
        creator: "cmcen.demo.alex.morrison",
        reviewer: "cmcen.demo.farah.khan",
        status: "published",
        title: {
            en: "C&E Branch Professional Development Day",
            fr: "Journee de perfectionnement professionnel de la Branche des C et E"
        },
        description: {
            en: "A one-day professional development event for serving members, veterans, and civilian partners focused on resilient communications, leadership in dispersed teams, and lessons identified from recent CAF exercises.",
            fr: "Une journee de perfectionnement professionnel pour les militaires en service, les veterans et les partenaires civils portant sur les communications resilientes, le leadership d'equipes dispersees et les lecons tirees d'exercices recents des FAC."
        },
        location: {
            en: "CFSCE Auditorium",
            fr: "Auditorium de l'ECTEFC"
        },
        registration: {
            en: "Unit representatives are asked to confirm attendance through the Branch office by 7 August.",
            fr: "Les representants des unites sont pries de confirmer la presence aupres du bureau de la Branche avant le 7 aout."
        },
        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "branch",
        eventType: "training",
        contentArea: "branch",
        schedule: {
            offsetDays: 24,
            startTime: "08:30",
            durationMinutes: 420,
            timezone: "America/Toronto"
        }
    },
    {
        creator: "cmcen.demo.danika.mills",
        reviewer: "cmcen.demo.alex.morrison",
        status: "published",
        title: {
            en: "National C&E Association Family Barbecue",
            fr: "Barbecue familial national de l'Association des C et E"
        },
        description: {
            en: "An informal afternoon for Branch families, serving members, veterans, and association volunteers, with children's activities, branch displays, and time to reconnect.",
            fr: "Un apres-midi informel pour les familles de la Branche, les militaires en service, les veterans et les benevoles de l'association, avec activites pour enfants, kiosques de la Branche et occasions de renouer."
        },
        location: {
            en: "Vimy Barracks Community Field",
            fr: "Terrain communautaire de la caserne Vimy"
        },
        registration: {
            en: "Please register family numbers through your local association chapter.",
            fr: "Veuillez inscrire le nombre de membres de votre famille aupres de votre chapitre local de l'association."
        },
        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "association",
        eventType: "social",
        contentArea: "association",
        schedule: {
            offsetDays: 38,
            startTime: "12:00",
            durationMinutes: 240,
            timezone: "America/Toronto"
        }
    },
    {
        creator: "cmcen.demo.ian.patel",
        reviewer: "cmcen.demo.graham.walsh",
        status: "published",
        title: {
            en: "Signals Heritage Evening",
            fr: "Soiree du patrimoine des transmissions"
        },
        description: {
            en: "Museum volunteers and retired members will share short stories behind selected field radios, switchboards, crypto equipment, and photographs from C&E Branch deployments.",
            fr: "Des benevoles du musee et des membres retraites raconteront de courtes histoires liees a des radios de campagne, standards, equipements crypto et photographies provenant de deploiements de la Branche des C et E."
        },
        location: {
            en: "C&E Museum Gallery",
            fr: "Galerie du Musee des C et E"
        },
        registration: {
            en: "Admission is free; seating is limited.",
            fr: "L'entree est gratuite; les places sont limitees."
        },
        city: "Kingston",
        provinceRegion: "ON",
        organizingEntity: "museum",
        eventType: "ceremony",
        contentArea: "museum",
        schedule: {
            offsetDays: 52,
            startTime: "18:30",
            durationMinutes: 120,
            timezone: "America/Toronto"
        }
    },
    {
        creator: "cmcen.demo.brianna.chen",
        reviewer: "cmcen.demo.farah.khan",
        status: "pending",
        title: {
            en: "C&E Foundation Scholarship Mentorship Session",
            fr: "Seance de mentorat sur les bourses de la Fondation des C et E"
        },
        description: {
            en: "A virtual session connecting students from C&E families with serving members, veterans, and foundation volunteers who can speak about education pathways and scholarship applications.",
            fr: "Une seance virtuelle reliant les etudiants des familles des C et E a des militaires en service, des veterans et des benevoles de la Fondation qui pourront parler des parcours scolaires et des demandes de bourses."
        },
        location: {
            en: "Online",
            fr: "En ligne"
        },
        registration: {
            en: "Registration link will be shared once the event is approved.",
            fr: "Le lien d'inscription sera partage lorsque l'evenement sera approuve."
        },
        city: "Ottawa",
        provinceRegion: "ON",
        organizingEntity: "foundation",
        eventType: "conference",
        contentArea: "foundation",
        schedule: {
            offsetDays: 67,
            startTime: "19:00",
            durationMinutes: 75,
            timezone: "America/Toronto"
        }
    }
];

function assertSeedAllowed() {
    if (process.env.ALLOW_DEMO_SEED !== "true") {
        throw new Error(
            "Demo seeding is disabled. Run with ALLOW_DEMO_SEED=true."
        );
    }

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not configured.");
    }
}

function daysAgo(value) {
    return new Date(Date.now() - value * DAY_IN_MS);
}

function dateOnly(value) {
    return new Date(`${value}T12:00:00.000Z`);
}

function padNumber(value) {
    return String(value).padStart(2, "0");
}

function getFutureDateString(offsetDays) {
    const date = new Date();
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);

    return [
        date.getUTCFullYear(),
        padNumber(date.getUTCMonth() + 1),
        padNumber(date.getUTCDate())
    ].join("-");
}

function getDatePartsInTimezone(date, timezone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
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

    formatter.formatToParts(date).forEach(part => {
        if (part.type !== "literal") {
            parts[part.type] = Number(part.value);
        }
    });

    return parts;
}

function zonedDateTimeToUtc(value, timezone) {
    const match = String(value).match(
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
    );

    if (!match) {
        throw new Error(`Invalid local date-time: ${value}`);
    }

    const [, year, month, day, hour, minute, second] =
        match.map(Number);

    const targetUtc = Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
    );

    let candidate = new Date(targetUtc);

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = getDatePartsInTimezone(candidate, timezone);
        const representedAsUtc = Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second
        );
        const difference = targetUtc - representedAsUtc;

        candidate = new Date(candidate.getTime() + difference);

        if (difference === 0) {
            break;
        }
    }

    return candidate;
}

function buildSchedule(schedule) {
    const date = getFutureDateString(schedule.offsetDays);
    const startDate = zonedDateTimeToUtc(
        `${date}T${schedule.startTime}:00`,
        schedule.timezone
    );

    return {
        startDate,
        endDate: new Date(
            startDate.getTime() + schedule.durationMinutes * 60 * 1000
        ),
        allDay: false,
        timezone: schedule.timezone
    };
}

function getAddress(seed) {
    return {
        line1: "1 Demo Way",
        line2: "",
        city: seed.city,
        country: "Canada",
        stateProvince: seed.province,
        postalCode: seed.postalCode
    };
}

function createSubmitterSnapshot(user) {
    return {
        rank: user.rank,
        firstName: user.firstName,
        lastName: user.lastName,
        unitRole: user.currentUnit,
        email: user.email,
        phone: "+1 613 555 01" + String(user.username.length).slice(-2)
    };
}

async function seedUsers() {
    const users = {};

    for (const seed of DEMO_USERS) {
        let user = await User.findOne({
            $or: [
                { username: seed.username },
                { email: seed.email }
            ]
        }).select("+password");

        if (!user) {
            user = new User();
        }

        user.username = seed.username;
        user.email = seed.email;
        user.password = DEMO_PASSWORD;
        user.accountName = seed.accountName;
        user.firstName = seed.firstName;
        user.lastName = seed.lastName;
        user.address = getAddress(seed);
        user.rank = seed.rank;
        user.postNominals = "";
        user.company = "Canadian Armed Forces";
        user.status = seed.status;
        user.affiliationElement = seed.affiliationElement;
        user.trade = seed.trade;
        user.tradeOther = "";
        user.currentUnit = seed.currentUnit;
        user.role = seed.role;
        user.contentAreas = seed.contentAreas;

        await user.save();
        users[user.username] = user;
    }

    return users;
}

async function deletePreviousContent(users) {
    const userIds = Object.values(users).map(user => user._id);
    const messageIds = await RetirementMessage.find({
        createdBy: { $in: userIds },
        "submitter.email": /@cmcen-demo\.invalid$/u
    }).distinct("_id");

    const [commentByMessageResult, commentByAuthorResult] =
        await Promise.all([
            RetirementComment.deleteMany({
                retirementMessage: { $in: messageIds }
            }),
            RetirementComment.deleteMany({
                author: { $in: userIds }
            })
        ]);

    const [messageResult, eventResult] = await Promise.all([
        RetirementMessage.deleteMany({
            _id: { $in: messageIds }
        }),
        Event.deleteMany({
            createdBy: { $in: userIds },
            "title.en": {
                $in: EVENT_SEEDS.map(seed => seed.title.en)
            }
        })
    ]);

    return {
        comments:
            commentByMessageResult.deletedCount +
            commentByAuthorResult.deletedCount,
        retirementMessages: messageResult.deletedCount,
        events: eventResult.deletedCount
    };
}

async function seedRetirementMessages(users) {
    const messagesByFirstName = {};
    const insertedMessages = [];

    for (const [index, seed] of RETIREMENT_SEEDS.entries()) {
        const submitter = users[seed.submitter];
        const reviewer = users[seed.reviewer];
        const publishedAt = daysAgo(10 - Math.min(index, 8));

        const retirementMessage = await RetirementMessage.create({
            retiree: {
                ...seed.retiree,
                retirementDate: dateOnly(seed.retiree.retirementDate)
            },
            message: seed.en,
            messageLanguage: "en",
            messages: {
                en: seed.en,
                fr: seed.fr
            },
            photoUrl: "",
            submitter: {
                firstName: submitter.firstName,
                lastName: submitter.lastName,
                relationship: "colleague",
                email: submitter.email,
                unit: submitter.currentUnit
            },
            publicationConsent: {
                confirmed: true,
                confirmedAt: daysAgo(14 - Math.min(index, 8))
            },
            memberReviewConfirmation: {
                confirmed: true,
                confirmedAt: daysAgo(14 - Math.min(index, 8))
            },
            status: "published",
            createdBy: submitter._id,
            updatedBy: reviewer._id,
            reviewedBy: reviewer._id,
            reviewedAt: publishedAt,
            publishedBy: reviewer._id,
            publishedAt,
            createdAt: daysAgo(18 - Math.min(index, 8)),
            updatedAt: publishedAt
        });

        messagesByFirstName[seed.retiree.firstName] =
            retirementMessage;
        insertedMessages.push(retirementMessage);
    }

    return {
        messagesByFirstName,
        insertedMessages
    };
}

async function seedComments(users, messagesByFirstName) {
    const insertedComments = [];

    for (const [index, seed] of COMMENT_SEEDS.entries()) {
        const [retireeFirstName, authorUsername, body] = seed;
        const author = users[authorUsername];
        const retirementMessage =
            messagesByFirstName[retireeFirstName];
        const publishedAt = daysAgo(7 - Math.min(index % 7, 6));

        insertedComments.push(
            await RetirementComment.create({
                retirementMessage: retirementMessage._id,
                author: author._id,
                body,
                status: "published",
                reviewedBy: author._id,
                reviewedAt: publishedAt,
                publishedBy: author._id,
                publishedAt,
                createdAt: publishedAt,
                updatedAt: publishedAt
            })
        );
    }

    return insertedComments;
}

async function seedEvents(users) {
    const insertedEvents = [];

    for (const [index, seed] of EVENT_SEEDS.entries()) {
        const creator = users[seed.creator];
        const reviewer = users[seed.reviewer];
        const submittedAt = daysAgo(6 - Math.min(index, 3));
        const publishedAt =
            seed.status === "published"
                ? daysAgo(4 - Math.min(index, 3))
                : null;

        insertedEvents.push(
            await Event.create({
                title: seed.title,
                description: seed.description,
                location: seed.location,
                registration: seed.registration,
                city: seed.city,
                provinceRegion: seed.provinceRegion,
                organizingEntity: seed.organizingEntity,
                eventType: seed.eventType,
                contentArea: seed.contentArea,
                ...buildSchedule(seed.schedule),
                imagePath: null,
                submitter: createSubmitterSnapshot(creator),
                publicationPermission: {
                    confirmed: true,
                    confirmedAt: submittedAt,
                    confirmedBy: creator._id
                },
                status: seed.status,
                createdBy: creator._id,
                updatedBy:
                    seed.status === "published"
                        ? reviewer._id
                        : creator._id,
                reviewedBy:
                    seed.status === "published"
                        ? reviewer._id
                        : null,
                reviewedAt: publishedAt,
                publishedBy:
                    seed.status === "published"
                        ? reviewer._id
                        : null,
                publishedAt,
                lastSubmittedAt: submittedAt,
                rejectionReason: "",
                deleteRequested: false,
                deleteRequestReason: "",
                deleteRequestedAt: null,
                createdAt: daysAgo(9 - Math.min(index, 3)),
                updatedAt: publishedAt || submittedAt
            })
        );
    }

    return insertedEvents;
}

async function seedDemoCommunity() {
    try {
        assertSeedAllowed();

        await mongoose.connect(process.env.MONGO_URI);

        const users = await seedUsers();
        const deleted = await deletePreviousContent(users);
        const { messagesByFirstName, insertedMessages } =
            await seedRetirementMessages(users);
        const insertedComments = await seedComments(
            users,
            messagesByFirstName
        );
        const insertedEvents = await seedEvents(users);

        console.table(
            Object.values(users).map(user => ({
                username: user.username,
                accountName: user.accountName,
                role: user.role,
                trade: user.trade
            }))
        );

        console.log(
            `\nRemoved ${deleted.retirementMessages} retirement messages, ${deleted.comments} comments, and ${deleted.events} events from the previous CMCEN demo seed.`
        );
        console.log(`Seeded ${Object.keys(users).length} users.`);
        console.log(
            `Seeded ${insertedMessages.length} retirement messages.`
        );
        console.log(`Seeded ${insertedComments.length} comments.`);
        console.log(`Seeded ${insertedEvents.length} events.`);
        console.log(`Demo password: ${DEMO_PASSWORD}`);
    } catch (error) {
        console.error(
            "Could not seed CMCEN demo community:",
            error
        );
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

seedDemoCommunity();
