# Complete legacy account field mapping

Audited 29 September 2026 against all 2,450 `wp_users` records and all 281
distinct `wp_usermeta` keys, including empty fields. This is the mapping
specification for extending the migration, not confirmation of applied changes.
The [field inventory](account-field-inventory.json) accounts for every account
column and metadata key without including personal values or credentials.

There are no public or member-browsable profile pages. Members continue to see
and edit their own information in the dashboard. New personal fields follow that
same boundary; authorized account administration remains separate. Do not add
these fields to public authors, comments, member lists or API projections.

## Personal fields

Counts below are populated source users, not confirmed destination updates.
Existing non-empty destination values win; conflicting values remain in the
private migration evidence. Do not truncate originals or manufacture missing data.

| Source | Destination | Users | Treatment |
| --- | --- | ---: | --- |
| user_email | email and username | 2,450 | Initial account import; never replace current email during backfill. |
| display_name | accountName | 2,450 | Initial account import; keep separate from first/last name. |
| first_name / last_name | firstName / lastName | 2,448 each | Existing dashboard fields. |
| mepr-address-one / mepr-address-two | address.line1 / address.line2 | 1,349 / 75 | Member address; preserve existing components independently. |
| mepr-address-city / mepr-address-country | address.city / address.country | 1,407 / 1,404 | Preserve source values; do not infer location from billing or plugin geolocation. |
| mepr-address-state / mepr-address-zip | address.stateProvince / address.postalCode | 1,391 / 1,367 | Preserve codes/text, including postal formatting. |
| mepr_rank | rank | 2,252 | Existing dashboard field. |
| mepr_post_nominals | postNominals | 613 | Existing dashboard field. |
| mepr_company | company | 312 | Existing dashboard field. |
| mepr_status | status | 1,737 | Existing enum values match. This is service status, not WordPress user_status. |
| mepr_affiliation_element | affiliationElement | 2,426 | air-force maps to air_force; army/navy/other match. |
| mepr_mosid_moc_trade | trade | 1,995 | Preserve original trade text. |
| mepr_mosid_moc_trade_other | tradeOther | 229 | Retain independently of trade. |
| mepr_current_unit | currentUnit | 1,317 | Longest value is 183 characters. Model limit raised from 160 to 256 to preserve it intact; deployment is still required. |
| Phone | phone | 570 | Preserve formatting. |
| description | **biography — new field** | 4 | All four are plain text; longest is 935 characters. Add an optional owner-editable multiline field with enough capacity; render as text. Preserve originals. |
| user_url | **websiteUrl — new field** | 3 | Two http URLs and one https URL. Preserve scheme; validate HTTP(S), reject executable schemes, do not fetch submitted URLs. |
| facebook | **socialLinks.facebook — new field** | 1 | Optional owner-editable link. Validate the actual value before import, preserving raw source separately if normalization is needed. Other platforms can be added when needed. |

The biography, website and Facebook fields are now implemented locally in the
model, authenticated profile read/update, owner dashboard and admin user detail.
They are excluded from ordinary model queries by default. No public profile
page exists. Admin detail requires canReadUsers and audits access without
copying private field values into audit records. Deployment is still pending.

## Language and identity provenance

- `ID` remains the authoritative WordPress identity in `legacyaccountmaps`.
  Preserve `user_login`, `user_nicename`, `uuid` and `nickname` as private legacy
  identity metadata rather than changing current logins or adding public slugs.
  Nickname exists for all 2,450 users; 35 differ from the old login. Do not treat
  a WordPress nickname as a verified preferred name or overwrite accountName.
- Preserve all 2,450 `user_registered` values as original registration timestamps
  in migration provenance. Retain the original string/timezone uncertainty; do
  not replace Mongo createdAt or label a timezone-less WordPress date UTC.
- Preserve `user_status` as legacy technical status. It is not military service
  status, email verification, membership entitlement or a new access policy.
- `locale` is populated for 709 accounts (708 en_US, one fr_CA).
  `icl_admin_language` is populated for 2,449 (2,448 en, one fr). These describe
  the WordPress interface, not verified correspondence preference. The earlier
  backfill infers preferredLanguage from locale, otherwise admin language, and
  only replaces the untouched import default. Retain the evidence and inference
  explicitly; never override a user's subsequent choice. Other language/editing
  metadata is provenance, not authority to translate user content.

