"use strict";
window.ContentWorkspaceActions = {
  create({
    canManageContentWorkspaceNews,
    canReviewContentWorkspace,
    contentWorkspaceReviewRoutes,
    contentWorkspaceScheduledPublicationTypes,
    setWorkspaceTranslatedText,
    hasUnsavedContentWorkspaceChanges,
    getText,
    contentWorkspaceDetail,
    contentWorkspaceApiJson,
    contentWorkspaceState,
    getEditorDraftKey,
    showWorkspaceSuccess,
    loadContentWorkspace,
    setWorkspaceMessage,
    getContentWorkspaceLocale,
    contentWorkspaceRoutes,
    getContentWorkspaceSaveForms,
    isContentWorkspaceFormDirty,
    updateContentWorkspaceSaveAction,
    captureEditorDrafts,
    getNewsArticleSaveRequest,
    getContentWorkspaceRecordSaveRequest,
    getContentLanguageSaveRequest,
  }) {
    function createContentWorkspaceReviewActions(item) {
      const isNewsArticle = item.type === "newsArticle";
      if (
        isNewsArticle
          ? !canManageContentWorkspaceNews() || item.status !== "draft"
          : !canReviewContentWorkspace() || item.status !== "pending"
      )
        return null;

      const route = contentWorkspaceReviewRoutes[item.type];
      if (!route) return null;

      const canSchedulePublication =
        contentWorkspaceScheduledPublicationTypes.has(item.type);

      const actions = document.createElement("div");
      actions.className = "content-workspace-review-actions";
      const reject = isNewsArticle ? null : document.createElement("button");
      if (reject) {
        reject.type = "button";
        reject.className = "admin-work-zone-button is-danger";
      }
      const publish = document.createElement("button");
      publish.type = "button";
      publish.className = "admin-work-zone-button is-success";
      const cancelSchedule =
        canSchedulePublication && item.scheduledPublishAt
          ? document.createElement("button")
          : null;
      if (cancelSchedule) {
        cancelSchedule.type = "button";
        cancelSchedule.className = "admin-work-zone-button is-secondary";
      }
      const buttons = [reject, publish, cancelSchedule].filter(Boolean);
      let isConfirming = false;
      let isSubmitting = false;

      function restoreActionLabels() {
        if (reject)
          setWorkspaceTranslatedText(
            reject,
            "content_workspace_reject",
            "Reject",
          );
        setWorkspaceTranslatedText(
          publish,
          "content_workspace_publish",
          "Publish",
        );
        if (cancelSchedule) {
          setWorkspaceTranslatedText(
            cancelSchedule,
            "content_workspace_cancel_scheduled_publish",
            "Cancel scheduled publish",
          );
        }
      }

      async function saveUnsavedChangesBeforePublication() {
        if (!hasUnsavedContentWorkspaceChanges()) return true;

        const choice = await CMCENModal.choose(
          getText(
            "content_workspace_save_before_publish_message",
            "Save your edits before publishing or scheduling this content.",
          ),
          {
            title: getText(
              "content_workspace_save_before_publish_title",
              "Save changes before publishing",
            ),
            cancelText: getText("cancel", "Cancel"),
            tone: "success",
            choices: [
              {
                value: "save",
                label: getText(
                  "content_workspace_save_and_continue",
                  "Save and continue",
                ),
                description: getText(
                  "content_workspace_save_and_continue_help",
                  "Save your edits, then continue with publication.",
                ),
              },
            ],
          },
        );

        if (choice !== "save") return false;

        const saveButton = contentWorkspaceDetail.querySelector(
          "[data-content-workspace-save]",
        );
        return saveButton
          ? saveContentWorkspaceChanges(item, saveButton)
          : false;
      }

      async function submitDecision(
        action,
        { rejectionReason = "", scheduledPublishAt = "" } = {},
      ) {
        if (
          (action === "publish" || action === "cancel-schedule") &&
          !(await saveUnsavedChangesBeforePublication())
        ) {
          return;
        }

        isSubmitting = true;
        const isScheduledPublication =
          action === "publish" && Boolean(scheduledPublishAt);
        const activeButton =
          action === "publish"
            ? publish
            : action === "cancel-schedule"
              ? cancelSchedule
              : reject;
        buttons.forEach((button) => {
          button.disabled = true;
        });
        setWorkspaceTranslatedText(
          activeButton,
          action === "publish"
            ? isScheduledPublication
              ? "content_workspace_scheduling"
              : "content_workspace_publishing"
            : action === "cancel-schedule"
              ? "content_workspace_cancelling_scheduled_publish"
              : "content_workspace_rejecting",
          action === "publish"
            ? isScheduledPublication
              ? "Scheduling…"
              : "Publishing…"
            : action === "cancel-schedule"
              ? "Cancelling scheduled publication…"
              : "Rejecting…",
        );

        try {
          await contentWorkspaceApiJson(route(item._id), {
            method: "PATCH",
            body: {
              action,
              rejectionReason:
                action === "reject" ? rejectionReason.trim() : undefined,
              scheduledPublishAt: isScheduledPublication
                ? scheduledPublishAt
                : undefined,
            },
          });
          contentWorkspaceState.editorDrafts.delete(
            getEditorDraftKey(item, "en"),
          );
          contentWorkspaceState.editorDrafts.delete(
            getEditorDraftKey(item, "fr"),
          );
          showWorkspaceSuccess(
            getText(
              action === "cancel-schedule"
                ? "content_workspace_cancel_scheduled_publish_success"
                : action === "publish"
                  ? isScheduledPublication
                    ? "content_workspace_schedule_success"
                    : "content_workspace_publish_success"
                  : "content_workspace_reject_success",
              action === "cancel-schedule"
                ? "Scheduled publication cancelled."
                : action === "publish"
                  ? isScheduledPublication
                    ? "Content publication scheduled."
                    : "Content published successfully."
                  : "Content rejected successfully.",
            ),
          );
          await loadContentWorkspace({ preserveSelection: true });
        } catch (error) {
          setWorkspaceMessage(error.message, "error");
          buttons.forEach((button) => {
            button.disabled = false;
          });
          restoreActionLabels();
        } finally {
          isSubmitting = false;
        }
      }

      async function confirmDecision(action) {
        if (isConfirming || isSubmitting) return;

        isConfirming = true;
        contentWorkspaceState.isActing =
          (contentWorkspaceState.isActing || 0) + 1;
        try {
          const decision =
            action === "publish"
              ? canSchedulePublication
                ? await CMCENModal.choose(
                    getText(
                      "content_workspace_publish_timing",
                      "Choose when this content should become visible on the public site.",
                    ),
                    {
                      title: getText("content_workspace_publish", "Publish"),
                      cancelText: getText("cancel", "Cancel"),
                      tone: "success",
                      choices: [
                        {
                          value: "now",
                          label: getText(
                            "content_workspace_publish_now",
                            "Publish now",
                          ),
                          description: getText(
                            "content_workspace_publish_now_help",
                            "Make this content public immediately.",
                          ),
                        },
                        {
                          value: "schedule",
                          label: getText(
                            "content_workspace_schedule_publish",
                            "Schedule publication",
                          ),
                          description: getText(
                            "content_workspace_schedule_publish_help",
                            "Choose a future date and time for it to go public.",
                          ),
                        },
                      ],
                    },
                  )
                : await CMCENModal.confirm(
                    getText(
                      "content_workspace_publish_confirmation",
                      "Publishing makes this content visible on the public site. Confirm when you are ready.",
                    ),
                    {
                      title: getText(
                        "content_workspace_confirm_publish",
                        "Confirm publish",
                      ),
                      confirmText: getText(
                        "content_workspace_confirm_publish",
                        "Confirm publish",
                      ),
                      cancelText: getText("cancel", "Cancel"),
                      tone: "success",
                    },
                  )
              : action === "cancel-schedule"
                ? await CMCENModal.confirm(
                    getText(
                      isNewsArticle
                        ? "content_workspace_cancel_scheduled_news_confirmation"
                        : "content_workspace_cancel_scheduled_publish_confirmation",
                      isNewsArticle
                        ? "This story will remain a draft and will not be published at its scheduled time."
                        : "This content will remain pending and will not be published at its scheduled time.",
                    ),
                    {
                      title: getText(
                        "content_workspace_cancel_scheduled_publish",
                        "Cancel scheduled publish",
                      ),
                      confirmText: getText(
                        "content_workspace_confirm_cancel_scheduled_publish",
                        "Cancel scheduled publish",
                      ),
                      cancelText: getText("cancel", "Cancel"),
                      tone: "danger",
                    },
                  )
                : await CMCENModal.form(
                    getText(
                      "content_workspace_reject_confirmation",
                      "This content will be rejected and the reason will be shared with the submitter. Confirm when you are ready.",
                    ),
                    {
                      title: getText(
                        "content_workspace_confirm_reject",
                        "Confirm rejection",
                      ),
                      confirmText: getText(
                        "content_workspace_confirm_reject",
                        "Confirm rejection",
                      ),
                      cancelText: getText("cancel", "Cancel"),
                      destructive: true,
                      tone: "danger",
                      fields: [
                        {
                          name: "rejectionReason",
                          type: "textarea",
                          label: getText(
                            "content_workspace_rejection_reason",
                            "Rejection reason",
                          ),
                          placeholder: getText(
                            "rejection_reason_placeholder",
                            "Explain what needs to be corrected…",
                          ),
                          required: true,
                          requiresNonWhitespace: true,
                          requiredMessage: getText(
                            "content_workspace_rejection_reason_required",
                            "Enter a reason before rejecting this content.",
                          ),
                          maxLength: 2000,
                        },
                      ],
                    },
                  );

          if (!decision) return;

          if (action === "publish" && decision === "schedule") {
            const schedule = await CMCENModal.form(
              getText(
                "content_workspace_schedule_publish_prompt",
                "Choose the local date and time this content should go public.",
              ),
              {
                title: getText(
                  "content_workspace_schedule_publish",
                  "Schedule publication",
                ),
                confirmText: getText(
                  "content_workspace_schedule_publish",
                  "Schedule publication",
                ),
                cancelText: getText("cancel", "Cancel"),
                tone: "success",
                fields: [
                  {
                    name: "scheduledPublishAt",
                    type: "cmcen-date-time",
                    label: getText(
                      "content_workspace_publish_date_time",
                      "Publish date and time",
                    ),
                    placeholder: getText(
                      "timers_date_time_placeholder",
                      "Select date and time",
                    ),
                    timeLabel: getText("timers_picker_time", "Time"),
                    clearLabel: getText("timers_picker_clear", "Clear"),
                    doneLabel: getText("timers_picker_done", "Done"),
                    locale: getContentWorkspaceLocale(),
                    hint: getText(
                      "content_workspace_publish_date_time_help",
                      "This uses your local time and must be in the future.",
                    ),
                    required: true,
                  },
                ],
              },
            );

            if (!schedule) return;
            const scheduledDate = new Date(schedule.scheduledPublishAt);
            if (
              Number.isNaN(scheduledDate.getTime()) ||
              scheduledDate.getTime() <= Date.now()
            ) {
              await CMCENModal.alert(
                getText(
                  "content_workspace_publish_date_time_invalid",
                  "Choose a future publication date and time.",
                ),
                {
                  title: getText(
                    "content_workspace_schedule_publish",
                    "Schedule publication",
                  ),
                },
              );
              return;
            }

            await submitDecision(action, {
              scheduledPublishAt: scheduledDate.toISOString(),
            });
            return;
          }

          await submitDecision(
            action,
            action === "reject" && typeof decision === "object"
              ? { rejectionReason: decision.rejectionReason || "" }
              : {},
          );
        } finally {
          isConfirming = false;
          contentWorkspaceState.isActing--;
        }
      }

      reject?.addEventListener("click", () => void confirmDecision("reject"));
      publish.addEventListener("click", () => void confirmDecision("publish"));
      cancelSchedule?.addEventListener(
        "click",
        () => void confirmDecision("cancel-schedule"),
      );

      restoreActionLabels();
      if (reject) actions.append(reject);
      if (cancelSchedule) actions.append(cancelSchedule);
      actions.append(publish);
      return actions;
    }

    function createRemovalActions(item) {
      const actions = document.createElement("div");
      actions.className = "content-workspace-removal-actions";
      const isNewsArticle = item.type === "newsArticle";
      if (!isNewsArticle && !contentWorkspaceRoutes[item.type]) return actions;
      const canHide = isNewsArticle
        ? canManageContentWorkspaceNews()
        : contentWorkspaceState.user?.permissions?.canHideContent === true;
      const canRestore = isNewsArticle
        ? canManageContentWorkspaceNews()
        : contentWorkspaceState.user?.permissions?.canRestoreContent === true;

      if (item.status === "hidden" && canRestore) {
        const restore = document.createElement("button");
        restore.className = "admin-work-zone-button is-secondary";
        restore.type = "button";
        setWorkspaceTranslatedText(
          restore,
          "content_workspace_restore",
          "Restore content",
        );
        restore.addEventListener("click", () =>
          changeContentVisibility(item, "restore"),
        );
        actions.append(restore);
      }

      if (
        canHide &&
        (isNewsArticle
          ? item.status === "published"
          : item.status !== "hidden" && item.status !== "pending")
      ) {
        const remove = document.createElement("button");
        remove.className = "admin-work-zone-button is-danger";
        remove.type = "button";
        setWorkspaceTranslatedText(
          remove,
          "content_workspace_remove",
          "Remove from public view",
        );
        remove.addEventListener("click", () =>
          changeContentVisibility(item, "remove"),
        );
        actions.append(remove);
      }

      return actions;
    }

    function createContentWorkspaceBottomActions(
      item,
      { canSave = false } = {},
    ) {
      const section = document.createElement("section");
      section.className = "content-workspace-bottom-actions";
      const actionRow = document.createElement("div");
      actionRow.className = "content-workspace-action-row";
      const removalActions = createRemovalActions(item);
      if (removalActions.childElementCount) {
        actionRow.append(removalActions);
      }

      const primaryActions = document.createElement("div");
      primaryActions.className = "content-workspace-primary-actions";

      if (canSave) {
        const saveActions = document.createElement("div");
        saveActions.className = "content-workspace-save-actions";
        const save = document.createElement("button");
        save.type = "button";
        save.className = "admin-work-zone-button is-primary";
        save.dataset.contentWorkspaceSave = "true";
        save.disabled = true;
        setWorkspaceTranslatedText(
          save,
          "content_workspace_save_changes",
          "Save changes",
        );
        save.addEventListener("click", () =>
          saveContentWorkspaceChanges(item, save),
        );
        saveActions.append(save);
        primaryActions.append(saveActions);
      }

      const reviewActions = createContentWorkspaceReviewActions(item);
      if (reviewActions) {
        primaryActions.append(reviewActions);
      }

      if (primaryActions.childElementCount) {
        actionRow.append(primaryActions);
      }

      if (actionRow.childElementCount) {
        section.append(actionRow);
      }

      return section.childElementCount ? section : null;
    }

    async function saveContentWorkspaceChanges(item, button) {
      contentWorkspaceState.isActing =
        (contentWorkspaceState.isActing || 0) + 1;
      try {
        return await persistContentWorkspaceChanges(item, button);
      } finally {
        contentWorkspaceState.isActing--;
      }
    }
    async function persistContentWorkspaceChanges(item, button) {
      const forms = getContentWorkspaceSaveForms().filter(
        isContentWorkspaceFormDirty,
      );
      const invalidForm = forms.find((form) => !form.checkValidity());

      if (invalidForm) {
        invalidForm.reportValidity();
        return false;
      }

      if (!forms.length) {
        setWorkspaceMessage(
          getText("content_workspace_no_changes", "No changes to save."),
        );
        updateContentWorkspaceSaveAction();
        return true;
      }

      captureEditorDrafts(item);
      const recordForm = forms.find((form) =>
        form.classList.contains("content-workspace-record-form"),
      );
      let savedRequests = 0;
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      setWorkspaceTranslatedText(
        button,
        "content_workspace_saving_changes",
        "Saving…",
      );
      try {
        const saveRequests =
          item.type === "newsArticle"
            ? [getNewsArticleSaveRequest(item)]
            : [
                ...(recordForm
                  ? [
                      await getContentWorkspaceRecordSaveRequest(
                        item,
                        recordForm,
                      ),
                    ]
                  : []),
                ...forms
                  .filter((form) =>
                    form.classList.contains(
                      "content-workspace-language-editor",
                    ),
                  )
                  .map((form) => getContentLanguageSaveRequest(item, form)),
              ].filter(Boolean);

        if (!saveRequests.length) return false;

        for (const request of saveRequests) {
          await contentWorkspaceApiJson(request.path, {
            method: "PATCH",
            body: request.body,
          });
          savedRequests += 1;

          if (request.language) {
            contentWorkspaceState.editorDrafts.delete(
              getEditorDraftKey(item, request.language),
            );
          }

          if (request.newsArticle) {
            ["en", "fr"].forEach((language) => {
              contentWorkspaceState.editorDrafts.delete(
                getEditorDraftKey(item, language),
              );
            });
          }
        }

        await loadContentWorkspace({ preserveSelection: true });
        showWorkspaceSuccess(
          getText(
            recordForm?.dataset.hasPendingImageUpload === "true"
              ? "content_workspace_image_uploaded"
              : "content_workspace_changes_saved",
            recordForm?.dataset.hasPendingImageUpload === "true"
              ? "Image uploaded and changes saved."
              : "Changes saved.",
          ),
        );
        return true;
      } catch (error) {
        if (savedRequests) {
          await loadContentWorkspace({ preserveSelection: true });
        }

        setWorkspaceMessage(
          savedRequests
            ? getText(
                "content_workspace_partial_save",
                "Some changes were saved before the error. Review the remaining fields and save again.",
              )
            : error.message,
          "error",
        );
        return false;
      } finally {
        button.removeAttribute("aria-busy");
        setWorkspaceTranslatedText(
          button,
          "content_workspace_save_changes",
          "Save changes",
        );
        updateContentWorkspaceSaveAction();
      }
    }

    async function changeContentVisibility(item, action) {
      if (contentWorkspaceState.isActing) return;
      contentWorkspaceState.isActing = 1;
      try {
        await persistContentVisibility(item, action);
      } finally {
        contentWorkspaceState.isActing = 0;
      }
    }
    async function persistContentVisibility(item, action) {
      const isRestore = action === "restore";
      const confirmed = await CMCENModal.confirm(
        isRestore
          ? getText(
              "content_workspace_restore_confirm",
              "Restore this content to its previous status?",
            )
          : getText(
              "content_workspace_remove_confirm",
              "Remove this content from public view? Its history will be preserved.",
            ),
        {
          title: isRestore
            ? getText("content_workspace_restore", "Restore content")
            : getText("content_workspace_remove", "Remove from public view"),
          confirmText: isRestore
            ? getText("content_workspace_restore", "Restore content")
            : getText("content_workspace_remove", "Remove from public view"),
          cancelText: getText("cancel", "Cancel"),
        },
      );

      if (!confirmed) return;

      const route =
        item.type === "newsArticle"
          ? `/api/news/${encodeURIComponent(item._id)}/${isRestore ? "restore" : "hide"}`
          : contentWorkspaceRoutes[item.type]
            ? `${contentWorkspaceRoutes[item.type]}/${encodeURIComponent(item._id)}/${isRestore ? "restore" : "hide"}`
            : "";
      if (!route) return;

      try {
        const result = await contentWorkspaceApiJson(route, {
          method: "PATCH",
        });
        showWorkspaceSuccess(
          result.message ||
            (isRestore
              ? getText("content_workspace_restored", "Content restored.")
              : getText(
                  "content_workspace_removed",
                  "Content removed from public view.",
                )),
        );
        await loadContentWorkspace({ preserveSelection: true });
      } catch (error) {
        setWorkspaceMessage(error.message, "error");
      }
    }

    return { createContentWorkspaceBottomActions, saveContentWorkspaceChanges };
  },
};
