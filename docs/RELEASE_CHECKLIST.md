# Release checklist

## Source and history

- [ ] Working tree contains only intended changes.
- [ ] `.env`, `.env.radio`, `data/`, virtual environments, logs, databases, and media are ignored.
- [ ] Current files and Git history have been scanned for secrets.
- [ ] Any credential previously exposed in chat, screenshots, logs, or commits has been rotated.
- [ ] `LICENSE` remains present and third-party notices are current.

## Quality

- [ ] `npm ci` succeeds on a clean checkout.
- [ ] Runtime uses Node.js 22.13 or newer.
- [ ] `npm test` passes.
- [ ] `git diff --check` passes.
- [ ] Local startup and `/api/health` have been checked.
- [ ] Database migrations have been tested on a backup copy.

## Security and privacy

- [ ] HTTPS, proxy trust, firewall, and worker bindings are correct.
- [ ] Server-funded keys require owner protection and rate limits.
- [ ] OAuth callback URLs exactly match production configuration.
- [ ] Deployment-specific privacy/contact/retention information is published.
- [ ] Account and content deletion requests have an operator process.
- [ ] Backups are encrypted, access-controlled, and restorable.

## Media and legal review

- [ ] No database, media, lyric, artwork, translation, or user record is included in the release.
- [ ] Every configured catalog and radio source has documented authorization.
- [ ] Required creator attribution, source links, license links, and modification notices are displayed.
- [ ] Platform branding, metadata, OAuth, and API requirements have been reviewed.
- [ ] Generic media tooling is described as authorized-use-only.

## GitHub release

- [ ] PR explains the complete diff, user impact, migrations, and checks.
- [ ] CI and review are complete.
- [ ] Version/tag and changelog are prepared if this is a release.
- [ ] Production deployment is made from the reviewed merge commit.
