Notifications — Developer documentation

Overview
- Purpose: UI for account-level notifications (rejected submissions, comment edits) and lightweight in-place editing of retirement comments.
- Key client files: /server/public/notifications.js, /server/public/notifications.html
- Endpoints used:
  - GET /api/notifications -> returns { notifications: { items: [...] } }
  - PATCH /api/retirement-messages/comments/:id -> updates comment body

Client behavior
- Authentication: requires token via CMCENUtils.requireAuthToken(); redirects to /login.html if missing.
- Loading: loadNotifications() fetches /api/notifications and renders cards via createNotificationCard().
- Card types: items have type fields like event, retirementMessage, retirementComment, comment — getNotificationTitle/TypeLabel pick labels via translate().
- Highlighting: query param ?comment=<id> will highlight retirementComment cards matching the id (adds .is-highlighted and scrolls into view).

Editing comments
- For type retirementComment, createCommentEditor(item) builds a form with textarea and submit button.
- submitCommentEdit(form, item) validates and PATCHes /api/retirement-messages/comments/:id with { body }.
- UI feedback: setCardMessage(card, message, type) shows success/error; loadNotifications() is called again after success to refresh list.

Accessibility & i18n
- Notifications HTML uses role=status and aria-live where appropriate.
- All user-visible strings use translate(key) — translations live in /server/data/translations.json.

Error handling
- API wrapper notificationsApiJson() sets redirectOnUnauthorized and an unauthorizedMessage.
- Errors show notificationStatus or per-card messages; buttons are disabled during requests to avoid duplicate submissions.

Developer notes
- To add new notification types: extend server API to include items.type and client-side getNotificationTitle/getNotificationEditLabel mappings.
- To change edit endpoint, update submitCommentEdit target path.
- Keep translation keys in translations.json and call translate() in UI components.

Example API response (minimal)
{
  "notifications": {
    "items": [
      {
        "id": "123",
        "type": "retirementComment",
        "body": "Please clarify...",
        "updatedAt": "2026-07-09T12:00:00Z",
        "editHref": "/page.html?id=..."
      }
    ]
  }
}
