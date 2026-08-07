#include "App.h"

#include <WebView2EnvironmentOptions.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>

#include <algorithm>
#include <cwctype>
#include <filesystem>
#include <optional>
#include <string_view>
#include <vector>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")

namespace {

constexpr wchar_t kWindowClassName[] = L"LeanMark.Reader.Window";
constexpr wchar_t kAppOrigin[] = L"https://app.leanmark.invalid/";
constexpr wchar_t kDocumentHost[] = L"doc.leanmark.invalid";
constexpr wchar_t kAppHost[] = L"app.leanmark.invalid";
constexpr wchar_t kReaderUrl[] = L"https://app.leanmark.invalid/reader.html";
constexpr wchar_t kSettingsKey[] = L"Software\\LeanMark";

std::wstring ExecutableDirectory() {
    std::wstring path(32768, L'\0');
    const DWORD length =
        GetModuleFileNameW(nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (length == 0 || length >= path.size()) {
        return L".";
    }
    path.resize(length);
    return std::filesystem::path(path).parent_path().wstring();
}

std::wstring LocalAppDataDirectory() {
    wchar_t* rawPath = nullptr;
    if (FAILED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &rawPath))) {
        return ExecutableDirectory();
    }
    std::wstring path(rawPath);
    CoTaskMemFree(rawPath);
    return path;
}

bool ReadFileStamp(
    const std::wstring& path, FILETIME* writeTime, ULONGLONG* fileSize) {
    WIN32_FILE_ATTRIBUTE_DATA data = {};
    if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &data) ||
        (data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        return false;
    }
    *writeTime = data.ftLastWriteTime;
    *fileSize =
        (static_cast<ULONGLONG>(data.nFileSizeHigh) << 32) | data.nFileSizeLow;
    return true;
}

bool EqualFileTimeValue(const FILETIME& left, const FILETIME& right) {
    return left.dwLowDateTime == right.dwLowDateTime &&
           left.dwHighDateTime == right.dwHighDateTime;
}

std::wstring Lowercase(std::wstring value) {
    std::transform(value.begin(), value.end(), value.begin(), [](wchar_t value) {
        return static_cast<wchar_t>(std::towlower(value));
    });
    return value;
}

bool StartsWithInsensitive(
    const std::wstring& value, const std::wstring_view prefix) {
    if (value.size() < prefix.size()) {
        return false;
    }
    for (std::size_t index = 0; index < prefix.size(); ++index) {
        if (std::towlower(value[index]) != std::towlower(prefix[index])) {
            return false;
        }
    }
    return true;
}

bool IsSupportedMarkdownPath(const std::filesystem::path& path) {
    const std::wstring extension = Lowercase(path.extension().wstring());
    return extension == L".md" || extension == L".markdown" ||
           extension == L".mdown" || extension == L".mkd";
}

int HexDigit(wchar_t value) {
    if (value >= L'0' && value <= L'9') {
        return value - L'0';
    }
    if (value >= L'a' && value <= L'f') {
        return value - L'a' + 10;
    }
    if (value >= L'A' && value <= L'F') {
        return value - L'A' + 10;
    }
    return -1;
}

std::optional<std::wstring> DecodeRelativeUrlPath(const std::wstring& value) {
    const std::string utf8 = leanmark::WideToUtf8(value);
    std::string decoded;
    decoded.reserve(utf8.size());

    for (std::size_t index = 0; index < utf8.size(); ++index) {
        if (utf8[index] == '%' && index + 2 < utf8.size()) {
            const int high = HexDigit(static_cast<unsigned char>(utf8[index + 1]));
            const int low = HexDigit(static_cast<unsigned char>(utf8[index + 2]));
            if (high < 0 || low < 0) {
                return std::nullopt;
            }
            decoded.push_back(static_cast<char>((high << 4) | low));
            index += 2;
        } else {
            decoded.push_back(utf8[index]);
        }
    }

    std::wstring wide = leanmark::Utf8ToWide(decoded);
    if (!decoded.empty() && wide.empty()) {
        return std::nullopt;
    }
    std::replace(wide.begin(), wide.end(), L'/', L'\\');
    return wide;
}

