#!/usr/bin/env bash
set -euo pipefail

if (($# != 2)); then
  printf '%s\n' 'Usage: smoke-macos.sh <LeanMark.app> <fixture.md>' >&2
  exit 2
fi

app_path=$1
fixture_path=$2
executable="$app_path/Contents/MacOS/LeanMark"

if [[ $(uname -s) != 'Darwin' ]]; then
  printf '%s\n' 'The WKWebView smoke check requires macOS.' >&2
  exit 2
fi
if [[ ! -x $executable ]]; then
  printf 'LeanMark executable is missing: %s\n' "$executable" >&2
  exit 2
fi
if [[ ! -f $fixture_path ]]; then
  printf 'Smoke fixture is missing: %s\n' "$fixture_path" >&2
  exit 2
fi

"$executable" --smoke-test "$fixture_path"
