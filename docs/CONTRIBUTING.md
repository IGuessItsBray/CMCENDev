# Contributing to CMCEN / RCMCE

Thank you for contributing to CMCEN / RCMCE.

This repository is explicitly **AI-agent friendly**. Contributions created with
AI coding assistants and autonomous coding agents are welcome.

AI-assisted contributions are held to the same standards as manually written
contributions.

The person submitting a contribution remains responsible for the correctness,
security, testing, documentation, and scope of the submitted changes regardless
of whether the work was written manually or with the assistance of an AI agent.

## Before You Start

Before making changes:

1. Read `README.md`.
2. Read `AGENTS.md` in full.
3. Ensure any AI coding agent you use has read and is following `AGENTS.md`.
4. Review documentation relevant to the area you intend to change.
5. Start from the latest `main`.
6. Create a branch following the repository's branch naming standard.

`AGENTS.md` contains the authoritative development and repository policy for
CMCENDev.

Its instructions apply to both human contributors and AI agents.

If this document provides a summary that conflicts with `AGENTS.md`,
`AGENTS.md` takes precedence.

## AI-Assisted Contributions

AI coding agents are welcome and supported in this repository.

This includes tools such as coding assistants, IDE agents, command-line agents,
and other systems capable of modifying the repository.

Use of an AI agent does not exempt a contribution from any repository policy.

### Ensure Your Agent Reads `AGENTS.md`

Before allowing an AI agent to modify the repository, explicitly instruct it to
read and follow:

```text
AGENTS.md
```

Do not assume that an agent has automatically discovered or read the file.

If the agent supports repository instruction files automatically, contributors
should still verify that the instructions were loaded and are being respected.

An agent must follow the same requirements as a human contributor, including:

- branch naming;
- Conventional Commit formatting;
- pull request naming;
- pull request requirements;
- testing requirements;
- documentation requirements;
- dependency policy;
- security requirements;
- configuration documentation requirements;
- API documentation requirements;
- release safety rules;
- repository safety rules.

### Contributor Responsibility

The contributor opening the pull request is responsible for reviewing the
agent's work.

Before submitting AI-assisted changes:

- review the complete diff;
- verify that the implementation matches the intended behavior;
- verify that unrelated files were not modified;
- run the applicable tests;
- verify documentation changes;
- review security-sensitive behavior;
- inspect any dependency changes;
- verify branch, commit, and PR naming;
- ensure no credentials or sensitive information were introduced.

Do not submit agent-generated changes without reviewing them.

### Keep Agents Within Scope

AI agents should be given a clearly defined task.

Do not allow an agent to perform unrelated cleanup merely because it notices
other issues while working.

Examples of unrelated work that should normally be excluded include:

- unrelated refactoring;
- repository-wide formatting;
- dependency upgrades unrelated to the task;
- renaming unrelated files or symbols;
- rewriting unrelated documentation;
- fixing unrelated tests;
- changing unrelated configuration;
- modifying deployment infrastructure unrelated to the requested work.

If another issue is discovered, it should normally be addressed separately.

### Do Not Give Agents Secrets

Never provide an AI agent with credentials or sensitive information that it
does not require.

Do not place secrets in prompts, committed files, documentation, tests, issue
content, or pull request descriptions.

Examples include:

- production `.env` files;
- passwords;
- API tokens;
- Forgejo access tokens;
- SSH private keys;
- JWT secrets;
- SMTP credentials;
- MongoDB credentials;
- MinIO credentials;
- production configuration;
- private user information;
- sensitive operational data.

Use safe placeholders in examples and documentation.

## Development Workflow

All repository changes must go through a pull request.

Direct changes to `main` are prohibited.

The normal contribution flow is:

```text
latest main
    |
    v
create appropriately named branch
    |
    v
make focused changes
    |
    v
add/update tests and documentation
    |
    v
run validation
    |
    v
Conventional Commit
    |
    v
push branch
    |
    v
open conventionally named PR
    |
    v
CI / review
    |
    v
squash merge
```

## Start From Current `main`

New work should normally begin from the latest `main`.

Example:

```sh
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c feat/example-change
```

Do not make normal development changes directly on `main`.

If you are continuing existing work that depends on an existing branch, you may
continue using that branch rather than creating a new branch from `main`.

## Branch Naming

Branches must follow the repository's Conventional Commit-style branch naming
policy.

Format:

```text
<type>/<short-kebab-case-description>
```

Examples:

```text
feat/add-notification-preferences
fix/session-expiry
docs/update-api-documentation
test/add-auth-integration-coverage
refactor/simplify-permission-checks
chore/update-project-documentation
ci/validate-pull-request-titles
```

Use a type that accurately describes the primary purpose of the change.