bool SystemUsesDarkApps() {
    DWORD lightTheme = 1;
    DWORD size = sizeof(lightTheme);
    const LSTATUS status = RegGetValueW(
        HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"AppsUseLightTheme",
        RRF_RT_REG_DWORD,
        nullptr,
        &lightTheme,
        &size);
    return status == ERROR_SUCCESS && lightTheme == 0;
}

}  // namespace

LeanMarkApp::LeanMarkApp(std::wstring initialPath)
    : initialPath_(std::move(initialPath)),
      executableDirectory_(ExecutableDirectory()) {}

int LeanMarkApp::Run(HINSTANCE instance, int showCommand) {
    instance_ = instance;
    LoadTheme();

    const HRESULT comResult =
        CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    const bool shouldUninitialize = SUCCEEDED(comResult);
    SetCurrentProcessExplicitAppUserModelID(L"LeanMark.Reader");

    if (!CreateMainWindow(showCommand)) {
        if (shouldUninitialize) {
            CoUninitialize();
        }
        return 1;
    }

    if (!initialPath_.empty()) {
        OpenDocument(initialPath_);
    }
    InitializeWebView();
    SetTimer(window_, kFilePollTimer, kFilePollIntervalMs, nullptr);

    MSG message = {};
    while (GetMessageW(&message, nullptr, 0, 0) > 0) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }

    if (shouldUninitialize) {
        CoUninitialize();
    }
    return static_cast<int>(message.wParam);
}

bool LeanMarkApp::CreateMainWindow(int showCommand) {
    const bool dark = EffectiveDarkTheme();
    WNDCLASSEXW windowClass = {};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = WindowProcedure;
    windowClass.hInstance = instance_;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.hIcon = LoadIconW(nullptr, IDI_APPLICATION);
    windowClass.hIconSm = windowClass.hIcon;
    windowClass.hbrBackground =
        CreateSolidBrush(dark ? RGB(14, 13, 11) : RGB(250, 249, 247));
    windowClass.lpszClassName = kWindowClassName;
    if (!RegisterClassExW(&windowClass) &&
        GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
        return false;
    }

    const UINT dpi = GetDpiForSystem();
    RECT bounds = {0, 0, MulDiv(1120, dpi, 96), MulDiv(820, dpi, 96)};
    AdjustWindowRectExForDpi(
        &bounds, WS_OVERLAPPEDWINDOW, FALSE, 0, dpi);

    window_ = CreateWindowExW(
        0,
        kWindowClassName,
        L"LeanMark",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        bounds.right - bounds.left,
        bounds.bottom - bounds.top,
        nullptr,
        nullptr,
        instance_,
        this);
    if (window_ == nullptr) {
        return false;
    }

    ApplyWindowTheme();
    ShowWindow(window_, showCommand);
    UpdateWindow(window_);
    return true;
}

LRESULT CALLBACK LeanMarkApp::WindowProcedure(
    HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    LeanMarkApp* app = reinterpret_cast<LeanMarkApp*>(
        GetWindowLongPtrW(window, GWLP_USERDATA));

    if (message == WM_NCCREATE) {
        const auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
        app = static_cast<LeanMarkApp*>(create->lpCreateParams);
        app->window_ = window;
        SetWindowLongPtrW(
            window, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(app));
    }
    return app == nullptr
               ? DefWindowProcW(window, message, wParam, lParam)
               : app->HandleWindowMessage(message, wParam, lParam);
}

