#!/usr/bin/env bash
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)
build_dir="$repo_root/build/linux-package"
output_dir="$repo_root/release"
requested_version=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-dir)
      [[ $# -ge 2 ]] || { echo "--build-dir needs a value" >&2; exit 2; }
      build_dir=$2
      shift 2
      ;;
    --output-dir)
      [[ $# -ge 2 ]] || { echo "--output-dir needs a value" >&2; exit 2; }
      output_dir=$2
      shift 2
      ;;
    --version)
      [[ $# -ge 2 ]] || { echo "--version needs a value" >&2; exit 2; }
      requested_version=${2#v}
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || {
  echo "Linux packages must be produced on Linux." >&2
  exit 1
}
for command in node npm cmake cpack ctest ninja sha256sum; do
  command -v "$command" >/dev/null || {
    echo "Required command was not found: $command" >&2
    exit 1
  }
done

manifest_version=$(node -e \
  'process.stdout.write(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).version)' \
  -- "$repo_root/package.json")
if [[ -n "$requested_version" && "$requested_version" != "$manifest_version" ]]; then
  echo "Requested version $requested_version does not match package.json $manifest_version." >&2
  exit 1
fi
version=$manifest_version
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)([-+][0-9A-Za-z.-]+)?$ ]] || {
  echo "package.json version is not a supported semantic version: $version" >&2
  exit 1
}

package_dir="$build_dir/packages"
mkdir -p "$build_dir" "$output_dir" "$package_dir"
cd "$repo_root"
npm ci --ignore-scripts --no-audit --no-fund

cmake -S "$repo_root" -B "$build_dir" -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/usr \
  -DBUILD_TESTING=ON \
  -DLEANMARK_ENABLE_GUI_TESTS=OFF
cmake --build "$build_dir" --parallel
ctest --test-dir "$build_dir" --output-on-failure

prefix="LeanMark-v${version}-linux-x86_64"
export SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH:-$(git -C "$repo_root" log -1 --format=%ct)}
cpack --config "$build_dir/CPackConfig.cmake" -G DEB -B "$package_dir"
cmake -E copy \
  "$package_dir/$prefix.deb" \
  "$output_dir/$prefix.deb"

for artifact in "$output_dir/$prefix.deb"; do
  [[ -f "$artifact" ]] || {
    echo "Expected package was not created: $artifact" >&2
    exit 1
  }
  artifact_name=$(basename -- "$artifact")
  checksum=$(sha256sum "$artifact" | awk '{print $1}')
  printf '%s  %s\n' "$checksum" "$artifact_name" >"$artifact.sha256"
done

bash "$repo_root/tests/linux/Test-DebianPackage.sh" \
  "$output_dir/$prefix.deb"
echo "LeanMark Linux $version packages are ready in $output_dir"
