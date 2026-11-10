/* Profile requirements for new submissions. The API remains authoritative. */
(() => {
  const requirements = {
    retirement: ["firstName", "lastName", "email"],
    event: ["rank", "firstName", "lastName", "email"],
    lastPost: ["rank", "firstName", "lastName", "email"],
  };
  const labels = {
    firstName: "first_name",
    lastName: "last_name",
    email: "field_email",
    rank: "rank",
  };
  const text = (value) => String(value || "").trim();

  function getMissingFields(user = {}, type) {
    return (requirements[type] || []).filter((field) => !text(user[field]));
  }

  function getContext() {
    const type = new URLSearchParams(window.location.search).get("submission");
    return Object.hasOwn(requirements, type) ? type : null;
  }

  function missingText(user, type) {
    return translate("submission_profile_missing", {
      fields: getMissingFields(user, type)
        .map((field) => translate(labels[field]))
        .join(", "),
    });
  }

  function createProfileGuidance(user) {
    const panel = document.createElement("aside");
    panel.className = "submission-profile-notice";
    const title = document.createElement("strong");
    title.textContent = translate("submission_profile_requirements");
    panel.append(title);
    const context = getContext();
    for (const type of context ? [context] : Object.keys(requirements)) {
      const description = document.createElement("p");
      description.textContent = translate(`submission_profile_${type}`);
      panel.append(description);
    }
    if (context) {
      const status = document.createElement("p");
      status.textContent = getMissingFields(user, context).length
        ? missingText(user, context)
        : translate("submission_profile_ready");
      panel.append(status);
    }
    return panel;
  }

  function createNotice({
    form,
    type,
    user,
    getToken,
    isEditing = () => false,
    onRefresh,
  }) {
    const notice = document.createElement("aside");
    notice.className = "submission-profile-notice";
    notice.tabIndex = -1;
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    const title = document.createElement("strong");
    const requirementsText = document.createElement("p");
    const missing = document.createElement("p");
    const instructions = document.createElement("p");
    const actions = document.createElement("div");
    actions.className = "submission-profile-actions";
    const edit = document.createElement("a");
    edit.href = `/dashboard?submission=${encodeURIComponent(type)}#accountDetailsTitle`;
    edit.target = "_blank";
    edit.rel = "noopener";
    const retry = document.createElement("button");
    retry.type = "button";
    actions.append(edit, retry);
    notice.append(title, requirementsText, missing, instructions, actions);
    form.before(notice);
    let currentUser = user;
    let failed = false;
    let pending = null;

    function render() {
      const fields = getMissingFields(currentUser, type);
      notice.hidden = isEditing() || (!fields.length && !failed);
      title.textContent = translate("submission_profile_complete");
      requirementsText.textContent = translate(`submission_profile_${type}`);
      missing.textContent = failed
        ? translate("submission_profile_check_error")
        : missingText(currentUser, type);
      instructions.textContent = translate("submission_profile_instructions");
      edit.textContent = translate("submission_profile_edit");
      retry.textContent = translate("submission_profile_recheck");
    }

    async function check({ focus = false } = {}) {
      // Existing content uses its stored submitter. Do not add a new edit gate.
      if (isEditing()) return true;
      if (!pending) {
        retry.disabled = true;
        pending = (async () => {
          try {
            const token = getToken();
            if (!token) throw new Error("Authentication required");
            currentUser = await CMCENUtils.apiJson("/api/me", {
              token,
              redirectOnUnauthorized: true,
            });
            failed = false;
            onRefresh?.(currentUser);
            return getMissingFields(currentUser, type).length === 0;
          } catch {
            failed = true;
            return false;
          } finally {
            retry.disabled = false;
            render();
          }
        })();
      }
      const result = await pending;
      pending = null;
      if (!result && focus) notice.focus();
      return result;
    }

    retry.addEventListener("click", () => check());
    window.addEventListener("focus", () => {
      if (!notice.hidden) void check();
    });
    document.addEventListener("languagechange", render);
    render();
    return { check, render };
  }

  window.CMCENSubmissionProfile = {
    getMissingFields,
    getContext,
    createProfileGuidance,
    createNotice,
  };
})();
