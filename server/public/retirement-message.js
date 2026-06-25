const retirementDetailContent =
    document.getElementById("retirementDetailContent");

const retirementDetailMessage =
    document.getElementById("retirementDetailMessage");

const retirementDetailTitle =
    document.getElementById("retirementDetailTitle");

const retirementDetailMosid =
    document.getElementById("retirementDetailMosid");

const retirementDetailDate =
    document.getElementById("retirementDetailDate");

const retirementDetailPhoto =
    document.getElementById("retirementDetailPhoto");

const retirementDetailText =
    document.getElementById("retirementDetailText");

function showRetirementDetailMessage(message, type = "neutral") {
    retirementDetailMessage.textContent = message;
    retirementDetailMessage.className =
        `retirements-message is-${type}`;
    retirementDetailMessage.hidden = false;
    retirementDetailContent.hidden = true;
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

function formatRetirementDate(value) {
    if (!value) {
        return "Retirement date pending";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Retirement date pending";
    }

    return `Retirement date: ${date.toLocaleDateString(
        undefined,
        {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC"
        }
    )}`;
}

function getInitials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map(part => part[0])
        .join("")
        .toUpperCase() || "CE";
}

function renderPhoto(retirementMessage, name) {
    retirementDetailPhoto.replaceChildren();

    if (retirementMessage.photoUrl) {
        const image = document.createElement("img");

        image.src = retirementMessage.photoUrl;
        image.alt = `${name} retirement photo`;

        retirementDetailPhoto.appendChild(image);
        return;
    }

    const placeholder = document.createElement("div");

    placeholder.className =
        "retirement-detail-photo-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = getInitials(name);

    retirementDetailPhoto.appendChild(placeholder);
}

function renderRetirementMessage(retirementMessage) {
    const name = formatRetireeName(retirementMessage);

    document.title = `Retirement: ${name} | CMCEN / RCMCE`;
    retirementDetailTitle.textContent = `Retirement: ${name}`;
    retirementDetailMosid.textContent = getMosid(retirementMessage);
    retirementDetailDate.textContent =
        formatRetirementDate(
            retirementMessage.retiree?.retirementDate
        );
    retirementDetailText.textContent =
        retirementMessage.message || "";

    renderPhoto(retirementMessage, name);

    retirementDetailMessage.hidden = true;
    retirementDetailContent.hidden = false;
}

async function loadRetirementMessage() {
    const messageId =
        new URLSearchParams(window.location.search).get("id");

    if (!messageId) {
        showRetirementDetailMessage(
            "No retirement message was selected.",
            "error"
        );
        return;
    }

    showRetirementDetailMessage(
        "Loading retirement message..."
    );

    try {
        const response =
            await fetch(
                `/api/retirement-messages/${encodeURIComponent(
                    messageId
                )}`
            );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                    "Could not load retirement message."
            );
        }

        renderRetirementMessage(data.retirementMessage);
    } catch (error) {
        showRetirementDetailMessage(
            error.message ||
                "Could not load retirement message.",
            "error"
        );
    }
}

loadRetirementMessage();
