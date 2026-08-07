#include <windows.h>
#include <shellapi.h>

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

std::wstring QuoteArgument(const std::wstring& argument) {
    // Windows file names cannot contain a quote, so this is sufficient for paths
    // passed by Explorer. Backslashes before the closing quote need doubling.
    std::wstring quoted = L"\"";
    std::size_t trailingBackslashes = 0;
    for (const wchar_t character : argument) {
        quoted.push_back(character);
        trailingBackslashes =
            character == L'\\' ? trailingBackslashes + 1 : 0;
    }
    quoted.append(trailingBackslashes, L'\\');
    quoted.push_back(L'"');
    return quoted;
}

void LaunchAdditionalDocument(const std::wstring& document) {
    std::wstring executable(32768, L'\0');
    const DWORD length = GetModuleFileNameW(
        nullptr, executable.data(), static_cast<DWORD>(executable.size()));
    if (length == 0 || length >= executable.size()) {
        return;
    }
    executable.resize(length);

    std::wstring commandLine =
        QuoteArgument(executable) + L" -- " + QuoteArgument(document);
    STARTUPINFOW startup = {};
    startup.cb = sizeof(startup);
    PROCESS_INFORMATION process = {};
    if (CreateProcessW(
            executable.c_str(),
            commandLine.data(),
            nullptr,
            nullptr,
            FALSE,
            0,
            nullptr,
            nullptr,
            &startup,
            &process)) {
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
    }
}

}  // namespace

int WINAPI wWinMain(
    HINSTANCE instance, HINSTANCE, wchar_t*, int showCommand) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    const auto documents = DocumentArguments();
    for (std::size_t index = 1; index < documents.size(); ++index) {
        LaunchAdditionalDocument(documents[index]);
    }

    const std::wstring initialDocument =
        documents.empty() ? std::wstring() : documents.front();
    LeanMarkApp app(initialDocument);
    return app.Run(instance, showCommand);
}
