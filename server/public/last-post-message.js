const lastPostDetailContent = document.getElementById('lastPostDetailContent');
const lastPostDetailMessage = document.getElementById('lastPostDetailMessage');
const lastPostDetailTitle = document.getElementById('lastPostDetailTitle');
const lastPostDetailDate = document.getElementById('lastPostDetailDate');
const lastPostDetailLanguage = document.getElementById('lastPostDetailLanguage');
const lastPostDetailImage = document.getElementById('lastPostDetailImage');
const lastPostDetailText = document.getElementById('lastPostDetailText');

let currentLastPost = null;

function showDetailMessage(message, type = 'neutral') {
  lastPostDetailMessage.textContent = message;
  lastPostDetailMessage.className = `last-post-message is-${type}`;
  lastPostDetailMessage.hidden = false;
  lastPostDetailContent.hidden = true;
}

function showDetailLoading() {
  const message = translate('last_post_detail_loading');
  lastPostDetailMessage.replaceChildren(
    ...Array.from(CMCENUtils.createLoadingSpinner(message).childNodes)
  );
  lastPostDetailMessage.className = 'last-post-message is-loading';
  lastPostDetailMessage.setAttribute('aria-label', message);
  lastPostDetailMessage.hidden = false;
  lastPostDetailContent.hidden = true;
}

function getLastPostName(lastPost) {
  return lastPost?.displayName || translate('last_post_default_name');
}

function formatPublishedDate(value) {
  if (!value) return '';

  return CMCENUtils.formatDate(value, {
    dateStyle: 'long',
    timeZone: 'UTC',
    fallback: ''
  });
}

function renderImage(lastPost, name) {
  lastPostDetailImage.replaceChildren();
  lastPostDetailImage.hidden = !lastPost.imageUrl;
  if (!lastPost.imageUrl) return;

  const image = document.createElement('img');
  image.src = lastPost.imageUrl;
  image.alt = translate('last_post_image_alt', { name });
  image.addEventListener('error', () => {
    lastPostDetailImage.hidden = true;
  }, { once: true });
  lastPostDetailImage.appendChild(image);
}

function renderLastPost(lastPost) {
  currentLastPost = lastPost;
  const name = getLastPostName(lastPost);
  document.title = `${name} | ${translate('last_post_heading')} | CMCEN / RCMCE`;
  lastPostDetailTitle.textContent = name;
  lastPostDetailDate.textContent = formatPublishedDate(lastPost.publishedAt);
  lastPostDetailLanguage.textContent = translate(
    lastPost.messageLanguage === 'fr'
      ? 'last_post_notice_language_fr'
      : 'last_post_notice_language_en'
  );
  lastPostDetailText.textContent = lastPost.message || '';
  renderImage(lastPost, name);
  lastPostDetailMessage.hidden = true;
  lastPostDetailContent.hidden = false;
}

async function loadLastPost() {
  const messageId = new URLSearchParams(window.location.search).get('id') || '';
  if (!messageId) {
    showDetailMessage(translate('last_post_detail_no_selection'), 'error');
    return;
  }

  showDetailLoading();
  try {
    const response = await fetch(`/api/last-posts/${encodeURIComponent(messageId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.lastPost) {
      throw new Error(data.error || translate('last_post_detail_load_error'));
    }
    renderLastPost(data.lastPost);
  } catch (error) {
    showDetailMessage(error.message || translate('last_post_detail_load_error'), 'error');
  }
}

document.addEventListener('languagechange', () => {
  if (currentLastPost) renderLastPost(currentLastPost);
});

loadLastPost();
