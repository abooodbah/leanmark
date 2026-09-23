#include "App.h"
#include "core/MarkdownCore.h"
#include "resource.h"

#include <WebView2EnvironmentOptions.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shobjidl.h>

#include <algorithm>
#include <climits>
#include <cstring>
#include <cwctype>
#include <filesystem>
#include <iterator>
#include <optional>
#include <string_view>
#include <utility>
#include <vector>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "shell32.lib")

namespace {

constexpr wchar_t kAppOrigin[] = L"https://app.leanmark.invalid/";
constexpr wchar_t kAppHost[] = L"app.leanmark.invalid";
constexpr wchar_t kReaderUrl[] = L"https://app.leanmark.invalid/reader.html";
// Document images load from d<N>.doc.leanmark.invalid, one number per folder.
constexpr wchar_t kDocumentHostSuffix[] = L".doc.leanmark.invalid";
constexpr wchar_t kDocumentRequestFilter[] = L"https://*.doc.leanmark.invalid/*";
constexpr std::uintmax_t kMaximumImageBytes = 64ull * 1024ull * 1024ull;
constexpr wchar_t kSettingsKey[] = L"Software\\LeanMark";

// A reader of static text gains nothing from GPU rasterization. On WebView2 153
// the GPU process measured about 70 MiB private with it and about 15 MiB with
// software compositing, the largest single saving LeanMark can make.
//
// The network service runs inside the browser process, which saved about 12 MiB
// on the diagram showcase. It is normally a separate sandboxed process because
// it parses responses from the web; the reader's CSP blocks every web request,
// so here it only ever handles LeanMark's own files.
constexpr wchar_t kBrowserArguments[] =
    L"--disable-background-networking --disable-component-update "
    L"--disable-sync --no-first-run --disk-cache-size=1048576 "
    L"--media-cache-size=1048576 --disable-gpu --disable-software-rasterizer "
    L"--enable-features=NetworkServiceInProcess2";

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

// NTFS compares names with the same upper-case table CompareStringOrdinal uses.
bool SamePath(const std::wstring& left, const std::wstring& right) {
    return CompareStringOrdinal(
               left.c_str(), static_cast<int>(left.size()),
               right.c_str(), static_cast<int>(right.size()),
               TRUE) == CSTR_EQUAL;
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

std::wstring DocumentHostName(unsigned number) {
    return L"d" + std::to_wstring(number) + kDocumentHostSuffix;
}

// Splits https://d<N>.doc.leanmark.invalid/<path> into the host number and the
// still-encoded path. Anything else is rejected.
bool ParseDocumentUri(const std::wstring& uri, unsigned& number, std::wstring& path) {
    constexpr std::wstring_view kPrefix = L"https://d";
    if (!StartsWithInsensitive(uri, kPrefix)) {
        return false;
    }
    std::size_t index = kPrefix.size();
    const std::size_t digitsStart = index;
    unsigned long long parsed = 0;
    while (index < uri.size() && uri[index] >= L'0' && uri[index] <= L'9' &&
           index - digitsStart < 9) {
        parsed = parsed * 10 + static_cast<unsigned long long>(uri[index] - L'0');
        ++index;
    }
    if (index == digitsStart || uri[digitsStart] == L'0') {
        return false;
    }
    const std::wstring rest = uri.substr(index);
    const std::wstring expected = std::wstring(kDocumentHostSuffix) + L"/";
    if (!StartsWithInsensitive(rest, expected)) {
        return false;
    }
    path = rest.substr(expected.size());
    const std::size_t extra = path.find_first_of(L"?#");
    if (extra != std::wstring::npos) {
        path.resize(extra);
    }
    number = static_cast<unsigned>(parsed);
    return true;
}

// The same image types the Linux host serves. The reader's CSP lets only
// images load from these hosts in any case.
const wchar_t* ImageContentType(const std::filesystem::path& path) {
    const std::wstring extension = Lowercase(path.extension().wstring());
    if (extension == L".png") {
        return L"image/png";
    }
    if (extension == L".jpg" || extension == L".jpeg") {
        return L"image/jpeg";
    }
    if (extension == L".gif") {
        return L"image/gif";
    }
    if (extension == L".webp") {
        return L"image/webp";
    }
    if (extension == L".svg") {
        return L"image/svg+xml";
    }
    if (extension == L".avif") {
        return L"image/avif";
    }
    return nullptr;
}

void AppendJson(std::string& json, std::wstring_view value) {
    leanmark::core::AppendJsonString(json, leanmark::WideToUtf8(value));
}

std::vector<std::wstring_view> SplitFields(std::wstring_view text, wchar_t separator) {
    std::vector<std::wstring_view> fields;
    std::size_t start = 0;
    for (;;) {
        const std::size_t end = text.find(separator, start);
        fields.push_back(text.substr(start, end == std::wstring_view::npos
                                                ? std::wstring_view::npos
                                                : end - start));
        if (end == std::wstring_view::npos) {
            return fields;
        }
        start = end + 1;
    }
}

bool ParseInteger(std::wstring_view text, long long minimum, long long maximum, long long& value) {
    if (text.empty() || text.size() > 12) {
        return false;
    }
    bool negative = false;
    std::size_t index = 0;
    if (text[0] == L'-') {
        negative = true;
        index = 1;
        if (text.size() == 1) {
            return false;
        }
    }
    long long parsed = 0;
    for (; index < text.size(); ++index) {
        if (text[index] < L'0' || text[index] > L'9') {
            return false;
        }
        parsed = parsed * 10 + (text[index] - L'0');
    }
    parsed = negative ? -parsed : parsed;
    if (parsed < minimum || parsed > maximum) {
        return false;
    }
    value = parsed;
    return true;
}

// The clipboard convention on Windows is CRLF. Markdown saved with LF endings
// would otherwise paste as one line into some older editors.
std::wstring ToClipboardText(std::string_view utf8) {
    const std::wstring wide = leanmark::Utf8ToWide(utf8);
    std::wstring text;
    text.reserve(wide.size() + wide.size() / 32 + 1);
    for (std::size_t index = 0; index < wide.size(); ++index) {
        if (wide[index] == L'\n' && (index == 0 || wide[index - 1] != L'\r')) {
            text.push_back(L'\r');
        }
        text.push_back(wide[index]);
    }
    return text;
}

bool WriteClipboardText(HWND owner, const std::wstring& text) {
    const SIZE_T bytes = (text.size() + 1) * sizeof(wchar_t);
    HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, bytes);
    if (memory == nullptr) {
        return false;
    }
    void* target = GlobalLock(memory);
    if (target == nullptr) {
        GlobalFree(memory);
        return false;
    }
    std::memcpy(target, text.c_str(), bytes);
    GlobalUnlock(memory);

    // Clipboard managers and Windows clipboard history hold the clipboard for a
    // moment after every change, so wait up to about half a second for it.
    bool opened = false;
    for (int attempt = 0; attempt < 20 && !opened; ++attempt) {
        opened = OpenClipboard(owner) != FALSE;
        if (!opened) {
            Sleep(25);
        }
    }
    if (!opened) {
        GlobalFree(memory);
        return false;
    }
    EmptyClipboard();
    const bool stored = SetClipboardData(CF_UNICODETEXT, memory) != nullptr;
    CloseClipboard();
    if (!stored) {
        GlobalFree(memory);
    }
    return stored;
}

}  // namespace

