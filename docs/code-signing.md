# Code signing for the Windows build

LeanMark's Windows executable can be signed for free through
[SignPath Foundation](https://signpath.org/). The repository already carries
what the foundation asks for: the code signing policy in `README.md`, on the
website, and on every release page; the privacy policy; uninstall
instructions; and a version resource in `LeanMark.exe` with ProductName
`LeanMark` and ProductVersion equal to the release version, which CI checks on
every build.

The signing steps in `.github/workflows/build.yml` do nothing until the
repository variable `SIGNPATH_ORGANIZATION_ID` is set. After that they run
only for release tags.

## What the owner does

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

## What happens at each release

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