Common types include:

```text
feat
fix
docs
test
refactor
perf
build
ci
chore
revert
```

Keep branch names concise and descriptive.

Do not use personal names, ticket dumps, arbitrary identifiers, or vague branch
names when a meaningful Conventional Commit-style name can be used.

Avoid names such as:

```text
changes
updates
fix-stuff
test123
new-branch
bray-work
agent-changes
```

## Commit Naming

Commits must follow Conventional Commits 1.0.0.

Format:

```text
<type>(<optional-scope>): <description>
```

Examples:

```text
feat(notifications): add notification preferences
fix(auth): correct session expiry
docs(config): document SMTP settings
test(auth): add passkey integration coverage
refactor(api): simplify permission checks
ci(release): add release publishing workflow
chore(deps): update development dependencies
```

Use imperative, concise descriptions.

The commit type should accurately describe the change.

Do not use vague commit messages such as:

```text
updates
fix
changes
stuff
work
final
more fixes
agent changes
```

Breaking changes must follow the repository's Conventional Commit and Semantic
Versioning policy described in `AGENTS.md`.

## Pull Request Naming

Pull request titles are mandatory and are validated by CI.

PR titles must use Conventional Commit format:

```text
<type>(<optional-scope>): <description>
```

Examples:

```text
feat(notifications): add notification preferences
fix(auth): correct session expiry
docs(config): document project configuration
ci(release): add release publishing workflow
```

A pull request with an invalid title must be corrected before it can be merged.

### Why PR Naming Matters

Pull requests are normally squash-merged into `main`.

The pull request title therefore becomes the canonical commit subject in the
repository's `main` history.

That history is consumed by the project's automated changelog and release
tooling.

The relationship is:

```text
Branch:
feat/add-notification-preferences

Commit:
feat(notifications): add notification preferences

Pull request:
feat(notifications): add notification preferences

Squash merge on main:
feat(notifications): add notification preferences

Changelog:
classified automatically as a feature
```

Correct PR naming is therefore not cosmetic.

It forms part of the project's machine-readable release history.

## Keep Pull Requests Focused

A pull request should address one coherent change.

Avoid combining unrelated work into a single PR.

For example, a feature PR should not also contain an unrelated:

- dependency upgrade;
- repository-wide formatting change;
- authentication refactor;
- documentation rewrite;
- Docker restructuring;
- test cleanup;
- unrelated bug fix.

Small supporting changes that are directly required by the primary change are
appropriate.

Focused pull requests are easier to:

- review;
- test;
- revert;
- understand;
- classify in changelogs;
- troubleshoot after deployment.

## Review Your Changes

Before committing or opening a PR, review the repository state.

At minimum:

```sh
git status --short
git diff --check
git diff
```

Before pushing a commit, review the staged diff:

```sh
git diff --cached --check
git diff --cached
```

Do not rely solely on an AI agent's summary of what it changed.

Inspect the actual diff.

## Testing

Changes should include appropriate testing.

Existing tests relevant to the changed behavior must continue to pass.

Behavior changes should normally include new or updated tests.

Examples include:

- unit tests;
- integration tests;
- API tests;
- authentication tests;
- migration tests;
- regression tests.

Run the applicable repository test suite before submitting a PR.

For server changes, this commonly includes:

```sh
cd server
npm test
```

Changes affecting the production container should also be compatible with the
repository's Docker build checks.

Do not weaken, remove, skip, or bypass a test merely to make a change pass.

If a test reveals a real problem, fix the problem.

If a failure is pre-existing or unrelated, document that clearly in the PR
rather than modifying unrelated code to make the check green.

## Documentation

Documentation is part of the implementation.

Update documentation when a change affects behavior that users, developers, or
operators need to understand.

Relevant documentation may include:

```text
README.md
AGENTS.md
docs/CONFIG.md
docs/API ROUTES.md
api/schema/openapi.yaml
.env.example
```

Documentation changes should normally be included in the same PR as the
behavior they describe.

## Configuration Changes

Environment and configuration changes have additional documentation
requirements.

When adding, removing, renaming, or changing the behavior or expected format of
an environment variable, update both:

```text
.env.example
docs/CONFIG.md
```

Update `README.md` as well when setup, deployment, or operator instructions are
affected.

The configuration documentation contract is:

```text
.env.example     supported variable inventory + safe examples/defaults
docs/CONFIG.md   complete usage, format, security, and deployment reference
README.md        setup and high-level operator guidance
```

These files must remain consistent.

Never put real production credentials in configuration documentation.

## API Changes

Changes to HTTP API behavior must be reflected in both:

```text
docs/API ROUTES.md
api/schema/openapi.yaml
```

API changes should include appropriate validation and integration testing.