LeanMarkApp::LeanMarkApp(std::vector<std::wstring> initialPaths)
    : executableDirectory_(ExecutableDirectory()),
      pendingPaths_(std::move(initialPaths)) {}

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

    OpenDocuments(std::exchange(pendingPaths_, {}));
    InitializeWebView();
    if (!minimized_) {
        SetTimer(window_, kFilePollTimer, kFilePollIntervalMs, nullptr);
    }

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

LeanMarkApp::FileStamp LeanMarkApp::ReadStamp(const std::wstring& path) {
    FileStamp stamp;
    WIN32_FILE_ATTRIBUTE_DATA data = {};
    if (!GetFileAttributesExW(path.c_str(), GetFileExInfoStandard, &data) ||
        (data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        return stamp;
    }
    stamp.writeTime = data.ftLastWriteTime;
    stamp.size =
        (static_cast<ULONGLONG>(data.nFileSizeHigh) << 32) | data.nFileSizeLow;
    stamp.valid = true;
    return stamp;
}

bool LeanMarkApp::SameStamp(const FileStamp& left, const FileStamp& right) {
    return left.valid && right.valid && left.size == right.size &&
           left.writeTime.dwLowDateTime == right.writeTime.dwLowDateTime &&
           left.writeTime.dwHighDateTime == right.writeTime.dwHighDateTime;
}

bool LeanMarkApp::CreateMainWindow(int showCommand) {
    const bool dark = EffectiveDarkTheme();
    WNDCLASSEXW windowClass = {};
    windowClass.cbSize = sizeof(windowClass);
    windowClass.lpfnWndProc = WindowProcedure;
    windowClass.hInstance = instance_;
    windowClass.hCursor = LoadCursorW(nullptr, IDC_ARROW);
    windowClass.hIcon = LoadIconW(instance_, MAKEINTRESOURCEW(IDI_LEANMARK));
    windowClass.hIconSm = static_cast<HICON>(LoadImageW(
        instance_,
        MAKEINTRESOURCEW(IDI_LEANMARK),
        IMAGE_ICON,
        GetSystemMetrics(SM_CXSMICON),
        GetSystemMetrics(SM_CYSMICON),
        LR_DEFAULTCOLOR));
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
            if (wParam == SIZE_MINIMIZED) {
                SetMinimized(true);
            } else {
                SetMinimized(false);
                ResizeWebView();
            }
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
                PollActiveTab();
            }
            return 0;
        case WM_COPYDATA:
            return ReceiveOpenRequest(
                       reinterpret_cast<const COPYDATASTRUCT*>(lParam))
                       ? TRUE
                       : FALSE;
        case kOpenPendingMessage:
            OpenDocuments(std::exchange(pendingPaths_, {}));
            return 0;
        case kRecreateWebViewMessage:
            RecreateWebView();
            return 0;
        case WM_SETTINGCHANGE:
            if (theme_ == ThemeMode::System) {
                ApplyWindowTheme();
                if (minimized_) {
                    themeChangedWhileMinimized_ = true;
                } else {
                    PostJson("{\"type\":\"theme\",\"value\":\"system\"}");
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
    options->put_AdditionalBrowserArguments(kBrowserArguments);
    // Tracking prevention exists to block third-party web content, which the
    // reader never loads, so skip loading and matching its lists.
    ComPtr<ICoreWebView2EnvironmentOptions5> options5;
    if (SUCCEEDED(options.As(&options5))) {
        options5->put_EnableTrackingPrevention(FALSE);
    }

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
                            if (minimized_) {
                                controller_->put_IsVisible(FALSE);
                            }
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

    // The reader has no forms, downloads, or web navigation, so autofill and
    // SmartScreen reputation checks have nothing to protect.
    ComPtr<ICoreWebView2Settings4> settings4;
    if (SUCCEEDED(settings.As(&settings4))) {
        settings4->put_IsPasswordAutosaveEnabled(FALSE);
        settings4->put_IsGeneralAutofillEnabled(FALSE);
    }
    ComPtr<ICoreWebView2Settings8> settings8;
    if (SUCCEEDED(settings.As(&settings8))) {
        settings8->put_IsReputationCheckingRequired(FALSE);
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

    // Document images are answered here instead of through a folder mapping.
    // WebView2 applies a new mapping only to later navigations, and a tab from
    // a new folder arrives without one. Each request is checked against its
    // tab's folder, so a document can show the images beside it and nothing else.
    webView_->AddWebResourceRequestedFilter(
        kDocumentRequestFilter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    webView_->add_WebResourceRequested(
        Callback<ICoreWebView2WebResourceRequestedEventHandler>(
            [this](ICoreWebView2*,
                   ICoreWebView2WebResourceRequestedEventArgs* arguments) -> HRESULT {
                HandleDocumentRequest(arguments);
                return S_OK;
            })
            .Get(),
        &token);

    webView_->add_ProcessFailed(
        Callback<ICoreWebView2ProcessFailedEventHandler>(
            [this](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs* arguments)
                -> HRESULT {
                COREWEBVIEW2_PROCESS_FAILED_KIND kind = {};
                if (SUCCEEDED(arguments->get_ProcessFailedKind(&kind))) {
                    HandleProcessFailed(kind);
                }
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

void LeanMarkApp::NavigateToReader() {
    if (webView_ == nullptr) {
        return;
    }
    readerReady_ = false;
    webView_->Navigate(kReaderUrl);
}

void LeanMarkApp::HandleProcessFailed(COREWEBVIEW2_PROCESS_FAILED_KIND kind) {
    // One window now holds every tab, so a crashed renderer would blank all of
    // them. Rebuild from disk, but only a few times a minute so a document that
    // crashes the renderer cannot trap the reader in a reload loop. A renderer
    // that is merely unresponsive (a very large diagram) is left to finish.
    const bool browserExited =
        kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED;
    if (!browserExited &&
        kind != COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED) {
        return;
    }
    const ULONGLONG now = GetTickCount64();
    if (now - recoveryWindowStart_ > 60000) {
        recoveryWindowStart_ = now;
        recoveriesInWindow_ = 0;
    }
    if (++recoveriesInWindow_ > 3) {
        return;
    }
    if (browserExited) {
        // The controller cannot be released from inside its own event.
        PostMessageW(window_, kRecreateWebViewMessage, 0, 0);
    } else {
        NavigateToReader();
    }
}

void LeanMarkApp::RecreateWebView() {
    if (controller_ != nullptr) {
        controller_->Close();
    }
    webView_ = nullptr;
    controller_ = nullptr;
    environment_ = nullptr;
    readerReady_ = false;
    documentHosts_.clear();
    for (Tab& tab : tabs_) {
        tab.host = 0;
    }
    InitializeWebView();
}

void LeanMarkApp::SetMinimized(bool minimized) {
    if (minimized == minimized_) {
        return;
    }
    minimized_ = minimized;
    ComPtr<ICoreWebView2_19> webView19;
    const bool canTarget =
        webView_ != nullptr && SUCCEEDED(webView_.As(&webView19));

    if (minimized) {
        // Nothing is on screen, so stop polling and let WebView2 trim the
        // renderer. Suspension needs the controller hidden first.
        KillTimer(window_, kFilePollTimer);
        if (controller_ == nullptr) {
            return;
        }
        controller_->put_IsVisible(FALSE);
        if (canTarget) {
            webView19->put_MemoryUsageTargetLevel(
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW);
        }
        ComPtr<ICoreWebView2_3> webView3;
        if (SUCCEEDED(webView_.As(&webView3))) {
            webView3->TrySuspend(
                Callback<ICoreWebView2TrySuspendCompletedHandler>(
                    [](HRESULT, BOOL) -> HRESULT { return S_OK; })
                    .Get());
        }
        return;
    }

    if (controller_ != nullptr) {
        if (canTarget) {
            webView19->put_MemoryUsageTargetLevel(
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL);
        }
        // Showing the controller also resumes a suspended WebView.
        controller_->put_IsVisible(TRUE);
    }
    SetTimer(window_, kFilePollTimer, kFilePollIntervalMs, nullptr);
    if (themeChangedWhileMinimized_) {
        themeChangedWhileMinimized_ = false;
        PostJson("{\"type\":\"theme\",\"value\":\"system\"}");
    }
    PollActiveTab();
}

bool LeanMarkApp::ReceiveOpenRequest(const COPYDATASTRUCT* data) {
    constexpr std::size_t kMaximumPathLength = 32767;
    if (data == nullptr || data->dwData != kOpenDocumentsCopyData ||
        data->cbData % sizeof(wchar_t) != 0 ||
        data->cbData > kMaximumForwardedPaths * (kMaximumPathLength + 1) *
                           sizeof(wchar_t) ||
        (data->cbData != 0 && data->lpData == nullptr)) {
        return false;
    }

    // WM_COPYDATA memory is only valid during this call, so copy the paths out
    // and open them from a posted message after the sender has been released.
    const auto* text = static_cast<const wchar_t*>(data->lpData);
    const std::size_t length = data->cbData / sizeof(wchar_t);
    std::size_t start = 0;
    std::size_t accepted = 0;
    for (std::size_t index = 0; index <= length; ++index) {
        if (index != length && text[index] != L'\0') {
            continue;
        }
        const std::size_t size = index - start;
        if (size != 0 && size <= kMaximumPathLength &&
            accepted < kMaximumForwardedPaths) {
            pendingPaths_.emplace_back(text + start, size);
            ++accepted;
        }
        start = index + 1;
    }

    if (IsIconic(window_)) {
        ShowWindow(window_, SW_RESTORE);
    }
    SetForegroundWindow(window_);
    if (accepted != 0) {
        PostMessageW(window_, kOpenPendingMessage, 0, 0);
    }
    return true;
}

LeanMarkApp::Tab* LeanMarkApp::FindTab(unsigned id) {
    const auto found = std::find_if(tabs_.begin(), tabs_.end(), [id](const Tab& tab) {
        return tab.id == id;
    });
    return found == tabs_.end() ? nullptr : &*found;
}

LeanMarkApp::Tab* LeanMarkApp::FindTabByPath(const std::wstring& path) {
    const auto found = std::find_if(tabs_.begin(), tabs_.end(), [&path](const Tab& tab) {
        return SamePath(tab.path, path);
    });
    return found == tabs_.end() ? nullptr : &*found;
}

LeanMarkApp::Tab* LeanMarkApp::ActiveTab() {
    return activeTab_ == 0 ? nullptr : FindTab(activeTab_);
}

void LeanMarkApp::OpenDocuments(const std::vector<std::wstring>& paths) {
    // Tabs are created from their paths alone. Only the tab that ends up active
    // is read and rendered, so opening twenty files costs one render.
    unsigned selected = 0;
    for (const std::wstring& requested : paths) {
        if (requested.empty()) {
            continue;
        }
        const std::wstring path = leanmark::CanonicalPath(requested);
        if (const Tab* existing = FindTabByPath(path)) {
            selected = existing->id;
            continue;
        }
        Tab tab;
        tab.id = nextTabId_++;
        tab.path = path;
        const std::filesystem::path filePath(path);
        tab.fileName = filePath.filename().wstring();
        tab.directory = filePath.parent_path().wstring();
        tabs_.push_back(std::move(tab));
        selected = tabs_.back().id;
    }
    if (selected != 0) {
        ActivateTab(selected);
    }
}

void LeanMarkApp::OpenInTab(const std::wstring& requested, OpenMode mode) {
    const std::wstring path = leanmark::CanonicalPath(requested);
    if (const Tab* existing = FindTabByPath(path)) {
        ActivateTab(existing->id);
        return;
    }
    Tab* active = ActiveTab();
    if (mode == OpenMode::NewTab || active == nullptr) {
        OpenDocuments({path});
        return;
    }

    const std::filesystem::path filePath(path);
    active->path = path;
    active->fileName = filePath.filename().wstring();
    active->directory = filePath.parent_path().wstring();
    active->ok = false;
    active->loaded = {};
    active->pending = {};
    UpdateTitle();
    SendTabs();
    ShowActiveTab();
}

void LeanMarkApp::ActivateTab(unsigned id) {
    if (FindTab(id) == nullptr) {
        return;
    }
    activeTab_ = id;
    UpdateTitle();
    if (!readerReady_) {
        return;  // The reader's "ready" message shows the active tab.
    }
    SendTabs();
    ShowActiveTab();
}

void LeanMarkApp::CloseTab(unsigned id) {
    const auto found = std::find_if(tabs_.begin(), tabs_.end(), [id](const Tab& tab) {
        return tab.id == id;
    });
    if (found == tabs_.end()) {
        return;
    }
    const bool wasActive = found->id == activeTab_;
    const auto index = static_cast<std::size_t>(std::distance(tabs_.begin(), found));
    ReleaseDocumentHost(*found);
    tabs_.erase(found);

    if (wasActive) {
        // Like a browser, select the tab that slid into the closed one's place,
        // or the new last tab when the closed one was last.
        activeTab_ = tabs_.empty() ? 0 : tabs_[std::min(index, tabs_.size() - 1)].id;
        UpdateTitle();
        SendTabs();
        ShowActiveTab();
        return;
    }
    SendTabs();
}

void LeanMarkApp::ShowActiveTab() {
    Tab* tab = ActiveTab();
    if (tab == nullptr) {
        UpdateTitle();
        SendEmpty();
        return;
    }
    LoadTab(*tab, false);
}

void LeanMarkApp::LoadTab(Tab& tab, bool automaticReload) {
    tab.pending.valid = false;
    if (!IsSupportedMarkdownPath(std::filesystem::path(tab.path))) {
        if (automaticReload) {
            SendStatus(L"LeanMark only reloads Markdown files.", "warning");
            return;
        }
        tab.ok = false;
        tab.loaded = {};
        ReleaseDocumentHost(tab);
        UpdateTitle();
        SendError(tab, L"LeanMark opens .md, .markdown, .mdown, and .mkd files.");
        return;
    }

    // The stamp is taken before the read, so an edit that lands mid-read shows
    // up as a newer stamp on the next poll rather than being missed.
    const FileStamp stamp = ReadStamp(tab.path);
    const leanmark::RenderedDocument document = leanmark::RenderMarkdownFile(tab.path);
    if (!document.ok && automaticReload) {
        SendStatus(
            L"The file is still changing or cannot be read. Keeping the last "
            L"complete view and trying again.",
            "warning");
        return;
    }

    tab.path = document.path;
    tab.directory = document.directory;
    tab.fileName = document.fileName;
    tab.ok = document.ok;
    tab.loaded = stamp;
    tab.missingReported = false;
    UpdateTitle();
    if (!document.ok) {
        ReleaseDocumentHost(tab);
        SendError(tab, document.error);
        return;
    }
    AssignDocumentHost(tab);
    SendDocument(tab, document);
}

void LeanMarkApp::AssignDocumentHost(Tab& tab) {
    const auto byNumber = [this](unsigned number) {
        return std::find_if(
            documentHosts_.begin(), documentHosts_.end(),
            [number](const DocumentHost& host) { return host.number == number; });
    };
    if (tab.host != 0) {
        const auto current = byNumber(tab.host);
        if (current != documentHosts_.end() &&
            SamePath(current->directory, tab.directory)) {
            return;
        }
        ReleaseDocumentHost(tab);
    }

    auto host = std::find_if(
        documentHosts_.begin(), documentHosts_.end(),
        [&tab](const DocumentHost& candidate) {
            return SamePath(candidate.directory, tab.directory);
        });
    if (host == documentHosts_.end()) {
        // Numbers are never reused, so a late image request from a closed tab
        // cannot land in another folder.
        DocumentHost added;
        added.directory = tab.directory;
        added.number = nextHostNumber_++;
        documentHosts_.push_back(std::move(added));
        host = std::prev(documentHosts_.end());
    }
    ++host->tabs;
    tab.host = host->number;
}

void LeanMarkApp::ReleaseDocumentHost(Tab& tab) {
    if (tab.host == 0) {
        return;
    }
    const unsigned number = std::exchange(tab.host, 0u);
    const auto host = std::find_if(
        documentHosts_.begin(), documentHosts_.end(),
        [number](const DocumentHost& candidate) { return candidate.number == number; });
    if (host == documentHosts_.end() || --host->tabs != 0) {
        return;
    }
    documentHosts_.erase(host);
}

void LeanMarkApp::HandleDocumentRequest(
    ICoreWebView2WebResourceRequestedEventArgs* arguments) {
    if (environment_ == nullptr) {
        return;
    }
    ComPtr<ICoreWebView2WebResourceRequest> request;
    if (FAILED(arguments->get_Request(&request))) {
        return;
    }
    wchar_t* rawUri = nullptr;
    wchar_t* rawMethod = nullptr;
    request->get_Uri(&rawUri);
    request->get_Method(&rawMethod);
    const std::wstring uri = rawUri == nullptr ? L"" : rawUri;
    const bool isGet = rawMethod != nullptr && std::wstring_view(rawMethod) == L"GET";
    CoTaskMemFree(rawUri);
    CoTaskMemFree(rawMethod);

    const std::wstring commonHeaders =
        L"X-Content-Type-Options: nosniff\r\nCache-Control: no-store";
    const auto respond = [this, arguments](IStream* content, int status,
                                           const wchar_t* reason,
                                           const std::wstring& headers) {
        ComPtr<ICoreWebView2WebResourceResponse> response;
        if (SUCCEEDED(environment_->CreateWebResourceResponse(
                content, status, reason, headers.c_str(), &response))) {
            arguments->put_Response(response.Get());
        }
    };

    unsigned number = 0;
    std::wstring encodedPath;
    if (!isGet || !ParseDocumentUri(uri, number, encodedPath)) {
        respond(nullptr, 404, L"Not Found", commonHeaders);
        return;
    }
    const auto host = std::find_if(
        documentHosts_.begin(), documentHosts_.end(),
        [number](const DocumentHost& candidate) { return candidate.number == number; });
    const auto decoded = DecodeRelativeUrlPath(encodedPath);
    if (host == documentHosts_.end() || !decoded || decoded->empty() ||
        decoded->find(L':') != std::wstring::npos) {
        respond(nullptr, 404, L"Not Found", commonHeaders);
        return;
    }

    const std::filesystem::path relative(*decoded);
    const std::filesystem::path directory(host->directory);
    const std::filesystem::path candidate = directory / relative;
    const wchar_t* contentType = ImageContentType(candidate);
    std::error_code error;
    if (relative.is_absolute() || relative.has_root_name() ||
        relative.has_root_directory() || contentType == nullptr ||
        !leanmark::core::IsPathWithin(directory, candidate) ||
        !std::filesystem::is_regular_file(candidate, error) || error ||
        std::filesystem::file_size(candidate, error) > kMaximumImageBytes || error) {
        respond(nullptr, 404, L"Not Found", commonHeaders);
        return;
    }

    ComPtr<IStream> stream;
    if (FAILED(SHCreateStreamOnFileEx(
            candidate.c_str(), STGM_READ | STGM_SHARE_DENY_NONE,
            FILE_ATTRIBUTE_NORMAL, FALSE, nullptr, &stream))) {
        respond(nullptr, 404, L"Not Found", commonHeaders);
        return;
    }
    respond(stream.Get(), 200, L"OK",
            std::wstring(L"Content-Type: ") + contentType + L"\r\n" + commonHeaders);
}

void LeanMarkApp::OpenDocumentDialog() {
    ComPtr<IFileOpenDialog> dialog;
    if (FAILED(CoCreateInstance(
            CLSID_FileOpenDialog,
            nullptr,
            CLSCTX_INPROC_SERVER,
            IID_PPV_ARGS(&dialog)))) {
        SendStatus(L"Windows could not open the file picker.", "error");
        return;
    }

    const COMDLG_FILTERSPEC filters[] = {
        {L"Markdown files", L"*.md;*.markdown;*.mdown;*.mkd"},
        {L"All files", L"*.*"}};
    dialog->SetFileTypes(static_cast<UINT>(std::size(filters)), filters);
    dialog->SetDefaultExtension(L"md");
    dialog->SetTitle(L"Open Markdown files");

    DWORD options = 0;
    dialog->GetOptions(&options);
    dialog->SetOptions(
        options | FOS_FILEMUSTEXIST | FOS_FORCEFILESYSTEM | FOS_ALLOWMULTISELECT);
    if (dialog->Show(window_) != S_OK) {
        return;
    }

    ComPtr<IShellItemArray> selected;
    if (FAILED(dialog->GetResults(&selected))) {
        return;
    }
    DWORD count = 0;
    selected->GetCount(&count);
    std::vector<std::wstring> paths;
    for (DWORD index = 0; index < count; ++index) {
        ComPtr<IShellItem> item;
        if (FAILED(selected->GetItemAt(index, &item))) {
            continue;
        }
        wchar_t* rawPath = nullptr;
        if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &rawPath)) &&
            rawPath != nullptr) {
            paths.emplace_back(rawPath);
        }
        CoTaskMemFree(rawPath);
    }
    OpenDocuments(paths);
}

void LeanMarkApp::PollActiveTab() {
    // Only the visible tab is watched. A background tab is read again when it
    // is selected, so it can never show stale text.
    Tab* tab = ActiveTab();
    if (tab == nullptr || !IsSupportedMarkdownPath(std::filesystem::path(tab->path))) {
        return;
    }

    const FileStamp current = ReadStamp(tab->path);
    if (!current.valid) {
        if (tab->ok && !tab->missingReported) {
            SendStatus(
                L"The file was moved or deleted. The last complete view is still "
                L"shown.",
                "warning");
            tab->missingReported = true;
        }
        return;
    }
    tab->missingReported = false;

    if (SameStamp(current, tab->loaded)) {
        tab->pending.valid = false;
        return;
    }
    if (!SameStamp(current, tab->pending)) {
        tab->pending = current;
        tab->pendingSince = GetTickCount64();
        return;
    }
    if (GetTickCount64() - tab->pendingSince >= 350) {
        // A tab showing an error has no view worth keeping, so it reloads fully.
        LoadTab(*tab, tab->ok);
    }
}

void LeanMarkApp::UpdateTitle() {
    const Tab* tab = ActiveTab();
    const std::wstring title = tab == nullptr || tab->fileName.empty()
                                   ? std::wstring(L"LeanMark")
                                   : tab->fileName + L" — LeanMark";
    SetWindowTextW(window_, title.c_str());
}

void LeanMarkApp::PostJson(const std::string& json) {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }
    const std::wstring wide = leanmark::Utf8ToWide(json);
    if (!wide.empty()) {
        webView_->PostWebMessageAsJson(wide.c_str());
    }
}

void LeanMarkApp::SendTabs() {
    std::string json = "{\"type\":\"tabs\",\"active\":";
    json += std::to_string(activeTab_);
    json += ",\"tabs\":[";
    for (std::size_t index = 0; index < tabs_.size(); ++index) {
        const Tab& tab = tabs_[index];
        json += index == 0 ? "{\"id\":" : ",{\"id\":";
        json += std::to_string(tab.id);
        json += ",\"name\":\"";
        AppendJson(json, tab.fileName);
        json += "\",\"path\":\"";
        AppendJson(json, tab.path);
        json += "\"}";
    }
    json += "]}";
    PostJson(json);
}

void LeanMarkApp::SendEmpty() {
    std::string json = "{\"type\":\"empty\",\"theme\":\"";
    json += ThemeName();
    json += "\"}";
    PostJson(json);
}

void LeanMarkApp::SendDocument(
    const Tab& tab, const leanmark::RenderedDocument& document) {
    if (webView_ == nullptr || !readerReady_) {
        return;
    }
    // One UTF-8 buffer, escaped in place and widened once. The old path made a
    // wide copy of the HTML, escaped it into a second, and joined a third.
    std::string json;
    json.reserve(document.html.size() + document.html.size() / 8 + 1024);
    json += "{\"type\":\"document\",\"tabId\":";
    json += std::to_string(tab.id);
    json += ",\"theme\":\"";
    json += ThemeName();
    json += "\",\"fileName\":\"";
    AppendJson(json, tab.fileName);
    json += "\",\"path\":\"";
    AppendJson(json, tab.path);
    json += "\",\"documentBaseUrl\":\"";
    if (tab.host != 0) {
        json += "https://";
        json += leanmark::WideToUtf8(DocumentHostName(tab.host));
        json += '/';
    }
    json += "\",\"sourceBytes\":";
    json += std::to_string(document.sourceBytes);
    json += ",\"hasMermaid\":";
    json += document.hasMermaid ? "true" : "false";
    json += ",\"html\":\"";
    leanmark::core::AppendJsonString(json, document.html);
    json += "\"}";
    PostJson(json);
}

void LeanMarkApp::SendError(const Tab& tab, std::wstring_view message) {
    std::string json = "{\"type\":\"error\",\"tabId\":";
    json += std::to_string(tab.id);
    json += ",\"theme\":\"";
    json += ThemeName();
    json += "\",\"fileName\":\"";
    AppendJson(json, tab.fileName);
    json += "\",\"path\":\"";
    AppendJson(json, tab.path);
    json += "\",\"message\":\"";
    AppendJson(json, message);
    json += "\"}";
    PostJson(json);
}

void LeanMarkApp::SendStatus(std::wstring_view message, const char* tone) {
    std::string json = "{\"type\":\"status\",\"tone\":\"";
    leanmark::core::AppendJsonString(json, tone == nullptr ? "info" : tone);
    json += "\",\"message\":\"";
    AppendJson(json, message);
    json += "\"}";
    PostJson(json);
}

void LeanMarkApp::SendCopyResult(unsigned long requestId, bool ok) {
    std::string json = "{\"type\":\"copied\",\"requestId\":";
    json += std::to_string(requestId);
    json += ",\"ok\":";
    json += ok ? "true" : "false";
    json += '}';
    PostJson(json);
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
        PostJson("{\"type\":\"host\",\"copySource\":true,\"tabs\":true}");
        SendTabs();
        ShowActiveTab();
        return;
    }
    if (message == L"open-file") {
        OpenDocumentDialog();
        return;
    }
    if (message == L"reload") {
        if (Tab* tab = ActiveTab()) {
            LoadTab(*tab, false);
        }
        return;
    }
    if (StartsWithInsensitive(message, L"open-link|")) {
        HandleLink(message.substr(10), OpenMode::ReplaceActive);
        return;
    }
    if (StartsWithInsensitive(message, L"open-link-tab|")) {
        HandleLink(message.substr(14), OpenMode::NewTab);
        return;
    }
    if (StartsWithInsensitive(message, L"tab-activate|")) {
        long long id = 0;
        if (ParseInteger(std::wstring_view(message).substr(13), 1, UINT_MAX, id) &&
            static_cast<unsigned>(id) != activeTab_) {
            ActivateTab(static_cast<unsigned>(id));
        }
        return;
    }
    if (StartsWithInsensitive(message, L"tab-close|")) {
        long long id = 0;
        if (ParseInteger(std::wstring_view(message).substr(10), 1, UINT_MAX, id)) {
            CloseTab(static_cast<unsigned>(id));
        }
        return;
    }
    if (StartsWithInsensitive(message, L"copy-source|")) {
        HandleCopySource(message.substr(12));
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

void LeanMarkApp::HandleLink(const std::wstring& href, OpenMode mode) {
    if (href.empty() || href.size() > 8192) {
        return;
    }

    if (StartsWithInsensitive(href, L"https://") ||
        StartsWithInsensitive(href, L"http://") ||
        StartsWithInsensitive(href, L"mailto:")) {
        const auto result = reinterpret_cast<INT_PTR>(
            ShellExecuteW(window_, L"open", href.c_str(), nullptr, nullptr, SW_SHOWNORMAL));
        if (result <= 32) {
            SendStatus(L"Windows could not open that link.", "error");
        }
        return;
    }

    if (href.front() == L'#') {
        return;
    }

    const Tab* active = ActiveTab();
    if (active == nullptr) {
        return;
    }

    std::wstring pathPart = href;
    const std::size_t extra = pathPart.find_first_of(L"?#");
    if (extra != std::wstring::npos) {
        pathPart.resize(extra);
    }
    const auto decoded = DecodeRelativeUrlPath(pathPart);
    if (!decoded || decoded->empty()) {
        SendStatus(L"That local link is not a valid UTF-8 path.", "warning");
        return;
    }

    const std::filesystem::path relative(*decoded);
    if (relative.is_absolute() || relative.has_root_name() ||
        relative.has_root_directory()) {
        SendStatus(L"Absolute local links are blocked for safety.", "warning");
        return;
    }

    if (!IsSupportedMarkdownPath(relative)) {
        SendStatus(
            L"LeanMark opens local Markdown links only. Images still display "
            L"inside the document.",
            "info");
        return;
    }

    std::error_code error;
    const auto resolved = std::filesystem::weakly_canonical(
        std::filesystem::path(active->directory) / relative, error);
    if (error || !std::filesystem::is_regular_file(resolved, error)) {
        SendStatus(L"That linked Markdown file could not be found.", "warning");
        return;
    }
    OpenInTab(resolved.wstring(), mode);
}

void LeanMarkApp::HandleCopySource(const std::wstring& arguments) {
    // requestId|tabId|headingIndex|headingCount, where headingIndex -1 is the
    // whole document and headingCount is what the page rendered.
    const auto fields = SplitFields(arguments, L'|');
    long long requestId = 0;
    long long tabId = 0;
    long long headingIndex = 0;
    long long headingCount = 0;
    if (fields.size() != 4 ||
        !ParseInteger(fields[0], 0, UINT_MAX, requestId) ||
        !ParseInteger(fields[1], 1, UINT_MAX, tabId) ||
        !ParseInteger(fields[2], -1, INT_MAX, headingIndex) ||
        !ParseInteger(fields[3], 0, INT_MAX, headingCount)) {
        return;
    }
    const auto request = static_cast<unsigned long>(requestId);

    Tab* tab = FindTab(static_cast<unsigned>(tabId));
    if (tab == nullptr || !tab->ok || tab->id != activeTab_) {
        SendCopyResult(request, false);
        SendStatus(L"Open a document before copying.", "warning");
        return;
    }

    // The copy comes from the file, not the page, so it is the exact Markdown.
    // If the file changed after it was shown, heading numbers may no longer line
    // up, so show the new version first instead of copying the wrong section.
    const FileStamp current = ReadStamp(tab->path);
    if (!current.valid) {
        SendCopyResult(request, false);
        SendStatus(L"The file was moved or deleted, so there is nothing to copy.", "warning");
        return;
    }
    bool stale = !SameStamp(current, tab->loaded);
    leanmark::core::SectionResult section;
    if (!stale) {
        std::string bytes;
        std::wstring readError;
        if (!leanmark::ReadDocumentBytes(tab->path, bytes, readError)) {
            SendCopyResult(request, false);
            SendStatus(readError, "error");
            return;
        }
        section = leanmark::core::ExtractSection(bytes, headingIndex);
        stale = headingIndex >= 0 &&
                section.headingCount != static_cast<std::size_t>(headingCount);
    }
    if (stale) {
        SendCopyResult(request, false);
        LoadTab(*tab, true);
        SendStatus(
            L"The file changed on disk, so LeanMark reloaded it. Copy again to "
            L"get the current text.",
            "warning");
        return;
    }
    if (!section.ok) {
        SendCopyResult(request, false);
        SendStatus(leanmark::Utf8ToWide(section.error), "warning");
        return;
    }
    if (!WriteClipboardText(window_, ToClipboardText(section.markdown))) {
        SendCopyResult(request, false);
        SendStatus(L"Windows could not open the clipboard. Try again in a moment.", "error");
        return;
    }
    SendCopyResult(request, true);
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
    const std::wstring value = leanmark::Utf8ToWide(ThemeName());
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

const char* LeanMarkApp::ThemeName() const {
    switch (theme_) {
        case ThemeMode::Light:
            return "light";
        case ThemeMode::Dark:
            return "dark";
        default:
            return "system";
    }
}