LRESULT LeanMarkApp::HandleWindowMessage(
    UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
        case WM_SIZE:
            ResizeWebView();
            return 0;
        case WM_DPICHANGED: {
            const auto* suggested = reinterpret_cast<RECT*>(lParam);
            SetWindowPos(
                window_, nullptr, suggested->left, suggested->top,
                suggested->right - suggested->left,
                suggested->bottom - suggested->top,
                SWP_NOACTIVATE | SWP_NOZORDER);
            return 0;
        }
        case WM_GETMINMAXINFO: {
            auto* sizing = reinterpret_cast<MINMAXINFO*>(lParam);
            const UINT dpi = GetDpiForWindow(window_);
            sizing->ptMinTrackSize.x = MulDiv(640, dpi, 96);
            sizing->ptMinTrackSize.y = MulDiv(480, dpi, 96);
            return 0;
        }
        case WM_TIMER:
            if (wParam == kFilePollTimer) {
                PollCurrentFile();
            }
            return 0;
        case WM_SETTINGCHANGE:
            if (theme_ == ThemeMode::System) {
                ApplyWindowTheme();
                if (webView_ != nullptr && readerReady_) {
                    webView_->PostWebMessageAsJson(
                        L"{\"type\":\"theme\",\"value\":\"system\"}");
                }
            }
            return 0;
        case WM_ERASEBKGND:
            return 1;
        case WM_DESTROY:
            KillTimer(window_, kFilePollTimer);
            if (controller_ != nullptr) {
                controller_->Close();
            }
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(window_, message, wParam, lParam);
    }
}

void LeanMarkApp::InitializeWebView() {
    const std::filesystem::path userData =
        std::filesystem::path(LocalAppDataDirectory()) / L"LeanMark" / L"WebView2";
    std::error_code ignored;
    std::filesystem::create_directories(userData, ignored);

    auto options = Make<CoreWebView2EnvironmentOptions>();
    options->put_AdditionalBrowserArguments(
        L"--disable-background-networking --disable-component-update "
        L"--disable-sync --no-first-run --disk-cache-size=1048576 "
        L"--media-cache-size=1048576");

    const HRESULT startResult = CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        userData.c_str(),
        options.Get(),
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [this](HRESULT result, ICoreWebView2Environment* environment)
                -> HRESULT {
                if (FAILED(result) || environment == nullptr) {
                    MessageBoxW(
                        window_,
                        L"LeanMark needs the Microsoft Edge WebView2 Runtime. "
                        L"Install or repair WebView2, then try again.",
                        L"LeanMark could not start",
                        MB_OK | MB_ICONERROR);
                    return result;
                }
                environment_ = environment;
                return environment_->CreateCoreWebView2Controller(
                    window_,
                    Callback<
                        ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [this](HRESULT controllerResult,
                               ICoreWebView2Controller* controller) -> HRESULT {
                            if (FAILED(controllerResult) || controller == nullptr) {
                                MessageBoxW(
                                    window_,
                                    L"Windows could not create LeanMark's reader "
                                    L"surface.",
                                    L"LeanMark could not start",
                                    MB_OK | MB_ICONERROR);
                                return controllerResult;
                            }
                            controller_ = controller;
                            controller_->get_CoreWebView2(&webView_);
                            ConfigureWebView();
                            ResizeWebView();
                            NavigateToReader();
                            return S_OK;
                        })
                        .Get());
            })
            .Get());

    if (FAILED(startResult)) {
        MessageBoxW(
            window_,
            L"LeanMark could not initialize the WebView2 Runtime.",
            L"LeanMark could not start",
            MB_OK | MB_ICONERROR);
    }
}

void LeanMarkApp::ResizeWebView() {
    if (controller_ == nullptr || window_ == nullptr) {
        return;
    }
    RECT bounds = {};
    GetClientRect(window_, &bounds);
    controller_->put_Bounds(bounds);
}

