"use strict";
(() => {
  function mount({
    api,
    onDenied,
    root = document.getElementById("adminCertificatesBody"),
  }) {
    const translate = (key, values) => window.translate(key, values);
    const CMCENUtils = window.CMCENUtils;
    const CMCENModal = window.CMCENModal;
    const lifecycle = new AbortController();
    let disposed = false,
      loading = false,
      busy = false,
      confirming = false;
    let requests = [],
      loadFailed = false,
      messageKey = "";
    let preview = null;
    const documentUrls = new Set();
    const familyReviews = new Map();
    const datePickers = new Set();
    let familyWordingOptions = [];
    const toolbar = document.createElement("div");
    toolbar.className = "certificate-requests-toolbar";
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.addEventListener(
      "click",
      () => {
        if (!busy && !confirming) return load();
      },
      { signal: lifecycle.signal },
    );
    toolbar.append(status, refresh);
    const list = document.createElement("div");
    list.className = "certificate-requests-list";
    const awardRoot = document.createElement("section");
    root.replaceChildren(toolbar, awardRoot, list);
    const awardController = window.TrustedToServe?.mount({
      root: awardRoot,
      api,
      onDenied,
    });
    function getCertificateRequestsLocale() {
      return CMCENUtils.getCurrentLocale();
    }

    function formatCertificateRequestDate(value) {
      if (!value) {
        return "—";
      }

      return CMCENUtils.formatDate(value, {
        locale: getCertificateRequestsLocale(),
        dateStyle: "medium",
        // Preserve the calendar date encoded by the server's UTC date-only parser.
        timeZone: "UTC",
      });
    }

    function getCertificateTypeLabel(certificateType) {
      const key = `certificate_type_${String(certificateType || "")
        .replace(/[^a-z0-9]+/gi, "_")
        .toLowerCase()}`;
      const translated = translate(key);

      return translated === key
        ? CMCENUtils.formatTitleCaseValue(certificateType, "—")
        : translated;
    }

    function getCertificateRelationshipLabel(relationship) {
      const key = `certificate_relationship_${String(relationship || "").replace(/-/g, "_")}`;
      const translated = translate(key);

      return translated === key
        ? CMCENUtils.formatTitleCaseValue(relationship, "—")
        : translated;
    }

    function createCertificateRequestDetail(labelKey, value) {
      const detail = document.createElement("div");
      detail.className = "certificate-request-detail";

      const label = document.createElement("span");
      label.textContent = translate(labelKey);

      const detailValue = document.createElement("strong");
      detailValue.textContent = value || "—";

      detail.append(label, detailValue);
      return detail;
    }

    function createCertificateRequestSection(titleKey, content) {
      const section = document.createElement("section");
      section.className = "certificate-request-card-section";

      const title = document.createElement("h3");
      title.textContent = translate(titleKey);

      section.append(title, content);
      return section;
    }

    function createFamilyMemberList(familyMembers = []) {
      if (!familyMembers.length) {
        const empty = document.createElement("p");
        empty.className = "certificate-request-empty-value";
        empty.textContent = translate("certificate_request_no_family_members");
        return empty;
      }

      const list = document.createElement("ul");
      list.className = "certificate-request-family-list";

      familyMembers.forEach((familyMember) => {
        const item = document.createElement("li");
        const relationship =
          familyMember.relationship === "other" &&
          familyMember.relationshipOther
            ? familyMember.relationshipOther
            : getCertificateRelationshipLabel(familyMember.relationship);

        item.textContent = `${familyMember.fullName || "—"} — ${relationship}`;
        list.append(item);
      });

      return list;
    }

    function getCertificateRequestStatusKey(status) {
      if (status === "mailed") {
        return "certificate_request_mailed";
      }

      if (status === "ready_to_mail" || status === "printed") {
        return "certificate_request_ready_to_mail";
      }

      return "certificate_request_pending";
    }

    function getCertificatePrintItems(certificateRequest) {
      const member = certificateRequest.member || {};
      const familyMembers = Array.isArray(certificateRequest.familyMembers)
        ? certificateRequest.familyMembers
        : [];

      return [
        {
          value: "member",
          label: translate("certificate_requests_member_certificate", {
            name: member.fullName || translate("certificate_request_untitled"),
          }),
        },
        ...familyMembers.map((familyMember, index) => {
          const relationship =
            familyMember.relationship === "other" &&
            familyMember.relationshipOther
              ? familyMember.relationshipOther
              : getCertificateRelationshipLabel(familyMember.relationship);

          return {
            value: `family:${index}`,
            label: translate("certificate_requests_family_certificate", {
              name: familyMember.fullName || "—",
              relationship,
            }),
          };
        }),
      ];
    }

    function createCertificateRequestAction(request) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "certificate-request-print-button";
      const readyToMail = ["ready_to_mail", "printed"].includes(request.status);
      action.textContent = translate(
        readyToMail
          ? "certificate_requests_mark_mailed"
          : "certificate_requests_mark_printed",
      );
      action.disabled = !readyToMail && request.status !== "pending";
      action.dataset.actionable = String(
        readyToMail || request.status === "pending",
      );
      action.addEventListener("click", () => advance(request));
      return action;
    }
    function createMemberDocumentAction(request, download) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = download
        ? "certificate-member-download"
        : "certificate-member-preview-button";
      button.textContent = translate(
        download ? "certificate_member_download" : "certificate_member_preview",
      );
      button.dataset.actionable = String(
        request.certificateType === "retirement",
      );
      button.addEventListener("click", () => memberDocument(request, download));
      return button;
    }
    function familyReview(request) {
      const signature = JSON.stringify([
        request.member?.fullName,
        request.member?.releaseDate,
        request.familyMembers,
      ]);
      let review = familyReviews.get(request._id);
      if (!review || review.signature !== signature) {
        if (review) invalidatePreview(request);
        review = {
          signature,
          certificateDate: String(request.member?.releaseDate || "").slice(
            0,
            10,
          ),
        };
        familyReviews.set(request._id, review);
      }
      return review;
    }
    function invalidatePreview(request) {
      if (preview?.requestId === request._id) {
        if (documentUrls.delete(preview.url)) URL.revokeObjectURL(preview.url);
        preview = null;
      }
    }
    function familyDocumentAction(request, download, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        index === undefined
          ? download
            ? "certificate-packet-download"
            : "certificate-packet-preview"
          : download
            ? "certificate-family-download"
            : "certificate-family-preview";
      button.textContent = translate(
        index === undefined
          ? download
            ? "certificate_packet_download"
            : "certificate_packet_preview"
          : download
            ? "certificate_family_download"
            : "certificate_family_preview",
      );
      button.dataset.actionable = String(
        request.certificateType === "retirement",
      );
      button.addEventListener("click", () =>
        memberDocument(
          request,
          download,
          index === undefined ? "packet" : "family",
          index,
        ),
      );
      return button;
    }
    function createFamilyDocumentControls(request) {
      const container = document.createElement("fieldset");
      container.className = "certificate-family-documents";
      const legend = document.createElement("legend");
      legend.textContent = translate("certificate_family_documents");
      const hint = document.createElement("p");
      hint.textContent = translate("certificate_family_wording_hint");
      container.append(legend, hint);
      const review = familyReview(request);
      const dateLabel = document.createElement("label");
      dateLabel.textContent = translate("certificate_family_date");
      const date = document.createElement("input");
      date.type = "date";
      date.className = "certificate-family-date";
      date.value = review.certificateDate;
      date.addEventListener("change", () => {
        review.certificateDate = date.value;
        invalidatePreview(request);
        render();
      });
      if (window.CMCENDateTimePicker?.create) {
        const picker = window.CMCENDateTimePicker.create({
          name: `certificateDate-${request._id}`,
          date: review.certificateDate,
          includeTime: false,
          label: translate("certificate_family_date"),
          clearLabel: translate("timers_picker_clear"),
          doneLabel: translate("timers_picker_done"),
          onInput: ({ date: value }) => {
            review.certificateDate = value;
            invalidatePreview(request);
            render();
          },
        });
        picker.querySelectorAll("button").forEach((button) => {
          button.dataset.actionable = "true";
        });
        datePickers.add(picker);
        dateLabel.append(picker);
      } else dateLabel.append(date);
      container.append(dateLabel);
      (request.familyMembers || []).forEach((family, index) => {
        const row = document.createElement("div");
        row.className = "certificate-family-document-row";
        const recipient = document.createElement("strong");
        recipient.textContent = `${family.fullName || "—"} — ${family.relationship === "other" ? family.relationshipOther || "—" : getCertificateRelationshipLabel(family.relationship)}`;
        const label = document.createElement("p");
        label.className = "certificate-family-saved-wording";
        const language = getCertificateRequestsLocale().startsWith("fr")
          ? "fr"
          : "en";
        const variant = familyWordingOptions.find(
          (item) => item.key === family.memberRelationshipToRecipient,
        );
        label.textContent = variant
          ? translate("certificate_family_saved_wording", {
              wording: variant[language],
            })
          : translate("certificate_family_wording_required");
        row.append(
          recipient,
          label,
          familyDocumentAction(request, false, index),
          familyDocumentAction(request, true, index),
        );
        container.append(row);
      });
      const actions = document.createElement("div");
      actions.className = "certificate-document-actions";
      actions.append(
        familyDocumentAction(request, false),
        familyDocumentAction(request, true),
      );
      container.append(actions);
      return container;
    }
    async function memberDocument(
      request,
      download,
      kind = "member",
      familyIndex,
    ) {
      if (
        disposed ||
        busy ||
        confirming ||
        loading ||
        loadFailed ||
        !requests.includes(request) ||
        request.certificateType !== "retirement"
      )
        return;
      const review = familyReview(request);
      if (
        kind !== "member" &&
        (kind === "family"
          ? !familyWordingOptions.some(
              (item) =>
                item.key ===
                request.familyMembers[familyIndex]
                  ?.memberRelationshipToRecipient,
            )
          : request.familyMembers.some(
              (family) =>
                !familyWordingOptions.some(
                  (item) => item.key === family.memberRelationshipToRecipient,
                ),
            ))
      ) {
        messageKey = "certificate_family_wording_required";
        update();
        return;
      }
      busy = true;
      messageKey =
        kind === "member"
          ? "certificate_member_generating"
          : "certificate_document_generating";
      update();
      try {
        const suffix =
          kind === "family" ? `family/${familyIndex}.pdf` : `${kind}.pdf`;
        const response = await api(
          `/api/certificate-requests/${encodeURIComponent(request._id)}/${suffix}${download ? "?download=1" : ""}`,
          {
            parseJson: false,
            ...(kind === "member"
              ? {}
              : {
                  method: "POST",
                  json: true,
                  body: {
                    certificateDate: review.certificateDate,
                  },
                }),
            timeoutMs: null,
            signal: lifecycle.signal,
          },
        );
        const blob = await response.blob();
        if (disposed) return;
        if (blob.type !== "application/pdf")
          throw new Error("Invalid certificate response");
        const url = URL.createObjectURL(blob);
        documentUrls.add(url);
        if (download) {
          const link = document.createElement("a");
          link.href = url;
          link.download = `retirement-${kind}${kind === "family" ? `-${familyIndex}` : ""}-${request._id.replace(/[^a-f0-9]/gi, "")}.pdf`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => {
            if (documentUrls.delete(url)) URL.revokeObjectURL(url);
          }, 1000);
        } else {
          if (preview && documentUrls.delete(preview.url))
            URL.revokeObjectURL(preview.url);
          preview = { requestId: request._id, url, kind };
        }
        messageKey =
          kind === "member"
            ? "certificate_member_generated"
            : "certificate_document_generated";
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
          /* Use the generic recoverable error. */
        }
        messageKey =
          code === "certificate_fonts_unavailable"
            ? "certificate_member_fonts_unavailable"
            : code === "certificate_wording_required"
              ? "certificate_family_wording_required"
              : code === "certificate_data_invalid"
                ? "certificate_member_data_invalid"
                : "certificate_member_document_error";
      } finally {
        if (!disposed) {
          busy = false;
          render();
        }
      }
    }
    function update() {
      status.textContent = translate(
        loading
          ? "certificate_requests_loading"
          : loadFailed
            ? "certificate_requests_load_error"
            : messageKey || "admin_next_certificates_queue",
      );
      refresh.textContent = translate(
        loadFailed ? "admin_next_retry" : "admin_refresh",
      );
      refresh.disabled = loading || busy || confirming;
      list.setAttribute("aria-busy", String(loading || busy));
      for (const button of list.querySelectorAll("button"))
        button.disabled =
          loading ||
          busy ||
          confirming ||
          loadFailed ||
          button.dataset.actionable !== "true";
      for (const input of [
        ...list.querySelectorAll("input"),
        ...list.querySelectorAll("select"),
      ])
        input.disabled = loading || busy || confirming || loadFailed;
    }
    function render() {
      if (disposed) return;
      for (const picker of datePickers) picker.destroy();
      datePickers.clear();
      list.replaceChildren();
      if (!loading && !loadFailed) {
        for (const request of requests)
          list.append(createCertificateRequestCard(request));
        if (!requests.length) {
          const empty = document.createElement("p");
          empty.className = "certificate-requests-empty";
          empty.textContent = translate("certificate_requests_empty");
          list.append(empty);
        }
      }
      update();
    }
    async function load() {
      if (disposed || loading) return;
      loading = true;
      loadFailed = false;
      render();
      try {
        const data = await api("/api/certificate-requests?status=actionable", {
          signal: lifecycle.signal,
        });
        if (disposed) return;
        if (!Array.isArray(data.certificateRequests))
          throw new Error("Invalid worklist");
        requests = data.certificateRequests;
        for (const request of requests) familyReview(request);
        familyWordingOptions = Array.isArray(data.familyWordingOptions)
          ? data.familyWordingOptions
          : [];
        for (const id of familyReviews.keys())
          if (!requests.some((request) => request._id === id))
            familyReviews.delete(id);
        if (
          preview &&
          !requests.some((request) => request._id === preview.requestId)
        ) {
          if (documentUrls.delete(preview.url))
            URL.revokeObjectURL(preview.url);
          preview = null;
        }
      } catch (error) {
        if (disposed) return;
        requests = [];
        if (error.status === 403) {
          onDenied();
          return;
        }
        loadFailed = true;
      } finally {
        if (!disposed) {
          loading = false;
          render();
        }
      }
    }
    async function advance(request) {
      if (
        disposed ||
        busy ||
        confirming ||
        loading ||
        loadFailed ||
        !requests.includes(request)
      )
        return;
      const mailing = ["ready_to_mail", "printed"].includes(request.status);
      if (!mailing && request.status !== "pending") return;
      confirming = true;
      update();
      let body;
      try {
        const name =
          request.member?.fullName || translate("certificate_request_untitled");
        if (mailing) {
          const confirmed = await CMCENModal.confirm(
            translate("certificate_requests_mark_mailed_confirm", { name }),
            {
              title: translate("certificate_requests_mark_mailed"),
              confirmText: translate("certificate_requests_mark_mailed"),
            },
          );
          if (confirmed) body = { status: "mailed" };
        } else {
          const checklist = getCertificatePrintItems(request);
          const printedCertificateKeys = await CMCENModal.confirmChecklist(
            translate("certificate_requests_print_checklist_intro", { name }),
            {
              title: translate("certificate_requests_mark_printed"),
              checklistLabel: translate(
                "certificate_requests_print_checklist_label",
              ),
              checklist,
              confirmText: translate("certificate_requests_confirm_printing"),
            },
          );
          if (Array.isArray(printedCertificateKeys)) {
            const keys = new Set(printedCertificateKeys);
            if (
              keys.size === checklist.length &&
              checklist.every((item) => keys.has(item.value))
            )
              body = {
                status: "ready_to_mail",
                printedCertificateKeys: [...keys],
              };
            else messageKey = "admin_next_certificates_incomplete";
          }
        }
      } finally {
        confirming = false;
        if (!disposed) update();
      }
      if (!body || disposed) return;
      busy = true;
      messageKey = "";
      update();
      try {
        await api(
          `/api/certificate-requests/${encodeURIComponent(request._id)}/status`,
          { method: "PATCH", body, signal: lifecycle.signal },
        );
        if (disposed) return;
        messageKey = mailing
          ? "certificate_requests_mail_success"
          : "certificate_requests_print_success";
      } catch (error) {
        if (disposed) return;
        if (error.status === 403) {
          onDenied();
          return;
        }
        messageKey = mailing
          ? "certificate_requests_mail_error"
          : "certificate_requests_print_error";
      } finally {
        // Reconcile after success, conflicts, or uncertain failures before another action.
        if (!disposed) {
          await load();
          busy = false;
          update();
        }
      }
    }
    function createCertificateRequestCard(certificateRequest) {
      const member = certificateRequest.member || {};
      const mailingAddress = certificateRequest.mailingAddress || {};
      const requester = certificateRequest.requester || {};
      const card = document.createElement("article");
      card.className = "certificate-request-card";

      const header = document.createElement("header");
      header.className = "certificate-request-card-header";

      const titleGroup = document.createElement("div");
      const status = document.createElement("span");
      status.className = "certificate-request-status";
      if (["ready_to_mail", "printed"].includes(certificateRequest.status))
        status.className += " is-ready-to-mail";
      status.textContent = translate(
        getCertificateRequestStatusKey(certificateRequest.status),
      );

      const title = document.createElement("h2");
      title.textContent =
        member.fullName || translate("certificate_request_untitled");

      const summary = document.createElement("p");
      summary.textContent = `${getCertificateTypeLabel(certificateRequest.certificateType)} · ${translate("certificate_request_needed_by")} ${formatCertificateRequestDate(member.neededByDate)}`;
      titleGroup.append(status, title, summary);

      header.append(
        titleGroup,
        createCertificateRequestAction(certificateRequest),
      );
      const documentActions = document.createElement("div");
      documentActions.className = "certificate-member-actions";
      documentActions.append(
        createMemberDocumentAction(certificateRequest, false),
        createMemberDocumentAction(certificateRequest, true),
      );
      const scope = document.createElement("p");
      scope.textContent = translate("certificate_member_document_scope");
      documentActions.append(scope);
      if (certificateRequest.familyMembers?.length)
        documentActions.append(
          createFamilyDocumentControls(certificateRequest),
        );
      if (preview?.requestId === certificateRequest._id) {
        const frame = document.createElement("iframe");
        frame.className = "certificate-member-preview";
        frame.title = translate(
          preview.kind === "family"
            ? "certificate_family_preview"
            : preview.kind === "packet"
              ? "certificate_packet_preview"
              : "certificate_member_preview",
        );
        frame.src = preview.url;
        documentActions.append(frame);
      }

      const requestDetails = document.createElement("div");
      requestDetails.className = "certificate-request-details-grid";
      requestDetails.append(
        createCertificateRequestDetail("certificate_request_rank", member.rank),
        createCertificateRequestDetail(
          "certificate_request_trade_role",
          member.tradeRole,
        ),
        createCertificateRequestDetail(
          "certificate_request_rank_language",
          member.rankLanguage === "fr"
            ? translate("language_fr")
            : translate("language_en"),
        ),
        createCertificateRequestDetail(
          "certificate_request_last_unit",
          member.lastUnit,
        ),
        createCertificateRequestDetail(
          "certificate_request_decorations",
          Array.isArray(member.decorations)
            ? member.decorations.join(", ")
            : "",
        ),
        createCertificateRequestDetail(
          "certificate_request_dwd_parade",
          member.dwdParadeRequested
            ? translate("certificate_yes")
            : translate("certificate_no"),
        ),
      );

      const dates = document.createElement("div");
      dates.className = "certificate-request-details-grid";
      dates.append(
        createCertificateRequestDetail(
          "certificate_release_date",
          formatCertificateRequestDate(member.releaseDate),
        ),
        createCertificateRequestDetail(
          "certificate_ce_enrollment_date",
          formatCertificateRequestDate(member.ceBranchEnrollmentDate),
        ),
        createCertificateRequestDetail(
          "certificate_needed_by_date",
          formatCertificateRequestDate(member.neededByDate),
        ),
      );

      const address = document.createElement("address");
      address.className = "certificate-request-address";
      [
        mailingAddress.line1,
        mailingAddress.line2,
        [mailingAddress.city, mailingAddress.province]
          .filter(Boolean)
          .join(", "),
        mailingAddress.postalCode,
        mailingAddress.country,
      ]
        .filter(Boolean)
        .forEach((line) => {
          const lineElement = document.createElement("span");
          lineElement.textContent = line;
          address.append(lineElement);
        });

      const requesterDetails = document.createElement("div");
      requesterDetails.className = "certificate-request-details-grid";
      requesterDetails.append(
        createCertificateRequestDetail(
          "certificate_request_requested_by",
          [requester.firstName, requester.lastName].filter(Boolean).join(" "),
        ),
        createCertificateRequestDetail(
          "certificate_request_requester_relationship",
          requester.relationship,
        ),
        createCertificateRequestDetail(
          "certificate_request_email",
          requester.email,
        ),
        createCertificateRequestDetail(
          "certificate_request_unit",
          requester.unit,
        ),
      );

      const sections = document.createElement("div");
      sections.className = "certificate-request-card-sections";
      sections.append(
        createCertificateRequestSection(
          "certificate_request_member_details",
          requestDetails,
        ),
        createCertificateRequestSection("certificate_dates_heading", dates),
        createCertificateRequestSection(
          "certificate_family_heading",
          createFamilyMemberList(certificateRequest.familyMembers),
        ),
        createCertificateRequestSection("certificate_address_heading", address),
        createCertificateRequestSection(
          "certificate_request_requester_details",
          requesterDetails,
        ),
      );

      card.append(header, documentActions, sections);
      return card;
    }

    document.addEventListener("languagechange", render, {
      signal: lifecycle.signal,
    });
    const ready = load();
    return {
      ready,
      canNavigate: () =>
        !busy && !confirming && awardController?.canNavigate() !== false,
      hasUnsavedChanges: () =>
        busy || confirming || awardController?.hasUnsavedChanges() === true,
      dispose() {
        disposed = true;
        lifecycle.abort();
        awardController?.dispose();
        for (const picker of datePickers) picker.destroy();
        datePickers.clear();
        for (const url of documentUrls) URL.revokeObjectURL(url);
        documentUrls.clear();
        preview = null;
        familyReviews.clear();
        requests = [];
        root.replaceChildren();
      },
    };
  }
  window.CertificateRequests = { mount };
})();
