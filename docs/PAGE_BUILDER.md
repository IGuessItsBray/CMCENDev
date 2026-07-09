Page Builder — Developer documentation

Overview
- Purpose: Create and manage site pages composed of typed blocks (heading, text, image, callout, button, divider). Supports localization and access control.
- Model: /server/models/Page.js defines PageSchema and block schema.

Page model (Mongoose)
- top-level fields:
  - title: { en, fr }
  - slug: normalized string (auto-generated from title)
  - summary: localized summary
  - status: 'draft'|'published'|'archived'
  - blocks: array of PageBlockSchema
  - access: PageAccessSchema (audience, roles, customRoles, permissions)
  - createdBy, updatedBy, publishedBy, publishedAt

PageBlockSchema fields
- type (enum): 'heading'|'text'|'image'|'callout'|'button'|'divider'
- level (heading level): 2-3 (default 2)
- text, body, alt, caption: LocalizedStringSchema { en, fr }
- url, mediaKey, mediaUrl: strings
- variant: 'standard'|'important'

Access control
- PageAccessSchema:
  - audience: 'public'|'authenticated'|'restricted'
  - roles: built-in role names (USER_ROLES)
  - customRoles: ObjectId[] referencing Role documents
  - permissions: array of permission keys validated against PERMISSION_CATALOG
- Normalization: normalizePermissionKeys() enforces canonical permission keys.

Client UI
- Admin pages UI: /server/public/pages-admin.js handles listing and management of pages (load via /api/admin/pages or similar endpoints).
- Public page viewer: /server/public/page.html + /server/public/page.js renders a published page, honoring page.access and localized content.

APIs (server-side expectations)
- CRUD endpoints for pages (typical):
  - GET /api/pages/:slug or /api/pages/:id
  - POST /api/admin/pages
  - PATCH /api/admin/pages/:id
  - DELETE /api/admin/pages/:id
  - Publish/unpublish endpoints may exist or be controlled via PATCH status.

Developer notes & guidelines
- When adding a new block type, update PageBlockSchema enum and front-end editors/renderers.
- Slug normalization: normalizeSlug(title) creates url-safe slugs and is applied in PageSchema.set for slug.
- Localization: prefer storing both en/fr in LocalizedStringSchema; page rendering should select language via user preference or Accept-Language fallback.
- Access checks: use getUserPermissions(user) and Page.access.permissions/roles/customRoles when evaluating whether a user can see or edit a page.

Example block (JSON)
{
  "type": "callout",
  "variant": "important",
  "body": { "en": "Important note", "fr": "Note importante" }
}

Backwards compatibility
- Permissions use legacy mapping in config/permissions.js; when migrating keys, update normalizePermissionKeys and relevant UI lists.

Testing
- Seed pages via server/scripts or API to verify rendering and access rules.
- Use page model pre-validate hook behavior to ensure slug generation is tested.