void LeanMarkApp::ConfigureWebView() {
    ComPtr<ICoreWebView2Settings> settings;
    webView_->get_Settings(&settings);
    settings->put_IsScriptEnabled(TRUE);
    settings->put_IsWebMessageEnabled(TRUE);
    settings->put_AreDefaultScriptDialogsEnabled(FALSE);
    settings->put_IsStatusBarEnabled(FALSE);
    settings->put_AreDevToolsEnabled(FALSE);
    settings->put_AreDefaultContextMenusEnabled(TRUE);
    settings->put_IsZoomControlEnabled(FALSE);
    settings->put_IsBuiltInErrorPageEnabled(FALSE);

    ComPtr<ICoreWebView2Settings3> settings3;
    if (SUCCEEDED(settings.As(&settings3))) {
        settings3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
    }

    ComPtr<ICoreWebView2Controller2> controller2;
    if (SUCCEEDED(controller_.As(&controller2))) {
        const COREWEBVIEW2_COLOR color =
            EffectiveDarkTheme() ? COREWEBVIEW2_COLOR{255, 14, 13, 11}
                                 : COREWEBVIEW2_COLOR{255, 250, 249, 247};
        controller2->put_DefaultBackgroundColor(color);
    }

    ComPtr<ICoreWebView2_3> webView3;
    if (SUCCEEDED(webView_.As(&webView3))) {
        const auto assets =
            (std::filesystem::path(executableDirectory_) / L"assets").wstring();
        webView3->SetVirtualHostNameToFolderMapping(
            kAppHost,
            assets.c_str(),
            COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
    }
    ConfigureDocumentFolderMapping();

    EventRegistrationToken token = {};
    webView_->add_WebMessageReceived(
        Callback<ICoreWebView2WebMessageReceivedEventHandler>(
            [this](ICoreWebView2*,
                   ICoreWebView2WebMessageReceivedEventArgs* arguments) -> HRESULT {
                HandleWebMessage(arguments);
                return S_OK;
            })
            .Get(),
        &token);

    webView_->add_NavigationStarting(
        Callback<ICoreWebView2NavigationStartingEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* arguments)
                -> HRESULT {
                wchar_t* rawUri = nullptr;
                arguments->get_Uri(&rawUri);
                const std::wstring uri = rawUri == nullptr ? L"" : rawUri;
                CoTaskMemFree(rawUri);
                if (!StartsWithInsensitive(uri, kAppOrigin) &&
                    !StartsWithInsensitive(uri, L"about:blank")) {
                    arguments->put_Cancel(TRUE);
                }
                return S_OK;
            })
            .Get(),
        &token);

    webView_->add_NewWindowRequested(
        Callback<ICoreWebView2NewWindowRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* arguments)
                -> HRESULT {
                arguments->put_Handled(TRUE);
                return S_OK;
            })
            .Get(),
        &token);

    webView_->add_PermissionRequested(
        Callback<ICoreWebView2PermissionRequestedEventHandler>(
            [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* arguments)
                -> HRESULT {
                arguments->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
                return S_OK;
            })
            .Get(),
        &token);

    ComPtr<ICoreWebView2_4> webView4;
    if (SUCCEEDED(webView_.As(&webView4))) {
        webView4->add_DownloadStarting(
            Callback<ICoreWebView2DownloadStartingEventHandler>(
                [](ICoreWebView2*,
                   ICoreWebView2DownloadStartingEventArgs* arguments) -> HRESULT {
                    arguments->put_Cancel(TRUE);
                    return S_OK;
                })
                .Get(),
            &token);
    }
}

void LeanMarkApp::ConfigureDocumentFolderMapping() {
    if (webView_ == nullptr) {
        return;
    }

    ComPtr<ICoreWebView2_3> webView3;
    if (FAILED(webView_.As(&webView3))) {
        return;
    }

    if (!mappedDocumentDirectory_.empty()) {
        webView3->ClearVirtualHostNameToFolderMapping(kDocumentHost);
        mappedDocumentDirectory_.clear();
    }
    if (document_.ok && !document_.directory.empty()) {
        webView3->SetVirtualHostNameToFolderMapping(
            kDocumentHost,
            document_.directory.c_str(),
            COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_DENY_CORS);
        mappedDocumentDirectory_ = document_.directory;
    }
}

void LeanMarkApp::NavigateToReader() {
    if (webView_ == nullptr) {
        return;
    }
    readerReady_ = false;
    ConfigureDocumentFolderMapping();
    webView_->Navigate(kReaderUrl);
}

