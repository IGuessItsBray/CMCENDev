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

const retirementCommentMessage =
    document.getElementById("retirementCommentMessage");

const retirementCommentList =
    document.getElementById("retirementCommentList");

const retirementCommentForm =
    document.getElementById("retirementCommentForm");

const retirementCommentText =
    document.getElementById("retirementCommentText");

const retirementCommentSubmit =
    document.getElementById("retirementCommentSubmit");

const retirementCommentLogin =
    document.getElementById("retirementCommentLogin");

let currentRetirementMessageId = "";
let currentRetirementMessage = null;
let loadedComments = [];
let visibleDetailMessageKey = "";
let visibleDetailMessageType = "neutral";
let visibleCommentMessageKey = "";
let visibleCommentMessageType = "neutral";

function showRetirementDetailMessage(message, type = "neutral") {
    retirementDetailMessage.textContent = message;
    retirementDetailMessage.className =
        `retirements-message is-${type}`;
    retirementDetailMessage.hidden = false;
    retirementDetailContent.hidden = true;
}

function showRetirementDetailMessageKey(key, type = "neutral") {
    visibleDetailMessageKey = key;
    visibleDetailMessageType = type;
    showRetirementDetailMessage(
        translate(key),
        type
    );
}

function formatRetireeName(retirementMessage) {
    const retiree = retirementMessage.retiree || {};

    return [
        retiree.rank,
        retiree.firstName,
        retiree.lastName
    ]
        .filter(Boolean)
        .join(" ") ||
        translate("retirement_card_default_name");
}

function getMosid(retirementMessage) {
    return retirementMessage.retiree?.tradeRole ||
        translate("retirement_mosid_pending");
}

function formatCommentAuthor(author) {
    if (!author || typeof author !== "object") {
        return translate("unknown_user");
    }

    return (
        [author.firstName, author.lastName]
            .filter(Boolean)
            .join(" ") ||
        author.accountName ||
        author.username ||
        translate("unknown_user")
    );
}

function formatCommentDate(value) {
    if (!value) {
        return "";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat(
        currentLang === "fr" ? "fr-CA" : "en-CA",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    ).format(date);
}

function formatRetirementDate(value) {
    if (!value) {
        return translate("retirement_date_pending");
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return translate("retirement_date_pending");
    }

    const dateLabel =
        date.toLocaleDateString(
            currentLang === "fr" ? "fr-CA" : "en-CA",
            {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC"
            }
        );

    return translate(
        "retirement_date_label",
        { date: dateLabel }
    );
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
        image.alt = translate(
            "retirement_photo_alt",
            { name }
        );

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

    currentRetirementMessage = retirementMessage;
    document.title =
        `${translate(
            "retirement_detail_title",
            { name }
        )} | CMCEN / RCMCE`;
    retirementDetailTitle.textContent =
        translate(
            "retirement_detail_title",
            { name }
        );
    retirementDetailMosid.textContent = getMosid(retirementMessage);
    retirementDetailDate.textContent =
        formatRetirementDate(
            retirementMessage.retiree?.retirementDate
        );
    retirementDetailText.textContent =
        retirementMessage.message || "";

    renderPhoto(retirementMessage, name);

    retirementDetailMessage.hidden = true;
    visibleDetailMessageKey = "";
    retirementDetailContent.hidden = false;
}

function showRetirementCommentMessage(message, type = "neutral") {
    retirementCommentMessage.textContent = message;
    retirementCommentMessage.className =
        `retirement-comment-message is-${type}`;
    retirementCommentMessage.hidden = false;
}

function showRetirementCommentMessageKey(key, type = "neutral") {
    visibleCommentMessageKey = key;
    visibleCommentMessageType = type;
    showRetirementCommentMessage(
        translate(key),
        type
    );
}

function createCommentElement(comment) {
    const article = document.createElement("article");
    article.className = "retirement-comment";

    const header = document.createElement("header");

    const author = document.createElement("strong");
    author.textContent = formatCommentAuthor(comment.author);

    const date = document.createElement("time");
    const dateLabel =
        formatCommentDate(
            comment.publishedAt || comment.createdAt
        );

    date.textContent = dateLabel;

    if (comment.publishedAt || comment.createdAt) {
        date.dateTime = comment.publishedAt || comment.createdAt;
    }

    header.append(author, date);

    const body = document.createElement("p");
    body.textContent = comment.body || "";

    article.append(header, body);

    return article;
}

function renderComments(comments) {
    retirementCommentList.replaceChildren();

    if (!comments.length) {
        const empty = document.createElement("p");
        empty.className = "retirement-comment-empty";
        empty.textContent = translate("retirement_comment_empty");
        retirementCommentList.appendChild(empty);
        return;
    }

    comments.forEach(comment => {
        retirementCommentList.appendChild(
            createCommentElement(comment)
        );
    });
}

async function loadComments(messageId) {
    try {
        const response =
            await fetch(
                `/api/retirement-messages/${encodeURIComponent(
                    messageId
                )}/comments`
            );

        const data =
            await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                    translate("retirement_comments_load_error")
            );
        }

        loadedComments =
            Array.isArray(data.comments)
                ? data.comments
                : [];

        renderComments(loadedComments);
    } catch (error) {
        showRetirementCommentMessage(
            error.message ||
                translate("retirement_comments_load_error"),
            "error"
        );
    }
}

