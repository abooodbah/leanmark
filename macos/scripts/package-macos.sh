#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: package-macos.sh --app <LeanMark.app> --version <x.y.z> [options]' \
    '' \
    'Options:' \
    '  --output <directory>       Artifact directory (default: ./release)' \
    '  --sign ad-hoc|unsigned     Local signing mode (default: ad-hoc)' \
    '' \
    'This script does not perform or claim Developer ID signing or notarization.'
}

app_path=''
version=''
output_path='release'
signing_mode='ad-hoc'

while (($# > 0)); do
  case "$1" in
    --app)
      app_path=${2:-}
      shift 2
      ;;
    --version)
      version=${2:-}
      shift 2
      ;;
    --output)
      output_path=${2:-}
      shift 2
      ;;
    --sign)
      signing_mode=${2:-}
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ $(uname -s) != 'Darwin' ]]; then
  printf '%s\n' 'macOS packaging must run on macOS.' >&2
  exit 2
fi
if [[ -z $app_path || ! -d $app_path || ${app_path##*.} != 'app' ]]; then
  printf 'A built .app bundle is required: %s\n' "$app_path" >&2
  exit 2
fi
if [[ ! $version =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  printf 'Version must be SemVer-like (for example 0.2.0): %s\n' "$version" >&2
  exit 2
fi
if [[ $signing_mode != 'ad-hoc' && $signing_mode != 'unsigned' ]]; then
  printf 'Signing mode must be ad-hoc or unsigned: %s\n' "$signing_mode" >&2
  exit 2
fi

app_parent=$(cd "$(dirname "$app_path")" && pwd -P)
app_path="$app_parent/$(basename "$app_path")"
mkdir -p "$output_path"
output_path=$(cd "$output_path" && pwd -P)

bundle_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  "$app_path/Contents/Info.plist")
if [[ $bundle_version != "$version" ]]; then
  printf 'Bundle version %s does not match package version %s.\n' \
    "$bundle_version" "$version" >&2
  exit 2
fi

executable="$app_path/Contents/MacOS/LeanMark"
if [[ ! -x $executable ]]; then
  printf 'LeanMark executable is missing: %s\n' "$executable" >&2
  exit 2
fi
architectures=$(lipo -archs "$executable")
if [[ " $architectures " != *' arm64 '* || " $architectures " != *' x86_64 '* ]]; then
  printf 'Universal 2 package requires arm64 and x86_64; found: %s\n' \
    "$architectures" >&2
  exit 2
fi

temporary_root=$(mktemp -d "${TMPDIR:-/tmp}/leanmark-package.XXXXXX")
cleanup() {
  case "$temporary_root" in
    "${TMPDIR:-/tmp}"/leanmark-package.*)
      rm -rf -- "$temporary_root"
      ;;
    *)
      printf 'Refusing to clean unexpected temporary path: %s\n' \
        "$temporary_root" >&2
      ;;
  esac
}
trap cleanup EXIT

staged_app="$temporary_root/LeanMark.app"
ditto --norsrc --noextattr "$app_path" "$staged_app"
xattr -cr "$staged_app"

hardened_runtime='false'
if [[ $signing_mode == 'ad-hoc' ]]; then
  if codesign --display --verbose=4 "$staged_app" >/dev/null 2>&1; then
    signature_details=$(codesign --display --verbose=4 "$staged_app" 2>&1)
    if [[ $signature_details != *'Signature=adhoc'* ]]; then
      printf '%s\n' \
        'Refusing to replace a non-ad-hoc signature in the input app bundle.' >&2
      exit 2
    fi
  fi
  codesign --force --sign - --options runtime --timestamp=none "$staged_app"
  codesign --verify --strict --verbose=2 "$staged_app"
  hardened_runtime='true'
else
  codesign --remove-signature "$staged_app" >/dev/null 2>&1 || true
  codesign --remove-signature "$staged_app/Contents/MacOS/LeanMark" \
    >/dev/null 2>&1 || true
  if codesign --verify "$staged_app" >/dev/null 2>&1; then
    printf '%s\n' 'Unsigned mode could not remove the existing signature.' >&2
    exit 2
  fi
fi

# Fixed mtimes and no timestamp authority make local artifacts reproducible from
# identical build inputs. This does not turn an ad-hoc signature into a trusted one.
find "$staged_app" -exec touch -h -t 200001010000 {} +

package_name="LeanMark-v${version}-macos-universal-preview"
archive_path="$output_path/${package_name}.zip"
checksum_path="${archive_path}.sha256"
metadata_path="${archive_path}.metadata.json"
temporary_archive="$temporary_root/${package_name}.zip"

ditto -c -k --norsrc --noextattr --keepParent "$staged_app" "$temporary_archive"
rm -f -- "$archive_path" "$checksum_path" "$metadata_path"
mv "$temporary_archive" "$archive_path"

digest=$(shasum -a 256 "$archive_path" | awk '{print $1}')
printf '%s  %s\n' "$digest" "$(basename "$archive_path")" > "$checksum_path"

printf '%s\n' \
  '{' \
  '  "schemaVersion": 1,' \
  '  "product": "LeanMark",' \
  "  \"version\": \"$version\"," \
  '  "platform": "macOS",' \
  '  "releaseChannel": "preview",' \
  '  "architectures": ["arm64", "x86_64"],' \
  '  "artifact": {' \
  "    \"file\": \"$(basename "$archive_path")\"," \
  "    \"sha256\": \"$digest\"" \
  '  },' \
  '  "signing": {' \
  "    \"mode\": \"$signing_mode\"," \
  '    "developerID": false,' \
  "    \"hardenedRuntime\": $hardened_runtime," \
  '    "trustedPublisher": false' \
  '  },' \
  '  "notarization": {' \
  '    "status": "not-attempted",' \
  '    "ticketStapled": false' \
  '  },' \
  '  "publicDistributionReady": false' \
  '}' > "$metadata_path"

printf 'Created %s\n' "$archive_path"
printf 'Checksum %s\n' "$checksum_path"
printf 'Trust metadata %s\n' "$metadata_path"
printf '%s\n' \
  'This macOS preview is not Developer ID signed, notarized, or Gatekeeper-trusted.'