void LeanMarkApp::OpenDocument(
    const std::wstring& path, bool automaticReload) {
    if (!IsSupportedMarkdownPath(std::filesystem::path(path))) {
        if (automaticReload) {
            SendStatus(L"LeanMark only reloads Markdown files.", L"warning");
            return;
        }
        document_ = {};
        document_.path = path;
        document_.fileName = std::filesystem::path(path).filename().wstring();
        document_.error =
            L"LeanMark opens .md, .markdown, .mdown, and .mkd files.";
        directOpenError_ = true;
        SendCurrentView();
        return;
    }

    auto rendered = leanmark::RenderMarkdownFile(path);
    if (!rendered.ok && automaticReload) {
        SendStatus(
            L"The file is still changing or cannot be read. Keeping the last "
            L"complete view and trying again.",
            L"warning");
        pendingFileChange_ = false;
        return;
    }

    const std::wstring previousDirectory = document_.directory;
    document_ = std::move(rendered);
    directOpenError_ = !document_.ok;
    pendingFileChange_ = false;
    missingFileReported_ = false;

    if (document_.ok) {
        ReadFileStamp(document_.path, &loadedWriteTime_, &loadedFileSize_);
        SetWindowTextW(
            window_, (document_.fileName + L" — LeanMark").c_str());
    } else {
        const std::wstring title = document_.fileName.empty()
                                       ? L"LeanMark"
                                       : document_.fileName + L" — LeanMark";
        SetWindowTextW(window_, title.c_str());
    }

    if (webView_ == nullptr) {
        return;
    }

    if (document_.ok && previousDirectory != document_.directory) {
        NavigateToReader();
    } else {
        SendCurrentView();
    }
}

void LeanMarkApp::OpenDocumentDialog() {
    ComPtr<IFileOpenDialog> dialog;
    if (FAILED(CoCreateInstance(
            CLSID_FileOpenDialog,
            nullptr,
            CLSCTX_INPROC_SERVER,
            IID_PPV_ARGS(&dialog)))) {
        SendStatus(L"Windows could not open the file picker.", L"error");
        return;
    }

    const COMDLG_FILTERSPEC filters[] = {
        {L"Markdown files", L"*.md;*.markdown;*.mdown;*.mkd"},
        {L"All files", L"*.*"}};
    dialog->SetFileTypes(static_cast<UINT>(std::size(filters)), filters);
    dialog->SetDefaultExtension(L"md");
    dialog->SetTitle(L"Open a Markdown file");

    DWORD options = 0;
    dialog->GetOptions(&options);
    dialog->SetOptions(options | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM);
    if (dialog->Show(window_) != S_OK) {
        return;
    }

    ComPtr<IShellItem> selected;
    if (FAILED(dialog->GetResult(&selected))) {
        return;
    }
    wchar_t* rawPath = nullptr;
    if (SUCCEEDED(selected->GetDisplayName(SIGDN_FILESYSPATH, &rawPath)) &&
        rawPath != nullptr) {
        const std::wstring selectedPath(rawPath);
        CoTaskMemFree(rawPath);
        OpenDocument(selectedPath);
    }
}

void LeanMarkApp::PollCurrentFile() {
    if (!document_.ok || document_.path.empty()) {
        return;
    }

    FILETIME currentWriteTime = {};
    ULONGLONG currentFileSize = 0;
    if (!ReadFileStamp(
            document_.path, &currentWriteTime, &currentFileSize)) {
        if (!missingFileReported_) {
            SendStatus(
                L"The file was moved or deleted. The last complete view is still "
                L"shown.",
                L"warning");
            missingFileReported_ = true;
        }
        return;
    }
    missingFileReported_ = false;

    if (EqualFileTimeValue(currentWriteTime, loadedWriteTime_) &&
        currentFileSize == loadedFileSize_) {
        pendingFileChange_ = false;
        return;
    }

    if (!pendingFileChange_ ||
        !EqualFileTimeValue(currentWriteTime, pendingWriteTime_) ||
        currentFileSize != pendingFileSize_) {
        pendingWriteTime_ = currentWriteTime;
        pendingFileSize_ = currentFileSize;
        pendingChangeSince_ = GetTickCount64();
        pendingFileChange_ = true;
        return;
    }

    if (GetTickCount64() - pendingChangeSince_ >= 350) {
        OpenDocument(document_.path, true);
    }
}

