# Code signing for the Windows build

## Status: signing is off

LeanMark applied to [SignPath Foundation](https://signpath.org/) for free code
signing. The application was declined in October 2026, so signing is off.

- The Windows ZIP on GitHub Releases, and the copy winget installs from it, is
  unsigned. Windows SmartScreen may ask for an explicit trust decision.
- The Microsoft Store build is signed by Microsoft when the Store publishes it.

The signing steps in `.github/workflows/build.yml` and
`.signpath/artifact-configuration.xml` are kept, but they do nothing: every
step is skipped unless the repository variable `SIGNPATH_ORGANIZATION_ID` is
set, and it is not set. The rest of this page describes how the setup would
work if a SignPath Foundation application were accepted later.

The version resource in `LeanMark.exe` (ProductName `LeanMark`, ProductVersion
equal to the release version) is still checked by CI on every build.

## What the owner would do

1. Turn on two-factor authentication for the GitHub account `abooodbah`, if it
   is not on already. SignPath Foundation requires it for everyone with commit
   access.
2. Apply at <https://signpath.org/apply> with the repository
   <https://github.com/abooodbah/leanmark>.
3. After acceptance, in SignPath:
   - Create a project with the slug `leanmark` and link it to the predefined
     GitHub.com trusted build system.
   - Add an artifact configuration and paste the contents of
     `.signpath/artifact-configuration.xml`. Make it the project's default.
   - Create a signing policy with the slug `release-signing` (or rename the
     one SignPath Foundation set up), with manual approval and yourself as
     the approver. The workflow uses that slug as written.
   - Create an API token for a CI user that may submit signing requests for
     that policy.
4. In the GitHub repository settings, under Secrets and variables > Actions:
   - Add the variable `SIGNPATH_ORGANIZATION_ID` with the SignPath organization
     ID.
   - Add the secret `SIGNPATH_API_TOKEN` with the API token.

## What would happen at each release

When a `v*` tag is built, the Windows job uploads the unsigned `LeanMark.exe`
as a workflow artifact and submits it to SignPath. The job then waits up to
one hour. Approve the signing request in SignPath within that hour; otherwise
the job fails and no release is published. After approval, the job checks that
the returned executable has a valid Authenticode signature, puts it in the ZIP,
and writes the ZIP's checksum. The release page then says that `LeanMark.exe`
is signed.

Branch and pull request builds never request a signature.

## Keeping it working

- Bump `src/LeanMark.rc` (FILEVERSION, PRODUCTVERSION, FileVersion,
  ProductVersion) with `package.json` at every release. SignPath refuses to
  sign when ProductVersion does not match, and CI fails before that.
- If the set of signed files changes, edit
  `.signpath/artifact-configuration.xml` and paste it into SignPath again. The
  copy in SignPath is the one that is used.
- Only `LeanMark.exe` is signed. `WebView2Loader.dll` is Microsoft's file and
  is shipped as Microsoft provides it.

## Turning it off

Delete the repository variable `SIGNPATH_ORGANIZATION_ID`. The next release is
built unsigned, exactly as before, and its release page says so.