Consider:

- request validation;
- response structure;
- HTTP status codes;
- authentication;
- authorization;
- permissions;
- audit logging;
- backward compatibility.

Do not silently change an existing API contract.

## Security-Sensitive Changes

Changes involving security-sensitive functionality require additional review.

Examples include:

- authentication;
- authorization;
- permissions;
- roles;
- JWT handling;
- sessions;
- cookies;
- passwords;
- passkeys/WebAuthn;
- TOTP;
- MFA;
- recovery flows;
- administrative functionality;
- audit logging.

Do not weaken security checks merely to make a feature or test work.

Security-sensitive changes should include tests covering relevant authorized
and unauthorized behavior.

Do not bypass authentication, MFA, authorization, permission, token, or session
checks unless the intended feature explicitly requires and documents that
behavior.

## Dependencies

Do not add a dependency merely because it makes an implementation easier.

Before adding a package, consider whether the functionality can reasonably be
implemented using:

- existing dependencies;
- platform APIs;
- Node.js built-ins;
- existing project utilities.

New dependencies should have a clear justification.

Avoid:

- unnecessary packages;
- abandoned packages;
- duplicate libraries providing functionality already available;
- packages with inappropriate licensing;
- dependencies introduced solely for trivial functionality.

Dependency changes should be kept focused and reviewed carefully.

See `AGENTS.md` for the complete dependency policy.

## Pull Request Descriptions

A PR description should explain enough for another contributor to understand
and validate the change.

Include, as applicable:

- what changed;
- why the change is needed;
- how it was tested;
- configuration changes;
- API changes;
- migration requirements;
- security implications;
- dependency changes;
- deployment considerations;
- known limitations or follow-up work.

Do not claim a test or validation step was performed if it was not actually
performed.

If something could not be tested, say so.

## Continuous Integration

Required CI checks must pass before a pull request is merged.

Current checks may include:

- Conventional PR title validation;
- Node.js tests;
- integration tests;
- Docker image builds;
- other repository validation.

Do not modify, disable, or bypass CI merely to make a pull request mergeable.

Changes to CI itself should be made through the normal branch and pull request
process.

## Squash Merging

CMCENDev normally uses squash merging.

This keeps `main` history aligned with the repository's Conventional Commit
policy.

The final squash commit should use the approved PR title.

For example:

```text
feat(notifications): add notification preferences
```

rather than a generated merge message such as:

```text
Merge pull request #123 from feat/add-notification-preferences
```

Because the squash commit becomes part of the changelog input, contributors
should verify the PR title before merge.

## Changelogs

`CHANGELOG.md` is generated from Conventional Commit history using git-cliff.

Normal contributors should not manually add changelog entries for ordinary
feature or fix PRs.

Instead:

1. use the correct Conventional Commit type;
2. use the correct PR title;
3. allow the PR to be squash-merged normally;
4. allow the release tooling to generate the appropriate changelog entry.

For example:

```text
feat(notifications): add notification preferences
```

will be classified as a feature by the changelog tooling.

Incorrect PR titles can therefore result in incorrect release notes.

Do not manually rewrite generated release history to hide a tooling or commit
classification problem.

## Releases and Version Tags

Normal contributions do not receive version tags.

Do not tag individual features, fixes, commits, or pull requests as beta,
release-candidate, or stable releases.

Release tags identify a complete repository state.

Examples include:

```text
v0.1.0-beta.3
v0.1.0-rc.1
v0.1.0
v1.0.0
```

A release contains the applicable changes merged into `main` since the previous
release tag.

For example:

```text
v0.1.0-beta.2
        |
        +-- feature PR
        +-- bug fix PR
        +-- documentation PR
        +-- another feature PR
        |
        v
v0.1.0-beta.3
```

Those changes collectively form the beta.3 release.

### Release Preparation

Creating a release is an explicit maintainer decision.

Normal contributors and AI agents should not:

- invent a new release version;
- run release preparation as part of an ordinary PR;
- create release branches without being asked;
- create or move release tags;
- publish Forgejo Releases;
- modify existing release history.

Maintainers prepare releases through the repository's Forgejo release
preparation workflow.

The resulting release PR follows the same review and CI requirements as other
changes.

### Beta and Release Candidate Versions

Beta and release-candidate versions are real releases.

Examples:

```text
v0.1.0-beta.3
v0.1.0-rc.1
```

Forgejo identifies these as **pre-releases**.

Stable versions such as:

```text
v0.1.0
v1.0.0
```

are published as normal Forgejo Releases.

The Git tag, changelog version, and Forgejo Release version should always
correspond to the same release.

## Secrets and Sensitive Data

Never commit secrets.

Before submitting a PR, verify that the change does not contain:

