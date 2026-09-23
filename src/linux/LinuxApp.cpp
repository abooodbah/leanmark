#include "LinuxApp.h"

#include <gio/gio.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <charconv>
#include <optional>
#include <string_view>
#include <utility>

namespace leanmark::linux_host {
namespace {

constexpr char kReaderUrl[] = "leanmark-app://app/reader.html";
constexpr char kAppScheme[] = "leanmark-app";
constexpr char kAppHost[] = "app";
constexpr char kDocumentScheme[] = "leanmark-doc";
constexpr char kDocumentHost[] = "document";
constexpr char kDocumentBaseUrl[] = "leanmark-doc://document/";
constexpr char kInstanceDataKey[] = "leanmark-linux-app";
constexpr std::uint64_t kMaximumImageBytes = 64ull * 1024ull * 1024ull;

#ifndef LEANMARK_INSTALL_ASSETS_DIR
#define LEANMARK_INSTALL_ASSETS_DIR "/usr/share/leanmark/assets"
#endif

std::string LowercaseAscii(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](char character) {
        const auto byte = static_cast<unsigned char>(character);
        return byte >= 'A' && byte <= 'Z'
                   ? static_cast<char>(byte - 'A' + 'a')
                   : character;
    });
    return value;
}

bool StartsWithInsensitive(
    std::string_view value,
    std::string_view prefix) {
    if (value.size() < prefix.size()) {
        return false;
    }
    for (std::size_t index = 0; index < prefix.size(); ++index) {
        if (std::tolower(static_cast<unsigned char>(value[index])) !=
            std::tolower(static_cast<unsigned char>(prefix[index]))) {
            return false;
        }
    }
    return true;
}

bool ParseInteger(std::string_view text, long long minimum, long long maximum,
                  long long& value) {
    long long parsed = 0;
    const char* end = text.data() + text.size();
    const auto result = std::from_chars(text.data(), end, parsed);
    if (text.empty() || result.ec != std::errc() || result.ptr != end ||
        parsed < minimum || parsed > maximum) {
        return false;
    }
    value = parsed;
    return true;
}

std::filesystem::path ResolveAssetRoot() {
    const char* overridePath = g_getenv("LEANMARK_ASSETS_DIR");
    if (overridePath != nullptr && overridePath[0] != '\0') {
        return std::filesystem::path(overridePath);
    }

    const std::filesystem::path installed(LEANMARK_INSTALL_ASSETS_DIR);
    std::error_code error;
    if (std::filesystem::is_regular_file(installed / "reader.html", error)) {
        return installed;
    }

    error.clear();
    const auto executable = std::filesystem::read_symlink("/proc/self/exe", error);
    if (!error) {
        const auto adjacent =
            executable.parent_path().parent_path() / "share" / "leanmark" /
            "assets";
        if (std::filesystem::is_regular_file(adjacent / "reader.html", error)) {
            return adjacent;
        }
    }
    return installed;
}

std::string DisplayPath(const std::filesystem::path& path) {
    if (path.empty()) {
        return {};
    }
    char* display = g_filename_display_name(path.c_str());
    if (display == nullptr) {
        return path.string();
    }
    std::string result(display);
    g_free(display);
    return result;
}

std::filesystem::path AbsolutePath(const std::filesystem::path& path) {
    std::error_code error;
    const auto absolute = std::filesystem::absolute(path, error);
    return error ? path : absolute.lexically_normal();
}

std::filesystem::path SettingsFilePath() {
    return std::filesystem::path(g_get_user_config_dir()) / "leanmark" /
           "settings.ini";
}

bool IsTrustedReaderUri(const char* uri) {
    return uri != nullptr &&
           (g_strcmp0(uri, kReaderUrl) == 0 ||
            g_strcmp0(uri, "about:blank") == 0);
}

bool DecodeUriPath(
    const char* uri,
    const char* expectedScheme,
    const char* expectedHost,
    std::string* decodedPath) {
    if (uri == nullptr) {
        return false;
    }
    const std::string lowercaseUri = LowercaseAscii(uri);
    if (lowercaseUri.find("%00") != std::string::npos) {
        return false;
    }

    GError* error = nullptr;
    GUri* parsed = g_uri_parse(uri, G_URI_FLAGS_NONE, &error);
    if (parsed == nullptr) {
        g_clear_error(&error);
        return false;
    }

    const char* scheme = g_uri_get_scheme(parsed);
    const char* host = g_uri_get_host(parsed);
    const char* path = g_uri_get_path(parsed);
    const bool originMatches =
        scheme != nullptr && host != nullptr && path != nullptr &&
        g_ascii_strcasecmp(scheme, expectedScheme) == 0 &&
        g_ascii_strcasecmp(host, expectedHost) == 0;
    if (!originMatches) {
        g_uri_unref(parsed);
        return false;
    }

    char* decoded = g_uri_unescape_string(path, nullptr);
    g_uri_unref(parsed);
    if (decoded == nullptr) {
        return false;
    }
    *decodedPath = decoded;
    g_free(decoded);
    return decodedPath->find('\\') == std::string::npos;
}

