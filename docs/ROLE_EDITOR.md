# Role Editor

The role editor manages custom roles and user assignments in the administrator
work zone. The main client is
[`admin-users.js`](../server/public/admin-users.js). Canonical permissions live
in [`permissions.js`](../server/config/permissions.js), and built-in role levels
live in [`roles.js`](../server/config/roles.js).

## Access

Role listing and changes require the corresponding role-management permission.
User reads and edits are separately protected by user-management permissions.
The server remains authoritative; hiding an action in the browser is not an
access-control boundary.

## Role Routes

- `GET /api/admin/roles` lists custom roles and the permission catalog.
- `POST /api/admin/roles` creates a role.
- `PATCH /api/admin/roles/:roleId` updates its name and permissions.
- `DELETE /api/admin/roles/:roleId` removes it and unassigns it from users.

Custom role records contain an ObjectId, name, canonical permission keys, and
timestamps. Add new permissions to `PERMISSION_CATALOG` before using them in a
role or route guard.

## User Assignment

- `GET /api/admin/users` lists user summaries.
- `GET /api/admin/users/:userId` returns editable detail.
- `PATCH /api/admin/users/:userId` updates built-in role, custom roles, and
  content areas.
- `PATCH /api/admin/users/:userId/developer` promotes an administrator to
  developer after explicit `DEVELOPER` confirmation. Only an existing developer
  may perform this operation.

The client maps `customRoleIds` to loaded role records for display, but the
server validates assignments and computes effective permissions.

## Maintenance

When adding a permission, update the permission catalog, route middleware,
administrator labels, role UI, API documentation, OpenAPI schema, and audit
logging as applicable. When changing role hierarchy, review every use of
`ROLE_LEVELS` and the derived built-in permission flags.