- passwords;
- private keys;
- access tokens;
- API keys;
- JWT secrets;
- production database credentials;
- SMTP credentials;
- MinIO credentials;
- private production URLs where disclosure would be inappropriate;
- sensitive user information.

Use placeholders in examples:

```text
JWT_SECRET=
MONGO_URI=mongodb://
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
```

If a secret is accidentally committed, do not merely delete it in a later
commit and assume the problem is resolved.

Notify a maintainer so the credential can be rotated and repository history can
be assessed appropriately.

## Generated and Binary Files

Do not modify generated or binary files unless the change specifically requires
it.

Avoid committing:

- temporary files;
- editor artifacts;
- local logs;
- test output;
- local environment files;
- build output not intended for version control;
- unrelated generated files.

When a repository tool is responsible for generating a file, use the
appropriate tool rather than manually reproducing generated content.

## Database and Migration Changes

Database changes must consider compatibility with existing data.

Do not assume newly introduced fields exist on older MongoDB documents.

Prefer backward-compatible schema evolution and safe defaults.

Do not:

- drop collections;
- delete production data;
- reset databases;
- perform destructive migrations;
- perform bulk destructive data modifications

unless the work has been explicitly authorized and appropriately reviewed.

Migration tooling and migration data should be treated carefully.

## Deployment Considerations

Merging into `main` may trigger deployment automation.

A pull request that requires operator action after deployment must state that
clearly.

Examples include:

- new required environment variables;
- changed environment-variable formats;
- migration requirements;
- infrastructure changes;
- new external services;
- changed storage requirements;
- changed authentication configuration.

Do not assume development defaults are appropriate for production.

Production configuration is maintained outside the repository.

## Pull Request Checklist

Before submitting a PR, confirm:

- [ ] I started from an appropriate current branch.
- [ ] My branch follows the repository naming standard.
- [ ] My commits follow Conventional Commits.
- [ ] My PR title follows the Conventional PR title standard.
- [ ] The PR contains one focused change.
- [ ] I reviewed the complete diff.
- [ ] `git diff --check` passes.
- [ ] Applicable tests pass.
- [ ] I added or updated tests where appropriate.
- [ ] I updated relevant documentation.
- [ ] Configuration changes are reflected in `.env.example` and
      `docs/CONFIG.md`.
- [ ] API changes are reflected in `docs/API ROUTES.md` and
      `api/schema/openapi.yaml`.
- [ ] I reviewed security implications.
- [ ] I reviewed any dependency changes.
- [ ] No secrets or sensitive information are included.
- [ ] No unrelated files were modified.
- [ ] I documented anything I could not test or verify.
- [ ] Any AI agent used for the change read and followed `AGENTS.md`.
- [ ] I personally reviewed AI-generated changes before submitting them.

## Example Contribution

A typical feature contribution might look like:

```sh
git status --short
git fetch origin
git switch main
git pull --ff-only origin main

git switch -c feat/add-notification-preferences

# Make the change.
# Add/update tests.
# Add/update documentation.

git status --short
git diff --check
git diff

cd server
npm test
cd ..

git add <changed-files>
git diff --cached --check
git diff --cached

git commit -m "feat(notifications): add notification preferences"

git push -u origin feat/add-notification-preferences
```

Then open a pull request targeting `main` with:

```text
feat(notifications): add notification preferences
```

and include the applicable testing, configuration, API, security, migration,
dependency, and deployment information in the PR description.

## Getting Help

If you are unsure about repository policy, implementation direction, security
behavior, configuration, or the scope of a proposed change, ask before making a
large or potentially disruptive change.

For repository development policy, consult:

```text
AGENTS.md
```

For project setup and high-level operation, consult:

```text
README.md
```

For environment and deployment configuration, consult:

```text
.env.example
docs/CONFIG.md
```

For API behavior, consult:

```text
docs/API ROUTES.md
api/schema/openapi.yaml
```

When documentation and implementation appear to disagree, call out the
discrepancy rather than silently choosing one interpretation.

## Summary

CMCENDev welcomes both human-written and AI-assisted contributions.

The core expectations are:

1. **Read and follow `AGENTS.md`.**
2. **Ensure any AI agent you use reads and follows `AGENTS.md`.**
3. **Use the required branch, commit, and PR naming conventions.**
4. **Keep pull requests focused.**
5. **Test your changes.**
6. **Update documentation with the implementation.**
7. **Protect secrets and sensitive data.**
8. **Review AI-generated work before submitting it.**
9. **Do not bypass CI, branch protection, security controls, or release
   processes.**
10. **Remember that PR titles become part of the project's changelog and release
    history.**

AI agents are tools for contributing to this project, not exceptions to its
development standards.