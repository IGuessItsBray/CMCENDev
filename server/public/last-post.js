const lastPostGrid = document.getElementById('lastPostGrid');
const lastPostMessage = document.getElementById('lastPostMessage');
const lastPostLoadMore = document.getElementById('lastPostLoadMore');
const lastPostLoadMoreButton = document.getElementById('lastPostLoadMoreButton');
const lastPostLoadMoreLabel = document.getElementById('lastPostLoadMoreLabel');
const lastPostLoadMoreMessage = document.getElementById('lastPostLoadMoreMessage');

const LAST_POST_PAGE_SIZE = 24;
let lastPostNextCursor = '';
let lastPostHasMore = false;
let isLoadingMoreLastPosts = false;

function createLoadingContent(message) {
  return Array.from(CMCENUtils.createLoadingSpinner(message).childNodes);
}

function showLastPostMessage(message, type = 'neutral') {
  lastPostMessage.textContent = message;
  lastPostMessage.className = `last-post-message is-${type}`;
  lastPostMessage.hidden = false;
  lastPostGrid.hidden = true;
  lastPostLoadMore.hidden = true;
}

function showLastPostLoading() {
  const message = translate('last_post_loading');
  lastPostMessage.replaceChildren(...createLoadingContent(message));
  lastPostMessage.className = 'last-post-message is-loading';
  lastPostMessage.setAttribute('aria-label', message);
  lastPostMessage.hidden = false;
  lastPostGrid.hidden = true;
  lastPostLoadMore.hidden = true;
}

function getLastPostName(lastPost) {
  return lastPost.displayName || translate('last_post_default_name');
}

function getExcerpt(value, maxLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();

  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength - 1).trim()}…`;
}

function formatPublishedDate(value) {
  if (!value) return '';

  return CMCENUtils.formatDate(value, {
    dateStyle: 'long',
    timeZone: 'UTC',
    fallback: ''
  });
}

function createLastPostCard(lastPost) {
  const name = getLastPostName(lastPost);
  const card = document.createElement('a');
  card.className = 'last-post-card';
  card.href = `/last-post-message?id=${encodeURIComponent(lastPost._id)}`;
  card.setAttribute('aria-label', translate('last_post_card_aria', { name }));

  const notice = document.createElement('p');
  notice.className = 'last-post-card-notice';
  notice.textContent = translate('last_post_in_memoriam');

  const heading = document.createElement('h2');
  heading.textContent = name;

  const date = document.createElement('p');
  date.className = 'last-post-card-date';
  date.textContent = formatPublishedDate(lastPost.publishedAt);

  const excerpt = document.createElement('p');
  excerpt.className = 'last-post-card-excerpt';
  excerpt.textContent = getExcerpt(
    CMCENUtils.getLocalizedText(lastPost.messages) || ''
  );

  const readMore = document.createElement('p');
  readMore.className = 'last-post-card-read-more';
  readMore.textContent = translate('last_post_read_notice');

  card.append(notice, heading, date, excerpt, readMore);
  return card;
}

function updateLoadMore() {
  const visible = lastPostHasMore && lastPostGrid.childElementCount > 0;
  lastPostLoadMore.hidden = !visible;
  lastPostLoadMoreButton.disabled = isLoadingMoreLastPosts;
  lastPostLoadMoreLabel.textContent = translate(
    isLoadingMoreLastPosts ? 'last_post_loading_more' : 'last_post_load_more'
  );
}

function renderLastPosts(lastPosts, { append = false } = {}) {
  if (!append) {
    lastPostGrid.replaceChildren();
  }

  if (!lastPosts.length && !append) {
    showLastPostMessage(translate('last_post_empty'), 'empty');
    return;
  }

  lastPosts.forEach(lastPost => {
    lastPostGrid.appendChild(createLastPostCard(lastPost));
  });

  lastPostMessage.hidden = true;
  lastPostGrid.hidden = false;
  updateLoadMore();
}

async function loadLastPosts({ append = false } = {}) {
  if (append) {
    isLoadingMoreLastPosts = true;
    lastPostLoadMoreMessage.hidden = true;
    updateLoadMore();
  } else {
    showLastPostLoading();
  }

  try {
    const params = new URLSearchParams({ limit: String(LAST_POST_PAGE_SIZE) });
    if (append && lastPostNextCursor) params.set('cursor', lastPostNextCursor);

    const data = await CMCENUtils.apiJson(`/api/last-posts?${params}`, {
      errorMessage: translate('last_post_load_error')
    });

    const lastPosts = Array.isArray(data.lastPosts) ? data.lastPosts : [];
    lastPostHasMore = data.hasMore === true;
    lastPostNextCursor = typeof data.nextCursor === 'string' ? data.nextCursor : '';
    renderLastPosts(lastPosts, { append });
  } catch (error) {
    if (append) {
      lastPostLoadMoreMessage.textContent = translate('last_post_load_more_error');
      lastPostLoadMoreMessage.hidden = false;
    } else {
      showLastPostMessage(translate('last_post_load_error'), 'error');
    }
  } finally {
    if (append) {
      isLoadingMoreLastPosts = false;
      updateLoadMore();
    }
  }
}

lastPostLoadMoreButton.addEventListener('click', () => loadLastPosts({ append: true }));
document.addEventListener('languagechange', () => {
  if (lastPostMessage.hidden && lastPostGrid.childElementCount) {
    // Reloading keeps all generated labels and dates in the selected language.
    loadLastPosts();
  }
});

loadLastPosts();