Use the existing preferredLanguage field rather than introducing another account
language setting. Login applies it; the header toggle stores a browser-local
language choice without updating the account. WordPress locale/admin language
seeds the account preference once; subsequent user choices take precedence.
The source scan found no other existing mapped profile fields over their current
length limits. Expand limits when real source data requires it, rather than
truncating content to arbitrary historical limits.

## Billing, membership and other account history

Preserve these in a separate private, source-linked legacy account record, not
as editable personal profile fields or current entitlements. The expanded
backfill stores this allowlisted source data in `legacyaccountprofiles`, keyed
by source identity and mapped Mongo user ID. Admin user details display it in
a separate legacy-data section; ordinary member endpoints do not return it.

- Billing identity: billing_email (181), billing_first_name (180),
  billing_last_name (179), plus billing address and phone. Eleven billing first
  names and six last names differ from member names. Some billing addresses also
  differ. Do not overwrite member identity/address with purchase details.
- Two billing_phone values exist where Phone is absent. Preserve them as billing
  contact numbers; do not guess that they are the member's personal number.
- Paying-customer/order counters and saved cart metadata are historical commerce
  data, not proof of current membership, payment status or permission.
- Organizer/speaker flags, the single `mepr_user_message`, historical consent and
  signup-notice flags retain their exact source key/value with limited access.
  Do not reinterpret them as moderator rights, a biography, marketing consent
  or an instruction to send email.
- Preserve old activity dates as legacy history without substituting them for
  current login or profile-edit timestamps.
- Preserve old capability/role information as historical evidence only. Imported
  accounts remain subscribers; no legacy permissions are automatically granted.
- Preserve `wpml_block_new_email_notifications` as a legacy notification setting;
  it neither subscribes users to new mailings nor controls requested password
  recovery. No migration sends mail.
- Five ambiguous keys (`mec_op`, `mlf_display_info`, `_icl_preferences`,
  `wpseo_metadesc`, `ppscc_birthday_message`) remain labelled legacy context for
  inspection, without inventing a personal-profile meaning.

The SQL export has only users, usermeta, posts, postmeta, comments and commentmeta.
It has no dedicated MemberPress transaction/subscription tables. These account
metadata fields cannot establish complete purchase or membership history. Any
order records in posts/postmeta need their own inventory before such a claim.

## Explicit non-profile dispositions

- Nine profile-like metadata keys are empty: Google Plus aliases, Twitter,
  honourary rank, alternate rank, salutation/other salutation, custom nickname
  and pronouns. Record their presence; there are no values to import or reasons
  to invent defaults. Shipping metadata is also empty in this export.
- WordPress/plugin interface state (181 keys) stays in the original export, not
  the live User schema: editor layouts, dismissed notices, cache/tracking state,
  admin screen preferences and similar implementation details. Each key is
  enumerated in the inventory, so this is an explicit disposition.
- Password hashes, activation keys, sessions, MFA seeds/backup codes, security
  tokens and payment-token references are not transferred into active accounts.
  Preserve the secured original export under its existing controls, never in
  public reports, profile fields or a broadly accessible legacy metadata blob.

## Delivery state

Account deletion (self-service or administrator) removes the private legacy
profile record and strips identifying fields from the identity map. A source-key
tombstone remains to prevent a later import from recreating the deleted account.
This cleanup runs only when the existing authorized deletion flow is used.

The original account import was operator-confirmed complete: 2,450 created,
2,450 verified mappings, no collisions and no email. The expanded backfill now
includes the new fields and legacy-history storage. A source-only validation
of all 2,450 expanded records found no invalid mapped values. The original
profile backfill has not been run, according to the operator.

Deploy the expanded application before running the new backfill; it refuses
models without the new fields or the expanded unit limit. It saves a private
backup including users, mappings and existing legacy history, preserves edits
with compare-and-set updates, and never resets passwords or sends mail.
The new private runner is `~/cmcen-vps/cmcen-account-profiles-expanded-20260929/run.sh`.
Do not run it until the updated application is deployed. No live profile backfill
is confirmed yet.

Private comprehensive extract:
`/private/tmp/cmcen-wordpress-review-20260928/complete-account-mapping-source-v2.json`.
It retains allowlisted identity/profile/history data; no passwords, activation
keys, session tokens or MFA/payment secrets. Temporary files are not backups;
retain the original SQL and secure the migration artifacts before application.