void LeanMarkApp::SendCurrentView() {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }

    const std::wstring theme = leanmark::EscapeJsonString(ThemeName());
    if (document_.path.empty() && !directOpenError_) {
        const std::wstring json =
            L"{\"type\":\"empty\",\"theme\":\"" + theme + L"\"}";
        webView_->PostWebMessageAsJson(json.c_str());
        return;
    }

    if (!document_.ok) {
        const std::wstring json =
            L"{\"type\":\"error\",\"theme\":\"" + theme +
            L"\",\"fileName\":\"" +
            leanmark::EscapeJsonString(document_.fileName) +
            L"\",\"path\":\"" + leanmark::EscapeJsonString(document_.path) +
            L"\",\"message\":\"" +
            leanmark::EscapeJsonString(document_.error) + L"\"}";
        webView_->PostWebMessageAsJson(json.c_str());
        return;
    }

    const std::wstring html = leanmark::Utf8ToWide(document_.html);
    const std::wstring json =
        L"{\"type\":\"document\",\"theme\":\"" + theme +
        L"\",\"fileName\":\"" +
        leanmark::EscapeJsonString(document_.fileName) +
        L"\",\"path\":\"" + leanmark::EscapeJsonString(document_.path) +
        L"\",\"html\":\"" + leanmark::EscapeJsonString(html) +
        L"\",\"sourceBytes\":" + std::to_wstring(document_.sourceBytes) +
        L",\"hasMermaid\":" +
        (document_.hasMermaid ? std::wstring(L"true") : std::wstring(L"false")) +
        L"}";
    webView_->PostWebMessageAsJson(json.c_str());
}

void LeanMarkApp::SendStatus(
    const std::wstring& message, const wchar_t* tone) {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }
    const std::wstring json =
        L"{\"type\":\"status\",\"tone\":\"" +
        leanmark::EscapeJsonString(tone == nullptr ? L"info" : tone) +
        L"\",\"message\":\"" + leanmark::EscapeJsonString(message) + L"\"}";
    webView_->PostWebMessageAsJson(json.c_str());
}

void LeanMarkApp::HandleWebMessage(
    ICoreWebView2WebMessageReceivedEventArgs* arguments) {
    wchar_t* rawMessage = nullptr;
    if (FAILED(arguments->TryGetWebMessageAsString(&rawMessage)) ||
        rawMessage == nullptr) {
        CoTaskMemFree(rawMessage);
        return;
    }
    const std::wstring message(rawMessage);
    CoTaskMemFree(rawMessage);

    if (message == L"ready") {
        readerReady_ = true;
        SendCurrentView();
        return;
    }
    if (message == L"open-file") {
        OpenDocumentDialog();
        return;
    }
    if (message == L"reload") {
        if (!document_.path.empty()) {
            OpenDocument(document_.path);
        }
        return;
    }
    if (StartsWithInsensitive(message, L"open-link|")) {
        HandleLink(message.substr(10));
        return;
    }
    if (StartsWithInsensitive(message, L"zoom|") && controller_ != nullptr) {
        double zoom = 1.0;
        controller_->get_ZoomFactor(&zoom);
        const std::wstring action = Lowercase(message.substr(5));
        if (action == L"reset") {
            zoom = 1.0;
        } else if (action == L"in") {
            zoom = std::min(3.0, zoom + 0.1);
        } else if (action == L"out") {
            zoom = std::max(0.5, zoom - 0.1);
        }
        controller_->put_ZoomFactor(zoom);
        return;
    }
    if (StartsWithInsensitive(message, L"theme|")) {
        const std::wstring requested = Lowercase(message.substr(6));
        if (requested == L"light") {
            theme_ = ThemeMode::Light;
        } else if (requested == L"dark") {
            theme_ = ThemeMode::Dark;
        } else {
            theme_ = ThemeMode::System;
        }
        SaveTheme();
        ApplyWindowTheme();
    }
}

