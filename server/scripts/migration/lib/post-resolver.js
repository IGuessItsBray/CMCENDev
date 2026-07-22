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

module.exports = { resolvePostWithFallback };
