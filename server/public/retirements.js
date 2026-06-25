const retirementsGrid =
    document.getElementById("retirementsGrid");

const retirementsMessage =
    document.getElementById("retirementsMessage");

function showRetirementsMessage(message, type = "neutral") {
    retirementsMessage.textContent = message;
    retirementsMessage.className =
        `retirements-message is-${type}`;
    retirementsMessage.hidden = false;
    retirementsGrid.hidden = true;
}

function formatRetireeName(retirementMessage) {
    const retiree = retirementMessage.retiree || {};

    return [
        retiree.rank,
        retiree.firstName,
        retiree.lastName
    ]
        .filter(Boolean)
        .join(" ") || "Retiring member";
}

function getMosid(retirementMessage) {
    return retirementMessage.retiree?.tradeRole || "MOSID pending";
}

function getCommentCount(retirementMessage) {
    if (typeof retirementMessage.commentCount === "number") {
        return retirementMessage.commentCount;
    }

    if (Array.isArray(retirementMessage.comments)) {
        return retirementMessage.comments.length;
    }

    return 0;
}

function formatCommentCount(count) {
    return `${count} ${count === 1 ? "comment" : "comments"}`;
}

function createPhotoElement(retirementMessage, name) {
    if (retirementMessage.photoUrl) {
        const image = document.createElement("img");

        image.src = retirementMessage.photoUrl;
        image.alt = `${name} retirement photo`;
        image.loading = "lazy";

        return image;
    }

    const placeholder = document.createElement("div");

    placeholder.className = "retirement-card-photo-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map(part => part[0])
        .join("")
        .toUpperCase() || "CE";

    return placeholder;
}

function createRetirementCard(retirementMessage) {
    const card = document.createElement("a");
    const name = formatRetireeName(retirementMessage);
    const commentCount = getCommentCount(retirementMessage);

    card.className = "retirement-card";
    card.href =
        `/retirement-message.html?id=${encodeURIComponent(
            retirementMessage._id
        )}`;
    card.setAttribute(
        "aria-label",
        `Read retirement message for ${name}`
    );

    const header = document.createElement("header");
    header.className = "retirement-card-header";

    const title = document.createElement("h2");
    title.textContent = name;

    const mosid = document.createElement("p");
    mosid.textContent = getMosid(retirementMessage);

    header.append(title, mosid);

    const photo = document.createElement("div");
    photo.className = "retirement-card-photo";
    photo.appendChild(
        createPhotoElement(retirementMessage, name)
    );

    const footer = document.createElement("footer");
    footer.className = "retirement-card-footer";
    footer.textContent = formatCommentCount(commentCount);

    card.append(header, photo, footer);

    return card;
}

function renderRetirements(retirementMessages) {
    retirementsGrid.replaceChildren();

    if (!retirementMessages.length) {
        showRetirementsMessage(
            "No retirement messages have been published yet.",
            "empty"
        );
        return;
    }

    retirementMessages.forEach(retirementMessage => {
        retirementsGrid.appendChild(
            createRetirementCard(retirementMessage)
        );
    });

    retirementsMessage.hidden = true;
    retirementsGrid.hidden = false;
}

async function loadRetirements() {
    showRetirementsMessage("Loading retirement messages...");

    try {
        const response =
            await fetch("/api/retirement-messages");

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                    "Could not load retirement messages."
            );
        }

        renderRetirements(
            Array.isArray(data.retirementMessages)
                ? data.retirementMessages
                : []
        );
    } catch (error) {
        showRetirementsMessage(
            error.message ||
                "Could not load retirement messages.",
            "error"
        );
    }
}

loadRetirements();
