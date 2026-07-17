# Security policy

## Supported versions

Security fixes are applied to the current `master` branch. Older commits and self-hosted deployments are not maintained automatically.

## Reporting a vulnerability

Do not open a public issue for credentials, authentication bypasses, remote code execution, SSRF, injection, unauthorized media access, or exposure of user data.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/Kusarok/translator/security/advisories/new>

Include the affected commit, reproduction steps, expected impact, and any suggested remediation. Do not access data that is not yours, interrupt the public service, or publish the issue before a fix is available.

## Operator responsibilities

- Keep `.env`, `.env.radio`, `data/`, OAuth secrets, cookies, and provider keys outside Git.
- Rotate any credential that has appeared in chat, logs, screenshots, commits, or issue reports.
- Run the public web service behind HTTPS.
- Bind media and radio workers to loopback or a private network.
- Set `TRUST_PROXY` only to the actual proxy topology.
- Restrict filesystem access to the service account and back up encrypted copies.
- Keep Node.js, FFmpeg, Python media tools, and npm dependencies updated.
- Review radio and media sources before enabling them.

## Public security boundaries

The browser communicates with the main Express application. Internal worker ports are not designed as public APIs. A deployment that exposes ports 8090 or 8091 directly weakens the expected security boundary.
