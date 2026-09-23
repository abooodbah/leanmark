#include <windows.h>
#include <shellapi.h>

#include <cstdint>
#include <string>
#include <vector>

#include "App.h"

namespace {

std::vector<std::wstring> DocumentArguments() {
    int argumentCount = 0;
    wchar_t** arguments =
        CommandLineToArgvW(GetCommandLineW(), &argumentCount);
    if (arguments == nullptr) {
        return {};
    }

    std::vector<std::wstring> documents;
    bool afterSeparator = false;
    for (int index = 1; index < argumentCount; ++index) {
        const std::wstring argument(arguments[index]);
        if (!afterSeparator && argument == L"--") {
            afterSeparator = true;
            continue;
        }
        if (!afterSeparator && !argument.empty() && argument.front() == L'-') {
            continue;
        }
        documents.push_back(argument);
    }
    LocalFree(arguments);
    return documents;
}

std::wstring ExecutablePath() {
    std::wstring path(32768, L'\0');
    const DWORD length = GetModuleFileNameW(
        nullptr, path.data(), static_cast<DWORD>(path.size()));
    if (length == 0 || length >= path.size()) {
        return {};
    }
    path.resize(length);
    return path;
}

// A forwarded path is opened by a process with a different working directory,
// so relative arguments are resolved here first.
std::wstring FullPath(const std::wstring& path) {
    const DWORD required = GetFullPathNameW(path.c_str(), 0, nullptr, nullptr);
    if (required == 0) {
        return path;
    }
    std::wstring full(required, L'\0');
    const DWORD written =
        GetFullPathNameW(path.c_str(), required, full.data(), nullptr);
    if (written == 0 || written >= required) {
        return path;
    }
    full.resize(written);
    return full;
}

// One reader per executable path: an installed copy and a portable copy each
// keep their own window and never take each other's documents.
std::wstring InstanceMutexName(std::wstring executable) {
    CharUpperBuffW(executable.data(), static_cast<DWORD>(executable.size()));
    std::uint64_t hash = 14695981039346656037ull;  // FNV-1a
    for (const wchar_t character : executable) {
        hash ^= static_cast<std::uint64_t>(character);
        hash *= 1099511628211ull;
    }
    static constexpr wchar_t kHex[] = L"0123456789abcdef";
    std::wstring name = L"Local\\LeanMark.Reader.";
    for (int shift = 60; shift >= 0; shift -= 4) {
        name.push_back(kHex[(hash >> shift) & 0xF]);
    }
    return name;
}

bool IsSameExecutable(DWORD processId, const std::wstring& executable) {
    HANDLE process =
        OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
    if (process == nullptr) {
        return false;
    }
    std::wstring image(32768, L'\0');
    DWORD length = static_cast<DWORD>(image.size());
    const BOOL queried = QueryFullProcessImageNameW(process, 0, image.data(), &length);
    CloseHandle(process);
    if (!queried) {
        return false;
    }
    image.resize(length);
    return CompareStringOrdinal(
               image.c_str(), static_cast<int>(image.size()),
               executable.c_str(), static_cast<int>(executable.size()),
               TRUE) == CSTR_EQUAL;
}

HWND FindRunningReader(const std::wstring& executable) {
    HWND window = nullptr;
    while ((window = FindWindowExW(
                nullptr, window, LeanMarkApp::kWindowClassName, nullptr)) !=
           nullptr) {
        DWORD processId = 0;
        GetWindowThreadProcessId(window, &processId);
        if (processId != GetCurrentProcessId() &&
            IsSameExecutable(processId, executable)) {
            return window;
        }
    }
    return nullptr;
}

bool SendPaths(HWND target, const std::wstring& payload) {
    COPYDATASTRUCT data = {};
    data.dwData = LeanMarkApp::kOpenDocumentsCopyData;
    data.cbData = static_cast<DWORD>(payload.size() * sizeof(wchar_t));
    data.lpData = payload.empty() ? nullptr : const_cast<wchar_t*>(payload.data());
    DWORD_PTR accepted = FALSE;
    return SendMessageTimeoutW(
               target, WM_COPYDATA, 0, reinterpret_cast<LPARAM>(&data),
               SMTO_ABORTIFHUNG, 5000, &accepted) != 0 &&
           accepted == TRUE;
}

// Hands the documents to the running window, which opens each as a tab. An
// empty list just brings that window forward.
bool ForwardDocuments(HWND target, const std::vector<std::wstring>& documents) {
    DWORD processId = 0;
    GetWindowThreadProcessId(target, &processId);
    // This process was started by the user, so it may pass on its right to
    // take the foreground; without it Windows would only flash the taskbar.
    AllowSetForegroundWindow(processId);

    if (documents.empty()) {
        return SendPaths(target, {});
    }
    std::wstring payload;
    std::size_t inPayload = 0;
    for (const std::wstring& document : documents) {
        payload += FullPath(document);
        payload.push_back(L'\0');
        if (++inPayload == LeanMarkApp::kMaximumForwardedPaths) {
            if (!SendPaths(target, payload)) {
                return false;
            }
            payload.clear();
            inPayload = 0;
        }
    }
    return payload.empty() || SendPaths(target, payload);
}

}  // namespace

int WINAPI wWinMain(
    HINSTANCE instance, HINSTANCE, wchar_t*, int showCommand) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    auto documents = DocumentArguments();
    const std::wstring executable = ExecutablePath();

    // The first launch owns this mutex for its lifetime. A later launch sends
    // its files to that window and exits, so every document shares one browser
    // process. If the owner is shutting down, the later launch inherits the
    // mutex and becomes the reader; if no window answers in time it opens its
    // own window rather than lose the file.
    HANDLE instanceMutex = executable.empty()
                               ? nullptr
                               : CreateMutexW(nullptr, FALSE,
                                              InstanceMutexName(executable).c_str());
    bool ownsMutex = false;
    if (instanceMutex != nullptr) {
        const ULONGLONG deadline = GetTickCount64() + 5000;
        for (;;) {
            const DWORD wait = WaitForSingleObject(instanceMutex, 0);
            if (wait == WAIT_OBJECT_0 || wait == WAIT_ABANDONED) {
                ownsMutex = true;
                break;
            }
            const HWND running = FindRunningReader(executable);
            if (running != nullptr && ForwardDocuments(running, documents)) {
                CloseHandle(instanceMutex);
                return 0;
            }
            if (GetTickCount64() >= deadline) {
                break;
            }
            Sleep(50);
        }
    }

    int exitCode = 0;
    {
        LeanMarkApp app(std::move(documents));
        exitCode = app.Run(instance, showCommand);
    }
    if (instanceMutex != nullptr) {
        if (ownsMutex) {
            ReleaseMutex(instanceMutex);
        }
        CloseHandle(instanceMutex);
    }
    return exitCode;
}