void FinishSchemeError(
    WebKitURISchemeRequest* request,
    GIOErrorEnum code,
    const char* message) {
    GError* error = g_error_new_literal(G_IO_ERROR, code, message);
    webkit_uri_scheme_request_finish_error(request, error);
    g_error_free(error);
}

void FinishFileRequest(
    WebKitURISchemeRequest* request,
    const std::filesystem::path& path,
    const char* contentType,
    std::uint64_t maximumBytes) {
    GFile* file = g_file_new_for_path(path.c_str());
    GError* error = nullptr;
    GFileInfo* info = g_file_query_info(
        file,
        G_FILE_ATTRIBUTE_STANDARD_TYPE "," G_FILE_ATTRIBUTE_STANDARD_SIZE,
        G_FILE_QUERY_INFO_NONE,
        nullptr,
        &error);
    if (info == nullptr ||
        g_file_info_get_file_type(info) != G_FILE_TYPE_REGULAR) {
        g_clear_object(&info);
        g_object_unref(file);
        g_clear_error(&error);
        FinishSchemeError(request, G_IO_ERROR_NOT_FOUND, "Resource not found.");
        return;
    }

    const goffset signedSize = g_file_info_get_size(info);
    if (signedSize < 0 ||
        static_cast<std::uint64_t>(signedSize) > maximumBytes) {
        g_object_unref(info);
        g_object_unref(file);
        FinishSchemeError(
            request, G_IO_ERROR_NO_SPACE, "Resource exceeds its safety limit.");
        return;
    }

    GFileInputStream* stream = g_file_read(file, nullptr, &error);
    g_object_unref(info);
    g_object_unref(file);
    if (stream == nullptr) {
        g_clear_error(&error);
        FinishSchemeError(
            request, G_IO_ERROR_PERMISSION_DENIED, "Resource could not be read.");
        return;
    }

    webkit_uri_scheme_request_finish(
        request,
        G_INPUT_STREAM(stream),
        static_cast<gint64>(signedSize),
        contentType);
    g_object_unref(stream);
}

std::optional<const char*> AppAssetContentType(std::string_view relativePath) {
    if (relativePath == "reader.html") {
        return "text/html";
    }
    if (relativePath == "reader.css") {
        return "text/css";
    }
    if (relativePath == "reader.js" ||
        relativePath == "vendor/mermaid.min.js") {
        return "application/javascript";
    }

    static constexpr std::array<std::string_view, 5> kFontFiles = {
        "fonts/ibm-plex-sans-latin-400-normal.woff2",
        "fonts/ibm-plex-sans-latin-500-normal.woff2",
        "fonts/ibm-plex-sans-latin-600-normal.woff2",
        "fonts/ibm-plex-serif-latin-600-normal.woff2",
        "fonts/ibm-plex-mono-latin-400-normal.woff2"};
    if (std::find(kFontFiles.begin(), kFontFiles.end(), relativePath) !=
        kFontFiles.end()) {
        return "font/woff2";
    }
    return std::nullopt;
}

std::optional<const char*> ImageContentType(
    const std::filesystem::path& path) {
    const std::string extension = LowercaseAscii(path.extension().string());
    if (extension == ".png") {
        return "image/png";
    }
    if (extension == ".jpg" || extension == ".jpeg") {
        return "image/jpeg";
    }
    if (extension == ".gif") {
        return "image/gif";
    }
    if (extension == ".webp") {
        return "image/webp";
    }
    if (extension == ".svg") {
        return "image/svg+xml";
    }
    if (extension == ".avif") {
        return "image/avif";
    }
    return std::nullopt;
}

}  // namespace

LinuxApp* LinuxApp::Create(
    GtkApplication* application,
    std::filesystem::path initialPath,
    bool smokeTest,
    int* smokeExitCode) {
    auto* instance = new LinuxApp(
        application, std::move(initialPath), smokeTest, smokeExitCode);
    instance->Initialize();
    return instance;
}

LinuxApp::LinuxApp(
    GtkApplication* application,
    std::filesystem::path initialPath,
    bool smokeTest,
    int* smokeExitCode)
    : application_(application),
      initialPath_(std::move(initialPath)),
      assetRoot_(ResolveAssetRoot()),
      smokeTest_(smokeTest),
      smokeExitCode_(smokeExitCode) {}

LinuxApp::~LinuxApp() {
    if (reloadTimer_ != 0) {
        g_source_remove(reloadTimer_);
    }
    if (smokeTimeout_ != 0) {
        g_source_remove(smokeTimeout_);
    }
    g_clear_object(&directoryMonitor_);
    g_clear_object(&contentManager_);
    g_clear_object(&networkSession_);
    g_clear_object(&webContext_);
}

