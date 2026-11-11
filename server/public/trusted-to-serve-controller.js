"use strict";
(() => {
  function mount({
    root,
    api,
    onDenied,
    memberRetirement = false,
    requestMode = false,
    onSubmitted,
    initiallyExpanded,
  }) {
    const lifecycle = new AbortController(),
      urls = new Set(),
      datePickers = new Set();
    let disposed = false,
      busy = false,
      message = "";
    let dirty = false,
      submitted = false,
      requestId,
      requestSnapshot;
    const delivery = {
      neededByDate: "",
      requesterRelationship: "",
      mailingAddress: {
        line1: "",
        line2: "",
        city: "",
        province: "",
        postalCode: "",
        country: "",
      },
    };
    if (requestMode && memberRetirement)
      Object.assign(delivery, {
        lastUnit: "",
        tradeRole: "",
        dwdParadeRequested: false,
      });
    let draft = memberRetirement
      ? {
          firstName: "",
          lastName: "",
          postNominals: "",
          fullRankEn: "",
          rankLanguage: "",
          ceBranchEnrollmentDate: "",
          releaseDate: "",
          dwdDate: "",
          familyMembers: [],
          reviewed: false,
        }
      : {
          awardRole: "student",
          firstName: "",
          lastName: "",
          postNominals: "",
          fullRankEn: "",
          presentationDate: "",
          frPronoun: "",
          reviewed: false,
        };
    const t = (key, values) =>
      window.translate(
        requestMode && key === "trusted_award_review_required"
          ? "trusted_request_review_required"
          : requestMode &&
              [
                "trusted_award_title",
                "trusted_award_intro",
                "trusted_award_download",
                "trusted_award_generating",
                "trusted_award_review",
              ].includes(key)
            ? key.replace(
                "trusted_award_",
                memberRetirement ? "retirement_request_" : "trusted_request_",
              )
            : memberRetirement && key.startsWith("trusted_award_")
              ? key.replace("trusted_award_", "manual_retirement_")
              : key,
        values,
      );
    let controls = [],
      status,
      neededByPicker,
      neededByDateInvalid = false;
    let expanded = initiallyExpanded ?? !memberRetirement;
    let familyOptions = { relationships: [], wordings: [] };
    let refreshFamilyQuestions = [];
    function update() {
      if (disposed) return;
      status.textContent = t(message || "trusted_award_intro");
      if (requestMode && message === "trusted_request_session_expired") {
        const link = document.createElement("a");
        link.href = "/login?returnTo=%2Fcertificates";
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = " " + t("trusted_request_sign_in_link");
        status.append(link);
      }
      status.setAttribute("aria-busy", String(busy));
      for (const control of controls)
        control.disabled =
          busy ||
          (requestMode &&
            ((requestSnapshot && control.dataset.requestSubmit !== "true") ||
              (submitted && control.dataset.requestSubmit === "true"))) ||
          (control.dataset.requiresFamilyOptions === "true" &&
            (!familyOptions.wordings.length ||
              draft.familyMembers.length >= 20));
      if (neededByPicker) {
        // The open calendar is portalled into document.body, outside the form.
        for (const tag of ["button", "input", "select"])
          for (const control of neededByPicker.popover.querySelectorAll(tag))
            control.disabled = neededByPicker.trigger.disabled;
        neededByPicker.error.hidden = !neededByDateInvalid;
        if (neededByDateInvalid) {
          neededByPicker.trigger.setAttribute("aria-invalid", "true");
          neededByPicker.trigger.setAttribute(
            "aria-describedby",
            neededByPicker.error.id,
          );
        } else {
          neededByPicker.trigger.removeAttribute("aria-invalid");
          neededByPicker.trigger.removeAttribute("aria-describedby");
        }
      }
    }
    function render() {
      if (disposed) return;
      for (const picker of datePickers) picker.destroy();
      datePickers.clear();
      neededByPicker = undefined;
      controls = [];
      refreshFamilyQuestions = [];
      const panel = document.createElement("details");
      panel.className = "trusted-award-panel";
      panel.open = expanded;
      panel.addEventListener("toggle", () => {
        expanded = panel.open;
      });
      const summary = document.createElement("summary");
      summary.textContent = t("trusted_award_title");
      const form = document.createElement("form");
      form.className = "trusted-award-form";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        return generate();
      });
      status = document.createElement("p");
      status.setAttribute("role", "status");
      form.append(status);
      const groups = {};
      for (const key of ["recipient", "ranks", "presentation"]) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "trusted-award-group";
        const legend = document.createElement("legend");
        legend.textContent = t(`trusted_award_group_${key}`);
        const fields = document.createElement("div");
        fields.className = "trusted-award-fields";
        fieldset.append(legend, fields);
        form.append(fieldset);
        groups[key] = fields;
      }
      let review;
      const changed = () => {
        if (requestMode) {
          dirty = true;
          if (submitted) {
            requestId = undefined;
            requestSnapshot = undefined;
            submitted = false;
          }
        }
        draft.reviewed = false;
        if (review) review.checked = false;
        message = "";
        for (const refresh of refreshFamilyQuestions) refresh();
        update();
      };
      for (const [key, type, maxLength] of [
        ["firstName", "text", 100],
        ["lastName", "text", 100],
        ["postNominals", "text", 120],
        ...(memberRetirement
          ? [
              ["ceBranchEnrollmentDate", "date"],
              ["releaseDate", "date"],
              ["dwdDate", "date"],
            ]
          : [["presentationDate", "date"]]),
      ]) {
        const label = document.createElement("label");
        label.className = `trusted-award-field trusted-award-field-${key}`;
        label.textContent = t(`trusted_award_${key}`);
        if (type === "date" && window.CMCENDateTimePicker?.create) {
          const picker = window.CMCENDateTimePicker.create({
            name: key,
            date: draft[key],
            includeTime: false,
            label: t(`trusted_award_${key}`),
            placeholder: t(`trusted_award_${key}`),
            clearLabel: t("timers_picker_clear"),
            doneLabel: t("timers_picker_done"),
            onInput: ({ date }) => {
              draft[key] = date;
              changed();
            },
          });
          label.append(picker);
          groups.presentation.append(label);
          datePickers.add(picker);
          controls.push(picker.querySelector(".cmcen-date-time-trigger"));
          continue;
        }
        const input = document.createElement("input");
        input.type = type;
        input.required = !["postNominals", "dwdDate"].includes(key);
        input.className = `trusted-award-${key}`;
        input.value = draft[key];
        if (maxLength) input.maxLength = maxLength;
        input.addEventListener("input", () => {
          draft[key] = input.value;
          changed();
        });
        label.append(input);
        groups[
          ["firstName", "lastName", "postNominals"].includes(key)
            ? "recipient"
            : type === "date"
              ? "presentation"
              : "ranks"
        ].append(label);
        controls.push(input);
      }
      const rankLabel = document.createElement("label");
      rankLabel.className =
        "trusted-award-field trusted-award-field-fullRankEn";
      rankLabel.textContent = t("trusted_award_fullRankEn");
      const fullRank = document.createElement("select");
      fullRank.className = "trusted-award-fullRankEn";
      fullRank.required = true;
      const noRank = document.createElement("option");
      noRank.value = "";
      noRank.textContent = t("select_option");
      fullRank.append(noRank);
      for (const rank of memberRetirement
        ? window.CMCENRanks.catalogue
        : window.CMCENAwardRanks.catalogue) {
        const option = document.createElement("option");
        option.value = rank.en;
        option.textContent = memberRetirement
          ? `${rank.en} / ${rank.fr}`
          : `${rank.en} (${rank.abbreviationEn}) / ${rank.fr} (${rank.abbreviationFr})`;
        fullRank.append(option);
      }
      fullRank.value = draft.fullRankEn;
      let refreshFrenchForm = () => {};
      fullRank.addEventListener("change", () => {
        draft.fullRankEn = fullRank.value;
        refreshFrenchForm();
        changed();
      });
      rankLabel.append(fullRank);
      groups.ranks.append(rankLabel);
      if (!memberRetirement) {
        const hint = document.createElement("p");
        hint.className = "trusted-award-rank-hint";
        hint.id = "trusted-award-rank-hint";
        hint.textContent = t("trusted_award_rank_hint");
        fullRank.setAttribute("aria-describedby", hint.id);
        groups.ranks.append(hint);
      }
      controls.push(fullRank);
      if (!memberRetirement) {
        const label = document.createElement("label");
        label.className = "trusted-award-field";
        label.textContent = t("trusted_award_awardRole");
        const select = document.createElement("select");
        select.className = "trusted-award-awardRole";
        select.required = true;
        for (const value of ["student", "instructor"]) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = t(`trusted_award_role_${value}`);
          select.append(option);
        }
        select.value = draft.awardRole;
        select.addEventListener("change", () => {
          draft.awardRole = select.value;
          changed();
        });
        label.append(select);
        groups.recipient.append(label);
        controls.push(select);
      }
      for (const [key, values] of memberRetirement
        ? [["rankLanguage", ["en", "fr"]]]
        : [["frPronoun", ["il", "elle"]]]) {
        const label = document.createElement("label");
        label.className = "trusted-award-field";
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
        if (key === "frPronoun") {
          refreshFrenchForm = () => {
            for (const option of select.children) {
              if (!option.value) continue;
              const selection = window.CMCENAwardRanks.resolve(
                draft.fullRankEn,
                option.value,
              );
              option.textContent =
                t(`trusted_award_${option.value}`) +
                (selection ? ` — ${selection.frenchForm}` : "");
            }
          };
          refreshFrenchForm();
        }
        select.value = draft[key];
        select.addEventListener("change", () => {
          draft[key] = select.value;
          changed();
        });
        label.append(select);
        groups.presentation.append(label);
        controls.push(select);
      }
      if (memberRetirement) {
        const families = document.createElement("fieldset");
        families.className = "trusted-award-group";
        const legend = document.createElement("legend");
        legend.textContent = t("certificate_family_heading");
        families.append(legend);
        draft.familyMembers.forEach((family, index) => {
          const row = document.createElement("div");
          row.className = "trusted-award-fields certificate-manual-family";
          const question = document.createElement("span");
          const updateQuestion = () => {
            question.textContent = t(
              "certificate_member_relationship_question",
              {
                member:
                  `${draft.firstName} ${draft.lastName}`.trim() ||
                  t("certificate_retiring_member"),
                recipient:
                  family.fullName || t("certificate_family_member_generic"),
              },
            );
          };
          refreshFamilyQuestions.push(updateQuestion);
          const field = (key, labelKey, values) => {
            const label = document.createElement("label");
            label.className = "trusted-award-field";
            if (key === "memberRelationshipToRecipient")
              label.className += " trusted-award-field-fullRankEn";
            if (key === "memberRelationshipToRecipient") {
              updateQuestion();
              label.append(question);
            } else {
              const text = document.createElement("span");
              text.textContent = t(labelKey);
              label.append(text);
            }
            const input = document.createElement(values ? "select" : "input");
            input.className = `manual-family-${key}`;
            input.required = true;
            if (values) {
              for (const value of ["", ...values]) {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value
                  ? t(
                      `${key === "memberRelationshipToRecipient" ? "certificate_member_relationship_" : "certificate_relationship_"}${value.replaceAll("-", "_")}`,
                    )
                  : t("select_option");
                input.append(option);
              }
            } else {
              input.type = "text";
              input.maxLength = key === "fullName" ? 160 : 80;
            }
            input.value = family[key] || "";
            input.addEventListener(values ? "change" : "input", () => {
              family[key] = input.value;
              changed();
              updateQuestion();
              if (key === "relationship") render();
            });
            label.append(input);
            row.append(label);
            controls.push(input);
          };
          field("fullName", "certificate_family_full_name");
          field(
            "memberRelationshipToRecipient",
            null,
            familyOptions.wordings.map((option) => option.key),
          );
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "manual-family-remove admin-work-zone-button";
          remove.textContent = t("certificate_remove_family_member");
          remove.addEventListener("click", () => {
            draft.familyMembers.splice(index, 1);
            changed();
            render();
          });
          controls.push(remove);
          const download = document.createElement("button");
          download.type = "button";
          download.className = "manual-family-download admin-work-zone-button";
          download.textContent = t("certificate_family_download");
          download.addEventListener("click", () =>
            generate(true, "family", index),
          );
          const actions = document.createElement("div");
          actions.className = "certificate-document-actions";
          actions.style.gridColumn = "1 / -1";
          actions.append(remove);
          if (!requestMode) actions.append(download);
          row.append(actions);
          controls.push(download);
          families.append(row);
        });
        const add = document.createElement("button");
        add.type = "button";
        add.className = "manual-family-add admin-work-zone-button";
        add.textContent = t("certificate_add_family_member");
        add.dataset.requiresFamilyOptions = "true";
        add.addEventListener("click", () => {
          expanded = true;
          draft.familyMembers.push({
            fullName: "",
            memberRelationshipToRecipient: "",
          });
          changed();
          render();
        });
        families.append(add);
        controls.push(add);
        form.append(families);
      }
      if (requestMode) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "trusted-award-group";
        const legend = document.createElement("legend");
        legend.textContent = t("trusted_request_delivery");
        const fields = document.createElement("div");
        fields.className = "trusted-award-fields";
        for (const key of [
          "neededByDate",
          "requesterRelationship",
          "line1",
          "line2",
          "city",
          "province",
          "postalCode",
          "country",
          ...(memberRetirement ? ["lastUnit", "tradeRole"] : []),
        ]) {
          const target = key in delivery ? delivery : delivery.mailingAddress;
          const label = document.createElement("label");
          label.className = "trusted-award-field";
          label.textContent = t(`trusted_request_${key}`);
          if (key === "neededByDate" && window.CMCENDateTimePicker?.create) {
            const picker = window.CMCENDateTimePicker.create({
              name: key,
              dateName: key,
              date: target[key],
              includeTime: false,
              label: t(`trusted_request_${key}`),
              placeholder: t(`trusted_request_${key}`),
              clearLabel: t("timers_picker_clear"),
              doneLabel: t("timers_picker_done"),
              onInput: ({ date }) => {
                if (disposed) return;
                if (busy || requestSnapshot) {
                  picker.setValue({ date: target[key] });
                  update();
                  return;
                }
                target[key] = date;
                neededByDateInvalid = false;
                changed();
              },
            });
            const trigger = picker.querySelector(".cmcen-date-time-trigger");
            trigger.id = `${memberRetirement ? "retirement" : "trusted"}-request-needed-by`;
            label.htmlFor = trigger.id;
            const error = document.createElement("span");
            error.id = `${trigger.id}-error`;
            error.textContent = t("validation_field_required");
            neededByPicker = {
              trigger,
              error,
              popover: picker.querySelector(".cmcen-date-time-popover"),
            };
            datePickers.add(picker);
            controls.push(trigger);
            label.append(picker, error);
            fields.append(label);
            continue;
          }
          const input = document.createElement("input");
          input.className = `trusted-request-${key}`;
          input.name = key;
          input.type = key === "neededByDate" ? "date" : "text";
          input.required = key !== "line2";
          input.maxLength =
            {
              postalCode: 24,
              requesterRelationship: 80,
              line1: 160,
              line2: 160,
              lastUnit: 200,
              tradeRole: 120,
            }[key] || 100;
          input.value = target[key];
          input.addEventListener("input", () => {
            target[key] = input.value;
            changed();
          });
          controls.push(input);
          label.append(input);
          fields.append(label);
        }
        if (memberRetirement) {
          const label = document.createElement("label");
          label.className = "trusted-award-field";
          label.textContent = t("trusted_request_dwdParadeRequested");
          const select = document.createElement("select");
          select.className = "trusted-request-dwdParadeRequested";
          for (const value of ["false", "true"]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = t(
              value === "true" ? "trusted_request_yes" : "trusted_request_no",
            );
            select.append(option);
          }
          select.value = String(delivery.dwdParadeRequested);
          select.addEventListener("change", () => {
            delivery.dwdParadeRequested = select.value === "true";
            changed();
          });
          controls.push(select);
          label.append(select);
          fields.append(label);
        }
        fieldset.append(legend, fields);
        form.append(fieldset);
      }
      const reviewLabel = document.createElement("label");
      reviewLabel.className = "trusted-award-review-label";
      review = document.createElement("input");
      review.type = "checkbox";
      review.className = "trusted-award-reviewed";
      review.checked = draft.reviewed;
      review.addEventListener("change", () => {
        draft.reviewed = review.checked;
        if (requestMode && !submitted) dirty = true;
      });
      const reviewText = document.createElement("span");
      reviewText.textContent = t("trusted_award_review");
      reviewLabel.append(review, reviewText);
      form.append(reviewLabel);
      controls.push(review);
      const actions = document.createElement("div");
      actions.className = "certificate-document-actions";
      for (const documentKind of !requestMode &&
      memberRetirement &&
      draft.familyMembers.length
        ? ["member", "packet"]
        : ["member"]) {
        const button = document.createElement("button");
        button.type = "button";
        if (requestMode) button.dataset.requestSubmit = "true";
        button.className =
          documentKind === "packet"
            ? "manual-packet-download"
            : "trusted-award-download";
        button.textContent =
          documentKind === "packet"
            ? t("certificate_packet_download")
            : t(
                requestMode
                  ? "trusted_request_submit"
                  : "trusted_award_download",
              );
        button.addEventListener("click", () => generate(true, documentKind));
        button.className += " admin-work-zone-button";
        actions.append(button);
        controls.push(button);
      }
      form.append(actions);
      panel.append(summary, form);
      root.replaceChildren(panel);
      update();
    }
    async function generate(
      download = true,
      documentKind = "member",
      familyIndex,
    ) {
      if (disposed || busy) return;
      if (requestMode) return submitRequest();
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
          `/api/certificate-requests/${memberRetirement ? "retirement" : "trusted-to-serve"}.pdf${window.CMCENUtils.getCertificatePdfQuery(download)}`,
          {
            method: "POST",
            json: true,
            parseJson: false,
            body: {
              ...draft,
              ...(memberRetirement
                ? {
                    documentKind,
                    ...(familyIndex === undefined ? {} : { familyIndex }),
                  }
                : {}),
            },
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
          link.download = window.CMCENUtils.getPdfDownloadFilename(
            response,
            memberRetirement
              ? `retirement-${documentKind}-${draft.releaseDate}.pdf`
              : `trusted-to-serve-${draft.presentationDate}.pdf`,
          );
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => {
            if (urls.delete(url)) URL.revokeObjectURL(url);
          }, 1000);
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
            certificate_wording_required: "trusted_award_data_invalid",
            certificate_data_invalid: "trusted_award_data_invalid",
            certificate_review_required: "trusted_award_review_required",
            certificate_text_overflow: "trusted_award_overflow",
          }[code] || "trusted_award_error";
      } finally {
        if (!disposed) {
          busy = false;
          update();
        }
      }
    }
    async function submitRequest() {
      if (submitted) return;
      if (!draft.reviewed) {
        message = "trusted_award_review_required";
        update();
        return;
      }
      const form = root.querySelector("form");
      if (!requestSnapshot && form.reportValidity && !form.reportValidity())
        return;
      if (!requestSnapshot && neededByPicker && !delivery.neededByDate) {
        neededByDateInvalid = true;
        message = "validation_field_required";
        update();
        neededByPicker.trigger.focus();
        return;
      }
      if (!requestSnapshot) {
        requestId ||= window.crypto.randomUUID();
        requestSnapshot = JSON.parse(
          JSON.stringify({
            [memberRetirement ? "retirement" : "award"]: draft,
            ...delivery,
            requestId,
          }),
        );
      }
      busy = true;
      message = "trusted_request_generating";
      update();
      try {
        const result = await api(
          `/api/certificate-requests/${memberRetirement ? "retirement" : "trusted-to-serve"}`,
          {
            method: "POST",
            json: true,
            body: requestSnapshot,
            timeoutMs: null,
            signal: lifecycle.signal,
          },
        );
        if (disposed) return;
        if (
          !result?.certificateRequest?.id ||
          !result.certificateRequest.status
        )
          throw new Error("Invalid request response");
        submitted = true;
        dirty = false;
        requestSnapshot = undefined;
        message = "trusted_request_success";
        // Queue refresh failures must not turn a confirmed submission into a retry.
        Promise.resolve()
          .then(() => onSubmitted?.(result.certificateRequest))
          .catch(() => {});
      } catch (error) {
        if (disposed) return;
        if (error.status === 403) {
          onDenied?.();
          return;
        }
        if (error.status === 401) {
          message = "trusted_request_session_expired";
          return;
        }
        let code = error.data?.code;
        try {
          if (error.data?.json) code = (await error.data.json())?.code;
        } catch {
          /* Keep the retry snapshot on uncertain outcomes. */
        }
        if ([400, 422].includes(error.status)) requestSnapshot = undefined;
        message =
          {
            award_data_invalid: "trusted_award_data_invalid",
            award_wording_required: "trusted_award_wording_required",
            award_review_required: "trusted_award_review_required",
            certificate_request_invalid: "trusted_request_invalid",
            certificate_data_invalid: "trusted_request_invalid",
            certificate_review_required: "trusted_award_review_required",
            certificate_request_profile_required:
              "trusted_request_profile_required",
            certificate_request_profile_incomplete:
              "trusted_request_profile_required",
            certificate_request_conflict: "trusted_request_conflict",
            certificate_request_idempotency_conflict:
              "trusted_request_conflict",
          }[code] || "trusted_request_error";
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
      hasUnsavedChanges: () => busy || (requestMode && dirty),
      setFamilyOptions(value) {
        familyOptions = value;
        if (memberRetirement) render();
      },
      dispose() {
        disposed = true;
        dirty = false;
        busy = false;
        requestSnapshot = undefined;
        lifecycle.abort();
        for (const picker of datePickers) picker.destroy();
        datePickers.clear();
        neededByPicker = undefined;
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
        draft = {};
        controls = [];
        root.replaceChildren();
      },
    };
  }
  window.TrustedToServe = { mount };
  window.TrustedToServeRequest = {
    mount: (options) =>
      mount({ ...options, requestMode: true, memberRetirement: false }),
  };
  window.RetirementCertificateRequest = {
    mount: (options) =>
      mount({ ...options, requestMode: true, memberRetirement: true }),
  };
  window.ManualRetirementCertificate = {
    mount: (options) => mount({ ...options, memberRetirement: true }),
  };
})();
