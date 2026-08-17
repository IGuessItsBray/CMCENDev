# Notifications

The authenticated notifications page surfaces rejected submissions and editable
retirement comments. The client is implemented by
[`notifications.js`](../server/public/notifications.js) and
[`notifications.html`](../server/public/notifications.html).

## Email subscriptions and CASL controls

The weekly brief is sent on Friday at noon in the `America/Toronto` time zone.
It contains public Last Post notices, retirement messages, and public pages
published since the prior successful weekly delivery (or the prior seven days
for the first delivery).

The weekly brief and occasional news announcements both use express consent
only. A member must deliberately opt in to each category on their account page
after seeing the sender name, mailing address, contact method, purpose, and
frequency. The choices are optional and separate from account registration.
The account stores the consent date, source, text version, and any withdrawal
date; subscription and withdrawal actions are also written to the audit log.

Every subscription email includes sender identification/contact information and
a unique opaque unsubscribe link. The link immediately withdraws the relevant
email category without sign-in and remains valid for at least 60 days. Each
delivery also includes standard `List-Unsubscribe` headers. Configure all of
`CASL_SENDER_NAME`, `CASL_SENDER_MAILING_ADDRESS`, and
`CASL_SENDER_CONTACT` before enabling delivery; the server will refuse opt-ins
and delivery when any of these values is absent.

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
