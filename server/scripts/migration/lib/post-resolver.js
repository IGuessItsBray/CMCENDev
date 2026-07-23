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

async function resolveCollectionWithFinalFallback({
  fetchPrimary,
  fetchFallback,
  fetchFinalFallback,
  onPrimaryError = () => {},
  onPrimaryEmpty = () => {},
  onFallbackError = () => {},
  onFallbackEmpty = () => {}
}) {
  try {
    const primaryItems = await fetchPrimary();

    if (primaryItems.length) {
      return {
        items: primaryItems,
        usedFallback: false,
        usedFinalFallback: false
      };
    }

    onPrimaryEmpty();
  } catch (error) {
    onPrimaryError(error);
  }

  try {
    const fallbackItems = await fetchFallback();

    if (fallbackItems.length) {
      return {
        items: fallbackItems,
        usedFallback: true,
        usedFinalFallback: false
      };
    }

    onFallbackEmpty();
  } catch (error) {
    onFallbackError(error);
  }

  return {
    items: await fetchFinalFallback(),
    usedFallback: true,
    usedFinalFallback: true
  };
}

module.exports = {
  resolveCollectionWithFallback,
  resolveCollectionWithFinalFallback,
  resolvePostWithFallback
};
