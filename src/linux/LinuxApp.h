#pragma once

#include <gtk/gtk.h>
#include <webkit/webkit.h>

#include <filesystem>
#include <string>

#include "core/MarkdownCore.h"

namespace leanmark::linux_host {

class LinuxApp final {
public:
    static LinuxApp* Create(
        GtkApplication* application,
        std::filesystem::path initialPath,
        bool smokeTest,
        int* smokeExitCode);

    LinuxApp(const LinuxApp&) = delete;
    LinuxApp& operator=(const LinuxApp&) = delete;

private:
    enum class ThemeMode { System, Light, Dark };

    LinuxApp(
        GtkApplication* application,
        std::filesystem::path initialPath,
        bool smokeTest,
        int* smokeExitCode);
    ~LinuxApp();

    void Initialize();
    void ConfigureWebView();
    void NavigateToReader();

    void OpenDocument(
        const std::filesystem::path& path,
        bool automaticReload = false);
    void OpenDocumentDialog();
    void WatchDocument();
    void ScheduleReload();
    void SendCurrentView();
    void SendStatus(
        std::string_view message,
        std::string_view tone = "info");
    void SendJson(const std::string& json);
    void HandleMessage(std::string_view message);
    void HandleLink(std::string_view href);
    void CopySource(std::string_view arguments);
    void SendCopyResult(long long requestId, bool ok);

    void LoadTheme();
    void SaveTheme() const;
    std::string ThemeName() const;
    void UpdateTitle();

    void StartSmokeProbe();
    void CompleteSmoke(bool success, std::string_view reason);

    void HandleAppScheme(WebKitURISchemeRequest* request);
    void HandleDocumentScheme(WebKitURISchemeRequest* request);

    static void OnWindowFinalized(gpointer data, GObject* object);
    static void OnAppScheme(
        WebKitURISchemeRequest* request,
        gpointer data);
    static void OnDocumentScheme(
        WebKitURISchemeRequest* request,
        gpointer data);
    static void OnScriptMessage(
        WebKitUserContentManager* manager,
        JSCValue* value,
        gpointer data);
    static gboolean OnDecidePolicy(
        WebKitWebView* view,
        WebKitPolicyDecision* decision,
        WebKitPolicyDecisionType type,
        gpointer data);
    static GtkWidget* OnCreateWebView(
        WebKitWebView* view,
        WebKitNavigationAction* action,
        gpointer data);
    static gboolean OnPermissionRequest(
        WebKitWebView* view,
        WebKitPermissionRequest* request,
        gpointer data);
    static gboolean OnQueryPermissionState(
        WebKitWebView* view,
        WebKitPermissionStateQuery* query,
        gpointer data);
    static void OnDownloadStarted(
        WebKitNetworkSession* session,
        WebKitDownload* download,
        gpointer data);
    static gboolean OnScriptDialog(
        WebKitWebView* view,
        WebKitScriptDialog* dialog,
        gpointer data);
    static gboolean OnRunFileChooser(
        WebKitWebView* view,
        WebKitFileChooserRequest* request,
        gpointer data);
    static gboolean OnEnterFullscreen(WebKitWebView* view, gpointer data);
    static gboolean OnPrint(
        WebKitWebView* view,
        WebKitPrintOperation* operation,
        gpointer data);
    static void OnOpenDialogFinished(
        GObject* source,
        GAsyncResult* result,
        gpointer data);
    static void OnDirectoryChanged(
        GFileMonitor* monitor,
        GFile* file,
        GFile* otherFile,
        GFileMonitorEvent event,
        gpointer data);
    static gboolean OnReloadTimer(gpointer data);
    static gboolean OnSmokeTimeout(gpointer data);

    GtkApplication* application_ = nullptr;
    GtkWidget* window_ = nullptr;
    WebKitWebView* webView_ = nullptr;
    WebKitWebContext* webContext_ = nullptr;
    WebKitNetworkSession* networkSession_ = nullptr;
    WebKitUserContentManager* contentManager_ = nullptr;

    std::filesystem::path initialPath_;
    std::filesystem::path assetRoot_;
    core::FileRenderResult document_;
    GFileMonitor* directoryMonitor_ = nullptr;
    guint reloadTimer_ = 0;

    ThemeMode theme_ = ThemeMode::System;
    bool readerReady_ = false;
    bool directOpenError_ = false;
    bool smokeTest_ = false;
    bool smokeComplete_ = false;
    int* smokeExitCode_ = nullptr;
    guint smokeTimeout_ = 0;
};

}  // namespace leanmark::linux_host
