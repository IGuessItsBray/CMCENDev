"use strict";
(() => {
  function mount({ root, api, onDenied }) {
    const lifecycle = new AbortController(),
      urls = new Set();
    let disposed = false,
      busy = false,
      previewUrl = null,
      message = "";
    let draft = {
      fullName: "",
      rankEn: "",
      rankFr: "",
      presentationDate: "",
      frPronoun: "",
      frRankGrammar: "",
      reviewed: false,
    };
    const t = (key) => window.translate(key);
    let controls = [],
      status,
      previewRoot;
    function revokePreview() {
      if (previewUrl && urls.delete(previewUrl))
        URL.revokeObjectURL(previewUrl);
      previewUrl = null;
      previewRoot?.replaceChildren();
    }
    function update() {
      if (disposed) return;
      status.textContent = t(message || "trusted_award_intro");
      status.setAttribute("aria-busy", String(busy));
      for (const control of controls) control.disabled = busy;
    }
    function render() {
      if (disposed) return;
      controls = [];
      const panel = document.createElement("details");
      panel.className = "trusted-award-panel";
      panel.open = true;
      const summary = document.createElement("summary");
      summary.textContent = t("trusted_award_title");
      const form = document.createElement("form");
      form.className = "trusted-award-form";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        return generate(false);
      });
      status = document.createElement("p");
      status.setAttribute("role", "status");
      form.append(status);
      let review;
      const changed = () => {
        draft.reviewed = false;
        if (review) review.checked = false;
        revokePreview();
        message = "";
        update();
      };
      for (const [key, type, maxLength] of [
        ["fullName", "text", 160],
        ["rankEn", "text", 40],
        ["rankFr", "text", 40],
        ["presentationDate", "date"],
      ]) {
        const label = document.createElement("label");
        label.textContent = t(`trusted_award_${key}`);
        const input = document.createElement("input");
        input.type = type;
        input.required = true;
        input.className = `trusted-award-${key}`;
        input.value = draft[key];
        if (maxLength) input.maxLength = maxLength;
        input.addEventListener("input", () => {
          draft[key] = input.value;
          changed();
        });
        label.append(input);
        form.append(label);
        controls.push(input);
      }
      for (const [key, values] of [
        ["frPronoun", ["il", "elle"]],
        ["frRankGrammar", ["masculine", "feminine", "elided", "no_article"]],
      ]) {
        const label = document.createElement("label");
        label.textContent = t(`trusted_award_${key}`);
        const select = document.createElement("select");
        select.required = true;
        select.className = `trusted-award-${key}`;
        for (const value of ["", ...values]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = t(
            value ? `trusted_award_${value}` : "select_option",
          );
          select.append(option);
        }
        select.value = draft[key];
        select.addEventListener("change", () => {
          draft[key] = select.value;
          changed();
        });
        label.append(select);
        form.append(label);
        controls.push(select);
      }
      const reviewLabel = document.createElement("label");
      reviewLabel.className = "trusted-award-review-label";
      review = document.createElement("input");
      review.type = "checkbox";
      review.className = "trusted-award-reviewed";
      review.checked = draft.reviewed;
      review.addEventListener("change", () => {
        draft.reviewed = review.checked;
      });
      const reviewText = document.createElement("span");
      reviewText.textContent = t("trusted_award_review");
      reviewLabel.append(review, reviewText);
      form.append(reviewLabel);
      controls.push(review);
      for (const download of [false, true]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = download
          ? "trusted-award-download"
          : "trusted-award-preview";
        button.textContent = t(
          download ? "trusted_award_download" : "trusted_award_preview",
        );
        button.addEventListener("click", () => generate(download));
        form.append(button);
        controls.push(button);
      }
      previewRoot = document.createElement("div");
      previewRoot.className = "trusted-award-preview-root";
      if (previewUrl) showPreview();
      form.append(previewRoot);
      panel.append(summary, form);
      root.replaceChildren(panel);
      update();
    }
    function showPreview() {
      const open = document.createElement("a");
      open.href = previewUrl;
      open.target = "_blank";
      open.rel = "noopener";
      open.textContent = t("trusted_award_open_preview");
      const frame = document.createElement("iframe");
      frame.className = "certificate-member-preview";
      frame.title = t("trusted_award_preview");
      frame.src = previewUrl;
      previewRoot.replaceChildren(open, frame);
    }
    async function generate(download) {
      if (disposed || busy) return;
      if (download && !draft.reviewed) {
        message = "trusted_award_review_required";
        update();
        return;
      }
      busy = true;
      message = "trusted_award_generating";
      update();
      try {
        const response = await api(
          `/api/certificate-requests/trusted-to-serve.pdf${download ? "?download=1" : ""}`,
          {
            method: "POST",
            json: true,
            parseJson: false,
            body: { ...draft },
            timeoutMs: null,
            signal: lifecycle.signal,
          },
        );
        const blob = await response.blob();
        if (disposed) return;
        if (blob.type !== "application/pdf")
          throw new Error("Invalid award response");
        const url = URL.createObjectURL(blob);
        urls.add(url);
        if (download) {
          const link = document.createElement("a");
          link.href = url;
          link.download = `trusted-to-serve-${draft.presentationDate}.pdf`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => {
            if (urls.delete(url)) URL.revokeObjectURL(url);
          }, 1000);
        } else {
          revokePreview();
          previewUrl = url;
          showPreview();
        }
        message = "trusted_award_ready";
      } catch (error) {
        if (disposed) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        let code;
        try {
          code = (await error.data?.json())?.code;
        } catch {
          /* Generic recoverable error. */
        }
        message =
          {
            certificate_fonts_unavailable:
              "certificate_member_fonts_unavailable",
            award_wording_required: "trusted_award_wording_required",
            award_review_required: "trusted_award_review_required",
            award_text_overflow: "trusted_award_overflow",
            award_data_invalid: "trusted_award_data_invalid",
          }[code] || "trusted_award_error";
      } finally {
        if (!disposed) {
          busy = false;
          update();
        }
      }
    }
    document.addEventListener("languagechange", render, {
      signal: lifecycle.signal,
    });
    render();
    return {
      canNavigate: () => !busy,
      hasUnsavedChanges: () => busy,
      dispose() {
        disposed = true;
        lifecycle.abort();
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
        previewUrl = null;
        draft = {};
        controls = [];
        previewRoot = null;
        root.replaceChildren();
      },
    };
  }
  window.TrustedToServe = { mount };
})();
