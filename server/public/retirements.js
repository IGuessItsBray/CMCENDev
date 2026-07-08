const retirementsGrid =
    document.getElementById("retirementsGrid");

const retirementsMessage =
    document.getElementById("retirementsMessage");

const RETIREMENT_PLACEHOLDER_PHOTO_URL = "/images/logo.png";

let loadedRetirementMessages = [];

function createRetirementLoadingContent(message) {
    const loading = CMCENUtils.createLoadingSpinner(message);

    return Array.from(loading.childNodes);
}

function showRetirementsMessage(message, type = "neutral") {
    retirementsMessage.textContent = message;
    retirementsMessage.className =
        `app-status retirements-message is-${type}`;
    retirementsMessage.removeAttribute("aria-label");
    retirementsMessage.hidden = false;
    retirementsGrid.hidden = true;
}

function showRetirementsLoading() {
    const message = translate("retirements_loading");

    retirementsMessage.replaceChildren(
        ...createRetirementLoadingContent(message)
    );
    retirementsMessage.className =
        "app-status is-loading is-large retirements-message";
    retirementsMessage.setAttribute("aria-label", message);
    retirementsMessage.hidden = false;
    retirementsGrid.hidden = true;
}

function formatRetireeName(retirementMessage) {
    const retiree = retirementMessage.retiree || {};

    const name = [
        retiree.rank,
        retiree.firstName,
        retiree.lastName
    ]
        .filter(Boolean)
        .join(" ");

    return [
        name,
        retiree.postNominals
    ]
        .filter(Boolean)
        .join(", ") ||
        translate("retirement_card_default_name");
}

function getMosid(retirementMessage) {
    return retirementMessage.retiree?.tradeRole ||
        translate("retirement_mosid_pending");
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
    return translate(
        count === 1
            ? "retirement_comment_singular"
            : "retirement_comment_plural",
        { count }
    );
}

function isRetirementPlaceholderPhoto(photoUrl) {
    if (!photoUrl) {
        return false;
    }

    try {
        const url =
            new URL(photoUrl, window.location.origin);
        const pathname =
            url.pathname.toLowerCase();
        const fileName =
            pathname.split("/").pop();

        return fileName === "logo.png" ||
            fileName.includes("cmcen-crest") ||
            pathname.includes("/legacy/wordpress/348036/");
    } catch (error) {
        const pathname =
            String(photoUrl)
                .toLowerCase()
                .split(/[?#]/)[0];
        const fileName =
            pathname.split("/").pop();

        return fileName === "logo.png" ||
            fileName.includes("cmcen-crest") ||
            pathname.includes("/legacy/wordpress/348036/");
    }
}

function createRetirementPlaceholderImage(className) {
    const image = document.createElement("img");

    image.className = className;
    image.src = RETIREMENT_PLACEHOLDER_PHOTO_URL;
    image.alt = "";
    image.loading = "lazy";
    image.setAttribute("aria-hidden", "true");

    return image;
}

function createPhotoElement(retirementMessage, name) {
    if (retirementMessage.photoUrl) {
        const image = document.createElement("img");
        const isPlaceholderPhoto =
            isRetirementPlaceholderPhoto(
                retirementMessage.photoUrl
            );

        image.src = isPlaceholderPhoto
            ? RETIREMENT_PLACEHOLDER_PHOTO_URL
            : retirementMessage.photoUrl;
        image.alt = isPlaceholderPhoto
            ? ""
            : translate(
                "retirement_photo_alt",
                { name }
            );
        image.loading = "lazy";

        if (isPlaceholderPhoto) {
            image.className =
                "retirement-card-photo-placeholder retirement-card-photo-logo";
            image.setAttribute("aria-hidden", "true");
        }

        return image;
    }

    return createRetirementPlaceholderImage(
        "retirement-card-photo-placeholder retirement-card-photo-logo"
    );
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
        translate(
            "retirement_card_aria",
            { name }
        )
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
            translate("retirements_empty"),
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
    showRetirementsLoading();

    try {
        const response =
            await fetch("/api/retirement-messages");

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                    translate("retirements_load_error")
            );
        }

        loadedRetirementMessages =
            Array.isArray(data.retirementMessages)
                ? data.retirementMessages
                : [];

        renderRetirements(
            loadedRetirementMessages
        );
    } catch (error) {
        showRetirementsMessage(
            error.message ||
                translate("retirements_load_error"),
            "error"
        );
    }
}

document.addEventListener(
    "languagechange",
    () => {
        if (loadedRetirementMessages.length) {
            renderRetirements(loadedRetirementMessages);
            return;
        }

        if (!retirementsMessage.hidden) {
            const isError =
                retirementsMessage.classList.contains("is-error");
            const isEmpty =
                retirementsMessage.classList.contains("is-empty");

            if (!isError && !isEmpty) {
                showRetirementsLoading();
                return;
            }

            showRetirementsMessage(
                translate(
                    isError
                        ? "retirements_load_error"
                        : isEmpty
                            ? "retirements_empty"
                            : "retirements_loading"
                ),
                isError
                    ? "error"
                    : isEmpty
                        ? "empty"
                        : "neutral"
            );
        }
    }
);

loadRetirements();
