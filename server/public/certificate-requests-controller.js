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
    root.replaceChildren(toolbar, list);
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
    }
    function render() {
      if (disposed) return;
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
          "certificate_caf_enrollment_date",
          formatCertificateRequestDate(member.cafEnrollmentDate),
        ),
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

      card.append(header, sections);
      return card;
    }

    document.addEventListener("languagechange", render, {
      signal: lifecycle.signal,
    });
    const ready = load();
    return {
      ready,
      canNavigate: () => !busy && !confirming,
      hasUnsavedChanges: () => busy || confirming,
      dispose() {
        disposed = true;
        lifecycle.abort();
        requests = [];
        root.replaceChildren();
      },
    };
  }
  window.CertificateRequests = { mount };
})();
