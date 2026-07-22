Role Editor — Developer documentation

Overview
- Purpose: Admin work-zone UI for viewing/creating/editing/deleting custom roles and assigning them to users.
- Key client file: /server/public/admin-users.js
- Permissions config: /server/config/permissions.js (PERMISSION_CATALOG lists keys and descriptions)
- Built-in roles: /server/config/roles.js (USER_ROLES and ROLE_LEVELS)

Client flows
- Initialization: initializeAdminUsersPage() verifies current admin via /api/me and then loads users or roles depending on the active view.
- Loading roles: loadAdminRoles() GET /api/admin/roles -> sets customRoles and permissionCatalog.
- Create role: createAdminRole(payload) POST /api/admin/roles with payload { name, permissions, ... }.
- Save role: saveAdminRole(roleId, payload) PATCH /api/admin/roles/:id.
- Delete role: deleteAdminRole(role) DELETE /api/admin/roles/:id (client confirms before request).
- Role selection: selectAdminRole(roleId) updates selectedRoleId in state and re-renders view.

Data model (client-side expectations)
- Role object fields (from API):
  - _id: ObjectId
  - name: string
  - permissions: [string] (permission keys from PERMISSION_CATALOG)
  - createdAt/updatedAt metadata

Permissions & access
- Permission keys are canonical strings (e.g., pages.manage, users.manage). See /server/config/permissions.js for full catalog and legacy mapping.
- getUserPermissions(user) merges built-in flags based on role level and custom role permissions; developers should use this server-side and client-side for UI gating.

Assigning roles to users
- Server returns customRoles and users; syncAssignedCustomRoles(users, customRoles) maps user.customRoleIds to role objects for quick rendering.
- Saving user: saveAdminUser(userId, payload) PATCH /api/admin/users/:id.

Developer notes
- To add a new permission: add to PERMISSION_CATALOG and update any UI lists that render permissionCatalog.
- To change default role hierarchy, edit /server/config/roles.js ROLE_LEVELS; getBuiltInPermissionFlags uses those levels to compute legacy flags.
- Be careful: deleting a role removes it from all assigned users client-side; server should enforce the same.

API endpoints (admin)
- GET /api/admin/roles
- POST /api/admin/roles
- PATCH /api/admin/roles/:id
- DELETE /api/admin/roles/:id
- GET /api/admin/users and GET /api/admin/users/:id
- PATCH /api/admin/users/:id
- PATCH /api/admin/users/:id/developer (promote): only existing developers can promote, and only administrator accounts can be promoted to developer. Subscribers must be promoted to administrator first.

UI components
- AdminUsersView (client) orchestrates tabs, actions and binds to state/actions (createRole, saveRole, deleteRole, selectRole).
- Use adminApiJson() wrapper to automatically include token and standard error/redirect behavior.