void LinuxApp::Initialize() {
    LoadTheme();
    window_ = gtk_application_window_new(application_);
    gtk_window_set_default_size(GTK_WINDOW(window_), 1120, 820);
    gtk_widget_set_size_request(window_, 640, 480);
    g_object_set_data(G_OBJECT(window_), kInstanceDataKey, this);
    g_object_weak_ref(G_OBJECT(window_), OnWindowFinalized, this);

    if (!initialPath_.empty()) {
        OpenDocument(initialPath_);
    } else {
        UpdateTitle();
    }

    webContext_ = webkit_web_context_new();
    webkit_web_context_set_cache_model(
        webContext_, WEBKIT_CACHE_MODEL_DOCUMENT_VIEWER);
    webkit_web_context_register_uri_scheme(
        webContext_, kAppScheme, OnAppScheme, this, nullptr);
    webkit_web_context_register_uri_scheme(
        webContext_, kDocumentScheme, OnDocumentScheme, this, nullptr);

    WebKitSecurityManager* securityManager =
        webkit_web_context_get_security_manager(webContext_);
    webkit_security_manager_register_uri_scheme_as_local(
        securityManager, kAppScheme);
    webkit_security_manager_register_uri_scheme_as_secure(
        securityManager, kAppScheme);
    webkit_security_manager_register_uri_scheme_as_local(
        securityManager, kDocumentScheme);
    webkit_security_manager_register_uri_scheme_as_secure(
        securityManager, kDocumentScheme);

    networkSession_ = webkit_network_session_new_ephemeral();
    contentManager_ = webkit_user_content_manager_new();
    g_signal_connect(
        contentManager_,
        "script-message-received::leanmark",
        G_CALLBACK(OnScriptMessage),
        this);
    if (!webkit_user_content_manager_register_script_message_handler(
            contentManager_, "leanmark", nullptr)) {
        g_warning("LeanMark could not register its WebKit message handler.");
    }

    WebKitSettings* settings = webkit_settings_new();
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_enable_developer_extras(settings, FALSE);
    webkit_settings_set_javascript_can_open_windows_automatically(
        settings, FALSE);
    webkit_settings_set_allow_file_access_from_file_urls(settings, FALSE);
    webkit_settings_set_allow_universal_access_from_file_urls(settings, FALSE);

    webView_ = WEBKIT_WEB_VIEW(g_object_new(
        WEBKIT_TYPE_WEB_VIEW,
        "web-context",
        webContext_,
        "network-session",
        networkSession_,
        "user-content-manager",
        contentManager_,
        "settings",
        settings,
        nullptr));
    g_object_unref(settings);

    ConfigureWebView();
    gtk_window_set_child(GTK_WINDOW(window_), GTK_WIDGET(webView_));
    NavigateToReader();
    gtk_window_present(GTK_WINDOW(window_));
}

void LinuxApp::ConfigureWebView() {
    g_signal_connect(
        webView_, "decide-policy", G_CALLBACK(OnDecidePolicy), this);
    g_signal_connect(webView_, "create", G_CALLBACK(OnCreateWebView), this);
    g_signal_connect(
        webView_, "permission-request", G_CALLBACK(OnPermissionRequest), this);
    g_signal_connect(
        webView_,
        "query-permission-state",
        G_CALLBACK(OnQueryPermissionState),
        this);
    g_signal_connect(
        networkSession_,
        "download-started",
        G_CALLBACK(OnDownloadStarted),
        this);
    g_signal_connect(
        webView_, "script-dialog", G_CALLBACK(OnScriptDialog), this);
    g_signal_connect(
        webView_, "run-file-chooser", G_CALLBACK(OnRunFileChooser), this);
    g_signal_connect(
        webView_, "enter-fullscreen", G_CALLBACK(OnEnterFullscreen), this);
    g_signal_connect(webView_, "print", G_CALLBACK(OnPrint), this);
}

void LinuxApp::NavigateToReader() {
    readerReady_ = false;
    webkit_web_view_load_uri(webView_, kReaderUrl);
}

void LinuxApp::OpenDocument(
    const std::filesystem::path& path,
    bool automaticReload) {
    if (!core::IsSupportedMarkdownPath(path)) {
        if (automaticReload) {
            SendStatus("LeanMark only reloads Markdown files.", "warning");
            return;
        }
        document_ = {};
        document_.path = AbsolutePath(path);
        document_.directory = document_.path.parent_path();
        document_.error =
            "LeanMark opens .md, .markdown, .mdown, and .mkd files.";
        directOpenError_ = true;
        WatchDocument();
        UpdateTitle();
        SendCurrentView();
        return;
    }

    auto rendered = core::RenderMarkdownFile(path);
    if (!rendered.ok && automaticReload) {
        SendStatus(
            "The file is still changing or cannot be read. Keeping the last "
            "complete view.",
            "warning");
        return;
    }

    const auto previousDirectory = document_.directory;
    document_ = std::move(rendered);
    directOpenError_ = !document_.ok;
    WatchDocument();
    UpdateTitle();

    if (webView_ == nullptr) {
        return;
    }
    if (readerReady_ && document_.ok &&
        previousDirectory != document_.directory) {
        NavigateToReader();
    } else {
        SendCurrentView();
    }
}

