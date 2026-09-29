# Account migration preparation

The [complete account mapping](ACCOUNT_MAPPING.md) supersedes earlier treatment
of bios/social links as having no destination. Those fields are implemented
locally in private dashboard profiles and admin user detail; separate historical
account data is preserved without changing active permissions. Deployment and
the expanded profile backfill remain pending.

29 September 2026. Accounts precede content so registered authors/commenters can
be mapped by original WordPress user ID. The importer is prepared and tested;
the operator must run the staged VPS command before any live import is confirmed.

## Confirmed access policy

Import users as members with subscriber access, incomplete profiles and unique
unknown random passwords. Send no email during import. Use the existing Forgot
password flow when a user requests access, including on staging. No separate
activation gate or reactivation UI is wanted. Keep email verification flags
honest: imported addresses are not marked previously verified. Login uses email.

## Verified locally

The private WordPress identity audit contains 2,450 users. All have plausible
emails, unique email/login hashes and status 0. The read-only plan has no
source-account holds; all 2,450 await a destination collision check. References
in the full export include missing comment user ID 31 and missing post author
IDs 38, 1, 123548, 123552, 123582, 123670 and 123849. Those references require
attribution research, not fabricated accounts. Counts cover the full SQL audit,
including records outside the selected content migration; they are not counts
of approved comments or public posts. Guest emails never establish ownership.

Private result: `/private/tmp/cmcen-wordpress-review-20260928/account-plan-20260929.json`.
This temporary file is not a backup. Retain the original private SQL export and
back up final mapping artifacts outside Git before applying an import.

Run from `server/` with Node 24:

```sh
node scripts/migration/plan-accounts.js --source /private/path/wp-identities-private.json --output /private/path/new-account-plan.json
```

The command has no database or mail access, rejects apply mode and refuses to
overwrite an earlier plan. Optional `--destination` accepts a private array of
`{id, emailHash, loginHash}` using the same hash and normalization contract as
the source audit. Verify that contract before preparing a destination export.
Omitting it leaves every account awaiting destination checks; do not pass an
empty array to represent an unchecked database. Collisions are held, never
automatically merged, and destination IDs remain null until a verified import.

## Account and recovery findings

`User` supports member, ghost and invited accounts, with incomplete profiles
allowed through `profileComplete: false`. Passwords are required and hashed on
save. Subscriber is the default role; subscriptions default off. Existing admin
provisioning creates an invited user and immediately attempts email delivery,
so it cannot be reused directly for a silent bulk import.

The password-reset request currently accepts any matching User and confirmation
sets its password. Login has no dedicated imported-account activation gate.
The operator explicitly accepts self-service recovery on staging. The earlier
proposal for an inactive-account gate is superseded. No login, recovery or email
behavior was changed; authenticated profile endpoints now include the new fields.

## Import procedure

1. Obtain a fresh, minimal VPS user inventory through its authorized operator
   (Docker access previously required interactive sudo). Check email and username
   collisions and protect the existing developer account. Same email is a review
   candidate, not permission to overwrite or assign historical ownership.
2. `import-accounts.js` reads an allowlisted private extract: source ID, email,
   display name and status. It creates member/subscriber accounts with email as
   username. It never copies WordPress passwords, roles, subscriptions or sessions,
   and never imports mail services. Existing User validation and bcrypt save hooks
   apply. Missing profile details remain unfilled rather than invented.
3. Its dry run checks the explicit target origin and all current users/mappings.
   Apply requires matching account/mapping backup data and unique email/username
   indexes. Any source collision stops the whole apply before account creation.
   The VPS runner copies and verifies the EJSON backup outside the container first.
4. Durable `legacyaccountmaps` documents map source URL/user ID to Mongo user ID.
   A pending mapping is reserved before creating its user; interrupted imports
   resume without replacing an existing password. Completed mappings are skipped.
   Reruns require a fresh backup, not reuse of an old run directory.
5. Verification checks every source mapping and confirms pre-existing accounts
   are unchanged. The private backup includes password hashes and must never be
   pasted or committed. Only dry-run/applied count reports are safe to share.
   Content imports must consume this map; guests remain separately attributed.

Four unit tests and a Mongo-backed import test cover privilege/credential
allowlisting, collisions, backup/apply, bcrypt storage, preservation of the existing
developer, interrupted mapping recovery and repeat runs. A live recovery email
has not been requested: the operator explicitly asked for no emails now.

The operator confirmed this import completed: 2,450 accounts created and mappings
verified, no conflicts or emails. The private report/backup directory is
`/home/eric/cmcen-vps/account-import.1dB7sm`. No need to rerun account creation.

## Profile backfill

The initial importer omitted profile metadata. The operator started that import
and requested a separate backfill for the same accounts. Do not rerun account
creation to fill profiles. `backfill-account-profiles.js` requires all 2,450
source mappings to be complete and resolves users only through those mappings.

| WordPress profile field | User field |
| --- | --- |
| first_name / last_name | firstName / lastName |
| mepr-address-one / mepr-address-two | address.line1 / address.line2 |
| mepr-address-city / mepr-address-country | address.city / address.country |
| mepr-address-state / mepr-address-zip | address.stateProvince / address.postalCode |
| mepr_rank / mepr_post_nominals | rank / postNominals |
| mepr_company / mepr_status | company / status |
| mepr_affiliation_element | affiliationElement (air-force becomes air_force) |
| mepr_mosid_moc_trade / mepr_mosid_moc_trade_other | trade / tradeOther |
| mepr_current_unit / Phone | currentUnit / phone |
| locale, otherwise icl_admin_language | preferredLanguage (en/fr) |

The last row is an inference from the legacy interface language, not mailing
consent. An explicit French source preference replaces the importer's English
default only on an untouched imported account (creation and update timestamps
equal, preceding mapping completion). Otherwise existing values remain intact.

The initial private source check found 23,340 mapped values, with one overlength
unit entry (source user 466). The local User model now permits 256 characters,
covering its full 183 characters; the deployed model must be updated before the
staged backfill can accept it. No source truncation is needed. The live dry run
will determine how many destination fields are actually empty. Conflicting,
invalid and already-populated different fields are reported by source ID and
field name without exposing their values. Biography/social fields lack User
schema destinations; retain the original SQL. Billing/payment/plugin metadata
is not substituted for member profile fields or imported as profile content.

The runner backs up users and mappings, verifies that backup outside the
container, then fills missing fields using compare-and-set updates. Concurrent
edits cause skips; reruns preserve existing values. Passwords, login/email,
permissions, subscriptions and profileComplete are untouched. Four focused tests
(including a Mongo-backed apply/rerun test) cover these boundaries.

The earlier profile runner below is superseded by the expanded version in
[the complete mapping](ACCOUNT_MAPPING.md); do not run this old version:

```sh
bash ~/cmcen-vps/cmcen-account-profiles-20260929/run.sh
```

The private bundle is staged; no live profile update is confirmed until the
operator runs it. Share the count/issue report, never the EJSON backup or extract.
