#include "Markdown.h"
#include "core/MarkdownCore.h"

#include <windows.h>

#include <algorithm>
#include <filesystem>
#include <limits>
#include <utility>

namespace leanmark {
namespace {

std::wstring LastErrorMessage(DWORD errorCode) {
    wchar_t* rawMessage = nullptr;
    const DWORD length = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM |
            FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,
        errorCode,
        0,
        reinterpret_cast<wchar_t*>(&rawMessage),
        0,
        nullptr);

    std::wstring message =
        length == 0 ? L"Windows could not describe the error." : rawMessage;
    if (rawMessage != nullptr) {
        LocalFree(rawMessage);
    }

    while (!message.empty() &&
           (message.back() == L'\r' || message.back() == L'\n' ||
            message.back() == L' ')) {
        message.pop_back();
    }
    return message;
}

}  // namespace

std::wstring CanonicalPath(const std::wstring& requestedPath) {
    std::error_code error;
    const auto canonical =
        std::filesystem::weakly_canonical(std::filesystem::path(requestedPath), error);
    if (!error) {
        return canonical.wstring();
    }

    const DWORD required = GetFullPathNameW(requestedPath.c_str(), 0, nullptr, nullptr);
    if (required == 0) {
        return requestedPath;
    }

    std::wstring fullPath(required, L'\0');
    const DWORD written =
        GetFullPathNameW(requestedPath.c_str(), required, fullPath.data(), nullptr);
    if (written == 0 || written >= required) {
        return requestedPath;
    }
    fullPath.resize(written);
    return fullPath;
}

bool ReadDocumentBytes(
    const std::wstring& path, std::string& bytes, std::wstring& error) {
    bytes.clear();
    const DWORD attributes = GetFileAttributesW(path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES) {
        error = L"LeanMark could not find this file.";
        return false;
    }
    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        error = L"That path is a folder, not a Markdown file.";
        return false;
    }

    HANDLE file = CreateFileW(
        path.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
        nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        error = L"LeanMark could not read this file. " + LastErrorMessage(GetLastError());
        return false;
    }

    LARGE_INTEGER size = {};
    if (!GetFileSizeEx(file, &size) || size.QuadPart < 0) {
        const DWORD errorCode = GetLastError();
        CloseHandle(file);
        error = L"LeanMark could not measure this file. " + LastErrorMessage(errorCode);
        return false;
    }
    if (static_cast<std::uint64_t>(size.QuadPart) > kMaximumDocumentBytes) {
        CloseHandle(file);
        error =
            L"This file is larger than LeanMark's 32 MB safety limit. Open it in "
            L"an editor if you need to inspect the raw text.";
        return false;
    }

    // Read straight into the string the parser will see; the old path read into
    // a vector and then copied the whole file into a std::string.
    bytes.resize(static_cast<std::size_t>(size.QuadPart));
    std::size_t totalRead = 0;
    while (totalRead < bytes.size()) {
        const DWORD request = static_cast<DWORD>(std::min<std::size_t>(
            bytes.size() - totalRead, std::numeric_limits<DWORD>::max()));
        DWORD justRead = 0;
        if (!ReadFile(file, bytes.data() + totalRead, request, &justRead, nullptr)) {
            const DWORD errorCode = GetLastError();
            CloseHandle(file);
            bytes.clear();
            error = L"LeanMark could not finish reading this file. " +
                    LastErrorMessage(errorCode);
            return false;
        }
        if (justRead == 0) {
            break;
        }
        totalRead += justRead;
    }
    CloseHandle(file);
    bytes.resize(totalRead);
    return true;
}

RenderedDocument RenderMarkdownFile(const std::wstring& requestedPath) {
    RenderedDocument result;
    result.path = CanonicalPath(requestedPath);

    const std::filesystem::path filePath(result.path);
    result.directory = filePath.parent_path().wstring();
    result.fileName = filePath.filename().wstring();

    std::string bytes;
    if (!ReadDocumentBytes(result.path, bytes, result.error)) {
        return result;
    }
    result.sourceBytes = static_cast<std::uint64_t>(bytes.size());

    auto rendered = core::RenderMarkdownUtf8(bytes);
    if (!rendered.ok) {
        result.error = Utf8ToWide(rendered.error);
        return result;
    }

    result.html = std::move(rendered.html);
    result.hasMermaid = rendered.hasMermaid;
    result.ok = true;
    return result;
}

std::wstring Utf8ToWide(std::string_view value) {
    if (value.empty() ||
        value.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
        return {};
    }
    const int required = MultiByteToWideChar(
        CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    if (required <= 0) {
        return {};
    }

    std::wstring output(static_cast<std::size_t>(required), L'\0');
    MultiByteToWideChar(
        CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), output.data(), required);
    return output;
}

std::string WideToUtf8(std::wstring_view value) {
    if (value.empty() ||
        value.size() > static_cast<std::size_t>(std::numeric_limits<int>::max())) {
        return {};
    }
    const int required = WideCharToMultiByte(
        CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0,
        nullptr, nullptr);
    if (required <= 0) {
        return {};
    }

    std::string output(static_cast<std::size_t>(required), '\0');
    WideCharToMultiByte(
        CP_UTF8, 0, value.data(), static_cast<int>(value.size()), output.data(),
        required, nullptr, nullptr);
    return output;
}

}  // namespace leanmark