void LinuxApp::OpenDocumentDialog() {
    GtkFileDialog* dialog = gtk_file_dialog_new();
    gtk_file_dialog_set_title(dialog, "Open a Markdown file");

    GtkFileFilter* markdown = gtk_file_filter_new();
    gtk_file_filter_set_name(markdown, "Markdown files");
    for (const char* pattern : {"*.md", "*.markdown", "*.mdown", "*.mkd"}) {
        gtk_file_filter_add_pattern(markdown, pattern);
    }
    GtkFileFilter* allFiles = gtk_file_filter_new();
    gtk_file_filter_set_name(allFiles, "All files");
    gtk_file_filter_add_pattern(allFiles, "*");

    GListStore* filters = g_list_store_new(GTK_TYPE_FILE_FILTER);
    g_list_store_append(filters, markdown);
    g_list_store_append(filters, allFiles);
    gtk_file_dialog_set_filters(dialog, G_LIST_MODEL(filters));
    gtk_file_dialog_set_default_filter(dialog, markdown);
    g_object_unref(markdown);
    g_object_unref(allFiles);
    g_object_unref(filters);

    gtk_file_dialog_open(
        dialog,
        GTK_WINDOW(window_),
        nullptr,
        OnOpenDialogFinished,
        g_object_ref(window_));
}

void LinuxApp::WatchDocument() {
    if (reloadTimer_ != 0) {
        g_source_remove(reloadTimer_);
        reloadTimer_ = 0;
    }
    g_clear_object(&directoryMonitor_);
    if (!document_.ok || document_.directory.empty()) {
        return;
    }

    GFile* directory = g_file_new_for_path(document_.directory.c_str());
    GError* error = nullptr;
    directoryMonitor_ = g_file_monitor_directory(
        directory, G_FILE_MONITOR_WATCH_MOVES, nullptr, &error);
    g_object_unref(directory);
    if (directoryMonitor_ == nullptr) {
        g_clear_error(&error);
        SendStatus("LeanMark could not watch this file for changes.", "warning");
        return;
    }
    g_signal_connect(
        directoryMonitor_, "changed", G_CALLBACK(OnDirectoryChanged), this);
}

void LinuxApp::ScheduleReload() {
    if (reloadTimer_ != 0) {
        g_source_remove(reloadTimer_);
    }
    reloadTimer_ = g_timeout_add(350, OnReloadTimer, this);
}

void LinuxApp::SendCurrentView() {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }

    const std::string theme = core::EscapeJsonString(ThemeName());
    if (document_.path.empty() && !directOpenError_) {
        SendJson("{\"type\":\"empty\",\"theme\":\"" + theme + "\"}");
        return;
    }

    const std::string displayPath = DisplayPath(document_.path);
    const std::string displayName = DisplayPath(document_.path.filename());
    if (!document_.ok) {
        SendJson(
            "{\"type\":\"error\",\"theme\":\"" + theme +
            "\",\"fileName\":\"" + core::EscapeJsonString(displayName) +
            "\",\"path\":\"" + core::EscapeJsonString(displayPath) +
            "\",\"message\":\"" +
            core::EscapeJsonString(document_.error) + "\"}");
        return;
    }

    // One buffer, escaped in place: the HTML is not copied into a separate
    // escaped string and then again into the joined message.
    std::string json;
    json.reserve(document_.html.size() + document_.html.size() / 8 + 1024);
    json += "{\"type\":\"document\",\"theme\":\"";
    json += theme;
    json += "\",\"fileName\":\"";
    core::AppendJsonString(json, displayName);
    json += "\",\"path\":\"";
    core::AppendJsonString(json, displayPath);
    json.append("\",\"documentBaseUrl\":\"").append(kDocumentBaseUrl);
    json += "\",\"sourceBytes\":";
    json += std::to_string(document_.sourceBytes);
    json += ",\"hasMermaid\":";
    json += document_.hasMermaid ? "true" : "false";
    json += ",\"html\":\"";
    core::AppendJsonString(json, document_.html);
    json += "\"}";
    SendJson(json);
}

void LinuxApp::SendStatus(
    std::string_view message,
    std::string_view tone) {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }
    SendJson(
        "{\"type\":\"status\",\"tone\":\"" +
        core::EscapeJsonString(tone) + "\",\"message\":\"" +
        core::EscapeJsonString(message) + "\"}");
}

