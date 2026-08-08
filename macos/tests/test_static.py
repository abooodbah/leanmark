#!/usr/bin/env python3
"""Dependency-free static security and packaging checks for the macOS host."""

from __future__ import annotations

import plistlib
import json
import sys
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def contains_all(text: str, needles: list[str], label: str) -> None:
    missing = [needle for needle in needles if needle not in text]
    require(not missing, f"{label} is missing: {', '.join(missing)}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: test_static.py <repository-root>", file=sys.stderr)
        return 2

    root = Path(sys.argv[1]).resolve()
    mac = root / "macos"
    required = [
        mac / "CMakeLists.txt",
        mac / "Info.plist.in",
        mac / "src" / "LMAppDelegate.mm",
        mac / "src" / "LMDocument.mm",
        mac / "src" / "LMDocumentWindowController.mm",
        mac / "src" / "LMResourceSchemeHandler.mm",
        mac / "scripts" / "package-macos.sh",
        root / "src" / "core" / "MarkdownCore.h",
        root / "src" / "core" / "MarkdownCore.cpp",
        root / "scripts" / "stage-runtime-assets.mjs",
    ]
    missing = [str(path.relative_to(root)) for path in required if not path.is_file()]
    require(not missing, f"required files are missing: {', '.join(missing)}")

    plist = plistlib.loads((mac / "Info.plist.in").read_bytes())
    manifest_version = json.loads((root / "package.json").read_text("utf-8"))["version"]
    require(plist["CFBundlePackageType"] == "APPL", "bundle must be an app")
    require(plist["LSMinimumSystemVersion"] == "@CMAKE_OSX_DEPLOYMENT_TARGET@",
            "deployment target must come from CMake")
    documents = plist["CFBundleDocumentTypes"]
    require(len(documents) == 1, "exactly one document type is expected")
    document = documents[0]
    require(document["CFBundleTypeRole"] == "Viewer",
            "Markdown registration must remain read-only")
    require(document["LSHandlerRank"] == "Alternate",
            "LeanMark must not force itself as the default handler")
    require(set(document["CFBundleTypeExtensions"]) ==
            {"md", "markdown", "mdown", "mkd"},
            "document extensions drifted from the core allowlist")
    require(document["NSDocumentClass"] == "LMDocument",
            "document type must resolve to LMDocument")

    scheme = (mac / "src" / "LMResourceSchemeHandler.mm").read_text("utf-8")
    contains_all(scheme, [
        "ApplicationResourceAllowlist",
        "DocumentImageExtensions",
        "DecodedRelativePath",
        "URLByResolvingSymlinksInPath",
        "leanmark::core::IsPathWithin",
        "NSURLIsRegularFileKey",
        "kMaximumImageBytes",
    ], "custom scheme handler")
    require("allowingReadAccessToURL" not in scheme,
            "document folders must not be exposed through broad file URL access")

    window = (mac / "src" / "LMDocumentWindowController.mm").read_text("utf-8")
    contains_all(window, [
        "WKWebsiteDataStore.nonPersistentDataStore",
        "setURLSchemeHandler:_applicationSchemeHandler",
        "setURLSchemeHandler:_documentSchemeHandler",
        "message.frameInfo.isMainFrame",
        "IsExpectedAppURL(frameURL)",
        "window.LeanMarkHost.receive(payload)",
        "configureWebViewForDocument:document",
        "WKNavigationActionPolicyCancel",
        "WKNavigationResponsePolicyCancel",
        "WKPermissionDecisionDeny",
        "completionHandler(nil)",
    ], "WKWebView host")
    require("self.document = document;" not in window,
            "NSDocument must attach its window controller through addWindowController")

    document_source = (mac / "src" / "LMDocument.mm").read_text("utf-8")
    contains_all(document_source, [
        "leanmark::core::RenderMarkdownFile",
        "leanmark::core::IsSupportedMarkdownPath",
        'documentBaseUrl\" : @\"leanmark-doc://document/\"',
        "last complete view is still shown",
    ], "document host")

    cmake = (mac / "CMakeLists.txt").read_text("utf-8")
    root_cmake = (root / "CMakeLists.txt").read_text("utf-8")
    contains_all(cmake, [
        "LEANMARK_MANIFEST_VERSION",
        'set(LEANMARK_BUNDLE_IDENTIFIER "io.github.abooodbah.LeanMark"',
        'set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64"',
        "scripts/stage-runtime-assets.mjs",
        "XCODE_ATTRIBUTE_MACOSX_DEPLOYMENT_TARGET",
        "XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER",
        "XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED \"NO\"",
        "LeanMarkMacWebKitSmoke",
        "package_macos",
        "if(TARGET leanmark_core)",
    ], "macOS CMake target")
    require(f"VERSION {manifest_version}" not in cmake,
            "macOS project version must be derived, not hardcoded")
    root_deployment = root_cmake.find('set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0"')
    root_project = root_cmake.find("project(")
    require(root_deployment >= 0 and root_deployment < root_project,
            "root macOS deployment target must be set before project()")
    mac_deployment = cmake.find('set(CMAKE_OSX_DEPLOYMENT_TARGET "12.0"')
    mac_project = cmake.find("project(LeanMarkMac")
    require(mac_deployment >= 0 and mac_deployment < mac_project,
            "standalone macOS deployment target must be set before project()")
    contains_all(root_cmake, ["if(APPLE)", "add_subdirectory(macos)"],
                 "root macOS build integration")

    package = (mac / "scripts" / "package-macos.sh").read_text("utf-8")
    contains_all(package, [
        "codesign --force --sign - --options runtime --timestamp=none",
        '"status": "not-attempted"',
        '"developerID": false',
        '"trustedPublisher": false',
        '"publicDistributionReady": false',
        '"releaseChannel": "preview"',
        'package_name="LeanMark-v${version}-macos-universal-preview"',
        "lipo -archs",
        "shasum -a 256",
    ], "package trust metadata")
    require('package_name="LeanMark-v${version}-macos-universal"' not in package,
            "macOS preview package must not use the stable artifact name")
    require("notarytool" not in package and "stapler staple" not in package,
            "credential-free packaging must not imply notarization")

    reader_html = (root / "assets" / "reader.html").read_text("utf-8")
    reader_js = (root / "assets" / "reader.js").read_text("utf-8")
    require("leanmark-doc:" in reader_html,
            "reader CSP must explicitly permit the confined document scheme")
    contains_all(reader_js, [
        "window.webkit",
        "messageHandlers.leanmark",
        "window.LeanMarkHost",
        "documentBaseUrl",
    ], "shared WebKit reader bridge")

    print("LeanMark macOS static checks: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"LeanMark macOS static checks: FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
