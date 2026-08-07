#pragma once

#include <windows.h>
#include <wrl.h>

#include <string>

#include <WebView2.h>

#include "Markdown.h"

class LeanMarkApp {
public:
    explicit LeanMarkApp(std::wstring initialPath);
    int Run(HINSTANCE instance, int showCommand);

private:
    enum class ThemeMode { System, Light, Dark };

    static constexpr UINT_PTR kFilePollTimer = 1;
    static constexpr UINT kFilePollIntervalMs = 500;

    static LRESULT CALLBACK WindowProcedure(
        HWND window, UINT message, WPARAM wParam, LPARAM lParam);
    LRESULT HandleWindowMessage(UINT message, WPARAM wParam, LPARAM lParam);

    bool CreateMainWindow(int showCommand);
    void InitializeWebView();
    void ConfigureWebView();
    void ResizeWebView();
    void NavigateToReader();
    void ConfigureDocumentFolderMapping();

    void OpenDocument(const std::wstring& path, bool automaticReload = false);
    void OpenDocumentDialog();
    void PollCurrentFile();
    void SendCurrentView();
    void SendStatus(const std::wstring& message, const wchar_t* tone = L"info");
    void HandleWebMessage(ICoreWebView2WebMessageReceivedEventArgs* arguments);
    void HandleLink(const std::wstring& href);

    void LoadTheme();
    void SaveTheme();
    void ApplyWindowTheme();
    bool EffectiveDarkTheme() const;
    std::wstring ThemeName() const;

    HINSTANCE instance_ = nullptr;
    HWND window_ = nullptr;
    std::wstring initialPath_;
    std::wstring executableDirectory_;
    std::wstring mappedDocumentDirectory_;

    Microsoft::WRL::ComPtr<ICoreWebView2Environment> environment_;
    Microsoft::WRL::ComPtr<ICoreWebView2Controller> controller_;
    Microsoft::WRL::ComPtr<ICoreWebView2> webView_;

    leanmark::RenderedDocument document_;
    bool readerReady_ = false;
    bool directOpenError_ = false;

    FILETIME loadedWriteTime_ = {};
    ULONGLONG loadedFileSize_ = 0;
    FILETIME pendingWriteTime_ = {};
    ULONGLONG pendingFileSize_ = 0;
    ULONGLONG pendingChangeSince_ = 0;
    bool pendingFileChange_ = false;
    bool missingFileReported_ = false;

    ThemeMode theme_ = ThemeMode::System;
};