void LinuxApp::SendJson(const std::string& json) {
    static constexpr std::string_view kPrefix =
        "window.LeanMarkHost && window.LeanMarkHost.receive(";
    std::string script;
    script.reserve(kPrefix.size() + json.size() + 2);
    script += kPrefix;
    script += json;
    script += ");";
    webkit_web_view_evaluate_javascript(
        webView_,
        script.c_str(),
        static_cast<gssize>(script.size()),
        nullptr,
        kReaderUrl,
        nullptr,
        nullptr,
        nullptr);
}

void LinuxApp::HandleMessage(std::string_view message) {
    if (message == "ready") {
        readerReady_ = true;
        SendJson("{\"type\":\"host\",\"copySource\":true,\"tabs\":false}");
        SendCurrentView();
        if (smokeTest_) {
            StartSmokeProbe();
        }
        return;
    }
    if (message == "open-file") {
        OpenDocumentDialog();
        return;
    }
    if (message == "reload") {
        if (!document_.path.empty()) {
            OpenDocument(document_.path);
        }
        return;
    }
    if (message == "smoke-ok" && smokeTest_) {
        CompleteSmoke(true, "Linux WebKit host smoke test passed.");
        return;
    }
    if (message == "smoke-failed" && smokeTest_) {
        CompleteSmoke(false, "Reader DOM did not reach the expected ready state.");
        return;
    }
    if (StartsWithInsensitive(message, "open-link|")) {
        HandleLink(message.substr(10));
        return;
    }
    if (StartsWithInsensitive(message, "copy-source|")) {
        CopySource(message.substr(12));
        return;
    }
    if (StartsWithInsensitive(message, "zoom|")) {
        double zoom = webkit_web_view_get_zoom_level(webView_);
        const std::string action = LowercaseAscii(std::string(message.substr(5)));
        if (action == "reset") {
            zoom = 1.0;
        } else if (action == "in") {
            zoom = std::min(3.0, zoom + 0.1);
        } else if (action == "out") {
            zoom = std::max(0.5, zoom - 0.1);
        }
        webkit_web_view_set_zoom_level(webView_, zoom);
        return;
    }
    if (StartsWithInsensitive(message, "theme|")) {
        const std::string requested =
            LowercaseAscii(std::string(message.substr(6)));
        if (requested == "light") {
            theme_ = ThemeMode::Light;
        } else if (requested == "dark") {
            theme_ = ThemeMode::Dark;
        } else {
            theme_ = ThemeMode::System;
        }
        SaveTheme();
        SendJson(
            "{\"type\":\"theme\",\"value\":\"" + ThemeName() + "\"}");
    }
}

void LinuxApp::SendCopyResult(long long requestId, bool ok) {
    SendJson(
        "{\"type\":\"copied\",\"requestId\":" + std::to_string(requestId) +
        ",\"ok\":" + (ok ? "true" : "false") + "}");
}

void LinuxApp::CopySource(std::string_view arguments) {
    // requestId|tabId|headingIndex|headingCount. This host shows one document
    // per window, so the tab id is ignored.
    std::array<std::string_view, 4> fields;
    std::size_t start = 0;
    for (std::size_t index = 0; index < fields.size(); ++index) {
        const std::size_t end = arguments.find('|', start);
        const bool last = index + 1 == fields.size();
        if ((end == std::string_view::npos) != last) {
            return;
        }
        fields[index] = arguments.substr(
            start, last ? std::string_view::npos : end - start);
        start = end + 1;
    }
    long long requestId = 0;
    long long headingIndex = 0;
    long long headingCount = 0;
    if (!ParseInteger(fields[0], 0, 4294967295ll, requestId) ||
        !ParseInteger(fields[2], -1, 2147483647ll, headingIndex) ||
        !ParseInteger(fields[3], 0, 2147483647ll, headingCount)) {
        return;
    }
    if (!document_.ok || document_.path.empty()) {
        SendCopyResult(requestId, false);
        SendStatus("Open a document before copying.", "warning");
        return;
    }

    // The copy comes from the file, so it is the exact Markdown. If the heading
    // count no longer matches the page, show the new version first.
    std::string bytes;
    std::string error;
    if (!core::ReadDocumentFile(document_.path, bytes, error)) {
        SendCopyResult(requestId, false);
        SendStatus(error, "error");
        return;
    }
    const auto section = core::ExtractSection(bytes, headingIndex);
    if (headingIndex >= 0 &&
        section.headingCount != static_cast<std::size_t>(headingCount)) {
        SendCopyResult(requestId, false);
        const std::filesystem::path path = document_.path;
        OpenDocument(path, true);
        SendStatus(
            "The file changed on disk, so LeanMark reloaded it. Copy again to "
            "get the current text.",
            "warning");
        return;
    }
    if (!section.ok) {
        SendCopyResult(requestId, false);
        SendStatus(section.error, "warning");
        return;
    }
    gdk_clipboard_set_text(
        gtk_widget_get_clipboard(window_), section.markdown.c_str());
    SendCopyResult(requestId, true);
}

