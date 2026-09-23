"use strict";
window.ContentWorkspaceEditors = {
  create({
    setWorkspaceTranslatedText,
    getText,
    contentWorkspaceState,
    contentWorkspaceDetail,
    getContentWorkspaceLocale,
    formatWorkspaceDate,
    contentWorkspaceScheduledPublicationTypes,
    contentWorkspaceEditRoutes,
    contentWorkspaceApiJson,
  }) {
    const previewUrls = new Set();
    const pickers = new Set();
    function setMediaBusy(active) {
      contentWorkspaceState.isActing =
        (contentWorkspaceState.isActing || 0) + (active ? 1 : -1);
      contentWorkspaceState.isUploading =
        (contentWorkspaceState.isUploading || 0) + (active ? 1 : -1);
    }
    function disposeEditors() {
      for (const picker of pickers) picker.destroy?.();
      pickers.clear();
      for (const url of previewUrls) URL.revokeObjectURL(url);
      previewUrls.clear();
    }
    function getInitialTextareaRows(
      value,
      { minimumRows = 5, maximumRows = 12, charactersPerRow = 60 } = {},
    ) {
      const estimatedRows = String(value || "")
        .split(/\r?\n/)
        .reduce(
          (total, line) =>
            total + Math.max(1, Math.ceil(line.length / charactersPerRow)),
          0,
        );

      return Math.min(maximumRows, Math.max(minimumRows, estimatedRows));
    }

    function createEditableField({
      label,
      labelKey,
      field,
      value,
      multiline = false,
      minimumRows,
      maximumRows,
    }) {
      const labelElement = document.createElement("label");
      labelElement.className =
        "admin-editor-field admin-editor-field--editorial";

      const labelText = document.createElement("span");
      if (labelKey) {
        setWorkspaceTranslatedText(labelText, labelKey, label);
      } else {
        labelText.textContent = label;
      }

      const control = document.createElement(multiline ? "textarea" : "input");
      control.className = "cmcen-control";
      control.name = field;
      control.value = value || "";

      if (multiline) {
        control.rows = getInitialTextareaRows(value, {
          ...(minimumRows ? { minimumRows } : {}),
          ...(maximumRows ? { maximumRows } : {}),
        });
      } else {
        control.type = "text";
      }

      labelElement.append(labelText, control);
      return labelElement;
    }

    function createEditNoteField() {
      const note = createEditableField({
        label: getText("content_workspace_note", "Editorial note (optional)"),
        labelKey: "content_workspace_note",
        field: "revisionNote",
        value: "",
        multiline: true,
        minimumRows: 2,
        maximumRows: 4,
      });
      note.classList.add("content-workspace-note");
      return note;
    }

    function getMessageForLanguage(item, language) {
      const messages = item.content?.messages || {};
      return String(messages[language] || "").trim();
    }

    function createLanguageEditor(item, language) {
      const languageName = getText(
        language === "en" ? "language_en" : "language_fr",
        language === "en" ? "English" : "French",
      );
      const form = document.createElement("form");
      form.className = "content-workspace-language-editor";
      form.dataset.language = language;

      const group = document.createElement("fieldset");
      group.className = "content-workspace-language-group";
      const heading = document.createElement("legend");
      setWorkspaceTranslatedText(
        heading,
        language === "en" ? "language_en" : "language_fr",
        languageName,
      );
      group.append(heading);
      if (item.type === "event" || item.type === "newsArticle") {
        const fields = [
          [
            "title",
            "content_workspace_field_title",
            getText("content_workspace_field_title", "Title"),
            false,
          ],
          ...(item.type === "event"
            ? [
                [
                  "location",
                  "content_workspace_field_location",
                  getText("content_workspace_field_location", "Location"),
                  false,
                ],
                [
                  "description",
                  "content_workspace_field_description",
                  getText("content_workspace_field_description", "Description"),
                  true,
                ],
                [
                  "registration",
                  "content_workspace_field_registration",
                  getText(
                    "content_workspace_field_registration",
                    "Registration details",
                  ),
                  true,
                ],
              ]
            : [
                [
                  "content",
                  "content_workspace_field_content",
                  getText("content_workspace_field_content", "Story"),
                  true,
                ],
              ]),
        ];

        fields.forEach(([field, labelKey, label, multiline]) => {
          if (field === "content" && item.content?.layout === "newsletter") {
            group.append(
              window.ArticleEditor.create({
                value: getEditorDraftValue(
                  item,
                  language,
                  "newsletterBlocks",
                  JSON.stringify(
                    item.content.newsletterBlocks?.[language] || [],
                  ),
                ),
                language,
                getText,
                api: contentWorkspaceApiJson,
                canUpload:
                  contentWorkspaceState.user?.permissions?.canUploadMedia,
                busy: setMediaBusy,
              }),
            );
            return;
          }
          group.append(
            createEditableField({
              label,
              labelKey,
              field,
              value: getEditorDraftValue(
                item,
                language,
                field,
                item.content?.[field]?.[language] || "",
              ),
              multiline,
            }),
          );
        });
      } else {
        const message = getEditorDraftValue(
          item,
          language,
          "message",
          getMessageForLanguage(item, language),
        );
        group.append(
          createEditableField({
            label: getText("content_workspace_field_message", "Message"),
            labelKey: "content_workspace_field_message",
            field: "message",
            value: message,
            multiline: true,
            minimumRows: 10,
            maximumRows: 18,
          }),
        );
      }

      const noteField = createEditNoteField();
      noteField.querySelector("textarea").value = getEditorDraftValue(
        item,
        language,
        "revisionNote",
        "",
      );
      group.append(noteField);
      form.append(group);

      form.addEventListener("submit", (event) => {
        event.preventDefault();
      });
      form.dataset.initialState = getContentWorkspaceFormState(form);
      form.dataset.hasUnsavedDraft = String(
        contentWorkspaceState.editorDrafts.has(
          getEditorDraftKey(item, language),
        ),
      );

      return form;
    }

    function getEditorDraftKey(item, language) {
      return `${item._id}:${language}`;
    }

    function getEditorDraftValue(item, language, field, fallback) {
      const draft = contentWorkspaceState.editorDrafts.get(
        getEditorDraftKey(item, language),
      );

      return Object.prototype.hasOwnProperty.call(draft || {}, field)
        ? draft[field]
        : fallback;
    }

    function captureEditorDrafts(item) {
      contentWorkspaceDetail
        .querySelectorAll(".content-workspace-language-editor")
        .forEach((form) => {
          const language = form.dataset.language;
          if (!language) return;

          contentWorkspaceState.editorDrafts.set(
            getEditorDraftKey(item, language),
            Object.fromEntries(new FormData(form).entries()),
          );
        });
    }

    function formatWorkspaceDateInput(value) {
      if (!value) return "";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";

      return date.toISOString().slice(0, 10);
    }

    function formatWorkspaceDateTimeInput(value) {
      if (!value) return "";

      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";

      const offsetDate = new Date(
        date.getTime() - date.getTimezoneOffset() * 60_000,
      );
      return offsetDate.toISOString().slice(0, 16);
    }

    function getWorkspaceDateTimeParts(value) {
      const formattedValue = formatWorkspaceDateTimeInput(value);
      const [date = "", time = ""] = formattedValue.split("T");
      return { date, time };
    }

    function createWorkspaceDateTimeField({
      field,
      label,
      labelKey,
      value,
      required = false,
      includeTime = true,
    }) {
      const labelElement = document.createElement("label");
      labelElement.className =
        "admin-editor-field admin-editor-field--editorial content-workspace-date-time-field";

      const labelText = document.createElement("span");
      if (labelKey) setWorkspaceTranslatedText(labelText, labelKey, label);
      else labelText.textContent = label;
      labelElement.append(labelText);

      const dateTime = includeTime
        ? getWorkspaceDateTimeParts(value)
        : { date: formatWorkspaceDateInput(value), time: "" };
      if (!window.CMCENDateTimePicker?.create) {
        const nativeInput = document.createElement("input");
        nativeInput.className = "cmcen-control";
        nativeInput.type = includeTime ? "datetime-local" : "date";
        nativeInput.name = field;
        nativeInput.value = includeTime
          ? formatWorkspaceDateTimeInput(value)
          : dateTime.date;
        nativeInput.required = required;
        labelElement.append(nativeInput);
        return labelElement;
      }

      const valueInput = document.createElement("input");
      valueInput.type = "hidden";
      valueInput.name = field;
      valueInput.value = dateTime.date
        ? includeTime
          ? dateTime.date + "T" + (dateTime.time || "00:00")
          : dateTime.date
        : "";

      const picker = window.CMCENDateTimePicker.create({
        name: field,
        dateName: field + "PickerDate",
        timeName: field + "PickerTime",
        date: dateTime.date,
        time: dateTime.time,
        includeTime,
        label: getText(labelKey, label),
        placeholder: includeTime
          ? getText("timers_date_time_placeholder", "Select date and time")
          : getText(labelKey, label),
        timeLabel: getText("timers_picker_time", "Time"),
        clearLabel: getText("timers_picker_clear", "Clear"),
        doneLabel: getText("timers_picker_done", "Done"),
        locale: getContentWorkspaceLocale(),
        onInput: ({ date, time }) => {
          valueInput.value = date
            ? includeTime
              ? date + "T" + (time || "00:00")
              : date
            : "";
        },
      });

      pickers.add(picker);
      labelElement.append(valueInput, picker);
      return labelElement;
    }

    function createWorkspaceEditorField({
      field,
      label,
      labelKey,
      value = "",
      type = "text",
      multiline = false,
      options = [],
      checked = false,
      required = false,
      disabled = false,
    }) {
      const labelElement = document.createElement("label");
      labelElement.className =
        "admin-editor-field admin-editor-field--editorial";
      const labelText = document.createElement("span");
      setWorkspaceTranslatedText(labelText, labelKey, label);

      let control;
      if (options.length) {
        control = document.createElement("select");
        const optionValues = new Set(options.map((option) => option.value));
        if (value && !optionValues.has(value)) {
          options = [{ value, label: value }, ...options];
        }

        options.forEach((option) => {
          const optionElement = document.createElement("option");
          optionElement.value = option.value;
          if (option.labelKey) {
            setWorkspaceTranslatedText(
              optionElement,
              option.labelKey,
              option.label,
            );
          } else {
            optionElement.textContent = option.label;
          }
          optionElement.selected = option.value === value;
          control.append(optionElement);
        });
      } else {
        control = document.createElement(multiline ? "textarea" : "input");
        if (multiline) {
          control.rows = 4;
        } else {
          control.type = type;
        }
        control.value = String(value || "");
      }

      control.name = field;
      control.required = required;
      control.disabled = disabled;
      if (type !== "checkbox") control.classList.add("cmcen-control");
      if (type === "checkbox") {
        control.type = "checkbox";
        control.checked = checked;
        control.value = "true";
        labelElement.classList.add("is-checkbox");
      }

      labelElement.append(labelText, control);
      return labelElement;
    }

    function getWorkspaceOption(value, labelKey, label) {
      return { value, labelKey, label };
    }

    function getEventDetailsFields(item) {
      return [
        createWorkspaceEditorField({
          field: "city",
          label: "City",
          labelKey: "event_city",
          value: item.content?.city,
        }),
        createWorkspaceEditorField({
          field: "provinceRegion",
          label: "Province or region",
          labelKey: "event_province_region",
          value: item.content?.provinceRegion,
          options: [
            getWorkspaceOption("", "event_select_option", "Select an option"),
            ...[
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
            ].map((value) =>
              getWorkspaceOption(value, `region_${value.toLowerCase()}`, value),
            ),
          ],
        }),
        createWorkspaceEditorField({
          field: "organizingEntity",
          label: "Organizing entity",
          labelKey: "event_organizing_entity",
          value: item.content?.organizingEntity,
          options: [
            getWorkspaceOption("", "event_select_option", "Select an option"),
            ...["branch", "association", "foundation", "museum"].map((value) =>
              getWorkspaceOption(value, `entity_${value}`, value),
            ),
          ],
        }),
        createWorkspaceEditorField({
          field: "eventType",
          label: "Event type",
          labelKey: "event_type",
          value: item.content?.eventType,
          options: [
            getWorkspaceOption("", "event_select_option", "Select an option"),
            ...[
              "conference",
              "mess-function",
              "ceremony",
              "training",
              "social",
              "other",
            ].map((value) =>
              getWorkspaceOption(
                value,
                `event_type_${value.replace(/-/gu, "_")}`,
                value,
              ),
            ),
          ],
        }),
        createWorkspaceDateTimeField({
          field: "startDate",
          label: "Start date and time",
          labelKey: "content_workspace_start_date_time",
          value: item.content?.startDate,
          required: true,
        }),
        createWorkspaceDateTimeField({
          field: "endDate",
          label: "End date and time",
          labelKey: "content_workspace_end_date_time",
          value: item.content?.endDate,
        }),
        createWorkspaceEditorField({
          field: "timezone",
          label: "Event timezone",
          labelKey: "event_timezone",
          value: item.content?.timezone,
          options: [
            getWorkspaceOption("", "event_select_option", "Select an option"),
            ...[
              "America/St_Johns",
              "America/Halifax",
              "America/Toronto",
              "America/Winnipeg",
              "America/Edmonton",
              "America/Vancouver",
            ].map((value) => getWorkspaceOption(value, "", value)),
          ],
        }),
        createWorkspaceEditorField({
          field: "allDay",
          label: "All-day event",
          labelKey: "event_all_day",
          type: "checkbox",
          checked: item.content?.allDay === true,
        }),
        createWorkspaceEditorField({
          field: "rsvpEnabled",
          label: "Enable RSVPs",
          labelKey: "event_rsvp_enabled",
          type: "checkbox",
          checked: item.content?.rsvpEnabled === true,
        }),
        createWorkspaceEditorField({
          field: "contentArea",
          label: "Content area",
          labelKey: "content_workspace_content_area",
          value: item.content?.contentArea || "general",
          options: [
            "general",
            "branch",
            "association",
            "foundation",
            "museum",
          ].map((value) => getWorkspaceOption(value, "", value)),
        }),
      ];
    }

    function getRetirementDetailsFields(item) {
      const retiree = item.content?.retiree || {};
      return [
        createWorkspaceEditorField({
          field: "retireeRank",
          label: "Rank at retirement",
          labelKey: "retirement_rank",
          value: retiree.rank,
        }),
        createWorkspaceEditorField({
          field: "retireeFirstName",
          label: "First name",
          labelKey: "retirement_first_name",
          value: retiree.firstName,
        }),
        createWorkspaceEditorField({
          field: "retireeLastName",
          label: "Last name",
          labelKey: "retirement_last_name",
          value: retiree.lastName,
        }),
        createWorkspaceEditorField({
          field: "retireePostNominals",
          label: "Post nominals",
          labelKey: "retirement_post_nominals",
          value: retiree.postNominals,
        }),
        createWorkspaceDateTimeField({
          field: "retirementDate",
          label: "Retirement date",
          labelKey: "retirement_date",
          value: retiree.retirementDate,
          includeTime: false,
        }),
        createWorkspaceEditorField({
          field: "retireeTradeRole",
          label: "MOSID / role",
          labelKey: "retirement_trade_role",
          value: retiree.tradeRole,
        }),
      ];
    }

    function getLastPostDetailsFields(item) {
      const deceased = item.content?.deceased || {};
      return [
        createWorkspaceEditorField({
          field: "title",
          label: "Internal title",
          labelKey: "content_workspace_internal_title",
          value: item.content?.title,
        }),
        createWorkspaceEditorField({
          field: "slug",
          label: "Slug",
          labelKey: "content_workspace_slug",
          value: item.content?.slug,
        }),
        createWorkspaceEditorField({
          field: "deceasedFullRank",
          label: "Full rank",
          labelKey: "last_post_full_rank",
          value: deceased.fullRank,
        }),
        createWorkspaceEditorField({
          field: "deceasedFirstName",
          label: "First name",
          labelKey: "last_post_first_name",
          value: deceased.firstName,
        }),
        createWorkspaceEditorField({
          field: "deceasedSurname",
          label: "Surname",
          labelKey: "last_post_surname",
          value: deceased.surname,
        }),
        createWorkspaceEditorField({
          field: "deceasedPostNominal",
          label: "Post-nominal",
          labelKey: "last_post_post_nominal",
          value: deceased.postNominal,
        }),
        createWorkspaceEditorField({
          field: "photoUrl",
          label: "Legacy photo URL",
          labelKey: "content_workspace_legacy_photo_url",
          value: item.content?.photoUrl,
          type: "url",
        }),
      ];
    }

    function getNewsArticleDetailsFields(item) {
      const fields = [
        createWorkspaceEditorField({
          field: "layout",
          label: "Article template",
          labelKey: "article_template",
          disabled: true,
          value: item.content?.layout || "standard",
          options: [
            {
              value: "standard",
              label: "News story",
              labelKey: "article_template_standard",
            },
            {
              value: "newsletter",
              label: "Newsletter",
              labelKey: "article_template_newsletter",
            },
          ],
        }),
        ...(item.content?.layout === "newsletter"
          ? [
              ...Object.entries({
                author: "Original author",
                issue: "Issue",
                kicker: "Section label",
                date: "Original publication date",
                sourceUrl: "Original publication URL",
              }).map(([key, label]) =>
                createWorkspaceEditorField({
                  field: `newsletter_${key}`,
                  label,
                  labelKey: `article_${key}`,
                  value: item.content?.newsletter?.[key] || "",
                  type:
                    key === "date"
                      ? "date"
                      : key === "sourceUrl"
                        ? "url"
                        : "text",
                }),
              ),
              createWorkspaceEditorField({
                field: "newsletter_language",
                label: "Original language",
                labelKey: "article_language",
                value: item.content?.newsletter?.language || "en",
                options: [
                  { value: "en", label: "English", labelKey: "language_en" },
                  { value: "fr", label: "French", labelKey: "language_fr" },
                ],
              }),
              createWorkspaceEditorField({
                field: "newsletter_headerCrest",
                label: "Show cover image in newsletter header",
                labelKey: "article_headerCrest",
                value: String(Boolean(item.content?.newsletter?.headerCrest)),
                options: [
                  { value: "false", label: "No", labelKey: "article_no" },
                  { value: "true", label: "Yes", labelKey: "article_yes" },
                ],
              }),
              createWorkspaceEditorField({
                field: "newsletter_archived",
                label: "Historical issue",
                labelKey: "article_archived",
                value: String(Boolean(item.content?.newsletter?.archived)),
                options: [
                  { value: "false", label: "No", labelKey: "article_no" },
                  { value: "true", label: "Yes", labelKey: "article_yes" },
                ],
              }),
            ]
          : []),
      ];

      if (item.status === "published") {
        fields.push(
          createWorkspaceEditorField({
            field: "status",
            label: "Publication status",
            labelKey: "content_workspace_status",
            value: item.status,
            options: [
              getWorkspaceOption("draft", "content_workspace_draft", "Draft"),
              getWorkspaceOption(
                "published",
                "content_workspace_published",
                "Published",
              ),
            ],
          }),
        );
      }

      return fields;
    }

    function getContentWorkspaceImageConfig(item) {
      if (item.type === "event") {
        return {
          field: "imagePath",
          value: item.content?.imagePath,
          uploadSource: "event",
          uploadContext: "event",
          sourceField: "imagePath",
        };
      }

      if (item.type === "retirementMessage") {
        return {
          field: "photoUrl",
          displayField: "photoDisplayUrl",
          value: item.content?.photoUrl,
          displayValue: item.content?.photoDisplayUrl,
          uploadSource: "retirementMessage",
          uploadContext: "retirement-message",
          sourceField: "photoUrl",
          displayAspectRatio: "4:3",
        };
      }

      if (item.type === "lastPost") {
        return {
          field: "imageUrl",
          displayField: "imageDisplayUrl",
          value: item.content?.imageUrl,
          displayValue: item.content?.imageDisplayUrl,
          uploadSource: "lastPostMessage",
          uploadContext: "last-post",
          sourceField: "imageUrl",
          displayAspectRatio: "4:3",
        };
      }

      return null;
    }

    function setContentWorkspaceImageEditorPreview(editor, imageUrl = "") {
      const preview = editor.querySelector(
        "[data-content-workspace-image-preview]",
      );
      const empty = editor.querySelector(
        "[data-content-workspace-image-empty]",
      );
      const state = editor.querySelector(
        "[data-content-workspace-image-state]",
      );
      const remove = editor.querySelector(
        "[data-content-workspace-image-remove]",
      );
      const hasImage = Boolean(imageUrl);

      editor.classList.toggle("has-image", hasImage);
      preview.hidden = !hasImage;
      empty.hidden = hasImage;
      remove.disabled = !hasImage;

      if (state) {
        setWorkspaceTranslatedText(
          state,
          hasImage
            ? "content_workspace_current_image"
            : "content_workspace_no_image_short",
          hasImage ? "Current image" : "No image",
        );
      }

      if (hasImage) {
        preview.src = imageUrl;
      } else {
        preview.removeAttribute("src");
      }
    }

    function getContentWorkspaceImageSourceName(item, form) {
      const getValue = (field) =>
        String(form.elements.namedItem(field)?.value || "").trim();

      if (item.type === "event") {
        return getValue("titleEN") || getValue("titleFR") || item.title;
      }

      if (item.type === "retirementMessage") {
        return (
          [
            getValue("retireeRank"),
            getValue("retireeFirstName"),
            getValue("retireeLastName"),
          ]
            .filter(Boolean)
            .join(" ") || item.title
        );
      }

      if (item.type === "lastPost") {
        return (
          [
            getValue("deceasedFullRank"),
            getValue("deceasedFirstName"),
            getValue("deceasedSurname"),
          ]
            .filter(Boolean)
            .join(" ") || item.title
        );
      }

      return item.title;
    }

    function createContentWorkspaceImageEditor(item) {
      const config = getContentWorkspaceImageConfig(item);
      if (!config) return null;

      const section = document.createElement("section");
      section.className = "content-workspace-image-editor";
      section.dataset.contentWorkspaceImageEditor = "true";
      section.dataset.uploadSource = config.uploadSource;
      section.dataset.uploadContext = config.uploadContext;
      section.dataset.sourceField = config.sourceField;
      if (config.displayAspectRatio) {
        section.dataset.displayAspectRatio = config.displayAspectRatio;
      }

      const header = document.createElement("div");
      header.className = "content-workspace-image-heading";
      const heading = document.createElement("h3");
      setWorkspaceTranslatedText(heading, "content_workspace_image", "Image");
      const state = document.createElement("span");
      state.className = "content-workspace-image-state";
      state.dataset.contentWorkspaceImageState = "true";
      header.append(heading, state);

      const previewFrame = document.createElement("div");
      previewFrame.className = "content-workspace-image-preview-frame";

      const preview = document.createElement("img");
      preview.className = "content-workspace-image-preview";
      preview.alt = getText("content_workspace_current_image", "Current image");
      preview.dataset.contentWorkspaceImagePreview = "true";

      const empty = document.createElement("p");
      empty.className = "content-workspace-image-empty";
      empty.dataset.contentWorkspaceImageEmpty = "true";
      setWorkspaceTranslatedText(
        empty,
        "content_workspace_no_image",
        "No image is attached to this submission.",
      );
      previewFrame.append(preview, empty);

      const primaryValue = document.createElement("input");
      primaryValue.type = "hidden";
      primaryValue.name = config.field;
      primaryValue.value = String(config.value || "");

      const displayValue = config.displayField
        ? document.createElement("input")
        : null;
      if (displayValue) {
        displayValue.type = "hidden";
        displayValue.name = config.displayField;
        displayValue.value = String(config.displayValue || "");
      }

      const uploadLabel = document.createElement("label");
      uploadLabel.className =
        "admin-work-zone-button is-secondary content-workspace-image-upload";
      const uploadText = document.createElement("span");
      setWorkspaceTranslatedText(
        uploadText,
        "content_workspace_choose_image",
        "Choose an image",
      );
      const file = document.createElement("input");
      file.type = "file";
      file.accept = "image/*";
      file.className = "visually-hidden";
      file.dataset.contentWorkspaceImageFile = "true";
      uploadLabel.append(uploadText, file);

      const hint = document.createElement("p");
      hint.className = "content-workspace-image-hint";
      setWorkspaceTranslatedText(
        hint,
        "content_workspace_image_save_hint",
        "Image changes are applied when you save changes.",
      );

      const actions = document.createElement("div");
      actions.className = "content-workspace-image-actions";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-work-zone-button is-danger";
      remove.dataset.contentWorkspaceImageRemove = "true";
      setWorkspaceTranslatedText(
        remove,
        "content_workspace_remove_image",
        "Remove image",
      );
      actions.append(remove, uploadLabel);

      const controls = document.createElement("div");
      controls.className = "content-workspace-image-controls";
      controls.append(hint, actions);

      const media = document.createElement("div");
      media.className = "content-workspace-image-media";
      media.append(previewFrame, controls);

      const initialImageUrl = String(config.displayValue || config.value || "");
      let previewObjectUrl = "";
      file.addEventListener("change", () => {
        const selectedFile = file.files?.[0];
        const form = section.closest(".content-workspace-record-form");
        if (form) {
          form.dataset.hasPendingImageUpload = String(Boolean(selectedFile));
        }
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewUrls.delete(previewObjectUrl);
        }
        previewObjectUrl = selectedFile
          ? URL.createObjectURL(selectedFile)
          : "";
        if (previewObjectUrl) previewUrls.add(previewObjectUrl);
        setContentWorkspaceImageEditorPreview(
          section,
          previewObjectUrl || (primaryValue.value ? initialImageUrl : ""),
        );
      });
      remove.addEventListener("click", () => {
        if (previewObjectUrl) {
          URL.revokeObjectURL(previewObjectUrl);
          previewUrls.delete(previewObjectUrl);
        }
        previewObjectUrl = "";
        file.value = "";
        primaryValue.value = "";
        if (displayValue) displayValue.value = "";
        setContentWorkspaceImageEditorPreview(section, "");
        file.dispatchEvent(new Event("change", { bubbles: true }));
      });

      section.append(
        header,
        media,
        primaryValue,
        ...(displayValue ? [displayValue] : []),
      );
      setContentWorkspaceImageEditorPreview(section, initialImageUrl);
      return section;
    }

    function createContentWorkspaceRecordEditor(item) {
      const fields = {
        event: getEventDetailsFields,
        retirementMessage: getRetirementDetailsFields,
        lastPost: getLastPostDetailsFields,
        newsArticle: getNewsArticleDetailsFields,
        retirementComment: () => [
          createWorkspaceEditorField({
            field: "body",
            label: "Comment",
            labelKey: "content_workspace_comment_body",
            value: item.content?.body,
            multiline: true,
          }),
        ],
      }[item.type]?.(item);

      if (!fields?.length) return null;

      const section = document.createElement("section");
      section.className = "content-workspace-record-editor";
      const heading = document.createElement("h2");
      const headingByType = {
        event: ["content_workspace_event_details", "Event details"],
        retirementMessage: [
          "content_workspace_retirement_details",
          "Retirement details",
        ],
        lastPost: ["content_workspace_last_post_details", "Last Post details"],
        newsArticle: ["content_workspace_news_details", "Article details"],
        retirementComment: [
          "content_workspace_comment_details",
          "Comment details",
        ],
      }[item.type];
      setWorkspaceTranslatedText(heading, ...headingByType);

      const form = document.createElement("form");
      form.className = "content-workspace-record-form";
      form.append(...fields);
      if (item.type === "newsArticle") {
        const cover = document.createElement("section");
        cover.className = "article-cover";
        const label = document.createElement("h3");
        setWorkspaceTranslatedText(label, "article_cover", "Cover image");
        const full = document.createElement("input");
        full.type = "hidden";
        full.name = "imageUrl";
        full.value = item.content?.imageUrl || "";
        const display = document.createElement("input");
        display.type = "hidden";
        display.name = "imageDisplayUrl";
        display.value = item.content?.imageDisplayUrl || "";
        cover.append(
          label,
          full,
          display,
          window.ArticleEditor.mediaControl({
            value: { url: display.value || full.value },
            getText,
            api: contentWorkspaceApiJson,
            canUpload: contentWorkspaceState.user?.permissions?.canUploadMedia,
            busy: setMediaBusy,
            onChange: (image) => {
              full.value = image.url;
              display.value = image.url;
              full.dispatchEvent(new Event("input", { bubbles: true }));
            },
          }),
        );
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "admin-work-zone-button is-secondary";
        setWorkspaceTranslatedText(
          remove,
          "content_workspace_remove_image",
          "Remove image",
        );
        remove.addEventListener("click", () => {
          full.value = "";
          display.value = "";
          cover.querySelector("img").hidden = true;
          full.dispatchEvent(new Event("input", { bubbles: true }));
        });
        cover.append(remove);
        form.append(cover);
      }
      const imageEditor = createContentWorkspaceImageEditor(item);
      if (imageEditor) form.append(imageEditor);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
      });
      form.dataset.initialState = getContentWorkspaceFormState(form);

      section.append(heading, form);
      return section;
    }

    function createReadOnlyComment(item) {
      const notice = document.createElement("p");
      notice.className = "content-workspace-read-only";
      setWorkspaceTranslatedText(
        notice,
        "content_workspace_comment_original",
        "Original member comment",
      );

      const body = document.createElement("blockquote");
      body.className = "content-workspace-comment-body";
      body.textContent = String(item.content?.body || "").trim();

      return [notice, body];
    }

    function createReadOnlyLanguage(item, language) {
      const languageName = getText(
        language === "en" ? "language_en" : "language_fr",
        language === "en" ? "English" : "French",
      );
      const section = document.createElement("section");
      section.className = "content-workspace-read-only-language";
      const heading = document.createElement("h3");
      setWorkspaceTranslatedText(
        heading,
        language === "en" ? "language_en" : "language_fr",
        languageName,
      );
      section.append(heading);

      if (item.type === "event" || item.type === "newsArticle") {
        const fields = [
          [
            "title",
            "content_workspace_field_title",
            getText("content_workspace_field_title", "Title"),
          ],
          ...(item.type === "event"
            ? [
                [
                  "location",
                  "content_workspace_field_location",
                  getText("content_workspace_field_location", "Location"),
                ],
                [
                  "description",
                  "content_workspace_field_description",
                  getText("content_workspace_field_description", "Description"),
                ],
                [
                  "registration",
                  "content_workspace_field_registration",
                  getText(
                    "content_workspace_field_registration",
                    "Registration details",
                  ),
                ],
              ]
            : [
                [
                  "content",
                  "content_workspace_field_content",
                  getText("content_workspace_field_content", "Story"),
                ],
              ]),
        ];
        const values = document.createElement("dl");

        fields.forEach(([field, labelKey, label]) => {
          const term = document.createElement("dt");
          setWorkspaceTranslatedText(term, labelKey, label);
          const description = document.createElement("dd");
          description.textContent = String(
            item.content?.[field]?.[language] || "",
          );
          values.append(term, description);
        });

        section.append(values);
        return section;
      }

      const message = document.createElement("p");
      message.textContent = getMessageForLanguage(item, language);
      section.append(message);
      return section;
    }

    function createReadOnlyCopy(item) {
      const copy = document.createElement("section");
      copy.className = "content-workspace-copy";
      const heading = document.createElement("h2");
      setWorkspaceTranslatedText(
        heading,
        "content_workspace_public_copy",
        "Public copy",
      );
      const languages = document.createElement("div");
      languages.className = "content-workspace-language-grid";
      languages.append(
        createReadOnlyLanguage(item, "en"),
        createReadOnlyLanguage(item, "fr"),
      );
      copy.append(heading, languages);
      return copy;
    }

    function getWorkspaceUserName(user) {
      if (!user || typeof user !== "object") {
        return getText("unknown_user", "Unknown user");
      }

      return (
        user.accountName ||
        [user.firstName, user.lastName].filter(Boolean).join(" ") ||
        user.username ||
        user.email ||
        getText("unknown_user", "Unknown user")
      );
    }

    function getWorkspaceRelationship(value) {
      const relationship = String(value || "").trim();
      if (!relationship) return "—";

      return getText(`relationship_${relationship}`, relationship);
    }

    function createWorkspaceSubmissionSection(headingKey, heading, fields) {
      const section = document.createElement("section");
      section.className = "content-workspace-submission-section";
      const title = document.createElement("h3");
      setWorkspaceTranslatedText(title, headingKey, heading);
      const list = document.createElement("dl");
      list.className = "content-workspace-submission-grid";

      fields.forEach(({ labelKey, label, value, wide = false }) => {
        const row = document.createElement("div");
        row.className = "content-workspace-submission-item";
        row.classList.toggle("is-wide", wide);
        const term = document.createElement("dt");
        setWorkspaceTranslatedText(term, labelKey, label);
        const description = document.createElement("dd");

        if (value instanceof Element) {
          description.append(value);
        } else {
          description.textContent = value || "—";
        }

        row.append(term, description);
        list.append(row);
      });

      section.append(title, list);
      return section;
    }

    function createWorkspaceDateValue(value) {
      const date = document.createElement("span");
      date.dataset.contentWorkspaceDate = String(value || "");
      date.textContent = value ? formatWorkspaceDate(value) : "—";
      return date;
    }

    function createWorkspacePermissionValue(confirmed) {
      const status = document.createElement("span");
      status.className = confirmed ? "is-confirmed" : "is-unconfirmed";
      setWorkspaceTranslatedText(
        status,
        confirmed
          ? "review_permission_confirmed"
          : "review_permission_not_recorded",
        confirmed ? "Confirmed" : "Not recorded",
      );
      return status;
    }

    function createContentWorkspaceSubmissionDetails(item) {
      if (item.type === "newsArticle") return null;

      const content = item.content || {};
      const details = document.createElement("details");
      details.className = "content-workspace-submission-details";
      const summary = document.createElement("summary");
      setWorkspaceTranslatedText(
        summary,
        "review_submission_details",
        "Submission and authorization details",
      );
      const body = document.createElement("div");
      body.className = "content-workspace-submission-body";

      if (item.type === "event") {
        const permission = content.publicationPermission || {};
        body.append(
          createWorkspaceSubmissionSection(
            "review_submitter_record",
            "Submitter record",
            [
              {
                labelKey: "event_submitter_rank",
                label: "Rank",
                value: content.submitter?.rank,
              },
              {
                labelKey: "event_submitter_first_name",
                label: "First name",
                value: content.submitter?.firstName,
              },
              {
                labelKey: "event_submitter_last_name",
                label: "Last name",
                value: content.submitter?.lastName,
              },
              {
                labelKey: "event_submitter_unit_role",
                label: "Unit or role",
                value: content.submitter?.unitRole,
                wide: true,
              },
              {
                labelKey: "event_submitter_email",
                label: "Email",
                value: content.submitter?.email,
                wide: true,
              },
              {
                labelKey: "event_submitter_phone",
                label: "Phone",
                value: content.submitter?.phone,
                wide: true,
              },
              {
                labelKey: "submitted_by",
                label: "Submitted by",
                value: getWorkspaceUserName(content.createdBy),
                wide: true,
              },
            ],
          ),
          createWorkspaceSubmissionSection(
            "review_authorization_record",
            "Publication authorization",
            [
              {
                labelKey: "review_permission_status",
                label: "Permission status",
                value: createWorkspacePermissionValue(
                  permission.confirmed === true,
                ),
              },
              {
                labelKey: "review_confirmed_by",
                label: "Confirmed by",
                value: getWorkspaceUserName(permission.confirmedBy),
                wide: true,
              },
              {
                labelKey: "review_confirmed_on",
                label: "Confirmed on",
                value: createWorkspaceDateValue(permission.confirmedAt),
                wide: true,
              },
            ],
          ),
        );
      }

      if (item.type === "retirementMessage") {
        const consent = content.publicationConsent || {};
        const memberReview = content.memberReviewConfirmation || {};
        body.append(
          createWorkspaceSubmissionSection(
            "review_submitter_record",
            "Submitter record",
            [
              {
                labelKey: "retirement_submitter_first_name",
                label: "First name",
                value: content.submitter?.firstName,
              },
              {
                labelKey: "retirement_submitter_last_name",
                label: "Last name",
                value: content.submitter?.lastName,
              },
              {
                labelKey: "retirement_submitter_relationship",
                label: "Relationship",
                value: getWorkspaceRelationship(
                  content.submitter?.relationship,
                ),
              },
              {
                labelKey: "retirement_submitter_email",
                label: "Email",
                value: content.submitter?.email,
                wide: true,
              },
              {
                labelKey: "retirement_submitter_unit",
                label: "Unit",
                value: content.submitter?.unit,
                wide: true,
              },
              {
                labelKey: "submitted_by",
                label: "Submitted by",
                value: getWorkspaceUserName(content.createdBy),
                wide: true,
              },
            ],
          ),
          createWorkspaceSubmissionSection(
            "review_authorization_record",
            "Publication authorization",
            [
              {
                labelKey: "retirement_member_review_status",
                label: "Member review confirmation",
                value: createWorkspacePermissionValue(
                  memberReview.confirmed === true,
                ),
              },
              {
                labelKey: "review_confirmed_on",
                label: "Confirmed on",
                value: createWorkspaceDateValue(memberReview.confirmedAt),
              },
              {
                labelKey: "retirement_publication_ack_status",
                label: "Publication acknowledgement",
                value: createWorkspacePermissionValue(
                  consent.confirmed === true,
                ),
              },
              {
                labelKey: "review_confirmed_on",
                label: "Confirmed on",
                value: createWorkspaceDateValue(consent.confirmedAt),
              },
            ],
          ),
        );
      }

      if (item.type === "lastPost") {
        const permission = content.publicationPermission || {};
        body.append(
          createWorkspaceSubmissionSection(
            "last_post_submitter_heading",
            "Submitter",
            [
              {
                labelKey: "rank",
                label: "Rank",
                value: content.submitter?.rank,
              },
              {
                labelKey: "first_name",
                label: "First name",
                value: content.submitter?.firstName,
              },
              {
                labelKey: "last_name",
                label: "Last name",
                value: content.submitter?.lastName,
              },
              {
                labelKey: "email",
                label: "Email",
                value: content.submitter?.email,
                wide: true,
              },
              {
                labelKey: "submitted_by",
                label: "Submitted by",
                value: getWorkspaceUserName(content.createdBy),
                wide: true,
              },
            ],
          ),
          createWorkspaceSubmissionSection(
            "review_authorization_record",
            "Publication authorization",
            [
              {
                labelKey: "review_permission_status",
                label: "Permission status",
                value: createWorkspacePermissionValue(
                  permission.confirmed === true,
                ),
              },
              {
                labelKey: "review_confirmed_by",
                label: "Confirmed by",
                value: getWorkspaceUserName(permission.confirmedBy),
                wide: true,
              },
              {
                labelKey: "review_confirmed_on",
                label: "Confirmed on",
                value: createWorkspaceDateValue(permission.confirmedAt),
                wide: true,
              },
            ],
          ),
        );
      }

      if (item.type === "retirementComment") {
        body.append(
          createWorkspaceSubmissionSection(
            "review_submitter_record",
            "Submitter record",
            [
              {
                labelKey: "submitted_by",
                label: "Submitted by",
                value: getWorkspaceUserName(content.author),
              },
              {
                labelKey: "email",
                label: "Email",
                value: content.author?.email,
                wide: true,
              },
              {
                labelKey: "submitted_on",
                label: "Submitted on",
                value: createWorkspaceDateValue(content.createdAt),
                wide: true,
              },
            ],
          ),
        );
      }

      details.append(summary, body);
      return details;
    }

    function createRejectionReason(item) {
      const reason = String(item.rejectionReason || "").trim();
      if (item.status !== "rejected" || !reason) return null;

      const section = document.createElement("section");
      section.className = "content-workspace-rejection-reason";
      const heading = document.createElement("h2");
      setWorkspaceTranslatedText(
        heading,
        "content_workspace_rejection_reason",
        "Rejection reason",
      );
      const body = document.createElement("p");
      body.textContent = reason;
      section.append(heading, body);
      return section;
    }

    function createScheduledPublicationStatus(item) {
      if (
        !contentWorkspaceScheduledPublicationTypes.has(item.type) ||
        !["pending", "draft"].includes(item.status) ||
        !item.scheduledPublishAt
      ) {
        return null;
      }

      const scheduledDate = new Date(item.scheduledPublishAt);
      if (Number.isNaN(scheduledDate.getTime())) return null;

      const section = document.createElement("section");
      section.className = "content-workspace-scheduled-publication";
      section.setAttribute("aria-live", "polite");

      const heading = document.createElement("h2");
      setWorkspaceTranslatedText(
        heading,
        "content_workspace_scheduled_publication",
        "Scheduled publication",
      );

      const message = document.createElement("p");
      setScheduledPublicationMessage(message, scheduledDate);

      section.append(heading, message);
      return section;
    }

    function setScheduledPublicationMessage(element, value) {
      const scheduledDate = new Date(value);
      if (Number.isNaN(scheduledDate.getTime())) return;

      element.dataset.scheduledPublicationAt = scheduledDate.toISOString();
      element.textContent = getText(
        "content_workspace_scheduled_publication_at",
        "This content is set to go public at {date}.",
        { date: formatWorkspaceDate(scheduledDate) },
      );
    }

    function getWorkspaceIsoDate(value, { includeTime = false } = {}) {
      const dateValue = String(value || "").trim();
      if (!dateValue) return null;

      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return null;

      return includeTime ? date.toISOString() : date.toISOString().slice(0, 10);
    }

    function getContentWorkspaceRecordPayload(item, formData) {
      if (item.type === "event") {
        const allDay = formData.get("allDay") === "true";

        return {
          city: String(formData.get("city") || ""),
          provinceRegion: String(formData.get("provinceRegion") || ""),
          organizingEntity: String(formData.get("organizingEntity") || ""),
          eventType: String(formData.get("eventType") || ""),
          startDate: getWorkspaceIsoDate(formData.get("startDate"), {
            includeTime: !allDay,
          }),
          endDate: getWorkspaceIsoDate(formData.get("endDate"), {
            includeTime: !allDay,
          }),
          timezone: String(formData.get("timezone") || ""),
          allDay,
          rsvpEnabled: formData.get("rsvpEnabled") === "true",
          contentArea: String(formData.get("contentArea") || "general"),
          imagePath: String(formData.get("imagePath") || ""),
        };
      }

      if (item.type === "retirementMessage") {
        return {
          retiree: {
            rank: String(formData.get("retireeRank") || ""),
            firstName: String(formData.get("retireeFirstName") || ""),
            lastName: String(formData.get("retireeLastName") || ""),
            postNominals: String(formData.get("retireePostNominals") || ""),
            retirementDate: getWorkspaceIsoDate(formData.get("retirementDate")),
            tradeRole: String(formData.get("retireeTradeRole") || ""),
          },
          photoUrl: String(formData.get("photoUrl") || ""),
          photoDisplayUrl: String(formData.get("photoDisplayUrl") || ""),
        };
      }

      if (item.type === "lastPost") {
        return {
          title: String(formData.get("title") || ""),
          slug: String(formData.get("slug") || ""),
          deceased: {
            fullRank: String(formData.get("deceasedFullRank") || ""),
            firstName: String(formData.get("deceasedFirstName") || ""),
            surname: String(formData.get("deceasedSurname") || ""),
            postNominal: String(formData.get("deceasedPostNominal") || ""),
          },
          imageUrl: String(formData.get("imageUrl") || ""),
          imageDisplayUrl: String(formData.get("imageDisplayUrl") || ""),
          photoUrl: String(formData.get("photoUrl") || ""),
        };
      }

      if (item.type === "retirementComment") {
        return { body: String(formData.get("body") || "") };
      }

      if (item.type === "newsArticle") {
        return {
          imageUrl: String(formData.get("imageUrl") || ""),
          imageDisplayUrl: String(formData.get("imageDisplayUrl") || ""),
          status: String(formData.get("status") || item.status),
        };
      }

      return null;
    }

    function getContentWorkspaceRecordSaveRoute(item) {
      return contentWorkspaceEditRoutes[item.type];
    }

    async function uploadContentWorkspaceImage(item, form) {
      const imageEditor = form.querySelector(
        "[data-content-workspace-image-editor]",
      );
      const file = imageEditor?.querySelector(
        "[data-content-workspace-image-file]",
      );
      const selectedFile = file?.files?.[0];
      if (!imageEditor || !selectedFile) return;

      if (!selectedFile.type.startsWith("image/")) {
        throw new Error(
          getText(
            "content_workspace_image_invalid",
            "Choose a valid image file.",
          ),
        );
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        throw new Error(
          getText(
            "content_workspace_image_too_large",
            "Images must be 10 MB or smaller.",
          ),
        );
      }

      const uploadData = new FormData();
      uploadData.append(
        "image",
        await CMCENUtils.prepareImageUploadFile(selectedFile),
      );
      uploadData.append("uploadSource", imageEditor.dataset.uploadSource);
      uploadData.append("uploadContext", imageEditor.dataset.uploadContext);
      uploadData.append("sourceField", imageEditor.dataset.sourceField);
      if (imageEditor.dataset.displayAspectRatio) {
        uploadData.append(
          "displayAspectRatio",
          imageEditor.dataset.displayAspectRatio,
        );
      }
      uploadData.append(
        "sourceName",
        getContentWorkspaceImageSourceName(item, form),
      );

      const result = await contentWorkspaceApiJson("/api/upload", {
        method: "POST",
        body: uploadData,
      });
      if (!result.url) {
        throw new Error(
          getText(
            "content_workspace_image_upload_error",
            "Could not upload image.",
          ),
        );
      }

      const primaryValue = form.elements.namedItem(
        imageEditor.dataset.sourceField,
      );
      if (primaryValue instanceof HTMLInputElement) {
        primaryValue.value = result.url;
      }

      const displayFieldBySource = {
        photoUrl: "photoDisplayUrl",
        imageUrl: "imageDisplayUrl",
      };
      const displayField =
        displayFieldBySource[imageEditor.dataset.sourceField];
      const displayValue = displayField
        ? form.elements.namedItem(displayField)
        : null;
      if (displayValue instanceof HTMLInputElement) {
        displayValue.value = result.display?.url || "";
      }
    }

    async function getContentWorkspaceRecordSaveRequest(item, form) {
      await uploadContentWorkspaceImage(item, form);
      const formData = new FormData(form);
      const route = getContentWorkspaceRecordSaveRoute(item);
      const body = getContentWorkspaceRecordPayload(item, formData);
      if (!route || !body) return null;

      return {
        path: route(item._id),
        body,
      };
    }

    function getNewsArticleSaveRequest(item) {
      const forms = getContentWorkspaceSaveForms();
      const getLanguageFormData = (language) => {
        const form = forms.find(
          (candidate) => candidate.dataset.language === language,
        );
        return form ? new FormData(form) : null;
      };
      const getLanguageValue = (language, field) => {
        const formData = getLanguageFormData(language);
        return String(
          formData?.get(field) ?? item.content?.[field]?.[language] ?? "",
        );
      };
      const recordForm = forms.find((form) =>
        form.classList.contains("content-workspace-record-form"),
      );
      const recordData = recordForm ? new FormData(recordForm) : null;
      const getRecordValue = (field, fallback) =>
        String(recordData?.get(field) ?? fallback ?? "");
      const note = ["en", "fr"]
        .map((language) => getLanguageFormData(language)?.get("revisionNote"))
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join("\n");

      return {
        path: item.isNew
          ? "/api/news"
          : `/api/news/${encodeURIComponent(item._id)}`,
        method: item.isNew ? "POST" : "PATCH",
        newsArticle: true,
        body: {
          layout: getRecordValue("layout", item.content?.layout || "standard"),
          newsletter: Object.fromEntries(
            [
              "author",
              "issue",
              "kicker",
              "date",
              "sourceUrl",
              "language",
              "headerCrest",
              "archived",
            ].map((key) => [
              key,
              ["headerCrest", "archived"].includes(key)
                ? getRecordValue(
                    `newsletter_${key}`,
                    String(Boolean(item.content?.newsletter?.[key])),
                  ) === "true"
                : getRecordValue(
                    `newsletter_${key}`,
                    item.content?.newsletter?.[key] ||
                      (key === "language" ? "en" : ""),
                  ),
            ]),
          ),
          title: {
            en: getLanguageValue("en", "title"),
            fr: getLanguageValue("fr", "title"),
          },
          content: {
            en: getLanguageValue("en", "content"),
            fr: getLanguageValue("fr", "content"),
          },
          newsletterBlocks: Object.fromEntries(
            ["en", "fr"].map((language) => [
              language,
              JSON.parse(
                getLanguageFormData(language)?.get("newsletterBlocks") ||
                  JSON.stringify(
                    item.content?.newsletterBlocks?.[language] || [],
                  ),
              ),
            ]),
          ),
          imageUrl: getRecordValue("imageUrl", item.content?.imageUrl),
          imageDisplayUrl: getRecordValue(
            "imageDisplayUrl",
            item.content?.imageDisplayUrl,
          ),
          status: getRecordValue("status", item.status),
          revisionNote: note,
        },
      };
    }

    function getContentLanguageSaveRequest(item, form) {
      const formData = new FormData(form);
      const language = form.dataset.language;
      if (!language) return null;
      const note = String(formData.get("revisionNote") || "");
      let path = "";
      let body = { language, note };

      if (item.type === "event") {
        path = `/api/events/${encodeURIComponent(item._id)}/review-content`;
        body.content = {
          title: String(formData.get("title") || ""),
          location: String(formData.get("location") || ""),
          description: String(formData.get("description") || ""),
          registration: String(formData.get("registration") || ""),
        };
      } else if (item.type === "retirementMessage") {
        path = `/api/retirement-messages/${encodeURIComponent(item._id)}/review-content`;
        body.message = String(formData.get("message") || "");
      } else if (item.type === "lastPost") {
        path = `/api/last-posts/${encodeURIComponent(item._id)}/review-content`;
        body.message = String(formData.get("message") || "");
      } else {
        return null;
      }

      return { path, body, language };
    }

    function getContentWorkspaceSaveForms() {
      return [
        ...contentWorkspaceDetail.querySelectorAll(
          ".content-workspace-language-editor, .content-workspace-record-form",
        ),
      ];
    }

    function getContentWorkspaceFormState(form) {
      return JSON.stringify(
        [...new FormData(form).entries()].map(([name, value]) => [
          name,
          typeof value === "string" ? value : value.name,
        ]),
      );
    }

    function isContentWorkspaceFormDirty(form) {
      return (
        form.dataset.hasUnsavedDraft === "true" ||
        form.dataset.hasPendingImageUpload === "true" ||
        form.dataset.initialState !== getContentWorkspaceFormState(form)
      );
    }

    return {
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
    };
  },
};
