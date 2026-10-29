"use strict";
(() => {
  function mount({ root, api, onDenied, memberRetirement = false }) {
    const lifecycle = new AbortController(),
      urls = new Set(),
      datePickers = new Set();
    let disposed = false,
      busy = false,
      message = "";
    let draft = memberRetirement
      ? {
          firstName: "",
          lastName: "",
          postNominals: "",
          fullRankEn: "",
          rankLanguage: "",
          ceBranchEnrollmentDate: "",
          releaseDate: "",
          familyMembers: [],
          reviewed: false,
        }
      : {
          firstName: "",
          lastName: "",
          postNominals: "",
          fullRankEn: "",
          rankEn: "",
          rankFr: "",
          presentationDate: "",
          frPronoun: "",
          frRankGrammar: "",
          reviewed: false,
        };
    const t = (key, values) =>
      window.translate(
        memberRetirement && key.startsWith("trusted_award_")
          ? key.replace("trusted_award_", "manual_retirement_")
          : key,
        values,
      );
    let controls = [],
      status;
    let expanded = !memberRetirement;
    let familyOptions = { relationships: [], wordings: [] };
    let refreshFamilyQuestions = [];
    function update() {
      if (disposed) return;
      status.textContent = t(message || "trusted_award_intro");
      status.setAttribute("aria-busy", String(busy));
      for (const control of controls)
        control.disabled =
          busy ||
          (control.dataset.requiresFamilyOptions === "true" &&
            (!familyOptions.relationships.length ||
              draft.familyMembers.length >= 20));
    }
    function render() {
      if (disposed) return;
      for (const picker of datePickers) picker.destroy();
      datePickers.clear();
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
            ]
          : [
              ["rankEn", "text", 40],
              ["rankFr", "text", 40],
              ["presentationDate", "date"],
            ]),
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
        input.required = key !== "postNominals";
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
      for (const rank of window.CMCENRanks.catalogue) {
        const option = document.createElement("option");
        option.value = rank.en;
        option.textContent = memberRetirement
          ? `${rank.en} / ${rank.fr}`
          : rank.en;
        fullRank.append(option);
      }
      fullRank.value = draft.fullRankEn;
      fullRank.addEventListener("change", () => {
        draft.fullRankEn = fullRank.value;
        changed();
      });
      rankLabel.append(fullRank);
      groups.ranks.append(rankLabel);
      controls.push(fullRank);
      for (const [key, values] of memberRetirement
        ? [["rankLanguage", ["en", "fr"]]]
        : [
            ["frPronoun", ["il", "elle"]],
            [
              "frRankGrammar",
              ["masculine", "feminine", "elided", "no_article"],
            ],
          ]) {
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
            "relationship",
            "certificate_relationship_label",
            familyOptions.relationships,
          );
          if (family.relationship === "other")
            field("relationshipOther", "certificate_relationship_other_label");
          field(
            "memberRelationshipToRecipient",
            null,
            familyOptions.wordings.map((option) => option.key),
          );
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "manual-family-remove";
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
          actions.append(remove, download);
          row.append(actions);
          controls.push(download);
          families.append(row);
        });
        const add = document.createElement("button");
        add.type = "button";
        add.className = "manual-family-add";
        add.textContent = t("certificate_add_family_member");
        add.dataset.requiresFamilyOptions = "true";
        add.addEventListener("click", () => {
          expanded = true;
          draft.familyMembers.push({
            fullName: "",
            relationship: "",
            relationshipOther: "",
            memberRelationshipToRecipient: "",
          });
          changed();
          render();
        });
        families.append(add);
        controls.push(add);
        form.append(families);
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
      const actions = document.createElement("div");
      actions.className = "certificate-document-actions";
      for (const documentKind of memberRetirement && draft.familyMembers.length
        ? ["member", "packet"]
        : ["member"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          documentKind === "packet"
            ? "manual-packet-download"
            : "trusted-award-download";
        button.textContent =
          documentKind === "packet"
            ? t("certificate_packet_download")
            : t("trusted_award_download");
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
          `/api/certificate-requests/${memberRetirement ? "retirement" : "trusted-to-serve"}.pdf${download ? "?download=1" : ""}`,
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
          link.download = memberRetirement
            ? `retirement-${documentKind}-${draft.releaseDate}.pdf`
            : `trusted-to-serve-${draft.presentationDate}.pdf`;
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
    document.addEventListener("languagechange", render, {
      signal: lifecycle.signal,
    });
    render();
    return {
      canNavigate: () => !busy,
      hasUnsavedChanges: () => busy,
      setFamilyOptions(value) {
        familyOptions = value;
        if (memberRetirement) render();
      },
      dispose() {
        disposed = true;
        lifecycle.abort();
        for (const picker of datePickers) picker.destroy();
        datePickers.clear();
        for (const url of urls) URL.revokeObjectURL(url);
        urls.clear();
        draft = {};
        controls = [];
        root.replaceChildren();
      },
    };
  }
  window.TrustedToServe = { mount };
  window.ManualRetirementCertificate = {
    mount: (options) => mount({ ...options, memberRetirement: true }),
  };
})();