function setupCommentAccess() {
    const token = localStorage.getItem("token");

    if (token) {
        retirementCommentForm.hidden = false;
        retirementCommentLogin.hidden = true;
        return;
    }

    retirementCommentForm.hidden = true;
    retirementCommentLogin.hidden = false;
}

async function loadRetirementMessage() {
    const messageId =
        new URLSearchParams(window.location.search).get("id");

    if (!messageId) {
        showRetirementDetailMessageKey(
            "retirement_detail_no_selection",
            "error"
        );
        return;
    }

    currentRetirementMessageId = messageId;

    showRetirementDetailMessageKey(
        "retirement_detail_loading"
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
                    translate("retirement_detail_load_error")
            );
        }

        renderRetirementMessage(data.retirementMessage);
        setupCommentAccess();
        await loadComments(messageId);
    } catch (error) {
        showRetirementDetailMessage(
            error.message ||
                translate("retirement_detail_load_error"),
            "error"
        );
    }
}

retirementCommentForm.addEventListener(
    "submit",
    async event => {
        event.preventDefault();

        const token = localStorage.getItem("token");

        if (!token) {
            setupCommentAccess();
            return;
        }

        if (!retirementCommentForm.checkValidity()) {
            retirementCommentForm.reportValidity();
            return;
        }

        const body = retirementCommentText.value.trim();

        retirementCommentSubmit.disabled = true;
        retirementCommentSubmit.textContent =
            translate("retirement_comment_posting");
        retirementCommentMessage.hidden = true;
        visibleCommentMessageKey = "";

        try {
            const response =
                await fetch(
                    `/api/retirement-messages/${encodeURIComponent(
                        currentRetirementMessageId
                    )}/comments`,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body:
                            JSON.stringify({ body })
                    }
                );

            const data =
                await response.json().catch(() => ({}));

            if (response.status === 401) {
                localStorage.removeItem("token");
                setupCommentAccess();
                throw new Error(
                    translate(
                        "retirement_comment_sign_in_again"
                    )
                );
            }

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        translate("retirement_comment_submit_error")
                );
            }

            retirementCommentForm.reset();

            if (data.status === "published" && data.comment) {
                const empty = retirementCommentList.querySelector(
                    ".retirement-comment-empty"
                );

                empty?.remove();

                retirementCommentList.appendChild(
                    createCommentElement(data.comment)
                );

                loadedComments.push(data.comment);

                showRetirementCommentMessageKey(
                    "retirement_comment_published",
                    "success"
                );
            } else {
                showRetirementCommentMessageKey(
                    "retirement_comment_submitted",
                    "success"
                );
            }
        } catch (error) {
            showRetirementCommentMessage(
                error.message ||
                    translate("retirement_comment_submit_error"),
                "error"
            );
        } finally {
            retirementCommentSubmit.disabled = false;
            retirementCommentSubmit.textContent =
                translate("retirement_comment_post");
        }
    }
);

document.addEventListener(
    "languagechange",
    () => {
        if (currentRetirementMessage) {
            renderRetirementMessage(currentRetirementMessage);
        } else if (visibleDetailMessageKey) {
            showRetirementDetailMessageKey(
                visibleDetailMessageKey,
                visibleDetailMessageType
            );
        }

        renderComments(loadedComments);

        if (visibleCommentMessageKey) {
            showRetirementCommentMessageKey(
                visibleCommentMessageKey,
                visibleCommentMessageType
            );
        }

        retirementCommentSubmit.textContent =
            translate(
                retirementCommentSubmit.disabled
                    ? "retirement_comment_posting"
                    : "retirement_comment_post"
            );
    }
);

loadRetirementMessage();
