async function resolvePostWithFallback({
  fetchRest,
  fetchPage,
  onRestMiss = () => {},
  onRestError = () => {},
  onPageError = () => {}
}) {
  try {
    const post = await fetchRest();

    if (post) {
      return post;
    }

    onRestMiss();
  } catch (error) {
    onRestError(error);
  }

  try {
    return await fetchPage();
  } catch (error) {
    onPageError(error);
    return null;
  }
}

async function resolveCollectionWithFallback({
  fetchPrimary,
  fetchFallback,
  onPrimaryError = () => {},
  onPrimaryEmpty = () => {}
}) {
  try {
    const items = await fetchPrimary();

    if (items.length) {
      return { items, usedFallback: false };
    }

    onPrimaryEmpty();
  } catch (error) {
    onPrimaryError(error);
  }

  return {
    items: await fetchFallback(),
    usedFallback: true
  };
}

module.exports = {
  resolveCollectionWithFallback,
  resolvePostWithFallback
};
