# Changelog

All notable changes to CMCEN / RCMCE are documented in this file.

This project uses Conventional Commits and git-cliff for changelog generation.

## [0.1.0-rc.1] - 2026-08-21



### Bug Fixes


- frontend: Improve mobile layouts

- header: Align desktop notification bell

- content: Linkify retirement and last post messages

- logging: Redact server output and silence client consoles

- editor: Improve content and translation editing

- admin: Hide legacy attribution accounts

- admin: Enlarge users list

- docker: Include changelog in production image



### Documentation


- accessibility: Add public accessibility guidance



### Features


- docker: Add full-stack compose deployment

- footer: Add member partnership links

- analytics: Embed plausible dashboard

- contact: Add member contact form

- translations: Organize admin translation editor

- admin: Add protected content edit routes

- frontend: Add developer changelog

- content: Add editorial workspace

- content: Consolidate review submissions in workspace

- dashboard: Embed permission-aware admin tools

- content-workspace: Add content navigation shortcuts

- pages: Add visual page builder

- content-workspace: Move event submissions into workspace

- content: Add staff workspace and contributor resubmission



### Maintenance


- Remove site config

- Clean workbook import placeholders


## [0.1.0-beta.6] - 2026-08-19



### Bug Fixes


- ci: Use release token for tag publishing


## [0.1.0-beta.5] - 2026-08-19



### Bug Fixes


- ci: Make release PR assignment non-blocking

- dashboard: Align loading skeleton with content



### CI


- release: Tag prepared releases automatically



### Documentation


- agents: Document automatic release tagging


## [0.1.0-beta.4] - 2026-08-19



### CI


- release: Publish Docker images to Forgejo Packages



### Features


- dashboard: Add animated account accordions


## [0.1.0-beta.3] - 2026-08-19



### Bug Fixes


- ci: Repair release workflow yaml



### CI


- release: Add release publishing workflow



### Documentation


- contributing: Add contributor guidelines


## [0.1.0-beta.2] - 2026-08-19



### Bug Fixes


- ci: Use explicit git-cliff action source

- release: Correct changelog release generation

- ci: Harden release preparation workflow



### CI


- release: Add release preparation workflow



### Features


- notifications: Add notification center


## [0.1.0-beta.1] - 2026-08-19

### Internal Beta

This release establishes the automated changelog baseline for CMCEN / RCMCE.

Historical development before this release predates the repository's enforced
Conventional Commit, Conventional PR title, and squash-merge standards and is
not exhaustively listed here.