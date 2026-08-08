#include "Markdown.h"
#include "core/MarkdownCore.h"

#include <windows.h>

#include <algorithm>
#include <filesystem>
#include <limits>
#include <utility>
#include <vector>

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

std::wstring CanonicalExistingPath(const std::wstring& requestedPath) {
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

}  // namespace

RenderedDocument RenderMarkdownFile(const std::wstring& requestedPath) {
    RenderedDocument result;
    result.path = CanonicalExistingPath(requestedPath);

    const std::filesystem::path filePath(result.path);
    result.directory = filePath.parent_path().wstring();
    result.fileName = filePath.filename().wstring();

    const DWORD attributes = GetFileAttributesW(result.path.c_str());
    if (attributes == INVALID_FILE_ATTRIBUTES) {
        result.error = L"LeanMark could not find this file.";
        return result;
    }
    if ((attributes & FILE_ATTRIBUTE_DIRECTORY) != 0) {
        result.error = L"That path is a folder, not a Markdown file.";
        return result;
    }

    HANDLE file = CreateFileW(
        result.path.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_SEQUENTIAL_SCAN,
        nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        result.error =
            L"LeanMark could not read this file. " + LastErrorMessage(GetLastError());
        return result;
    }

    LARGE_INTEGER size = {};
    if (!GetFileSizeEx(file, &size) || size.QuadPart < 0) {
        const DWORD errorCode = GetLastError();
        CloseHandle(file);
        result.error =
            L"LeanMark could not measure this file. " + LastErrorMessage(errorCode);
        return result;
    }
    result.sourceBytes = static_cast<std::uint64_t>(size.QuadPart);
    if (result.sourceBytes > kMaximumDocumentBytes) {
        CloseHandle(file);
        result.error =
            L"This file is larger than LeanMark's 32 MB safety limit. Open it in "
            L"an editor if you need to inspect the raw text.";
        return result;
    }

    std::vector<char> bytes(static_cast<std::size_t>(result.sourceBytes));
    std::size_t totalRead = 0;
    while (totalRead < bytes.size()) {
        const DWORD request = static_cast<DWORD>(std::min<std::size_t>(
            bytes.size() - totalRead, std::numeric_limits<DWORD>::max()));
        DWORD justRead = 0;
        if (!ReadFile(file, bytes.data() + totalRead, request, &justRead, nullptr)) {
            const DWORD errorCode = GetLastError();
            CloseHandle(file);
            result.error =
                L"LeanMark could not finish reading this file. " +
                LastErrorMessage(errorCode);
            return result;
        }
        if (justRead == 0) {
            break;
        }
        totalRead += justRead;
    }
    CloseHandle(file);
    bytes.resize(totalRead);

    auto rendered = core::RenderMarkdownUtf8(
        std::string(bytes.begin(), bytes.end()));
    if (!rendered.ok) {
        result.error = Utf8ToWide(rendered.error);
        return result;
    }

    result.html = std::move(rendered.html);
    result.hasMermaid = rendered.hasMermaid;
    result.ok = true;
    return result;
}

std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) {
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

std::string WideToUtf8(const std::wstring& value) {
    if (value.empty()) {
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

std::wstring EscapeJsonString(const std::wstring& value) {
    static constexpr wchar_t kHex[] = L"0123456789abcdef";
    std::wstring output;
    output.reserve(value.size() + 16);

    for (const wchar_t character : value) {
        switch (character) {
            case L'"':
                output += L"\\\"";
                break;
            case L'\\':
                output += L"\\\\";
                break;
            case L'\b':
                output += L"\\b";
                break;
            case L'\f':
                output += L"\\f";
                break;
            case L'\n':
                output += L"\\n";
                break;
            case L'\r':
                output += L"\\r";
                break;
            case L'\t':
                output += L"\\t";
                break;
            default:
                if (character < 0x20 || character == 0x2028 ||
                    character == 0x2029) {
                    output += L"\\u";
                    output += kHex[(character >> 12) & 0xF];
                    output += kHex[(character >> 8) & 0xF];
                    output += kHex[(character >> 4) & 0xF];
                    output += kHex[character & 0xF];
                } else {
                    output += character;
                }
                break;
        }
    }
    return output;
}

}  // namespace leanmark
