const certificateRequestsToken = CMCENUtils.requireAuthToken();
const certificateRequestsStatus = document.getElementById(
  "certificateRequestsStatus",
);
const certificateRequestsList = document.getElementById(
  "certificateRequestsList",
);

let actionableCertificateRequests = [];
let certificateRequestsLoadFailed = false;

function getCertificateRequestsLanguage() {
  return CMCENUtils.getCurrentLanguage();
}

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
  });
}

function getCertificateTypeLabel(certificateType) {
  const key = `certificate_type_${String(certificateType || "").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
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
      familyMember.relationship === "other" && familyMember.relationshipOther
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
        familyMember.relationship === "other" && familyMember.relationshipOther
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

async function updateCertificateRequestStatus(
  button,
  certificateRequest,
  body,
  options,
) {
  button.disabled = true;

  try {
    await certificateRequestsApiJson(
      `/api/certificate-requests/${encodeURIComponent(certificateRequest._id)}/status`,
      {
        method: "PATCH",
        body,
        errorMessage: translate(options.errorKey),
      },
    );
    CMCENUtils.showToast(translate(options.successKey), {
      color: "success",
      position: "bottom-right",
      animation: "slide",
    });
    await loadCertificateRequests();
  } catch (error) {
    button.disabled = false;
    CMCENUtils.showToast(error.message || translate(options.errorKey), {
      color: "error",
      position: "bottom-right",
      animation: "slide",
    });
  }
}

function createCertificateRequestAction(certificateRequest) {
  const member = certificateRequest.member || {};
  const isReadyToMail = ["ready_to_mail", "printed"].includes(
    certificateRequest.status,
  );
  const actionButton = document.createElement("button");
  actionButton.className = "certificate-request-print-button";
  actionButton.type = "button";

  if (isReadyToMail) {
    actionButton.textContent = translate("certificate_requests_mark_mailed");
    actionButton.addEventListener("click", async () => {
      const confirmed = await CMCENModal.confirm(
        translate("certificate_requests_mark_mailed_confirm", {
          name: member.fullName || translate("certificate_request_untitled"),
        }),
        {
          title: translate("certificate_requests_mark_mailed"),
          confirmText: translate("certificate_requests_mark_mailed"),
        },
      );

      if (!confirmed) {
        return;
      }

      await updateCertificateRequestStatus(
        actionButton,
        certificateRequest,
        { status: "mailed" },
        {
          successKey: "certificate_requests_mail_success",
          errorKey: "certificate_requests_mail_error",
        },
      );
    });

    return actionButton;
  }

  actionButton.textContent = translate("certificate_requests_mark_printed");
  actionButton.addEventListener("click", async () => {
    const printedCertificateKeys = await CMCENModal.confirmChecklist(
      translate("certificate_requests_print_checklist_intro", {
        name: member.fullName || translate("certificate_request_untitled"),
      }),
      {
        title: translate("certificate_requests_mark_printed"),
        checklistLabel: translate("certificate_requests_print_checklist_label"),
        checklist: getCertificatePrintItems(certificateRequest),
        confirmText: translate("certificate_requests_confirm_printing"),
      },
    );

    if (!Array.isArray(printedCertificateKeys)) {
      return;
    }

    await updateCertificateRequestStatus(
      actionButton,
      certificateRequest,
      {
        status: "ready_to_mail",
        printedCertificateKeys,
      },
      {
        successKey: "certificate_requests_print_success",
        errorKey: "certificate_requests_print_error",
      },
    );
  });

  return actionButton;
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
  status.classList.toggle(
    "is-ready-to-mail",
    ["ready_to_mail", "printed"].includes(certificateRequest.status),
  );
  status.textContent = translate(
    getCertificateRequestStatusKey(certificateRequest.status),
  );

  const title = document.createElement("h2");
  title.textContent = member.fullName || translate("certificate_request_untitled");

  const summary = document.createElement("p");
  summary.textContent = `${getCertificateTypeLabel(certificateRequest.certificateType)} · ${translate("certificate_request_needed_by")} ${formatCertificateRequestDate(member.neededByDate)}`;
  titleGroup.append(status, title, summary);

  header.append(titleGroup, createCertificateRequestAction(certificateRequest));

  const requestDetails = document.createElement("div");
  requestDetails.className = "certificate-request-details-grid";
  requestDetails.append(
    createCertificateRequestDetail(
      "certificate_request_rank",
      member.rank,
    ),
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
      Array.isArray(member.decorations) ? member.decorations.join(", ") : "",
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
    createCertificateRequestDetail("certificate_request_email", requester.email),
    createCertificateRequestDetail("certificate_request_unit", requester.unit),
  );

  const sections = document.createElement("div");
  sections.className = "certificate-request-card-sections";
  sections.append(
    createCertificateRequestSection("certificate_request_member_details", requestDetails),
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

function renderCertificateRequests() {
  certificateRequestsList.replaceChildren();

  if (certificateRequestsLoadFailed) {
    certificateRequestsList.hidden = true;
    certificateRequestsStatus.className = "certificate-requests-status is-error";
    certificateRequestsStatus.textContent = translate(
      "certificate_requests_load_error",
    );
    return;
  }

  certificateRequestsStatus.hidden = true;
  certificateRequestsStatus.className = "certificate-requests-status";

  if (!actionableCertificateRequests.length) {
    const empty = document.createElement("p");
    empty.className = "certificate-requests-empty";
    empty.textContent = translate("certificate_requests_empty");
    certificateRequestsList.append(empty);
  } else {
    actionableCertificateRequests.forEach((certificateRequest) => {
      certificateRequestsList.append(
        createCertificateRequestCard(certificateRequest),
      );
    });
  }

  certificateRequestsList.hidden = false;
}

function showCertificateRequestsLoading() {
  certificateRequestsList.hidden = true;
  certificateRequestsStatus.className = "certificate-requests-status is-loading";
  certificateRequestsStatus.replaceChildren();

  const spinner = document.createElement("span");
  spinner.className = "loading-state-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "visually-hidden";
  text.textContent = translate("certificate_requests_loading");

  certificateRequestsStatus.setAttribute(
    "aria-label",
    translate("certificate_requests_loading"),
  );
  certificateRequestsStatus.append(spinner, text);
  certificateRequestsStatus.hidden = false;
}

async function certificateRequestsApiJson(path, options = {}) {
  if (!certificateRequestsToken) {
    CMCENUtils.redirectToLogin();
    throw new Error(translate("sign_in_to_continue"));
  }

  try {
    return await CMCENUtils.apiJson(path, {
      ...options,
      token: certificateRequestsToken,
      redirectOnUnauthorized: true,
      unauthorizedMessage: translate("sign_in_to_continue"),
    });
  } catch (error) {
    if (error.status === 403) {
      error.message = translate("certificate_requests_access_denied");
    }

    throw error;
  }
}

async function loadCertificateRequests() {
  showCertificateRequestsLoading();
  certificateRequestsLoadFailed = false;

  try {
    const data = await certificateRequestsApiJson(
      "/api/certificate-requests?status=actionable",
      {
        errorMessage: translate("certificate_requests_load_error"),
      },
    );
    actionableCertificateRequests = Array.isArray(data.certificateRequests)
      ? data.certificateRequests
      : [];
  } catch (error) {
    actionableCertificateRequests = [];
    certificateRequestsLoadFailed = true;
    console.error("Could not load certificate requests:", error);
  } finally {
    renderCertificateRequests();
  }
}

document.addEventListener("languagechange", renderCertificateRequests);

loadCertificateRequests();
