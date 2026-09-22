"use strict";
(() => {
  const destination = new URL("/dashboard-next", window.location.origin);
  destination.search = window.location.search;
  destination.searchParams.set("area", "content");
  window.location.replace(
    destination.pathname + destination.search + window.location.hash,
  );
})();
