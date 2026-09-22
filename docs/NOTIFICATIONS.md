# Submission status and feedback

The in-app notification bell and its read/unread tracking have been retired.
Members find submission status, reviewer feedback, and correction forms under
**My submissions** on their personal dashboard. The section is hidden when
they have no submissions.

The `/api/notifications` and `/api/notifications/read` endpoints are removed,
and `/api/me` no longer computes notification counts. Old `/notifications`
and `/notifications.html` links redirect to the dashboard. Existing database
read markers are left untouched and are no longer used.

Staff review queues remain in **Admin → Content**. RSVP records and their
existing access controls remain available through event management. This
change does not alter email subscriptions or email delivery.