void LinuxApp::HandleLink(std::string_view hrefView) {
    if (hrefView.empty() || hrefView.size() > 8192) {
        return;
    }
    const std::string href(hrefView);
    char* rawScheme = g_uri_parse_scheme(href.c_str());
    if (rawScheme != nullptr) {
        const std::string scheme = LowercaseAscii(rawScheme);
        g_free(rawScheme);
        if (scheme == "http" || scheme == "https" || scheme == "mailto") {
            GError* error = nullptr;
            if (!g_app_info_launch_default_for_uri(href.c_str(), nullptr, &error)) {
                g_clear_error(&error);
                SendStatus("Linux could not open that link.", "error");
            }
        } else {
            SendStatus("That link scheme is blocked for safety.", "warning");
        }
        return;
    }
    if (href.front() == '#') {
        return;
    }

    std::string pathPart = href;
    const std::size_t extra = pathPart.find_first_of("?#");
    if (extra != std::string::npos) {
        pathPart.resize(extra);
    }
    if (LowercaseAscii(pathPart).find("%00") != std::string::npos) {
        SendStatus("That local link is not a valid UTF-8 path.", "warning");
        return;
    }
    char* decoded = g_uri_unescape_string(pathPart.c_str(), nullptr);
    if (decoded == nullptr || decoded[0] == '\0') {
        g_free(decoded);
        SendStatus("That local link is not a valid UTF-8 path.", "warning");
        return;
    }
    const std::filesystem::path relative(decoded);
    g_free(decoded);
    if (relative.is_absolute() || relative.has_root_name() ||
        relative.has_root_directory()) {
        SendStatus("Absolute local links are blocked for safety.", "warning");
        return;
    }
    if (!core::IsSupportedMarkdownPath(relative)) {
        SendStatus(
            "LeanMark opens local Markdown links only. Images still display "
            "inside the document.");
        return;
    }

    std::error_code error;
    const auto resolved = std::filesystem::weakly_canonical(
        document_.directory / relative, error);
    if (error || !std::filesystem::is_regular_file(resolved, error)) {
        SendStatus("That linked Markdown file could not be found.", "warning");
        return;
    }
    OpenDocument(resolved);
}

void LinuxApp::LoadTheme() {
    GKeyFile* settings = g_key_file_new();
    GError* error = nullptr;
    if (!g_key_file_load_from_file(
            settings,
            SettingsFilePath().c_str(),
            G_KEY_FILE_NONE,
            &error)) {
        g_clear_error(&error);
        g_key_file_unref(settings);
        theme_ = ThemeMode::System;
        return;
    }

    char* value = g_key_file_get_string(settings, "Reader", "Theme", &error);
    g_key_file_unref(settings);
    if (value == nullptr) {
        g_clear_error(&error);
        theme_ = ThemeMode::System;
        return;
    }
    const std::string saved = LowercaseAscii(value);
    g_free(value);
    if (saved == "light") {
        theme_ = ThemeMode::Light;
    } else if (saved == "dark") {
        theme_ = ThemeMode::Dark;
    } else {
        theme_ = ThemeMode::System;
    }
}

void LinuxApp::SaveTheme() const {
    const auto settingsPath = SettingsFilePath();
    if (g_mkdir_with_parents(settingsPath.parent_path().c_str(), 0700) != 0) {
        return;
    }

    GKeyFile* settings = g_key_file_new();
    g_key_file_set_string(settings, "Reader", "Theme", ThemeName().c_str());
    gsize length = 0;
    char* data = g_key_file_to_data(settings, &length, nullptr);
    g_key_file_unref(settings);
    if (data != nullptr) {
        g_file_set_contents(
            settingsPath.c_str(), data, static_cast<gssize>(length), nullptr);
        g_free(data);
    }
}

std::string LinuxApp::ThemeName() const {
    switch (theme_) {
        case ThemeMode::Light:
            return "light";
        case ThemeMode::Dark:
            return "dark";
        default:
            return "system";
    }
}

void LinuxApp::UpdateTitle() {
    const std::string fileName = DisplayPath(document_.path.filename());
    const std::string title =
        fileName.empty() ? "LeanMark" : fileName + " — LeanMark";
    gtk_window_set_title(GTK_WINDOW(window_), title.c_str());
}

