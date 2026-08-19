# Notifications

Authenticated users receive review-result notifications from the bell in the
shared header. Each entry has a submission-type badge and an outcome badge:
`Published` or `Rejected`. Rejections are action items and remain in the bell
until the submission is resubmitted or otherwise leaves the rejected state.
Published items are informational: opening the bell marks those review results
read without dismissing any outstanding rejection.

Selecting a rejected item opens its correction view directly: events open the
event form, retirement messages open the retirement form, and comments open
the associated retirement message with its comment editor ready. Published
items instead open their public detail view. Content that the submitter was
authorized to publish immediately does not create an approval notification.

Accounts that predate this feature see reviewer approvals from the prior 30
days the first time their bell is opened, then establish their normal
approval-read baseline. Current rejections always appear; older approvals are
not backfilled into the dropdown.

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

- `GET /api/notifications` returns `{ notifications: { count, actionCount,
  unreadCount, shouldMarkRead, items, readThrough } }` for the authenticated account.
  `actionCount` is the number of current rejections; `unreadCount` is the
  number of unseen approvals from another reviewer. Each item has its `type`,
  `status`, direct destination, and review timestamp.
- `POST /api/notifications/read` accepts `{ readThrough }` from a returned
  summary and records all review results through that snapshot as read.
- `PATCH /api/retirement-messages/comments/:commentId` updates an editable
  retirement comment.

Both calls require a bearer token. The client obtains it through
`CMCENUtils.requireAuthToken()` and redirects unauthenticated visitors to login.

## Client Behavior

`index.js` loads the notification summary with the authenticated navigation
state, then refreshes the list from `/api/notifications` when the bell opens.
If the summary has unread approvals, it sends the returned `readThrough` value
to `/api/notifications/read`; a later review decision is not cleared because it
falls outside that snapshot. The badge retains `actionCount` after that call.
While the page is visible, the header refreshes its notification summary every
minute and when the tab regains focus; those background refreshes never mark an
approval as read.
Supported item types include events, retirement messages, and retirement
comments. The header uses DOM-created links and text so notification titles and
rejection reasons are never inserted as HTML.

Rejected retirement comments use
`/retirement-message?id=<message-id>&editComment=<comment-id>`. The detail
page verifies owner/reviewer access through the existing edit endpoint, shows
the rejection reason, and resubmits through the existing comment PATCH route.

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
        "status": "rejected",
        "body": "Please clarify this detail.",
        "updatedAt": "2026-07-09T12:00:00.000Z",
        "editHref": "/retirement-message?id=507f1f77bcf86cd799439012&editComment=507f1f77bcf86cd799439011"
      }
    ],
    "count": 1,
    "readThrough": "2026-08-18T12:00:00.000Z"
  }
}
```
