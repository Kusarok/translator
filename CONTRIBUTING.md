# Contributing

## Before you start

Open an issue for substantial behavior or architecture changes. Never add real credentials, cookies, user data, databases, downloaded media, lyrics, copyrighted artwork, or deployment-specific radio URLs.

By submitting a contribution, you confirm that you have the right to provide it under the repository's Apache-2.0 license.

## Development

```bash
npm ci
cp .env.example .env
npm test
npm start
```

Music development additionally requires Python 3, FFmpeg, and:

```bash
npm run media:install
```

## Pull requests

- Create a focused branch from `master`.
- Keep unrelated changes in separate commits/PRs.
- Add or update tests for behavior changes.
- Update README/configuration examples when setup changes.
- Run `npm test` and inspect `git diff --check`.
- Explain user impact, migration steps, and validation in the PR body.
- Keep the PR in draft while required checks or documentation are incomplete.

Use private vulnerability reporting for security issues as described in [SECURITY.md](SECURITY.md).
