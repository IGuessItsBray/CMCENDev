"use strict";

window.MySubmissionEditor = (() => {
  const routes = {
    event: ["/api/events", "event"],
    retirementMessage: ["/api/retirement-messages", "retirementMessage"],
    lastPost: ["/api/last-posts", "lastPost"],
    retirementComment: ["/api/retirement-messages/comments", "comment"],
  };
  const t = (key) => window.translate(key);
  function dateInput(value, allDay, timezone) {
    if (!value) return "";
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: allDay ? "UTC" : timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(value))
        .map(({ type, value }) => [type, value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}${allDay ? "" : `T${parts.hour}:${parts.minute}`}`;
  }
  async function load(item, api, signal) {
    const [route, key] = routes[item.type];
    const data = await api(
      `${route}/${encodeURIComponent(item.id)}/edit`,
      signal,
    );
    const record = data[key];
    if (!record || record.status !== "rejected" || record.scheduledPublishAt)
      throw new Error(t("my_submissions_correction_unavailable"));
    return { record, endpoint: `${route}/${encodeURIComponent(item.id)}` };
  }
  function create({ item, source, onSubmit }) {
    const record = source.record;
    const form = document.createElement("form");
    form.id = "mySubmissionCorrectionForm";
    form.className = "my-submission-correction";
    const fields = new Map();
    const labels = [];
    let imageFile = null;
    let imageRemoved = false;
    let imageRevision = 0;
    let previewUrl;
    const text = (tag, key, parent = form) => {
      const node = document.createElement(tag);
      node.textContent = t(key);
      labels.push([node, key]);
      parent.append(node);
      return node;
    };
    function field(
      name,
      key,
      value,
      {
        type = "text",
        options,
        required = false,
        minLength,
        maxLength = 240,
        parent = form,
      } = {},
    ) {
      const label = document.createElement("label");
      label.className = `my-submission-edit-field${type === "checkbox" ? " is-checkbox" : ""}`;
      const caption = text("span", key, label);
      const input = document.createElement(
        options ? "select" : type === "textarea" ? "textarea" : "input",
      );
      if (!options && type !== "textarea") input.type = type;
      if (options)
        for (const [value, labelKey] of options) {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = labelKey ? t(labelKey) : value;
          if (labelKey) labels.push([option, labelKey]);
          input.append(option);
        }
      input.name = name;
      if (type === "checkbox") input.checked = Boolean(value);
      else input.value = value ?? "";
      input.required = required;
      if (minLength) input.minLength = minLength;
      if (["text", "textarea"].includes(type)) input.maxLength = maxLength;
      if (type === "textarea")
        input.rows = Math.min(
          14,
          Math.max(5, Math.ceil(String(value || "").length / 90)),
        );
      label.append(input);
      if (type === "checkbox") label.append(caption);
      parent.append(label);
      fields.set(name, input);
      return input;
    }
    const val = (name) => fields.get(name)?.value ?? "";
    const checked = (name) => fields.get(name)?.checked === true;
    if (item.type === "event") {
      for (const language of ["en", "fr"]) {
        const group = document.createElement("fieldset");
        group.lang = language;
        text("legend", `language_${language}`, group);
        for (const name of ["title", "location", "description", "registration"])
          field(
            `${name}.${language}`,
            `content_workspace_field_${name}`,
            record[name]?.[language],
            {
              type: ["description", "registration"].includes(name)
                ? "textarea"
                : "text",
              maxLength: ["description", "registration"].includes(name)
                ? 10000
                : 240,
              parent: group,
            },
          );
        form.append(group);
      }
      field("city", "event_city", record.city);
      const options = (values, prefix) =>
        values.map((v) => [
          v,
          prefix ? prefix + v.toLowerCase().replaceAll("-", "_") : null,
        ]);
      field("provinceRegion", "event_province_region", record.provinceRegion, {
        required: true,
        options: options(
          [
            "AB",
            "BC",
            "MB",
            "NB",
            "NL",
            "NS",
            "NT",
            "NU",
            "ON",
            "PE",
            "QC",
            "SK",
            "YT",
            "International",
          ],
          "region_",
        ),
      });
      field(
        "organizingEntity",
        "event_organizing_entity",
        record.organizingEntity,
        {
          required: true,
          options: options(
            ["branch", "association", "foundation", "museum"],
            "entity_",
          ),
        },
      );
      field("eventType", "event_type", record.eventType, {
        required: true,
        options: options(
          [
            "conference",
            "mess-function",
            "ceremony",
            "training",
            "social",
            "other",
          ],
          "event_type_",
        ),
      });
      const allDay = field("allDay", "event_all_day", record.allDay, {
        type: "checkbox",
      });
      const zone = field(
        "timezone",
        "event_timezone",
        record.timezone || "America/Toronto",
        {
          options: options([
            "America/St_Johns",
            "America/Halifax",
            "America/Toronto",
            "America/Winnipeg",
            "America/Edmonton",
            "America/Vancouver",
          ]),
        },
      );
      for (const name of ["startDate", "endDate"])
        field(
          name,
          name === "startDate"
            ? "my_submissions_event_start"
            : "my_submissions_event_end",
          dateInput(record[name], record.allDay, record.timezone),
          {
            type: record.allDay ? "date" : "datetime-local",
            required: name === "startDate",
          },
        );
      const updateSchedule = () => {
        zone.disabled = allDay.checked;
        for (const name of ["startDate", "endDate"]) {
          const input = fields.get(name);
          const value = input.value;
          input.type = allDay.checked ? "date" : "datetime-local";
          input.value = value
            ? allDay.checked
              ? value.slice(0, 10)
              : value.length === 10
                ? `${value}T09:00`
                : value
            : "";
        }
      };
      allDay.addEventListener("change", updateSchedule);
      updateSchedule();
      field(
        "publicationPermissionConfirmed",
        "event_permission_confirmation",
        record.publicationPermission?.confirmed,
        { type: "checkbox", required: true },
      );
    } else if (item.type === "retirementComment") {
      field("body", "content_workspace_comment_body", record.body, {
        type: "textarea",
        required: true,
        minLength: 2,
        maxLength: 2000,
      });
    } else {
      const retirement = item.type === "retirementMessage";
      const person = retirement ? record.retiree : record.deceased;
      const names = retirement
        ? ["rank", "firstName", "lastName", "postNominals"]
        : ["fullRank", "firstName", "surname", "postNominal"];
      const keys = retirement
        ? [
            "retirement_rank",
            "retirement_first_name",
            "retirement_last_name",
            "retirement_post_nominals",
          ]
        : [
            "last_post_full_rank",
            "last_post_first_name",
            "last_post_surname",
            "last_post_post_nominal",
          ];
      names.forEach((name, i) =>
        field(name, keys[i], person?.[name], {
          required: i < 3,
          maxLength: i === 3 ? 120 : 80,
        }),
      );
      if (retirement) {
        field("tradeRole", "retirement_trade_role", person?.tradeRole, {
          required: true,
          options: (
            window.CMCENContentOptions?.retirementTradeRoles || [
              person?.tradeRole,
            ]
          )
            .filter(Boolean)
            .map((v) => [v, null]),
        });
        field(
          "retirementDate",
          "retirement_date",
          String(person?.retirementDate || "").slice(0, 10),
          { type: "date", required: true },
        );
        field(
          "relationship",
          "retirement_submitter_relationship",
          record.submitter?.relationship,
          {
            required: true,
            options: ["self", "colleague", "family", "other"].map((v) => [
              v,
              `relationship_${v}`,
            ]),
          },
        );
      }
      const language = ["en", "fr"].includes(record.messageLanguage)
        ? record.messageLanguage
        : "en";
      text("h3", `language_${language}`);
      field(
        "message",
        "content_workspace_field_message",
        record.messages?.[language] || record.message,
        {
          type: "textarea",
          required: true,
          minLength: 1,
          maxLength: 10000,
        },
      );
      text("p", "my_submissions_translation_review");
      field(
        "permission",
        retirement ? "retirement_consent" : "last_post_permission_confirmation",
        retirement
          ? record.publicationConsent?.confirmed
          : record.publicationPermission?.confirmed,
        { type: "checkbox", required: true },
      );
      if (retirement)
        field(
          "memberReviewConfirmed",
          "retirement_member_review_confirmed",
          false,
          { type: "checkbox", required: true },
        );
    }
    if (item.type !== "retirementComment") {
      const media = document.createElement("fieldset");
      text("legend", "last_post_image", media);
      const preview = document.createElement("img");
      preview.className = "my-submission-image";
      preview.alt = "";
      let existing =
        (item.type === "event"
          ? record.imagePath
          : item.type === "retirementMessage"
            ? record.photoUrl
            : record.imageUrl) || "";
      try {
        const url = new URL(existing, location.origin);
        if (
          existing &&
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password
        )
          preview.src = url.href;
        else existing = "";
      } catch {
        existing = "";
        /* Ignore invalid legacy references. */
      }
      preview.hidden = !preview.getAttribute("src");
      media.append(preview);
      const file = field("image", "my_submissions_replace_image", "", {
        type: "file",
        parent: media,
      });
      file.accept = "image/jpeg,image/png,image/webp,image/gif";
      file.addEventListener("change", () => {
        const next = file.files[0];
        file.setCustomValidity("");
        if (
          next &&
          (!next.type.startsWith("image/") || next.size > 10 * 1024 * 1024)
        ) {
          file.setCustomValidity(t("last_post_image_too_large"));
          file.reportValidity();
          return;
        }
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        imageFile = next || null;
        imageRemoved = false;
        imageRevision++;
        previewUrl = next ? URL.createObjectURL(next) : null;
        if (previewUrl || existing) preview.src = previewUrl || existing;
        preview.hidden = !previewUrl && !existing;
      });
      const remove = text("button", "content_workspace_remove_image", media);
      remove.type = "button";
      remove.className = "admin-work-zone-button is-secondary";
      remove.addEventListener("click", () => {
        imageFile = null;
        imageRemoved = true;
        imageRevision++;
        file.value = "";
        file.setCustomValidity("");
        preview.hidden = true;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      });
      form.append(media);
    }
    const error = text("p", "my_submissions_save_error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    error.tabIndex = -1;
    const snapshot = () =>
      JSON.stringify(
        [...fields]
          .filter(([, input]) => input.type !== "file")
          .map(([name, input]) => [
            name,
            input.type === "checkbox" ? input.checked : input.value,
          ])
          .concat([["image", imageRevision]]),
      );
    const original = snapshot();
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.reportValidity()) onSubmit();
    });
    function payload() {
      const common = { submitForReview: true, publishNow: false };
      if (item.type === "retirementComment")
        return { body: val("body"), submitForReview: true };
      if (item.type === "event") {
        const body = { ...common };
        for (const name of ["title", "description", "location", "registration"])
          body[name] = { en: val(`${name}.en`), fr: val(`${name}.fr`) };
        if (!body.title.en.trim() && !body.title.fr.trim())
          throw new Error(t("event_title_required"));
        for (const name of [
          "city",
          "provinceRegion",
          "organizingEntity",
          "eventType",
          "timezone",
          "startDate",
          "endDate",
        ])
          body[name] = val(name);
        return {
          ...body,
          allDay: checked("allDay"),
          publicationPermissionConfirmed: checked(
            "publicationPermissionConfirmed",
          ),
          imagePath: imageRemoved ? "" : record.imagePath || "",
        };
      }
      const language = ["en", "fr"].includes(record.messageLanguage)
        ? record.messageLanguage
        : "en";
      const body = {
        ...common,
        messageLanguage: language,
        message: val("message"),
      };
      if (item.type === "lastPost")
        return {
          ...body,
          deceased: Object.fromEntries(
            ["fullRank", "firstName", "surname", "postNominal"].map((k) => [
              k,
              val(k),
            ]),
          ),
          publicationPermissionConfirmed: checked("permission"),
          imageUrl: imageRemoved ? "" : record.imageUrl || "",
          imageDisplayUrl: imageRemoved ? "" : record.imageDisplayUrl || "",
        };
      return {
        ...body,
        retiree: Object.fromEntries(
          [
            "rank",
            "firstName",
            "lastName",
            "postNominals",
            "tradeRole",
            "retirementDate",
          ].map((k) => [k, val(k)]),
        ),
        submitter: { relationship: val("relationship") },
        publicationConsentConfirmed: checked("permission"),
        memberReviewConfirmed: checked("memberReviewConfirmed"),
        photoUrl: imageRemoved ? "" : record.photoUrl || "",
        photoDisplayUrl: imageRemoved ? "" : record.photoDisplayUrl || "",
      };
    }
    return {
      form,
      endpoint: source.endpoint,
      dirty: () => snapshot() !== original,
      translate: () =>
        labels.forEach(([node, key]) => {
          if (node !== error) node.textContent = t(key);
        }),
      busy(value) {
        form.inert = value;
        form.setAttribute("aria-busy", String(value));
      },
      error(message) {
        error.textContent = message || t("my_submissions_save_error");
        error.hidden = false;
        error.focus();
      },
      async payload({ token, signal }) {
        const body = payload();
        if (imageFile) {
          const upload = new FormData();
          upload.append("image", imageFile);
          upload.append(
            "uploadSource",
            item.type === "event"
              ? "event"
              : item.type === "lastPost"
                ? "lastPostMessage"
                : "retirementMessage",
          );
          const field =
            item.type === "event"
              ? "imagePath"
              : item.type === "lastPost"
                ? "imageUrl"
                : "photoUrl";
          upload.append("sourceField", field);
          if (item.type !== "event") upload.append("displayAspectRatio", "4:3");
          const result = await CMCENUtils.apiFetch("/api/upload", {
            method: "POST",
            body: upload,
            token,
            signal,
            redirectOnUnauthorized: true,
          });
          if (!result.url) throw new Error(t("last_post_image_upload_error"));
          body[field] = result.url;
          record[field] = result.url;
          if (item.type !== "event") {
            const displayField =
              item.type === "lastPost" ? "imageDisplayUrl" : "photoDisplayUrl";
            body[displayField] = result.display?.url || "";
            record[displayField] = body[displayField];
          }
          imageFile = null;
        }
        return body;
      },
      dispose() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
      },
    };
  }
  return { load, create };
})();
