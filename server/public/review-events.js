const reviewQueue =
    document.getElementById('reviewQueue');

const reviewPageMessage =
    document.getElementById('reviewPageMessage');

let pendingEvents = [];

function getReviewLanguage() {
    return localStorage.getItem('lang') || 'en';
}

function reviewTranslate(key) {
    const language = getReviewLanguage();

    return translations[language]?.[key] ||
        translations.en?.[key] ||
        key;
}

function getContentValue(value, language) {
    if (typeof value?.[language] !== 'string') {
        return '';
    }

    return value[language].trim();
}

function createContentSection(event, language, heading) {
    const section = document.createElement('section');
    section.className = 'review-language-section';

    const sectionHeading = document.createElement('h3');
    sectionHeading.textContent = heading;

    const title = document.createElement('h4');
    title.textContent =
        getContentValue(event.title, language) ||
        reviewTranslate('translation_missing');

    const location = document.createElement('p');
    location.className = 'review-event-location';

    const locationValue =
        getContentValue(event.location, language);

    location.textContent = locationValue
        ? `${reviewTranslate('event_location_label')}: ${locationValue}`
        : `${reviewTranslate('event_location_label')}: ${reviewTranslate('translation_missing')}`;

    const description = document.createElement('p');
    description.className = 'review-event-description';

    description.textContent =
        getContentValue(event.description, language) ||
        reviewTranslate('translation_missing');

    section.append(
        sectionHeading,
        title,
        location,
        description
    );

    return section;
}

function formatSubmittedDate(dateValue) {
    return new Intl.DateTimeFormat(
        getReviewLanguage() === 'fr'
            ? 'fr-CA'
            : 'en-CA',
        {
            dateStyle: 'medium',
            timeStyle: 'short'
        }
    ).format(new Date(dateValue));
}

function formatEventDate(event) {
    const locale =
        getReviewLanguage() === 'fr'
            ? 'fr-CA'
            : 'en-CA';

    const options = {
        dateStyle: 'full'
    };

    if (event.allDay) {
        options.timeZone = 'UTC';
    }

    return new Intl.DateTimeFormat(
        locale,
        options
    ).format(new Date(event.startDate));
}

function createReviewCard(event) {
    const article = document.createElement('article');
    article.className = 'review-card';
    article.dataset.eventId = event._id;

    const meta = document.createElement('div');
    meta.className = 'review-meta';

    const author = document.createElement('p');

    const submittedBy =
        event.createdBy?.accountName ||
        event.createdBy?.username ||
        reviewTranslate('unknown_user');

    author.textContent =
        `${reviewTranslate('submitted_by')}: ${submittedBy}`;

    const submittedDate = document.createElement('p');
    submittedDate.textContent =
        `${reviewTranslate('submitted_on')}: ${formatSubmittedDate(event.createdAt)}`;

    const eventDate = document.createElement('p');
    eventDate.textContent =
        `${reviewTranslate('event_date_label')}: ${formatEventDate(event)}`;

    meta.append(author, submittedDate, eventDate);

    const languages = document.createElement('div');
    languages.className = 'review-languages';

    languages.append(
        createContentSection(event, 'en', 'English'),
        createContentSection(event, 'fr', 'Français')
    );

    const rejectionLabel = document.createElement('label');
    rejectionLabel.className = 'review-rejection-label';
    rejectionLabel.textContent =
        reviewTranslate('rejection_reason_label');

    const rejectionReason =
        document.createElement('textarea');

    rejectionReason.className = 'review-rejection-reason';
    rejectionReason.rows = 3;
    rejectionReason.maxLength = 2000;
    rejectionReason.placeholder =
        reviewTranslate('rejection_reason_placeholder');

    const actionMessage = document.createElement('p');
    actionMessage.className = 'auth-error review-action-message';

    const actions = document.createElement('div');
    actions.className = 'review-actions';

    const publishButton =
        document.createElement('button');

    publishButton.type = 'button';
    publishButton.className = 'auth-btn review-publish-button';
    publishButton.textContent =
        reviewTranslate('publish_event');

    const rejectButton =
        document.createElement('button');

    rejectButton.type = 'button';
    rejectButton.className = 'review-reject-button';
    rejectButton.textContent =
        reviewTranslate('reject_event');

    publishButton.addEventListener('click', () => {
        submitReview(
            event._id,
            'publish',
            article
        );
    });

    rejectButton.addEventListener('click', () => {
        submitReview(
            event._id,
            'reject',
            article
        );
    });

    actions.append(publishButton, rejectButton);

    article.append(
        meta,
        languages,
        rejectionLabel,
        rejectionReason,
        actionMessage,
        actions
    );

    return article;
}

function renderReviewQueue() {
    reviewQueue.replaceChildren();

    if (!pendingEvents.length) {
        reviewQueue.hidden = true;
        reviewPageMessage.hidden = false;
        reviewPageMessage.textContent =
            reviewTranslate('no_pending_events');

        return;
    }

    reviewPageMessage.hidden = true;
    reviewQueue.hidden = false;

    pendingEvents.forEach(event => {
        reviewQueue.appendChild(
            createReviewCard(event)
        );
    });
}

async function submitReview(eventId, action, card) {
    const token = localStorage.getItem('token');

    const reasonInput =
        card.querySelector('.review-rejection-reason');

    const messageElement =
        card.querySelector('.review-action-message');

    const buttons =
        card.querySelectorAll('button');

    const rejectionReason =
        reasonInput.value.trim();

    messageElement.textContent = '';
    messageElement.className =
        'auth-error review-action-message';

    if (action === 'reject' && !rejectionReason) {
        messageElement.textContent =
            reviewTranslate('rejection_reason_required');

        reasonInput.focus();
        return;
    }

    buttons.forEach(button => {
        button.disabled = true;
    });

    try {
        const response = await fetch(
            `/api/events/${eventId}/review`,
            {
                method: 'PATCH',

                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },

                body: JSON.stringify({
                    action,
                    rejectionReason:
                        action === 'reject'
                            ? rejectionReason
                            : undefined
                })
            }
        );

        const data = await response.json();

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }

        if (response.status === 403) {
            throw new Error(
                reviewTranslate('review_access_denied')
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error || reviewTranslate('review_failed')
            );
        }

        pendingEvents = pendingEvents.filter(
            event => event._id !== eventId
        );

        card.remove();

        if (!pendingEvents.length) {
            renderReviewQueue();
        }
    } catch (error) {
        messageElement.textContent = error.message;

        buttons.forEach(button => {
            button.disabled = false;
        });
    }
}

async function loadReviewQueue() {
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    reviewPageMessage.hidden = false;
    reviewPageMessage.textContent =
        reviewTranslate('loading_events');

    try {
        const userResponse = await fetch('/api/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (userResponse.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }

        const user = await userResponse.json();

        if (
            !userResponse.ok ||
            !user.permissions?.canReviewAndPublish
        ) {
            reviewPageMessage.textContent =
                reviewTranslate('review_access_denied');

            return;
        }

        const response = await fetch(
            '/api/events/review',
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || reviewTranslate('review_load_error')
            );
        }

        pendingEvents = data.events || [];
        renderReviewQueue();
    } catch (error) {
        reviewPageMessage.hidden = false;
        reviewPageMessage.textContent = error.message;
    }
}

document.addEventListener(
    'languagechange',
    renderReviewQueue
);

loadReviewQueue();