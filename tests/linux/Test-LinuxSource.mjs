import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDirectory, "..", "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const [host, header, cmake, reader, html, desktop, metainfo] =
  await Promise.all([
    read("src/linux/LinuxApp.cpp"),
    read("src/linux/LinuxApp.h"),
    read("CMakeLists.txt"),
    read("assets/reader.js"),
    read("assets/reader.html"),
    read("packaging/linux/io.github.abooodbah.leanmark.desktop"),
    read("packaging/linux/io.github.abooodbah.leanmark.metainfo.xml.in")
  ]);

for (const guard of [
  /webkit_network_session_new_ephemeral/,
  /webkit_web_context_set_cache_model[\s\S]*WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER/,
  /webkit_web_context_register_uri_scheme/,
  /webkit_security_manager_register_uri_scheme_as_local/,
  /webkit_security_manager_register_uri_scheme_as_secure/,
  /script-message-received::leanmark/,
  /webkit_user_content_manager_register_script_message_handler/,
  /webkit_web_view_get_uri[\s\S]*kReaderUrl/,
  /WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION/,
  /WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION/,
  /webkit_permission_request_deny/,
  /WEBKIT_PERMISSION_STATE_DENIED/,
  /webkit_download_cancel/,
  /webkit_script_dialog_close/,
  /webkit_file_chooser_request_cancel/,
  /g_app_info_launch_default_for_uri/,
  /core::IsPathWithin/,
  /kMaximumImageBytes/
]) {
  assert.match(host, guard, `Linux host security guard is missing: ${guard}`);
}

assert.doesNotMatch(
  host,
  /webkit_web_context_set_sandbox_enabled/,
  "WebKitGTK 6.0 sandboxing is mandatory; the removed toggle must not be used"
);
assert.doesNotMatch(
  host,
  /\b(?:system|popen|execl|execv|fork)\s*\(/,
  "Linux external links and files must never pass through a shell/process API"
);
assert.match(
  host,
  /window\.LeanMarkHost[\s\S]*\.receive\(/,
  "native-to-reader delivery must use the shared LeanMarkHost contract"
);
assert.match(
  host,
  /documentBaseUrl[\\\"]+:[\\\"]+.*kDocumentBaseUrl/,
  "document messages must select the confined Linux image origin"
);
assert.match(
  header,
  /WebKitNetworkSession\* networkSession_/,
  "the ephemeral network session must have explicit host ownership"
);

assert.match(
  reader,
  /window\.webkit[\s\S]*messageHandlers[\s\S]*leanmark/,
  "the shared reader must expose the WebKitGTK bridge"
);
assert.match(
  reader,
  /window\.LeanMarkHost\s*=\s*Object\.freeze/,
  "the reader must expose one frozen native-delivery surface"
);
assert.match(
  html,
  /img-src[^;]*leanmark-doc:/,
  "the CSP must allow only the confined Linux document-image scheme"
);

assert.match(cmake, /pkg_check_modules\(GTK4[^\n]*gtk4>=4\.10/);
assert.match(cmake, /pkg_check_modules\(WEBKITGTK[^\n]*webkitgtk-6\.0>=2\.44/);
assert.match(cmake, /scripts\/stage-runtime-assets\.mjs/);
assert.match(cmake, /CPACK_DEBIAN_PACKAGE_SHLIBDEPS/);
assert.match(desktop, /^Exec=leanmark %F$/m);
assert.match(desktop, /^MimeType=text\/markdown;text\/x-markdown;$/m);
assert.match(metainfo, /<id>io\.github\.abooodbah\.leanmark<\/id>/);

console.log("LeanMark Linux source policy checks passed.");