void LeanMarkApp::HandleLink(const std::wstring& href) {
    if (href.empty() || href.size() > 8192) {
        return;
    }

    if (StartsWithInsensitive(href, L"https://") ||
        StartsWithInsensitive(href, L"http://") ||
        StartsWithInsensitive(href, L"mailto:")) {
        const auto result = reinterpret_cast<INT_PTR>(
            ShellExecuteW(window_, L"open", href.c_str(), nullptr, nullptr, SW_SHOWNORMAL));
        if (result <= 32) {
            SendStatus(L"Windows could not open that link.", L"error");
        }
        return;
    }

    if (href.front() == L'#') {
        return;
    }

    std::wstring pathPart = href;
    const std::size_t extra = pathPart.find_first_of(L"?#");
    if (extra != std::wstring::npos) {
        pathPart.resize(extra);
    }
    const auto decoded = DecodeRelativeUrlPath(pathPart);
    if (!decoded || decoded->empty()) {
        SendStatus(L"That local link is not a valid UTF-8 path.", L"warning");
        return;
    }

    const std::filesystem::path relative(*decoded);
    if (relative.is_absolute() || relative.has_root_name() ||
        relative.has_root_directory()) {
        SendStatus(L"Absolute local links are blocked for safety.", L"warning");
        return;
    }

    if (!IsSupportedMarkdownPath(relative)) {
        SendStatus(
            L"LeanMark opens local Markdown links only. Images still display "
            L"inside the document.",
            L"info");
        return;
    }

    std::error_code error;
    const auto resolved = std::filesystem::weakly_canonical(
        std::filesystem::path(document_.directory) / relative, error);
    if (error || !std::filesystem::is_regular_file(resolved, error)) {
        SendStatus(L"That linked Markdown file could not be found.", L"warning");
        return;
    }
    OpenDocument(resolved.wstring());
}

void LeanMarkApp::LoadTheme() {
    wchar_t value[16] = {};
    DWORD valueBytes = sizeof(value);
    if (RegGetValueW(
            HKEY_CURRENT_USER,
            kSettingsKey,
            L"Theme",
            RRF_RT_REG_SZ,
            nullptr,
            value,
            &valueBytes) != ERROR_SUCCESS) {
        theme_ = ThemeMode::System;
        return;
    }

    const std::wstring saved = Lowercase(value);
    if (saved == L"light") {
        theme_ = ThemeMode::Light;
    } else if (saved == L"dark") {
        theme_ = ThemeMode::Dark;
    } else {
        theme_ = ThemeMode::System;
    }
}

void LeanMarkApp::SaveTheme() {
    HKEY key = nullptr;
    if (RegCreateKeyExW(
            HKEY_CURRENT_USER,
            kSettingsKey,
            0,
            nullptr,
            0,
            KEY_SET_VALUE,
            nullptr,
            &key,
            nullptr) != ERROR_SUCCESS) {
        return;
    }
    const std::wstring value = ThemeName();
    RegSetValueExW(
        key,
        L"Theme",
        0,
        REG_SZ,
        reinterpret_cast<const BYTE*>(value.c_str()),
        static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t)));
    RegCloseKey(key);
}

void LeanMarkApp::ApplyWindowTheme() {
    if (window_ == nullptr) {
        return;
    }
    const BOOL dark = EffectiveDarkTheme() ? TRUE : FALSE;
    constexpr DWORD kImmersiveDarkMode = 20;
    if (FAILED(DwmSetWindowAttribute(
            window_,
            kImmersiveDarkMode,
            &dark,
            sizeof(dark)))) {
        constexpr DWORD kImmersiveDarkModeLegacy = 19;
        DwmSetWindowAttribute(
            window_,
            kImmersiveDarkModeLegacy,
            &dark,
            sizeof(dark));
    }

    ComPtr<ICoreWebView2Controller2> controller2;
    if (controller_ != nullptr && SUCCEEDED(controller_.As(&controller2))) {
        const COREWEBVIEW2_COLOR color =
            dark ? COREWEBVIEW2_COLOR{255, 14, 13, 11}
                 : COREWEBVIEW2_COLOR{255, 250, 249, 247};
        controller2->put_DefaultBackgroundColor(color);
    }
}

bool LeanMarkApp::EffectiveDarkTheme() const {
    if (theme_ == ThemeMode::Dark) {
        return true;
    }
    if (theme_ == ThemeMode::Light) {
        return false;
    }
    return SystemUsesDarkApps();
}

std::wstring LeanMarkApp::ThemeName() const {
    switch (theme_) {
        case ThemeMode::Light:
            return L"light";
        case ThemeMode::Dark:
            return L"dark";
        default:
            return L"system";
    }
}
