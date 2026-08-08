# Security policy

LeanMark treats every Markdown document as untrusted input. Security reports are
welcome for the native host, Markdown rendering, local-resource handling,
WebView2 boundaries, installer behavior, and bundled dependencies.

## Supported versions

Security fixes target the latest published release and the current `main`
branch. Users should update to the newest release before reporting a problem
that may already be fixed.

## Report a vulnerability

Do not open a public issue with exploit details.

1. Open the repository's **Security** tab and choose **Report a vulnerability**
   to send a private report.
2. If private reporting is unavailable, open a minimal issue titled
   `Security contact requested`. Do not include technical details, document
   contents, credentials, or a proof of concept in that issue.

Include the following in the private report when possible:

- the affected LeanMark version or commit;
- the Windows and WebView2 versions;
- clear reproduction steps and a minimal, non-private test file;
- the expected impact and required user interaction;
- a proof of concept or suggested fix, if available.

A maintainer will validate the report and coordinate a fix and disclosure. Wait
until a fix is available or a disclosure date is agreed before publishing the
details. Credit will be included when requested.

Use the public bug form for crashes, rendering errors, and hardening suggestions
that do not expose a vulnerability.