void LinuxApp::StartSmokeProbe() {
    if (smokeComplete_ || smokeTimeout_ != 0) {
        return;
    }
    static constexpr char kProbe[] = R"JS(
(function () {
  var attempts = 0;
  function inspect() {
    attempts += 1;
    var ready = document.documentElement.dataset.renderState === "ready";
    if (ready && document.querySelector("#article h1")) {
      window.webkit.messageHandlers.leanmark.postMessage("smoke-ok");
      return;
    }
    if (attempts >= 100) {
      window.webkit.messageHandlers.leanmark.postMessage("smoke-failed");
      return;
    }
    window.setTimeout(inspect, 100);
  }
  inspect();
}());
)JS";
    webkit_web_view_evaluate_javascript(
        webView_, kProbe, -1, nullptr, kReaderUrl, nullptr, nullptr, nullptr);
    smokeTimeout_ = g_timeout_add_seconds(15, OnSmokeTimeout, this);
}

void LinuxApp::CompleteSmoke(bool success, std::string_view reason) {
    if (smokeComplete_) {
        return;
    }
    smokeComplete_ = true;
    if (smokeTimeout_ != 0) {
        g_source_remove(smokeTimeout_);
        smokeTimeout_ = 0;
    }
    if (smokeExitCode_ != nullptr) {
        *smokeExitCode_ = success ? 0 : 1;
    }
    if (success) {
        g_message("%.*s", static_cast<int>(reason.size()), reason.data());
    } else {
        g_warning("%.*s", static_cast<int>(reason.size()), reason.data());
    }
    g_application_quit(G_APPLICATION(application_));
}

void LinuxApp::HandleAppScheme(WebKitURISchemeRequest* request) {
    if (webkit_uri_scheme_request_get_web_view(request) != webView_) {
        FinishSchemeError(request, G_IO_ERROR_PERMISSION_DENIED, "Wrong view.");
        return;
    }
    std::string path;
    if (!DecodeUriPath(
            webkit_uri_scheme_request_get_uri(request),
            kAppScheme,
            kAppHost,
            &path) ||
        path.empty() || path.front() != '/') {
        FinishSchemeError(request, G_IO_ERROR_INVALID_ARGUMENT, "Invalid URI.");
        return;
    }

    const std::string relative = path.substr(1);
    const auto contentType = AppAssetContentType(relative);
    if (!contentType) {
        FinishSchemeError(request, G_IO_ERROR_NOT_FOUND, "Resource not found.");
        return;
    }
    FinishFileRequest(
        request,
        assetRoot_ / std::filesystem::path(relative),
        *contentType,
        core::kMaximumDocumentBytes);
}

void LinuxApp::HandleDocumentScheme(WebKitURISchemeRequest* request) {
    if (webkit_uri_scheme_request_get_web_view(request) != webView_ ||
        !document_.ok || document_.directory.empty()) {
        FinishSchemeError(
            request, G_IO_ERROR_PERMISSION_DENIED, "Document assets unavailable.");
        return;
    }

    std::string path;
    if (!DecodeUriPath(
            webkit_uri_scheme_request_get_uri(request),
            kDocumentScheme,
            kDocumentHost,
            &path) ||
        path.size() < 2 || path.front() != '/') {
        FinishSchemeError(request, G_IO_ERROR_INVALID_ARGUMENT, "Invalid URI.");
        return;
    }

    const std::filesystem::path relative(path.substr(1));
    if (relative.is_absolute() || relative.has_root_name() ||
        relative.has_root_directory()) {
        FinishSchemeError(
            request, G_IO_ERROR_PERMISSION_DENIED, "Absolute paths are blocked.");
        return;
    }
    const auto candidate = document_.directory / relative;
    const auto contentType = ImageContentType(candidate);
    if (!contentType ||
        !core::IsPathWithin(document_.directory, candidate)) {
        FinishSchemeError(
            request, G_IO_ERROR_PERMISSION_DENIED, "Document path is blocked.");
        return;
    }
    FinishFileRequest(request, candidate, *contentType, kMaximumImageBytes);
}

void LinuxApp::OnWindowFinalized(gpointer data, GObject*) {
    auto* app = static_cast<LinuxApp*>(data);
    app->window_ = nullptr;
    app->webView_ = nullptr;
    delete app;
}

void LinuxApp::OnAppScheme(
    WebKitURISchemeRequest* request,
    gpointer data) {
    static_cast<LinuxApp*>(data)->HandleAppScheme(request);
}

void LinuxApp::OnDocumentScheme(
    WebKitURISchemeRequest* request,
    gpointer data) {
    static_cast<LinuxApp*>(data)->HandleDocumentScheme(request);
}

void LinuxApp::OnScriptMessage(
    WebKitUserContentManager*,
    JSCValue* value,
    gpointer data) {
    auto* app = static_cast<LinuxApp*>(data);
    if (!jsc_value_is_string(value) || app->webView_ == nullptr ||
        g_strcmp0(webkit_web_view_get_uri(app->webView_), kReaderUrl) != 0) {
        return;
    }
    char* rawMessage = jsc_value_to_string(value);
    if (rawMessage == nullptr) {
        return;
    }
    const std::string message(rawMessage);
    g_free(rawMessage);
    if (message.size() <= 16384) {
        app->HandleMessage(message);
    }
}

