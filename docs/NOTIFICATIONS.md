# Notifications

The authenticated notifications page surfaces rejected submissions and editable
retirement comments. The client is implemented by
[`notifications.js`](../server/public/notifications.js) and
[`notifications.html`](../server/public/notifications.html).

## API

- `GET /api/notifications` returns `{ notifications: { items: [...] } }` for the
  authenticated account.
- `PATCH /api/retirement-messages/comments/:commentId` updates an editable
  retirement comment.

Both calls require a bearer token. The client obtains it through
`CMCENUtils.requireAuthToken()` and redirects unauthenticated visitors to login.

## Client Behavior

`loadNotifications()` fetches the current list and renders each item with
`createNotificationCard()`. Supported item types include events, retirement
messages, and retirement comments. A `?comment=<id>` query highlights and
scrolls to the matching retirement comment.

Editable retirement comments render a text area and submit action. The client
validates the body, disables the action during the request, reports the result
through the card status region, and reloads notifications after a successful
update.

## Accessibility and Localization

Status regions use `aria-live` where asynchronous feedback is presented. All
visible strings must use `translate(key)` and have English and French values in
[`translations.json`](../server/data/translations.json).

When adding a notification type, update the server serializer, client title and
label mappings, and both language dictionaries together.

## Minimal Response

```json
{
  "notifications": {
    "items": [
      {
        "id": "507f1f77bcf86cd799439011",
        "type": "retirementComment",
        "body": "Please clarify this detail.",
        "updatedAt": "2026-07-09T12:00:00.000Z",
        "editHref": "/retirement-message?id=507f1f77bcf86cd799439012"
      }
    ]
  }
}
```
