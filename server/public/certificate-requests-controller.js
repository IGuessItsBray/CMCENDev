"use strict";
(() => {
  function mount({
    api,
    onDenied,
    permissions = {},
    showRequestForm = true,
    showSubmittedRequests = true,
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
    const documentUrls = new Set();
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
    const manualRoot = document.createElement("section");
    const requestRoot = document.createElement("section");
    root.replaceChildren(requestRoot, toolbar, list, manualRoot, awardRoot);
    const requestController =
      showRequestForm && permissions.canSubmitCertificateRequests === true
        ? window.TrustedToServeRequest?.mount({
            root: requestRoot,
            api,
            onDenied: () => {
              requestController?.dispose();
              requestRoot.textContent = translate(
                "trusted_request_access_denied",
              );
            },
            onSubmitted: () => load(),
          })
        : null;
    const manualController = window.ManualRetirementCertificate?.mount({
      root: manualRoot,
      api,
      onDenied,
    });
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

    function familyRelationshipLabel(family, memberName) {
      if (family.memberRelationshipToRecipient)
        return `${translate("certificate_member_relationship_question", {
          member: memberName || translate("certificate_retiring_member"),
          recipient:
            family.fullName || translate("certificate_family_member_generic"),
        })} ${translate(`certificate_member_relationship_${family.memberRelationshipToRecipient.replaceAll("-", "_")}`)}`;
      return family.relationship === "other"
        ? family.relationshipOther || "—"
        : getCertificateRelationshipLabel(family.relationship);
    }
    function createFamilyMemberList(familyMembers = [], memberName) {
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
        const relationship = familyRelationshipLabel(familyMember, memberName);

        item.textContent = `${familyMember.fullName || "—"} — ${relationship}`;
        list.append(item);
      });

      return list;
    }

    function requestName(request) {
      return (
        request.member?.fullName ||
        [request.trustedToServe?.firstName, request.trustedToServe?.lastName]
          .filter(Boolean)
          .join(" ") ||
        translate("certificate_request_untitled")
      );
    }
    function certificateCount(request) {
      return Number.isInteger(request.certificateCount) &&
        request.certificateCount > 0
        ? request.certificateCount
        : 1 +
            (request.certificateType === "retirement"
              ? request.familyMembers?.length || 0
              : 0);
    }
    function fulfillmentChecked(request, field) {
      return field === "mailed"
        ? request.status === "mailed"
        : ["ready_to_mail", "printed", "mailed"].includes(request.status);
    }
    function createFulfillmentCheckbox(request, field) {
      const label = document.createElement("label");
      label.className = "certificate-fulfillment-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = fulfillmentChecked(request, field);
      const description = document.createElement("span");
      description.textContent = translate(`certificate_fulfillment_${field}`);
      input.setAttribute(
        "aria-label",
        `${description.textContent}: ${requestName(request)}`,
      );
      input.dataset.fulfillmentField = field;
      input.dataset.requestId = request._id;
      input.dataset.unavailable = String(
        field === "printed"
          ? request.status === "mailed"
          : !fulfillmentChecked(request, "printed"),
      );
      const unavailableKey =
        field === "printed"
          ? "certificate_fulfillment_unmail_first"
          : "certificate_fulfillment_print_first";
      if (input.dataset.unavailable === "true") {
        const reason = document.createElement("span");
        reason.className = "certificate-fulfillment-reason";
        reason.id = `certificate-fulfillment-${field}-${request._id}`;
        reason.textContent = translate(unavailableKey);
        input.setAttribute("aria-describedby", reason.id);
        description.append(reason);
      }
      input.addEventListener("change", () => {
        const checked = input.checked;
        input.checked = fulfillmentChecked(request, field);
        if (input.dataset.unavailable !== "true") {
          return changeFulfillment(request, field, checked);
        }
      });
      label.append(input, description);
      return label;
    }
    function focusToggle(request, field) {
      const controls = Array.from(list.querySelectorAll("input")).filter(
        (input) => input.dataset.requestId === request._id && !input.disabled,
      );
      (
        controls.find((input) => input.dataset.fulfillmentField === field) ||
        controls[0] ||
        refresh
      ).focus();
    }
    async function changeFulfillment(request, field, checked) {
      if (
        disposed ||
        busy ||
        confirming ||
        loading ||
        loadFailed ||
        !requests.includes(request) ||
        checked === fulfillmentChecked(request, field)
      )
        return;
      const direction = checked ? "set" : "clear";
      const key = `certificate_fulfillment_${direction}_${field}`;
      confirming = true;
      update();
      let accepted;
      try {
        accepted = await CMCENModal.confirm(
          translate(`${key}_confirm`, {
            name: requestName(request),
            count: certificateCount(request),
          }),
          { title: translate(key), confirmText: translate(key) },
        );
      } finally {
        confirming = false;
        if (!disposed) update();
      }
      if (disposed) return;
      if (!accepted) {
        focusToggle(request, field);
        return;
      }
      busy = true;
      messageKey = "certificate_fulfillment_saving";
      update();
      try {
        const result = await api(
          `/api/certificate-requests/${encodeURIComponent(request._id)}/fulfillment`,
          {
            method: "PATCH",
            body: {
              field,
              checked,
              expectedStatus: request.status,
              expectedRevision: request.fulfillmentRevision ?? 0,
            },
            signal: lifecycle.signal,
          },
        );
        if (disposed) return;
        const saved = result?.certificateRequest;
        if (
          saved?.id !== request._id ||
          !["pending", "ready_to_mail", "printed", "mailed"].includes(
            saved?.status,
          ) ||
          !Number.isInteger(saved?.fulfillmentRevision)
        )
          throw new Error("Invalid certificate fulfillment response");
        Object.assign(request, saved);
        messageKey = "certificate_fulfillment_saved";
      } catch (error) {
        if (disposed) return;
        if (error.status === 403 || error.status === 401) {
          onDenied();
          return;
        }
        messageKey =
          error.status === 409
            ? "certificate_fulfillment_stale"
            : "certificate_fulfillment_save_error";
        await load();
      } finally {
        if (!disposed) {
          busy = false;
          render();
          focusToggle(request, field);
        }
      }
    }
    async function memberDocument(request, correctFamilyDate = false) {
      if (
        disposed ||
        busy ||
        confirming ||
        loading ||
        loadFailed ||
        !requests.includes(request) ||
        !["retirement", "trusted_to_serve"].includes(request.certificateType)
      )
        return;
      const trusted = request.certificateType === "trusted_to_serve";
      const family = !trusted && request.familyMembers?.length > 0;
      const kind = trusted ? "member" : "packet";
      let certificateDate;
      if (correctFamilyDate && !family) return;
      if (
        family &&
        request.familyMembers.some(
          (recipient) =>
            !familyWordingOptions.some(
              (item) => item.key === recipient.memberRelationshipToRecipient,
            ),
        )
      ) {
        messageKey = "certificate_family_wording_required";
        update();
        return;
      }
      if (trusted || correctFamilyDate) {
        confirming = true;
        update();
        let reviewed;
        try {
          if (trusted) {
            const award = request.trustedToServe || {};
            reviewed = await CMCENModal.confirm(
              translate("certificate_fulfillment_award_review", {
                name: requestName(request),
                rank: award.fullRankEn || "—",
                role: translate(
                  `trusted_award_role_${award.awardRole === "instructor" ? "instructor" : "student"}`,
                ),
                wording: ["elle", "il"].includes(award.frPronoun)
                  ? translate(`trusted_award_${award.frPronoun}`)
                  : "—",
                date: formatCertificateRequestDate(award.presentationDate),
              }),
              {
                title: translate("certificate_fulfillment_download"),
                confirmText: translate("certificate_fulfillment_download"),
              },
            );
          } else {
            const language = getCertificateRequestsLocale().startsWith("fr")
              ? "fr"
              : "en";
            const wording = request.familyMembers
              .map((recipient) => {
                const variant = familyWordingOptions.find(
                  (item) =>
                    item.key === recipient.memberRelationshipToRecipient,
                );
                return `${recipient.fullName}: ${variant[language]}`;
              })
              .join("; ");
            reviewed = await CMCENModal.form(
              translate("certificate_fulfillment_packet_date_correction", {
                name: requestName(request),
                wording,
              }),
              {
                title: translate("certificate_fulfillment_correct_family_date"),
                confirmText: translate("certificate_fulfillment_download"),
                fields: [
                  {
                    name: "certificateDate",
                    type: "date",
                    required: true,
                    label: translate("certificate_family_date"),
                    defaultValue: String(
                      request.member?.dwdDate ??
                        request.member?.releaseDate ??
                        "",
                    ).slice(0, 10),
                  },
                ],
              },
            );
            certificateDate = reviewed?.certificateDate;
          }
        } finally {
          confirming = false;
          if (!disposed) update();
        }
        if (!reviewed || disposed || (correctFamilyDate && !certificateDate))
          return;
      }
      busy = true;
      messageKey =
        kind === "member"
          ? "certificate_member_generating"
          : "certificate_document_generating";
      update();
      try {
        const suffix = trusted ? "trusted-to-serve.pdf" : "packet.pdf";
        const response = await api(
          `/api/certificate-requests/${encodeURIComponent(request._id)}/${suffix}${window.CMCENUtils.getCertificatePdfQuery(true)}`,
          {
            parseJson: false,
            ...(trusted
              ? { method: "POST", json: true, body: { reviewed: true } }
              : {
                  method: "POST",
                  json: true,
                  body: correctFamilyDate ? { certificateDate } : {},
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
        {
          const link = document.createElement("a");
          link.href = url;
          link.download = window.CMCENUtils.getPdfDownloadFilename(
            response,
            `${trusted ? "trusted-to-serve" : "retirement-packet"}-${request._id.replace(/[^a-f0-9]/gi, "")}.pdf`,
          );
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => {
            if (documentUrls.delete(url)) URL.revokeObjectURL(url);
          }, 1000);
        }
        messageKey = trusted
          ? "trusted_request_generated"
          : kind === "member"
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
          update();
        }
      }
    }
    function update() {
      toolbar.hidden = !showSubmittedRequests && !loadFailed;
      list.hidden = !showSubmittedRequests;
      status.textContent = translate(
        loading
          ? "certificate_requests_loading"
          : loadFailed
            ? "certificate_requests_load_error"
            : messageKey || "admin_next_certificates_queue",
      );
      status.dataset.tone =
        loadFailed ||
        [
          "certificate_fulfillment_stale",
          "certificate_fulfillment_save_error",
          "certificate_member_fonts_unavailable",
          "certificate_family_wording_required",
          "certificate_member_data_invalid",
          "certificate_member_document_error",
        ].includes(messageKey)
          ? "error"
          : "";
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
        input.disabled =
          loading ||
          busy ||
          confirming ||
          loadFailed ||
          input.dataset.unavailable === "true";
    }
    function render() {
      if (disposed) return;
      list.replaceChildren();
      if (showSubmittedRequests && !loading && !loadFailed) {
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
        const data = await api(
          `/api/certificate-requests?status=${showSubmittedRequests ? "all" : "actionable"}`,
          {
            signal: lifecycle.signal,
          },
        );
        if (disposed) return;
        if (!Array.isArray(data.certificateRequests))
          throw new Error("Invalid worklist");
        requests = data.certificateRequests;
        familyWordingOptions = Array.isArray(data.familyWordingOptions)
          ? data.familyWordingOptions
          : [];
        manualController?.setFamilyOptions({
          relationships: data.familyRelationshipOptions || [],
          wordings: familyWordingOptions,
        });
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
    function createCertificateRequestCard(certificateRequest) {
      const trusted = certificateRequest.certificateType === "trusted_to_serve";
      const member = certificateRequest.member || {};
      const mailingAddress = certificateRequest.mailingAddress || {};
      const requester = certificateRequest.requester || {};
      const card = document.createElement("article");
      card.className = "certificate-request-card certificate-fulfillment-card";

      const header = document.createElement("header");
      header.className = "certificate-fulfillment-row";

      const titleGroup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = requestName(certificateRequest);
      const summary = document.createElement("span");
      summary.textContent = getCertificateTypeLabel(
        certificateRequest.certificateType,
      );
      titleGroup.append(title, summary);
      const count = document.createElement("span");
      const number = certificateCount(certificateRequest);
      count.className = "certificate-fulfillment-count";
      count.textContent = translate(
        number === 1
          ? "certificate_fulfillment_count_one"
          : "certificate_fulfillment_count_many",
        { count: number },
      );

      const download = document.createElement("button");
      download.type = "button";
      download.className = "certificate-packet-download";
      download.textContent = translate("certificate_fulfillment_download");
      download.setAttribute(
        "aria-label",
        `${download.textContent}: ${requestName(certificateRequest)}`,
      );
      download.dataset.actionable = String(
        ["retirement", "trusted_to_serve"].includes(
          certificateRequest.certificateType,
        ),
      );
      download.addEventListener("click", () =>
        memberDocument(certificateRequest),
      );
      header.append(
        titleGroup,
        count,
        createFulfillmentCheckbox(certificateRequest, "printed"),
        createFulfillmentCheckbox(certificateRequest, "mailed"),
        download,
      );
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
          "certificate_dwd_date",
          formatCertificateRequestDate(member.dwdDate),
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

      if (trusted) {
        const award = certificateRequest.trustedToServe || {};
        requestDetails.replaceChildren(
          createCertificateRequestDetail(
            "trusted_award_awardRole",
            translate(
              `trusted_award_role_${award.awardRole === "instructor" ? "instructor" : "student"}`,
            ),
          ),
          createCertificateRequestDetail(
            "certificate_request_rank",
            award.fullRankEn,
          ),
          createCertificateRequestDetail(
            "trusted_award_postNominals",
            award.postNominals,
          ),
          createCertificateRequestDetail(
            "trusted_award_frPronoun",
            ["il", "elle"].includes(award.frPronoun)
              ? translate(`trusted_award_${award.frPronoun}`)
              : "—",
          ),
        );
        dates.replaceChildren(
          createCertificateRequestDetail(
            "trusted_award_presentationDate",
            formatCertificateRequestDate(award.presentationDate),
          ),
          createCertificateRequestDetail(
            "certificate_needed_by_date",
            formatCertificateRequestDate(member.neededByDate),
          ),
        );
      }

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
        ...(trusted
          ? []
          : [
              createCertificateRequestSection(
                "certificate_family_heading",
                createFamilyMemberList(
                  certificateRequest.familyMembers,
                  member.fullName,
                ),
              ),
            ]),
        createCertificateRequestSection("certificate_address_heading", address),
        createCertificateRequestSection(
          "certificate_request_requester_details",
          requesterDetails,
        ),
      );

      const details = document.createElement("details");
      details.className = "certificate-fulfillment-details";
      const detailsLabel = document.createElement("summary");
      detailsLabel.textContent = translate("certificate_fulfillment_details");
      detailsLabel.setAttribute(
        "aria-label",
        `${detailsLabel.textContent}: ${requestName(certificateRequest)}`,
      );
      details.append(detailsLabel, sections);
      if (
        certificateRequest.certificateType === "retirement" &&
        certificateRequest.familyMembers?.length
      ) {
        const correct = document.createElement("button");
        correct.type = "button";
        correct.className = "certificate-fulfillment-correct-date";
        correct.textContent = translate(
          "certificate_fulfillment_correct_family_date",
        );
        correct.setAttribute(
          "aria-label",
          `${correct.textContent}: ${requestName(certificateRequest)}`,
        );
        correct.dataset.actionable = "true";
        correct.addEventListener("click", () =>
          memberDocument(certificateRequest, true),
        );
        details.append(correct);
      }
      card.append(header, details);
      return card;
    }

    document.addEventListener("languagechange", render, {
      signal: lifecycle.signal,
    });
    const ready = load();
    return {
      ready,
      reload: load,
      canNavigate: () =>
        !busy &&
        !confirming &&
        requestController?.canNavigate() !== false &&
        awardController?.canNavigate() !== false &&
        manualController?.canNavigate() !== false,
      hasUnsavedChanges: () =>
        busy ||
        confirming ||
        requestController?.hasUnsavedChanges() === true ||
        awardController?.hasUnsavedChanges() === true ||
        manualController?.hasUnsavedChanges() === true,
      dispose() {
        disposed = true;
        lifecycle.abort();
        requestController?.dispose();
        awardController?.dispose();
        manualController?.dispose();
        for (const url of documentUrls) URL.revokeObjectURL(url);
        documentUrls.clear();
        requests = [];
        root.replaceChildren();
      },
    };
  }
  window.CertificateRequests = { mount };
})();