gboolean LinuxApp::OnDecidePolicy(
    WebKitWebView*,
    WebKitPolicyDecision* decision,
    WebKitPolicyDecisionType type,
    gpointer) {
    if (type == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) {
        webkit_policy_decision_ignore(decision);
        return TRUE;
    }
    if (type == WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
        auto* navigation = WEBKIT_NAVIGATION_POLICY_DECISION(decision);
        WebKitNavigationAction* action =
            webkit_navigation_policy_decision_get_navigation_action(navigation);
        WebKitURIRequest* request = webkit_navigation_action_get_request(action);
        if (IsTrustedReaderUri(webkit_uri_request_get_uri(request))) {
            webkit_policy_decision_use(decision);
        } else {
            webkit_policy_decision_ignore(decision);
        }
        return TRUE;
    }
    if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) {
        auto* response = WEBKIT_RESPONSE_POLICY_DECISION(decision);
        if (webkit_response_policy_decision_is_mime_type_supported(response)) {
            webkit_policy_decision_use(decision);
        } else {
            webkit_policy_decision_ignore(decision);
        }
        return TRUE;
    }
    return FALSE;
}

GtkWidget* LinuxApp::OnCreateWebView(
    WebKitWebView*,
    WebKitNavigationAction*,
    gpointer) {
    return nullptr;
}

gboolean LinuxApp::OnPermissionRequest(
    WebKitWebView*,
    WebKitPermissionRequest* request,
    gpointer) {
    webkit_permission_request_deny(request);
    return TRUE;
}

gboolean LinuxApp::OnQueryPermissionState(
    WebKitWebView*,
    WebKitPermissionStateQuery* query,
    gpointer) {
    webkit_permission_state_query_finish(
        query, WEBKIT_PERMISSION_STATE_DENIED);
    return TRUE;
}

void LinuxApp::OnDownloadStarted(
    WebKitNetworkSession*,
    WebKitDownload* download,
    gpointer) {
    webkit_download_cancel(download);
}

gboolean LinuxApp::OnScriptDialog(
    WebKitWebView*,
    WebKitScriptDialog* dialog,
    gpointer) {
    webkit_script_dialog_close(dialog);
    return TRUE;
}

gboolean LinuxApp::OnRunFileChooser(
    WebKitWebView*,
    WebKitFileChooserRequest* request,
    gpointer) {
    webkit_file_chooser_request_cancel(request);
    return TRUE;
}

gboolean LinuxApp::OnEnterFullscreen(WebKitWebView*, gpointer) {
    return TRUE;
}

gboolean LinuxApp::OnPrint(
    WebKitWebView*,
    WebKitPrintOperation*,
    gpointer) {
    return TRUE;
}

void LinuxApp::OnOpenDialogFinished(
    GObject* source,
    GAsyncResult* result,
    gpointer data) {
    auto* window = GTK_WIDGET(data);
    auto* app = static_cast<LinuxApp*>(
        g_object_get_data(G_OBJECT(window), kInstanceDataKey));
    GError* error = nullptr;
    GFile* file = gtk_file_dialog_open_finish(
        GTK_FILE_DIALOG(source), result, &error);
    if (file != nullptr && app != nullptr) {
        char* path = g_file_get_path(file);
        if (path != nullptr) {
            app->OpenDocument(std::filesystem::path(path));
            g_free(path);
        } else {
            app->SendStatus("LeanMark can open local files only.", "warning");
        }
        g_object_unref(file);
    }
    g_clear_error(&error);
    g_object_unref(source);
    g_object_unref(window);
}

void LinuxApp::OnDirectoryChanged(
    GFileMonitor*,
    GFile* file,
    GFile* otherFile,
    GFileMonitorEvent,
    gpointer data) {
    auto* app = static_cast<LinuxApp*>(data);
    const std::string expected = app->document_.path.filename().string();
    bool matches = false;
    for (GFile* candidate : {file, otherFile}) {
        if (candidate == nullptr) {
            continue;
        }
        char* basename = g_file_get_basename(candidate);
        if (basename != nullptr && expected == basename) {
            matches = true;
        }
        g_free(basename);
    }
    if (matches) {
        app->ScheduleReload();
    }
}

gboolean LinuxApp::OnReloadTimer(gpointer data) {
    auto* app = static_cast<LinuxApp*>(data);
    app->reloadTimer_ = 0;
    if (!app->document_.path.empty()) {
        app->OpenDocument(app->document_.path, true);
    }
    return G_SOURCE_REMOVE;
}

gboolean LinuxApp::OnSmokeTimeout(gpointer data) {
    auto* app = static_cast<LinuxApp*>(data);
    app->smokeTimeout_ = 0;
    app->CompleteSmoke(false, "Linux WebKit host smoke test timed out.");
    return G_SOURCE_REMOVE;
}

}  // namespace leanmark::linux_host
