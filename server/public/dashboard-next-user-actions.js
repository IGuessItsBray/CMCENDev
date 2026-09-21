"use strict";

(() => {
  const t = (key, values) => window.translate(key, values);
  const nameOf = (user) =>
    CMCENUtils.getUserDisplayName(user, t("unknown_user"));

  function capabilities(actor, target) {
    const p = actor.permissions || {};
    const self = String(target?._id) === String(actor._id || actor.id);
    const developer = actor.role === "developer";
    return {
      edit: p.canManageUsers === true,
      role:
        p.canManageUsers === true &&
        !self &&
        target?.role !== "developer" &&
        (developer || target?.role !== "internal_beta"),
      customRoles: p.canManageUsers === true && !self,
      invite: p.canProvisionUsers === true,
      resend:
        p.canProvisionUsers === true &&
        target?.accountType === "invited" &&
        (developer || target?.role !== "internal_beta"),
      resetMfa:
        p.canResetUserMfa === true && !self && target?.mfa?.enabled === true,
      remove: p.canDeleteAnyUser === true && !self,
      promote:
        p.canManageUsers === true &&
        developer &&
        target?.role === "administrator",
    };
  }

  function assignableRoles(roles, actor, target, invitation = false) {
    return roles.filter(
      (role) =>
        role !== "developer" &&
        (!invitation || role !== "ghost") &&
        (role !== "internal_beta" ||
          actor.role === "developer" ||
          (!invitation && target?.role === role)),
    );
  }

  function changes(original, current, allowed) {
    const result = {};
    if (allowed.role && original.role !== current.role)
      result.role = current.role;
    for (const [key, canEdit] of [
      ["contentAreas", allowed.edit],
      ["customRoleIds", allowed.customRoles],
    ]) {
      if (
        canEdit &&
        JSON.stringify([...(original[key] || [])].sort()) !==
          JSON.stringify([...(current[key] || [])].sort())
      ) {
        result[key] = current[key];
      }
    }
    return result;
  }

  async function perform(action, target, { api, actor, isCurrent }) {
    const allowed = capabilities(actor, target);
    if (!allowed[action]) return null;
    const path = `/api/admin/users/${encodeURIComponent(target._id)}`;
    const ask = async (method, ...args) => {
      const answer = await window.CMCENModal[method](...args);
      return isCurrent() ? answer : null;
    };
    const confirm = (message, title, destructive = false) =>
      ask("confirm", message, {
        title,
        confirmText: title,
        destructive,
      });
    if (action === "resend") {
      if (
        !(await confirm(
          t("admin_next_users_resend_confirm", { name: nameOf(target) }),
          t("admin_next_users_resend"),
        ))
      )
        return null;
      return api(`${path}/invitation/resend`, { method: "POST" });
    }
    if (action === "resetMfa") {
      if (
        !(await confirm(
          t("admin_users_mfa_reset_confirm", { name: nameOf(target) }),
          t("admin_users_mfa_reset"),
          true,
        ))
      )
        return null;
      return api(`${path}/mfa-reset`, { method: "PATCH" });
    }
    if (action === "promote") {
      if (
        !(await confirm(
          t("admin_users_promote_confirm", { name: nameOf(target) }),
          t("admin_users_promote_developer"),
        ))
      )
        return null;
      if (
        !(await confirm(
          t("admin_users_promote_access_confirm"),
          t("admin_users_promote_developer"),
        ))
      )
        return null;
      const confirmation = await ask(
        "prompt",
        t("admin_users_promote_prompt"),
        {
          title: t("admin_users_promote_developer"),
          inputLabel: "DEVELOPER",
          confirmText: t("modal_confirm"),
        },
      );
      if (confirmation !== "DEVELOPER") return null;
      return api(`${path}/developer`, {
        method: "PATCH",
        body: { confirmed: true, confirmation },
      });
    }
    if (action !== "remove") return null;
    const contentDisposition = await ask(
      "choose",
      t("admin_next_users_delete_content", { name: nameOf(target) }),
      {
        title: t("admin_next_users_delete"),
        choices: [
          {
            value: "keep_and_anonymize",
            label: t("admin_next_users_keep_content"),
            description: t("admin_next_users_keep_content_help"),
          },
          {
            value: "delete_all",
            label: t("admin_next_users_delete_all"),
            description: t("admin_next_users_delete_all_help"),
            destructive: true,
          },
        ],
      },
    );
    if (!contentDisposition) return null;
    const [totp, passkeys] = await Promise.all([
      api("/api/mfa/totp/status"),
      api("/api/mfa/webauthn/credentials"),
    ]);
    if (!isCurrent()) return null;
    const hasTotp = totp?.enabled === true;
    const hasPasskey = Array.isArray(passkeys) && passkeys.length > 0;
    if (!hasTotp && !hasPasskey)
      throw new Error(t("admin_next_users_mfa_required"));
    let mfaMethod = hasTotp ? "totp" : "webauthn";
    if (hasTotp && hasPasskey) {
      mfaMethod = await ask("choose", t("admin_next_users_choose_mfa"), {
        title: t("admin_next_users_delete"),
        choices: [
          { value: "totp", label: t("mfa_totp_title") },
          { value: "webauthn", label: t("mfa_passkey_title") },
        ],
      });
      if (!mfaMethod) return null;
    }
    let mfaCode = "";
    if (mfaMethod === "totp") {
      mfaCode = await ask("prompt", t("admin_next_users_enter_code"), {
        title: t("admin_next_users_delete"),
        inputLabel: t("mfa_totp_title"),
        confirmText: t("admin_next_users_delete"),
        destructive: true,
      });
      if (!mfaCode) return null;
    } else {
      if (
        !(await confirm(
          t("admin_next_users_delete_confirm", { name: nameOf(target) }),
          t("admin_next_users_delete"),
          true,
        ))
      )
        return null;
      CMCENUtils.ensureWebAuthnAvailable();
      const options = CMCENUtils.preparePublicKeyRequestOptions(
        await api("/api/mfa/webauthn/authenticate/options", { method: "POST" }),
      );
      if (!isCurrent()) return null;
      const assertion = await navigator.credentials.get({ publicKey: options });
      if (!isCurrent() || !assertion) return null;
      await api("/api/mfa/webauthn/authenticate/verify", {
        method: "POST",
        body: CMCENUtils.serializeAssertionCredential(assertion),
      });
    }
    if (!isCurrent()) return null;
    return api(path, {
      method: "DELETE",
      body: { contentDisposition, mfaMethod, mfaCode },
    });
  }

  window.DashboardNextUserActions = Object.freeze({
    capabilities,
    assignableRoles,
    changes,
    perform,
  });
})();
