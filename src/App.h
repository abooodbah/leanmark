#pragma once

#include <windows.h>
#include <wrl.h>

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include <WebView2.h>

#include "Markdown.h"

class LeanMarkApp {
public:
    // Shared with main.cpp, which hands a second launch's documents to the
    // running window instead of starting another browser process.
    static constexpr wchar_t kWindowClassName[] = L"LeanMark.Reader.Window";
    static constexpr ULONG_PTR kOpenDocumentsCopyData = 0x4C4D4B31;  // "LMK1"
    static constexpr std::size_t kMaximumForwardedPaths = 64;

    explicit LeanMarkApp(std::vector<std::wstring> initialPaths);
    int Run(HINSTANCE instance, int showCommand);

private:
    enum class ThemeMode { System, Light, Dark };
    enum class OpenMode { NewTab, ReplaceActive };

    struct FileStamp {
        FILETIME writeTime = {};
        ULONGLONG size = 0;
        bool valid = false;
    };

    // A tab keeps only what the tab strip and the file watcher need. Rendered
    // HTML goes to the page and is dropped, and a background tab is read from
    // disk again when it is selected, so it costs a few hundred bytes.
    struct Tab {
        unsigned id = 0;
        std::wstring path;
        std::wstring directory;
        std::wstring fileName;
        unsigned host = 0;  // document host number, 0 while it has none
        bool ok = false;
        FileStamp loaded;
        FileStamp pending;
        ULONGLONG pendingSince = 0;
        bool missingReported = false;
    };

    // Each folder with an open document gets its own host name, so a tab from
    // another folder needs no page reload and cannot read this one's images.
    struct DocumentHost {
        std::wstring directory;
        unsigned number = 0;
        unsigned tabs = 0;
    };

    static constexpr UINT_PTR kFilePollTimer = 1;
    static constexpr UINT kFilePollIntervalMs = 500;
    static constexpr UINT kOpenPendingMessage = WM_APP + 1;
    static constexpr UINT kRecreateWebViewMessage = WM_APP + 2;

    static FileStamp ReadStamp(const std::wstring& path);
    static bool SameStamp(const FileStamp& left, const FileStamp& right);

    static LRESULT CALLBACK WindowProcedure(
        HWND window, UINT message, WPARAM wParam, LPARAM lParam);
    LRESULT HandleWindowMessage(UINT message, WPARAM wParam, LPARAM lParam);

    bool CreateMainWindow(int showCommand);
    void InitializeWebView();
    void ConfigureWebView();
    void ResizeWebView();
    void NavigateToReader();
    void RecreateWebView();
    void HandleProcessFailed(COREWEBVIEW2_PROCESS_FAILED_KIND kind);
    void SetMinimized(bool minimized);

    bool ReceiveOpenRequest(const COPYDATASTRUCT* data);
    void OpenDocuments(const std::vector<std::wstring>& paths);
    void OpenInTab(const std::wstring& path, OpenMode mode);
    void ActivateTab(unsigned id);
    void CloseTab(unsigned id);
    void ShowActiveTab();
    void LoadTab(Tab& tab, bool automaticReload);
    Tab* FindTab(unsigned id);
    Tab* FindTabByPath(const std::wstring& path);
    Tab* ActiveTab();
    void AssignDocumentHost(Tab& tab);
    void ReleaseDocumentHost(Tab& tab);
    void HandleDocumentRequest(ICoreWebView2WebResourceRequestedEventArgs* arguments);

    void OpenDocumentDialog();
    void PollActiveTab();
    void UpdateTitle();

    void PostJson(const std::string& json);
    void SendTabs();
    void SendEmpty();
    void SendDocument(const Tab& tab, const leanmark::RenderedDocument& document);
    void SendError(const Tab& tab, std::wstring_view message);
    void SendStatus(std::wstring_view message, const char* tone = "info");
    void SendCopyResult(unsigned long requestId, bool ok);
    void HandleWebMessage(ICoreWebView2WebMessageReceivedEventArgs* arguments);
    void HandleLink(const std::wstring& href, OpenMode mode);
    void HandleCopySource(const std::wstring& arguments);

    void LoadTheme();
    void SaveTheme();
    void ApplyWindowTheme();
    bool EffectiveDarkTheme() const;
    const char* ThemeName() const;

    HINSTANCE instance_ = nullptr;
    HWND window_ = nullptr;
    std::wstring executableDirectory_;
    std::vector<std::wstring> pendingPaths_;

    Microsoft::WRL::ComPtr<ICoreWebView2Environment> environment_;
    Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
    Microsoft::WRL::ComPtr<ICoreWebView2> webView_;

    std::vector<Tab> tabs_;
    std::vector<DocumentHost> documentHosts_;
    unsigned activeTab_ = 0;
    unsigned nextTabId_ = 1;
    unsigned nextHostNumber_ = 1;

    bool readerReady_ = false;
    bool minimized_ = false;
    bool themeChangedWhileMinimized_ = false;
    ULONGLONG recoveryWindowStart_ = 0;
    unsigned recoveriesInWindow_ = 0;

    ThemeMode theme_ = ThemeMode::System;
};
