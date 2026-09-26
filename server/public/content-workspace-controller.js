"use strict";
window.ContentWorkspace = {
  mount({ api, user, onUrlChange = () => {}, articleMode = false }) {
    const area = articleMode ? "articles" : "content";
    const root = document.getElementById(
      articleMode ? "adminArticlesBody" : "adminContentBody",
    );
    root.replaceChildren(
      document
        .getElementById("contentWorkspaceTemplate")
        .content.cloneNode(true),
    );
    const elementId = (id) =>
      articleMode ? id.replace("contentWorkspace", "articleWorkspace") : id;
    if (articleMode) {
      root.querySelectorAll("[id]").forEach((node) => {
        node.id = elementId(node.id);
      });
      root
        .querySelectorAll(
          "[for], [aria-labelledby], [aria-describedby], [aria-controls]",
        )
        .forEach((node) => {
          for (const attribute of [
            "for",
            "aria-labelledby",
            "aria-describedby",
            "aria-controls",
          ])
            if (node.hasAttribute(attribute))
              node.setAttribute(
                attribute,
                node
                  .getAttribute(attribute)
                  .split(" ")
                  .map(elementId)
                  .join(" "),
              );
        });
    }
    const getElement = (id) =>
      root.querySelector("#" + elementId(id)) ||
      document.getElementById(elementId(id));
    const lifecycle = new AbortController();
    let disposed = false;
    let queueRequestId = 0;
    let reviewCounts = null;
    const queues = document.createElement("nav");
    queues.className = "content-workspace-review-queues";
    queues.hidden = true;
    root.prepend(queues);
    function renderReviewQueues() {
      queues.hidden = !canReviewContentWorkspace();
      if (queues.hidden) return;
      const heading = document.createElement("h2");
      heading.id = "contentWorkspaceReviewQueuesTitle";
      heading.className = "content-workspace-review-queues-title";
      setWorkspaceTranslatedText(
        heading,
        "dashboard_review_work_title",
        "Submissions to review",
      );
      queues.setAttribute("aria-labelledby", heading.id);
      queues.replaceChildren(heading);
      for (const [type, key, label] of [
        ["event", "events", "review_events_tab"],
        ["retirementMessage", "retirementMessages", "review_retirements_tab"],
        ["lastPost", "lastPosts", "review_last_posts_tab"],
        ["retirementComment", "comments", "review_comments_tab"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "admin-work-zone-button is-secondary is-compact";
        const count = reviewCounts?.[key];
        button.textContent = `${getText(label, type)}${Number.isInteger(count) ? ` (${count})` : ""}`;
        button.addEventListener(
          "click",
          () => void changeFilters({ queueType: type }),
        );
        queues.append(button);
      }
    }
    async function loadReviewQueues() {
      if (!canReviewContentWorkspace()) return;
      const requestId = ++queueRequestId;
      renderReviewQueues();
      try {
        const counts = await contentWorkspaceApiJson(
          "/api/admin/review-counts",
        );
        if (disposed || requestId !== queueRequestId) return;
        reviewCounts = counts;
      } catch {
        if (disposed || requestId !== queueRequestId) return;
        reviewCounts = null;
      }
      renderReviewQueues();
    }
    let workspaceUrl = new URL(window.location.href);
    let changingFilters = false;
    const filterNames = ["type", "status", "translation", "search", "id"];
    const routeKey = (url) =>
      filterNames
        .map((name) => url.searchParams.get(name) || "")
        .join("\u0000");
    const isBareRoute = (url) =>
      !filterNames.some((name) => url.searchParams.has(name));
    function rememberUrl(url) {
      workspaceUrl = new URL(url);
      if (new URL(window.location.href).searchParams.get("area") === area) {
        window.history.replaceState(null, "", workspaceUrl);
        onUrlChange();
      }
    }
    const contentWorkspaceType = getElement("contentWorkspaceType");
    const contentWorkspaceStatusFilter = getElement(
      "contentWorkspaceStatusFilter",
    );
    const contentWorkspaceSearch = getElement("contentWorkspaceSearch");
    const contentWorkspaceTranslationFilter = getElement(
      "contentWorkspaceTranslationFilter",
    );
    const contentWorkspaceEyebrow = getElement("contentWorkspaceEyebrow");
    const contentWorkspaceTitle = getElement("contentWorkspaceTitle");
    const contentWorkspaceIntro = getElement("contentWorkspaceIntro");
    const contentWorkspaceMessage = getElement("contentWorkspaceMessage");
    const contentWorkspaceList = getElement("contentWorkspaceList");
    const contentWorkspaceCount = getElement("contentWorkspaceCount");
    const contentWorkspaceLoadMore = getElement("contentWorkspaceLoadMore");
    const contentWorkspaceLoadMoreButton = getElement(
      "contentWorkspaceLoadMoreButton",
    );
    const contentWorkspaceLoadMoreLabel = getElement(
      "contentWorkspaceLoadMoreLabel",
    );
    const contentWorkspaceClearFilters = getElement(
      "contentWorkspaceClearFilters",
    );
    const contentWorkspaceDetail = getElement("contentWorkspaceDetail");
    const contentWorkspaceListLoadingTemplate = getElement(
      "contentWorkspaceListLoadingTemplate",
    );
    const contentWorkspaceDetailLoadingTemplate = getElement(
      "contentWorkspaceDetailLoadingTemplate",
    );
    const CONTENT_WORKSPACE_PAGE_SIZE = 24;

    const contentWorkspaceState = {
      items: [],
      selectedId: "",
      requestedContentId: "",
      user: null,
      isLoading: false,
      isLoadingMore: false,
      isSelecting: false,
      loadRequestId: 0,
      nextCursor: "",
      hasMore: false,
      editorDrafts: new Map(),
    };

    const contentWorkspaceRoutes = Object.freeze({
      event: "/api/admin/events",
      retirementMessage: "/api/admin/retirement-messages",
      lastPost: "/api/admin/last-posts",
      retirementComment: "/api/admin/retirement-comments",
    });

    const contentWorkspaceReviewRoutes = Object.freeze({
      newsArticle: (id) => `/api/news/${encodeURIComponent(id)}/publication`,
      event: (id) => `/api/events/${encodeURIComponent(id)}/review`,
      retirementMessage: (id) =>
        `/api/retirement-messages/${encodeURIComponent(id)}/review`,
      lastPost: (id) => `/api/last-posts/${encodeURIComponent(id)}/review`,
      retirementComment: (id) =>
        `/api/retirement-messages/comments/${encodeURIComponent(id)}/review`,
    });

    const contentWorkspaceScheduledPublicationTypes = new Set([
      "event",
      "retirementMessage",
      "lastPost",
      "newsArticle",
    ]);

    const contentWorkspaceEditRoutes = Object.freeze({
      event: (id) => `/api/admin/events/${encodeURIComponent(id)}`,
      retirementMessage: (id) =>
        `/api/admin/retirement-messages/${encodeURIComponent(id)}`,
      lastPost: (id) => `/api/admin/last-posts/${encodeURIComponent(id)}`,
      retirementComment: (id) =>
        `/api/admin/retirement-comments/${encodeURIComponent(id)}`,
    });

    const contentWorkspaceTypes = new Set([
      "all",
      "event",
      "retirementMessage",
      "lastPost",
      "newsArticle",
      "retirementComment",
    ]);
    const contentWorkspaceStatuses = new Set([
      "all",
      "draft",
      "pending",
      "scheduled",
      "published",
      "rejected",
      "hidden",
    ]);
    const contentWorkspaceTranslationStatuses = new Set([
      "all",
      "missing-any",
      "missing-en",
      "missing-fr",
    ]);
    let contentWorkspaceSearchTimeout;

    function getText(key, fallback, replacements = {}) {
      const translated =
        typeof window.translate === "function"
          ? window.translate(key, replacements)
          : key;

      return translated === key ? fallback : translated;
    }

    function setWorkspaceTranslatedText(element, key, fallback) {
      element.dataset.i18n = key;
      element.textContent = getText(key, fallback);
    }

    function canReviewContentWorkspace() {
      return (
        !articleMode &&
        contentWorkspaceState.user?.permissions?.canReviewAndPublish === true
      );
    }

    function canManageContentWorkspaceNews() {
      return (
        articleMode &&
        contentWorkspaceState.user?.permissions?.canManageNews === true
      );
    }

    function canManageContentWorkspaceRsvps() {
      return (
        contentWorkspaceState.user?.permissions?.canManageEventRsvps === true
      );
    }

    function canEditContentWorkspaceRecord(item) {
      return item?.type === "newsArticle"
        ? canManageContentWorkspaceNews()
        : canReviewContentWorkspace();
    }

    function canEditContentWorkspacePublicCopy(item) {
      if (item?.type === "newsArticle") {
        return (
          canManageContentWorkspaceNews() &&
          ["draft", "published", "hidden"].includes(item.status)
        );
      }

      return (
        item?.type !== "retirementComment" &&
        canReviewContentWorkspace() &&
        ["pending", "published", "hidden"].includes(item.status)
      );
    }

    function canViewContentWorkspaceHistory(item) {
      return item?.type === "newsArticle"
        ? canManageContentWorkspaceNews()
        : canReviewContentWorkspace();
    }

    function updateContentWorkspaceTypeOptions() {
      const canReview = canReviewContentWorkspace();
      const canManageNews = canManageContentWorkspaceNews();
      [...contentWorkspaceStatusFilter.options].forEach((option) => {
        const unavailable = articleMode
          ? ["pending", "rejected"].includes(option.value)
          : option.value === "draft";
        option.hidden = unavailable;
        option.disabled = unavailable;
      });
      if (contentWorkspaceStatusFilter.selectedOptions[0]?.disabled)
        contentWorkspaceStatusFilter.value = "all";
      contentWorkspaceType.closest("label").hidden = articleMode;
      if (articleMode) contentWorkspaceType.value = "newsArticle";

      [...contentWorkspaceType.options].forEach((option) => {
        const isAvailable =
          option.value === "all" ||
          (option.value === "newsArticle" ? canManageNews : canReview);
        option.hidden = !isAvailable;
        option.disabled = !isAvailable;
      });

      const selected = contentWorkspaceType.selectedOptions[0];
      if (selected && !selected.disabled) return;

      contentWorkspaceType.value = canManageNews ? "newsArticle" : "all";
    }

    function updateContentWorkspaceModePresentation() {
      setWorkspaceTranslatedText(
        contentWorkspaceEyebrow,
        articleMode ? "article_staff" : "content_workspace_eyebrow",
        articleMode ? "Staff publishing" : "Editorial workspace",
      );
      setWorkspaceTranslatedText(
        contentWorkspaceTitle,
        articleMode ? "admin_articles" : "content_workspace_title",
        articleMode ? "Articles" : "Submissions",
      );
      setWorkspaceTranslatedText(
        contentWorkspaceIntro,
        articleMode ? "article_intro" : "content_workspace_intro",
        "Review pending submissions, correct bilingual public copy, and publish, reject, remove, or restore content without losing its history.",
      );
    }

    function getContentWorkspaceLocale() {
      return CMCENUtils.getCurrentLocale();
    }

    async function contentWorkspaceApiJson(path, options = {}) {
      if (disposed) throw new DOMException("Workspace disposed", "AbortError");
      const result = await api(path, { ...options, signal: lifecycle.signal });
      if (disposed) throw new DOMException("Workspace disposed", "AbortError");
      return result;
    }

    function setWorkspaceMessage(message = "", kind = "") {
      if (disposed) return;
      contentWorkspaceMessage.textContent = message;
      contentWorkspaceMessage.className = "content-workspace-status";

      if (kind) {
        contentWorkspaceMessage.classList.add(`is-${kind}`);
      }
    }

    function showWorkspaceSuccess(message) {
      if (disposed) return;
      setWorkspaceMessage("");
      CMCENUtils.showToast(message, {
        color: "success",
        position: "bottom-right",
        animation: "slide",
      });
    }

    function applyContentWorkspaceSearchParameters() {
      const searchParameters = workspaceUrl.searchParams;
      const type = searchParameters.get("type");
      const status = searchParameters.get("status");
      const translation = searchParameters.get("translation");
      const search = String(searchParameters.get("search") || "").slice(0, 120);
      const contentId = String(searchParameters.get("id") || "").trim();

      contentWorkspaceType.value = contentWorkspaceTypes.has(type)
        ? type
        : "all";

      contentWorkspaceStatusFilter.value = contentWorkspaceStatuses.has(status)
        ? status
        : "all";

      contentWorkspaceTranslationFilter.value =
        contentWorkspaceTranslationStatuses.has(translation)
          ? translation
          : "all";

      contentWorkspaceSearch.value = search;

      contentWorkspaceState.selectedId = contentId;
      contentWorkspaceState.requestedContentId = contentId;
    }

    function updateContentWorkspaceSearchParameters({
      includeSelection = false,
    } = {}) {
      const url = new URL(workspaceUrl);
      const searchParameters = new URLSearchParams({ area });
      const type = contentWorkspaceType.value || "all";
      const status = contentWorkspaceStatusFilter.value || "all";
      const translation = contentWorkspaceTranslationFilter.value || "all";
      const search = contentWorkspaceSearch.value.trim();

      if (type !== "all") {
        searchParameters.set("type", type);
      }
      if (status !== "all") {
        searchParameters.set("status", status);
      }
      if (translation !== "all") {
        searchParameters.set("translation", translation);
      }
      if (search) {
        searchParameters.set("search", search);
      }
      if (includeSelection && contentWorkspaceState.selectedId) {
        searchParameters.set("id", contentWorkspaceState.selectedId);
      }
      url.search = searchParameters.toString();
      rememberUrl(url);
    }

    function hasContentWorkspaceFilters() {
      const searchParameters = workspaceUrl.searchParams;

      return Boolean(
        contentWorkspaceType.value !== "all" ||
        contentWorkspaceStatusFilter.value !== "all" ||
        contentWorkspaceTranslationFilter.value !== "all" ||
        contentWorkspaceSearch.value.trim() ||
        searchParameters.get("id"),
      );
    }

    function updateContentWorkspaceClearFiltersAction() {
      contentWorkspaceClearFilters.disabled = !hasContentWorkspaceFilters();
    }

    function clearContentWorkspaceFilters() {
      contentWorkspaceType.value = "all";
      contentWorkspaceStatusFilter.value = "all";
      contentWorkspaceTranslationFilter.value = "all";
      contentWorkspaceSearch.value = "";
      contentWorkspaceState.selectedId = "";
      contentWorkspaceState.requestedContentId = "";
      updateContentWorkspaceStatusFilterAppearance();
      updateContentWorkspaceSearchParameters();
      void loadContentWorkspace();
    }

    function getItemTitle(item) {
      return (
        String(item?.title || "").trim() ||
        getText("content_workspace_untitled", "Untitled content")
      );
    }

    function getListItemTitle(item) {
      if (item?.type === "retirementMessage") {
        const retiree = item.content?.retiree || {};
        const name = [retiree.rank, retiree.firstName, retiree.lastName]
          .filter(Boolean)
          .join(" ");

        if (name) return name;
      }

      if (item?.type === "lastPost") {
        const deceased = item.content?.deceased || {};
        const name = [
          deceased.fullRank,
          deceased.firstName,
          deceased.surname,
          deceased.postNominal,
        ]
          .filter(Boolean)
          .join(" ");

        if (name) return name;
      }

      return getItemTitle(item);
    }

    function getContentWorkspaceMissingLanguages(item) {
      const localizedFields = {
        event: [
          item.content?.title,
          item.content?.location,
          item.content?.description,
          item.content?.registration,
        ],
        retirementMessage: [item.content?.messages],
        lastPost: [item.content?.messages],
        newsArticle: [item.content?.title, item.content?.content],
      }[item?.type];

      if (!localizedFields) return [];

      return ["en", "fr"].filter((language) => {
        const sourceLanguage = language === "en" ? "fr" : "en";

        return localizedFields.some((field) => {
          const value = String(field?.[language] || "").trim();
          const sourceValue = String(field?.[sourceLanguage] || "").trim();

          return !value && Boolean(sourceValue);
        });
      });
    }

    function setContentWorkspaceTranslationStatus(status, item) {
      const missing = getContentWorkspaceMissingLanguages(item);
      const languages = missing.map((language) =>
        getText(
          language === "en" ? "language_en" : "language_fr",
          language === "en" ? "English" : "French",
        ),
      );

      status.textContent = languages.length
        ? `${getText("translations_missing_label", "Missing translation")}: ${languages.join(", ")}`
        : "";
    }

    function createContentWorkspaceTranslationStatus(item) {
      const missing = getContentWorkspaceMissingLanguages(item);

      if (!missing.length) return null;

      const status = document.createElement("p");
      status.className =
        "translation-row-status content-workspace-translation-status is-warning";
      setContentWorkspaceTranslationStatus(status, item);
      return status;
    }

    function formatWorkspaceDate(value) {
      if (!value) return "";

      return CMCENUtils.formatDate(value, {
        locale: getContentWorkspaceLocale(),
        dateStyle: "medium",
        timeStyle: "short",
      });
    }

    function getTypeTranslation(type) {
      return {
        event: ["content_workspace_event", "Events"],
        retirementMessage: [
          "content_workspace_retirement",
          "Retirement messages",
        ],
        lastPost: ["content_workspace_last_post", "Last Post notices"],
        newsArticle: ["content_workspace_news", "Articles"],
        retirementComment: ["content_workspace_comment", "Comments"],
      }[type];
    }

    function getTypeLabel(type) {
      const translation = getTypeTranslation(type);
      return translation ? getText(...translation) : type;
    }

    function setTypeLabel(element, type) {
      const translation = getTypeTranslation(type);

      if (translation) {
        setWorkspaceTranslatedText(element, ...translation);
        return;
      }

      element.textContent = type;
    }

    function getStatusTranslation(status) {
      return {
        draft: ["content_workspace_draft", "Draft"],
        pending: ["content_workspace_pending", "Pending"],
        scheduled: ["content_workspace_scheduled", "Scheduled"],
        published: ["content_workspace_published", "Published"],
        rejected: ["content_workspace_rejected", "Rejected"],
        hidden: ["content_workspace_hidden", "Removed"],
      }[status];
    }

    function getStatusLabel(status) {
      const translation = getStatusTranslation(status);
      return translation ? getText(...translation) : status;
    }

    function getContentWorkspaceDisplayStatus(item) {
      if (
        contentWorkspaceScheduledPublicationTypes.has(item?.type) &&
        (item.status === "pending" ||
          (item.type === "newsArticle" && item.status === "draft")) &&
        item.scheduledPublishAt
      ) {
        return "scheduled";
      }

      return item?.status;
    }

    function updateContentWorkspaceStatusFilterAppearance() {
      const status = contentWorkspaceStatusFilter?.value || "all";
      contentWorkspaceStatusFilter.className =
        "content-workspace-status-filter is-" + status;
    }

    function createStatusBadge(status) {
      const badge = document.createElement("span");
      badge.className = `content-workspace-status-badge is-${status || "unknown"}`;
      const translation = getStatusTranslation(status);

      if (translation) {
        if (status === "scheduled") {
          const icon = document.createElement("span");
          icon.className = "content-workspace-status-badge-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "◷";
          const label = document.createElement("span");
          setWorkspaceTranslatedText(label, ...translation);
          badge.append(icon, label);
        } else {
          setWorkspaceTranslatedText(badge, ...translation);
        }
      } else {
        badge.textContent = status;
      }

      return badge;
    }

    function getPublicContentHref(item) {
      if (!item?._id || item.isNew) return "";
      if (item.type === "newsArticle")
        return `/news-story?id=${encodeURIComponent(item._id)}${item.status === "published" ? "" : "&preview=1"}`;
      if (item.status !== "published") return "";

      if (item.type === "event") {
        return `/event?id=${encodeURIComponent(item._id)}`;
      }

      if (item.type === "retirementMessage") {
        return `/retirement-message?id=${encodeURIComponent(item._id)}`;
      }

      if (item.type === "lastPost") {
        return `/last-post-message?id=${encodeURIComponent(item._id)}`;
      }

      if (item.type === "newsArticle") {
        return `/news-story?id=${encodeURIComponent(item._id)}`;
      }

      if (item.type === "retirementComment") {
        const retirementMessageId = item.content?.retirementMessage?._id;
        return retirementMessageId
          ? `/retirement-message?id=${encodeURIComponent(retirementMessageId)}`
          : "";
      }

      return "";
    }

    function createPublicContentLink(item) {
      const href = getPublicContentHref(item);
      if (!href) return null;

      const link = document.createElement("a");
      link.className = "content-workspace-public-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (item.type === "newsArticle" && item.status !== "published") {
        setWorkspaceTranslatedText(link, "article_preview", "Preview article");
        return link;
      }
      setWorkspaceTranslatedText(
        link,
        "content_workspace_view_public_link",
        "View public link",
      );
      return link;
    }

    function updateContentWorkspaceCount() {
      if (contentWorkspaceState.isLoading) {
        contentWorkspaceCount.textContent = "";
        return;
      }

      const count = contentWorkspaceState.items.length;
      const singular = count === 1;
      contentWorkspaceCount.textContent = getText(
        singular
          ? "content_workspace_results_singular"
          : "content_workspace_results_plural",
        singular ? `${count} result` : `${count} results`,
        { count },
      );
    }

    function setRecordMetadata(metadata, item) {
      metadata.replaceChildren();

      const type = document.createElement("span");
      setTypeLabel(type, item.type);
      metadata.append(type);

      metadata.append(
        document.createTextNode(` · ${getPublicationLabel(item)}`),
      );
      if (item.lastEditedAt) {
        metadata.append(
          document.createElement("br"),
          document.createTextNode(getEditLabel(item)),
        );
      }
      appendHiddenMetadata(metadata, item);
    }

    function getPublicationLabel(item) {
      return getText(
        item.publishedAt
          ? item.publishedByName
            ? "submission_published_by"
            : "submission_published_at"
          : "submission_submitted_at",
        "",
        {
          date: formatWorkspaceDate(item.publishedAt || item.createdAt),
          name: item.publishedByName,
        },
      );
    }

    function appendHiddenMetadata(element, item) {
      if (!item.hiddenAt) return;
      element.append(
        document.createElement("br"),
        document.createTextNode(
          getText(
            item.hiddenByName ? "submission_hidden_by" : "submission_hidden_at",
            "",
            {
              date: formatWorkspaceDate(item.hiddenAt),
              name: item.hiddenByName,
            },
          ),
        ),
      );
    }

    function getEditLabel(item) {
      return getText(
        item.lastEditedBy ? "submission_edited_by" : "submission_edited_at",
        "",
        {
          date: formatWorkspaceDate(item.lastEditedAt),
          name: item.lastEditedBy,
        },
      );
    }

    function updateContentWorkspaceLoadMore() {
      const showLoadMore =
        !contentWorkspaceState.isLoading &&
        contentWorkspaceState.hasMore &&
        contentWorkspaceState.items.length;

      contentWorkspaceLoadMore.hidden = !showLoadMore;
      contentWorkspaceLoadMoreButton.disabled =
        contentWorkspaceState.isLoadingMore;
      contentWorkspaceLoadMoreButton.setAttribute(
        "aria-busy",
        String(contentWorkspaceState.isLoadingMore),
      );
      setWorkspaceTranslatedText(
        contentWorkspaceLoadMoreLabel,
        contentWorkspaceState.isLoadingMore
          ? "content_workspace_loading_more"
          : "content_workspace_load_more",
        contentWorkspaceState.isLoadingMore ? "Loading more…" : "Load more",
      );
    }

    function renderContentWorkspaceList() {
      if (disposed) return;
      contentWorkspaceList.replaceChildren();
      updateContentWorkspaceCount();
      updateContentWorkspaceClearFiltersAction();
      updateContentWorkspaceLoadMore();
      contentWorkspaceList.setAttribute(
        "aria-busy",
        contentWorkspaceState.isLoading ? "true" : "false",
      );

      if (contentWorkspaceState.isLoading) {
        const loading = document.createElement("span");
        loading.className = "visually-hidden";
        setWorkspaceTranslatedText(
          loading,
          "content_workspace_loading",
          "Loading content…",
        );
        contentWorkspaceList.append(
          loading,
          contentWorkspaceListLoadingTemplate.content.cloneNode(true),
        );
        return;
      }

      if (!contentWorkspaceState.items.length) {
        const empty = document.createElement("p");
        empty.className = "content-workspace-empty";
        setWorkspaceTranslatedText(
          empty,
          "content_workspace_empty",
          "No content matches these filters.",
        );
        contentWorkspaceList.append(empty);
        return;
      }

      contentWorkspaceState.items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "content-workspace-record";
        button.dataset.contentWorkspaceRecordId = String(item._id);
        button.classList.toggle(
          "is-selected",
          String(item._id) === contentWorkspaceState.selectedId,
        );
        button.setAttribute(
          "aria-current",
          String(item._id) === contentWorkspaceState.selectedId
            ? "true"
            : "false",
        );

        const title = document.createElement("strong");
        title.textContent = getListItemTitle(item);

        const metadata = document.createElement("span");
        metadata.className = "content-workspace-record-meta";
        setRecordMetadata(metadata, item);

        button.append(title, metadata);
        const translationStatus = createContentWorkspaceTranslationStatus(item);

        if (translationStatus) {
          button.append(translationStatus);
        }

        button.append(
          createStatusBadge(getContentWorkspaceDisplayStatus(item)),
        );
        button.addEventListener("click", () => {
          void selectContentWorkspaceItem(item);
        });
        contentWorkspaceList.append(button);
      });
    }

    function getSelectedContentWorkspaceItem() {
      if (contentWorkspaceState.selectedId === "new")
        return contentWorkspaceState.newArticle;
      return contentWorkspaceState.items.find(
        (item) => String(item._id) === contentWorkspaceState.selectedId,
      );
    }

    function setDetailInfo(info, item) {
      const values = [getTypeLabel(item.type), getPublicationLabel(item)];

      if (item.type === "event") {
        values.push(
          item.content?.city,
          formatWorkspaceDate(item.content?.startDate),
        );
      }

      if (item.status === "hidden" && item.hiddenFromStatus) {
        values.push(
          getText("content_workspace_removed_from", "Removed from {status}", {
            status: getStatusLabel(item.hiddenFromStatus),
          }),
        );
      }

      info.textContent = values.filter(Boolean).join(" · ");
      if (item.lastEditedAt) {
        info.append(
          document.createElement("br"),
          document.createTextNode(getEditLabel(item)),
        );
      }
      appendHiddenMetadata(info, item);
    }

    function createDetailInfo(item) {
      const info = document.createElement("p");
      info.className = "content-workspace-detail-info";
      setDetailInfo(info, item);
      return info;
    }

    function renderContentWorkspaceDetail() {
      if (disposed) return;
      disposeEditors();
      contentWorkspaceDetail.replaceChildren();
      contentWorkspaceDetail.setAttribute(
        "aria-busy",
        contentWorkspaceState.isLoading ? "true" : "false",
      );

      if (contentWorkspaceState.isLoading) {
        const loading = document.createElement("span");
        loading.className = "visually-hidden";
        setWorkspaceTranslatedText(
          loading,
          "content_workspace_loading",
          "Loading content…",
        );
        contentWorkspaceDetail.append(
          loading,
          contentWorkspaceDetailLoadingTemplate.content.cloneNode(true),
        );
        return;
      }

      const item = getSelectedContentWorkspaceItem();

      if (!item) {
        const empty = document.createElement("p");
        empty.className = "content-workspace-detail-empty";
        setWorkspaceTranslatedText(
          empty,
          "content_workspace_select",
          "Choose a record to view its content and history.",
        );
        contentWorkspaceDetail.append(empty);
        return;
      }

      const header = document.createElement("header");
      header.className = "content-workspace-detail-heading";
      const title = document.createElement("h2");
      title.textContent = getItemTitle(item);
      const actions = document.createElement("div");
      actions.className = "content-workspace-detail-actions";
      actions.append(createStatusBadge(getContentWorkspaceDisplayStatus(item)));
      const publicContentLink = createPublicContentLink(item);

      header.append(title, createDetailInfo(item), actions);
      if (publicContentLink) header.append(publicContentLink);
      contentWorkspaceDetail.append(header);

      const canEditPublicCopy = canEditContentWorkspacePublicCopy(item);

      if (canEditPublicCopy) {
        const copy = document.createElement("section");
        copy.className = "content-workspace-copy";
        const copyHeading = document.createElement("h2");
        setWorkspaceTranslatedText(
          copyHeading,
          "content_workspace_public_copy",
          "Public copy",
        );
        copy.append(copyHeading);

        const editors = document.createElement("div");
        editors.className = "content-workspace-language-editors";
        editors.append(
          createLanguageEditor(item, "en"),
          createLanguageEditor(item, "fr"),
        );
        copy.append(editors);

        contentWorkspaceDetail.append(copy);
      } else if (item.type === "retirementComment") {
        const comment = document.createElement("section");
        comment.className = "content-workspace-copy";
        const heading = document.createElement("h2");
        setWorkspaceTranslatedText(
          heading,
          "content_workspace_public_copy",
          "Public copy",
        );
        comment.append(heading, ...createReadOnlyComment(item));
        contentWorkspaceDetail.append(comment);
      } else {
        contentWorkspaceDetail.append(createReadOnlyCopy(item));
      }

      const recordEditor = canEditContentWorkspaceRecord(item)
        ? createContentWorkspaceRecordEditor(item)
        : null;
      if (recordEditor) {
        contentWorkspaceDetail.append(recordEditor);
      }

      const submissionDetails = createContentWorkspaceSubmissionDetails(item);
      if (submissionDetails) {
        contentWorkspaceDetail.append(submissionDetails);
      }

      const rejectionReason = createRejectionReason(item);
      if (rejectionReason) {
        contentWorkspaceDetail.append(rejectionReason);
      }

      const rsvpPanel = createContentWorkspaceRsvpPanel(item);
      if (rsvpPanel) {
        contentWorkspaceDetail.append(rsvpPanel);
      }

      if (!item.isNew && canViewContentWorkspaceHistory(item)) {
        const history = document.createElement("section");
        history.className = "content-workspace-history";
        const historyHeading = document.createElement("h2");
        setWorkspaceTranslatedText(
          historyHeading,
          "content_workspace_history",
          "Revision history",
        );
        const revisions = document.createElement("div");
        revisions.className = "content-workspace-revisions";
        revisions.hidden = true;
        const loadHistory = document.createElement("button");
        loadHistory.type = "button";
        loadHistory.className =
          "admin-work-zone-button is-secondary is-compact";
        setWorkspaceTranslatedText(
          loadHistory,
          "content_workspace_load_history",
          "Load revision history",
        );
        loadHistory.addEventListener("click", async () => {
          loadHistory.disabled = true;
          loadHistory.setAttribute("aria-busy", "true");
          setWorkspaceTranslatedText(
            loadHistory,
            "content_workspace_history_loading",
            "Loading revision history…",
          );
          revisions.hidden = false;
          const loaded = await loadRevisionHistory(item, revisions);

          if (loaded) {
            loadHistory.remove();
            return;
          }

          loadHistory.disabled = false;
          loadHistory.removeAttribute("aria-busy");
          setWorkspaceTranslatedText(
            loadHistory,
            "content_workspace_retry_history",
            "Retry revision history",
          );
        });
        history.append(historyHeading, loadHistory, revisions);
        contentWorkspaceDetail.append(history);
      }

      const scheduledPublication = createScheduledPublicationStatus(item);
      if (scheduledPublication) {
        contentWorkspaceDetail.append(scheduledPublication);
      }

      const bottomActions = createContentWorkspaceBottomActions(item, {
        canSave: canEditPublicCopy || Boolean(recordEditor),
      });
      if (bottomActions) {
        contentWorkspaceDetail.append(bottomActions);
        updateContentWorkspaceSaveAction();
      }
    }

    function hasUnsavedContentWorkspaceChanges() {
      return getContentWorkspaceSaveForms().some(isContentWorkspaceFormDirty);
    }

    function updateContentWorkspaceSaveAction() {
      const save = contentWorkspaceDetail.querySelector(
        "[data-content-workspace-save]",
      );

      if (!save || save.getAttribute("aria-busy") === "true") return;

      save.disabled = !hasUnsavedContentWorkspaceChanges();
    }

    function discardContentWorkspaceDrafts(item) {
      ["en", "fr"].forEach((language) => {
        contentWorkspaceState.editorDrafts.delete(
          getEditorDraftKey(item, language),
        );
      });
    }

    async function selectContentWorkspaceItem(item) {
      const nextId = String(item._id);

      if (
        nextId === contentWorkspaceState.selectedId ||
        contentWorkspaceState.isActing ||
        contentWorkspaceState.isSelecting
      ) {
        return;
      }

      contentWorkspaceState.isSelecting = true;
      try {
        const currentItem = getSelectedContentWorkspaceItem();

        if (currentItem && hasUnsavedContentWorkspaceChanges()) {
          const choice = await CMCENModal.choose(
            getText(
              "content_workspace_unsaved_changes_message",
              "Save or discard your changes before switching to another record.",
            ),
            {
              title: getText(
                "content_workspace_unsaved_changes_title",
                "Unsaved changes",
              ),
              closeOnBackdrop: false,
              choices: [
                {
                  value: "save",
                  label: getText(
                    "content_workspace_save_changes",
                    "Save changes",
                  ),
                  description: getText(
                    "content_workspace_save_before_switching",
                    "Save your edits, then open the selected record.",
                  ),
                },
                {
                  value: "discard",
                  label: getText(
                    "content_workspace_discard_changes",
                    "Discard changes",
                  ),
                  description: getText(
                    "content_workspace_discard_before_switching",
                    "Discard your edits and open the selected record.",
                  ),
                  destructive: true,
                },
              ],
            },
          );

          if (choice === "save") {
            const save = contentWorkspaceDetail.querySelector(
              "[data-content-workspace-save]",
            );
            const saved = save
              ? await saveContentWorkspaceChanges(currentItem, save)
              : false;

            if (!saved) return;
          } else if (choice === "discard") {
            discardContentWorkspaceDrafts(currentItem);
          } else {
            return;
          }
        }

        contentWorkspaceState.selectedId = nextId;
        contentWorkspaceState.requestedContentId = "";
        updateContentWorkspaceSearchParameters({ includeSelection: true });
        renderContentWorkspaceList();
        renderContentWorkspaceDetail();
      } finally {
        contentWorkspaceState.isSelecting = false;
      }
    }

    async function loadContentWorkspace({
      preserveSelection = false,
      updateSearchParameters = false,
      append = false,
    } = {}) {
      if (disposed) return;
      if (
        append &&
        (!contentWorkspaceState.hasMore ||
          !contentWorkspaceState.nextCursor ||
          contentWorkspaceState.isLoadingMore)
      ) {
        return;
      }

      if (updateSearchParameters) {
        updateContentWorkspaceSearchParameters();
      }

      const requestId = ++contentWorkspaceState.loadRequestId;
      if (!append) void loadReviewQueues();
      contentWorkspaceState.isLoading = !append;
      contentWorkspaceState.isLoadingMore = append;
      if (!append) {
        contentWorkspaceState.nextCursor = "";
        contentWorkspaceState.hasMore = false;
      }
      renderContentWorkspaceList();
      if (!append) {
        renderContentWorkspaceDetail();
      }

      const query = new URLSearchParams({
        limit: String(CONTENT_WORKSPACE_PAGE_SIZE),
        scope: articleMode ? "articles" : "submissions",
      });
      const type = contentWorkspaceType.value || "all";
      const status = contentWorkspaceStatusFilter.value || "all";
      const translation = contentWorkspaceTranslationFilter.value || "all";
      const search = contentWorkspaceSearch.value.trim();

      if (type !== "all") {
        query.set("type", type);
      }
      if (status !== "all") {
        query.set("status", status);
      }
      if (translation !== "all") {
        query.set("translation", translation);
      }
      if (search) {
        query.set("search", search);
      }
      if (contentWorkspaceState.requestedContentId) {
        query.set("id", contentWorkspaceState.requestedContentId);
      }
      if (append) {
        query.set("cursor", contentWorkspaceState.nextCursor);
      }

      try {
        const data = await contentWorkspaceApiJson(
          `/api/admin/content?${query}`,
        );
        if (requestId !== contentWorkspaceState.loadRequestId) return;

        const nextItems = Array.isArray(data.items) ? data.items : [];

        if (append) {
          const loadedItemIds = new Set(
            contentWorkspaceState.items.map((item) => String(item._id)),
          );
          contentWorkspaceState.items.push(
            ...nextItems.filter((item) => !loadedItemIds.has(String(item._id))),
          );
        } else {
          const previousSelection =
            contentWorkspaceState.requestedContentId ||
            (preserveSelection ? contentWorkspaceState.selectedId : "");
          contentWorkspaceState.items = nextItems;
          contentWorkspaceState.selectedId = contentWorkspaceState.items.some(
            (item) => String(item._id) === previousSelection,
          )
            ? previousSelection
            : String(contentWorkspaceState.items[0]?._id || "");
          contentWorkspaceState.requestedContentId = "";
          setWorkspaceMessage(
            contentWorkspaceState.items.length
              ? ""
              : getText(
                  "content_workspace_empty",
                  "No content matches these filters.",
                ),
          );
        }

        const nextCursor = String(data.nextCursor || "");
        contentWorkspaceState.hasMore =
          data.hasMore === true && Boolean(nextCursor);
        contentWorkspaceState.nextCursor = contentWorkspaceState.hasMore
          ? nextCursor
          : "";
      } catch (error) {
        if (requestId !== contentWorkspaceState.loadRequestId) return;

        if (!append) {
          contentWorkspaceState.items = [];
          contentWorkspaceState.selectedId = "";
          contentWorkspaceState.nextCursor = "";
          contentWorkspaceState.hasMore = false;
        }
        setWorkspaceMessage(error.message, "error");
      } finally {
        if (requestId === contentWorkspaceState.loadRequestId) {
          contentWorkspaceState.isLoading = false;
          contentWorkspaceState.isLoadingMore = false;
          renderContentWorkspaceList();
          if (!append) {
            renderContentWorkspaceDetail();
          }
        }
      }
    }

    async function initializeContentWorkspace() {
      contentWorkspaceState.user = user;
      applyContentWorkspaceSearchParameters();
      updateContentWorkspaceTypeOptions();
      updateContentWorkspaceModePresentation();
      updateContentWorkspaceStatusFilterAppearance();
      await loadContentWorkspace();
    }

    if (articleMode) {
      const create = document.createElement("button");
      create.type = "button";
      create.className = "admin-work-zone-button is-primary article-create";
      setWorkspaceTranslatedText(create, "article_new", "New article");
      root.prepend(create);
      create.addEventListener("click", async () => {
        if (
          contentWorkspaceState.isLoading ||
          contentWorkspaceState.isActing ||
          !(await confirmDiscard())
        )
          return;
        if (disposed) return;
        contentWorkspaceState.editorDrafts.clear();
        contentWorkspaceState.newArticle = {
          _id: "new",
          type: "newsArticle",
          isNew: true,
          status: "draft",
          title: getText("article_new", "New article"),
          content: {
            layout: "newsletter",
            category: "news",
            title: { en: "", fr: "" },
            content: { en: "", fr: "" },
            newsletterBlocks: { en: [], fr: [] },
            newsletter: {
              language: CMCENUtils.getCurrentLanguage(),
              archived: false,
            },
          },
        };
        contentWorkspaceState.selectedId = "new";
        contentWorkspaceState.requestedContentId = "";
        updateContentWorkspaceSearchParameters();
        renderContentWorkspaceDetail();
        contentWorkspaceDetail.querySelector("input[name=title]")?.focus();
      });
    }

    function updateContentWorkspaceLanguage() {
      renderReviewQueues();
      updateContentWorkspaceModePresentation();
      updateContentWorkspaceStatusFilterAppearance();
      updateContentWorkspaceCount();

      contentWorkspaceList
        .querySelectorAll("[data-content-workspace-record-id]")
        .forEach((record) => {
          const item = contentWorkspaceState.items.find(
            (candidate) =>
              String(candidate._id) === record.dataset.contentWorkspaceRecordId,
          );
          const metadata = record.querySelector(
            ".content-workspace-record-meta",
          );

          if (item && metadata) {
            setRecordMetadata(metadata, item);
          }

          const translationStatus = record.querySelector(
            ".content-workspace-translation-status",
          );

          if (item && translationStatus) {
            setContentWorkspaceTranslationStatus(translationStatus, item);
          }
        });

      const item = getSelectedContentWorkspaceItem();
      const detailInfo = contentWorkspaceDetail.querySelector(
        ".content-workspace-detail-info",
      );

      if (item && detailInfo) {
        setDetailInfo(detailInfo, item);
      }

      contentWorkspaceDetail
        .querySelectorAll("[data-revision-created-at]")
        .forEach((date) => {
          date.textContent = formatWorkspaceDate(
            date.dataset.revisionCreatedAt,
          );
        });

      contentWorkspaceDetail
        .querySelectorAll("[data-scheduled-publication-at]")
        .forEach((publication) => {
          setScheduledPublicationMessage(
            publication,
            publication.dataset.scheduledPublicationAt,
          );
        });

      contentWorkspaceDetail
        .querySelectorAll("[data-content-workspace-rsvp-accepted]")
        .forEach((summary) => {
          setContentWorkspaceRsvpSummary(
            summary,
            Number(summary.dataset.contentWorkspaceRsvpAccepted) || 0,
            Number(summary.dataset.contentWorkspaceRsvpDeclined) || 0,
          );
        });
    }

    async function confirmDiscard() {
      if (!hasUnsavedContentWorkspaceChanges()) return true;
      const accepted = await window.CMCENModal.confirm(
        getText("admin_next_leave_unsaved", "Discard your unsaved changes?"),
        {
          title: getText(
            "content_workspace_unsaved_changes_title",
            "Unsaved changes",
          ),
          confirmText: getText(
            "content_workspace_discard_changes",
            "Discard changes",
          ),
          destructive: true,
        },
      );
      return accepted && !disposed;
    }

    async function changeFilters({ clear = false, queueType = "" } = {}) {
      if (
        changingFilters ||
        contentWorkspaceState.isActing ||
        contentWorkspaceState.isSelecting
      )
        return;
      changingFilters = true;
      window.clearTimeout(contentWorkspaceSearchTimeout);
      try {
        if (!(await confirmDiscard())) {
          const selection = contentWorkspaceState.selectedId;
          applyContentWorkspaceSearchParameters();
          contentWorkspaceState.selectedId = selection;
          contentWorkspaceState.requestedContentId = "";
          updateContentWorkspaceStatusFilterAppearance();
          return;
        }
        contentWorkspaceState.editorDrafts.clear();
        if (queueType) {
          contentWorkspaceType.value = queueType;
          contentWorkspaceStatusFilter.value = "pending";
          contentWorkspaceTranslationFilter.value = "all";
          contentWorkspaceSearch.value = "";
        }
        if (clear) {
          clearContentWorkspaceFilters();
          updateContentWorkspaceTypeOptions();
          return;
        }
        contentWorkspaceState.selectedId = "";
        contentWorkspaceState.requestedContentId = "";
        updateContentWorkspaceStatusFilterAppearance();
        await loadContentWorkspace({ updateSearchParameters: true });
      } finally {
        changingFilters = false;
      }
    }

    for (const filter of [
      contentWorkspaceType,
      contentWorkspaceStatusFilter,
      contentWorkspaceTranslationFilter,
    ]) {
      filter.addEventListener("change", () => void changeFilters());
    }

    contentWorkspaceSearch.addEventListener("input", () => {
      window.clearTimeout(contentWorkspaceSearchTimeout);
      contentWorkspaceSearchTimeout = window.setTimeout(() => {
        void changeFilters();
      }, 250);
    });

    contentWorkspaceClearFilters.addEventListener(
      "click",
      () => void changeFilters({ clear: true }),
    );
    contentWorkspaceLoadMoreButton.addEventListener("click", () => {
      void loadContentWorkspace({ append: true });
    });

    document.addEventListener(
      "languagechange",
      updateContentWorkspaceLanguage,
      { signal: lifecycle.signal },
    );

    function updateContentWorkspaceSaveActionFromField(event) {
      if (!(event.target instanceof Element)) return;

      if (
        !event.target.closest(
          ".content-workspace-language-editor, .content-workspace-record-form",
        )
      ) {
        return;
      }

      updateContentWorkspaceSaveAction();
    }

    contentWorkspaceDetail.addEventListener(
      "input",
      updateContentWorkspaceSaveActionFromField,
    );
    contentWorkspaceDetail.addEventListener(
      "change",
      updateContentWorkspaceSaveActionFromField,
    );

    const {
      disposeEditors,
      createLanguageEditor,
      getEditorDraftKey,
      captureEditorDrafts,
      createContentWorkspaceRecordEditor,
      createReadOnlyComment,
      createReadOnlyCopy,
      createContentWorkspaceSubmissionDetails,
      createRejectionReason,
      createScheduledPublicationStatus,
      setScheduledPublicationMessage,
      getContentWorkspaceRecordSaveRequest,
      getNewsArticleSaveRequest,
      getContentLanguageSaveRequest,
      getContentWorkspaceSaveForms,
      isContentWorkspaceFormDirty,
    } = window.ContentWorkspaceEditors.create({
      setWorkspaceTranslatedText: (...args) =>
        setWorkspaceTranslatedText(...args),
      getText: (...args) => getText(...args),
      contentWorkspaceState,
      contentWorkspaceDetail,
      getContentWorkspaceLocale: (...args) =>
        getContentWorkspaceLocale(...args),
      formatWorkspaceDate: (...args) => formatWorkspaceDate(...args),
      contentWorkspaceScheduledPublicationTypes,
      contentWorkspaceEditRoutes,
      contentWorkspaceApiJson: (...args) => contentWorkspaceApiJson(...args),
    });
    const { createContentWorkspaceBottomActions, saveContentWorkspaceChanges } =
      window.ContentWorkspaceActions.create({
        onArticleCreated: (article) => {
          contentWorkspaceState.newArticle = null;
          contentWorkspaceState.selectedId = String(article._id);
          contentWorkspaceState.requestedContentId = String(article._id);
          updateContentWorkspaceSearchParameters({ includeSelection: true });
        },
        canManageContentWorkspaceNews: (...args) =>
          canManageContentWorkspaceNews(...args),
        canReviewContentWorkspace: (...args) =>
          canReviewContentWorkspace(...args),
        contentWorkspaceReviewRoutes,
        contentWorkspaceScheduledPublicationTypes,
        setWorkspaceTranslatedText: (...args) =>
          setWorkspaceTranslatedText(...args),
        hasUnsavedContentWorkspaceChanges: (...args) =>
          hasUnsavedContentWorkspaceChanges(...args),
        getText: (...args) => getText(...args),
        contentWorkspaceDetail,
        contentWorkspaceApiJson: (...args) => contentWorkspaceApiJson(...args),
        contentWorkspaceState,
        getEditorDraftKey: (...args) => getEditorDraftKey(...args),
        showWorkspaceSuccess: (...args) => showWorkspaceSuccess(...args),
        loadContentWorkspace: (...args) => loadContentWorkspace(...args),
        setWorkspaceMessage: (...args) => setWorkspaceMessage(...args),
        getContentWorkspaceLocale: (...args) =>
          getContentWorkspaceLocale(...args),
        contentWorkspaceRoutes,
        getContentWorkspaceSaveForms: (...args) =>
          getContentWorkspaceSaveForms(...args),
        isContentWorkspaceFormDirty: (...args) =>
          isContentWorkspaceFormDirty(...args),
        updateContentWorkspaceSaveAction: (...args) =>
          updateContentWorkspaceSaveAction(...args),
        captureEditorDrafts: (...args) => captureEditorDrafts(...args),
        getNewsArticleSaveRequest: (...args) =>
          getNewsArticleSaveRequest(...args),
        getContentWorkspaceRecordSaveRequest: (...args) =>
          getContentWorkspaceRecordSaveRequest(...args),
        getContentLanguageSaveRequest: (...args) =>
          getContentLanguageSaveRequest(...args),
      });
    const { setContentWorkspaceRsvpSummary, createContentWorkspaceRsvpPanel } =
      window.ContentWorkspaceRsvps.create({
        getText: (...args) => getText(...args),
        setWorkspaceTranslatedText: (...args) =>
          setWorkspaceTranslatedText(...args),
        contentWorkspaceApiJson: (...args) => contentWorkspaceApiJson(...args),
        getSelectedContentWorkspaceItem: (...args) =>
          getSelectedContentWorkspaceItem(...args),
        canManageContentWorkspaceRsvps: (...args) =>
          canManageContentWorkspaceRsvps(...args),
      });
    const { loadRevisionHistory } = window.ContentWorkspaceHistory.create({
      getText: (...args) => getText(...args),
      setWorkspaceTranslatedText: (...args) =>
        setWorkspaceTranslatedText(...args),
      contentWorkspaceApiJson: (...args) => contentWorkspaceApiJson(...args),
      getSelectedContentWorkspaceItem: (...args) =>
        getSelectedContentWorkspaceItem(...args),
      formatWorkspaceDate: (...args) => formatWorkspaceDate(...args),
    });
    updateContentWorkspaceModePresentation();
    updateContentWorkspaceStatusFilterAppearance();
    renderContentWorkspaceDetail();
    const ready = initializeContentWorkspace();
    return {
      ready,
      hasUnsavedChanges: hasUnsavedContentWorkspaceChanges,
      canNavigate: () =>
        !changingFilters &&
        !contentWorkspaceState.isActing &&
        !contentWorkspaceState.isSelecting,
      async canRoute(url) {
        if (isBareRoute(url) || routeKey(url) === routeKey(workspaceUrl))
          return true;
        return confirmDiscard();
      },
      activate(url) {
        if (isBareRoute(url)) {
          rememberUrl(workspaceUrl);
        } else if (routeKey(url) !== routeKey(workspaceUrl)) {
          workspaceUrl = new URL(url);
          contentWorkspaceState.editorDrafts.clear();
          applyContentWorkspaceSearchParameters();
          updateContentWorkspaceTypeOptions();
          updateContentWorkspaceStatusFilterAppearance();
          void loadContentWorkspace();
        }
      },
      dispose() {
        disposed = true;
        contentWorkspaceState.loadRequestId++;
        lifecycle.abort();
        window.clearTimeout(contentWorkspaceSearchTimeout);
        contentWorkspaceState.items = [];
        contentWorkspaceState.editorDrafts.clear();
        disposeEditors();
        root.replaceChildren();
      },
    };
  },
};
