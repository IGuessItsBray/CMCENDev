# Page Builder

The page builder creates localized, access-controlled pages from typed content
blocks. The model is [`Page.js`](../server/models/Page.js), the administrator
client is [`pages-admin.js`](../server/public/pages-admin.js), and public pages
are rendered by [`page.js`](../server/public/page.js).

## Page Model

A page contains localized `title` and `summary` values, a normalized `slug`, a
`status` of `draft`, `published`, or `archived`, ordered `blocks`, access rules,
and creator/editor/publication metadata.

Supported block types are:

- `heading`, with level 2 or 3
- `text`
- `image`
- `callout`
- `button`
- `divider`

Localized block fields use `{ en, fr }`. Images may store `mediaKey` and
`mediaUrl`; access rules may restrict pages by audience, built-in roles, custom
roles, or canonical permission keys.

## Routes

Public routes:

- `GET /pages/:slug` serves the page shell.
- `GET /api/pages/:slug` returns visible published page data.
- `GET /api/navigation` returns navigation visible to the current visitor.
- `GET /api/sitemap` returns public static and dynamic pages.

Administrator routes:

- `GET /api/admin/pages`
- `GET /api/admin/pages/media`
- `POST /api/admin/pages`
- `GET /api/admin/pages/:pageId`
- `GET /api/admin/pages/:pageId/preview`
- `PATCH /api/admin/pages/:pageId`
- `PATCH /api/admin/pages/:pageId/status`
- `DELETE /api/admin/pages/:pageId`
- `POST`, `PATCH`, and `DELETE /api/admin/navigation-items...`

See [API ROUTES.md](API%20ROUTES.md) for access requirements.

## Extending Blocks

When adding a block type, update the model enum, administrator editor, public
renderer, validation, localization, and any content snapshot or audit behavior.
Permission keys must come from
[`permissions.js`](../server/config/permissions.js) and pass through the shared
normalization helpers.

Example callout:

```json
{
  "type": "callout",
  "variant": "important",
  "body": {
    "en": "Important note",
    "fr": "Note importante"
  }
}
```

Use the administrator UI and public preview route to verify block ordering,
localization, access control, and responsive rendering.
