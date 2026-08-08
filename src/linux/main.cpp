#include <gtk/gtk.h>

#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

#include "LinuxApp.h"

namespace {

struct ApplicationState {
    std::vector<std::filesystem::path> documents;
    bool smokeTest = false;
    int smokeExitCode = 0;
};

bool ParseArguments(
    int argc,
    char** argv,
    ApplicationState* state,
    bool* showHelp) {
    bool afterSeparator = false;
    for (int index = 1; index < argc; ++index) {
        const std::string argument(argv[index]);
        if (!afterSeparator && argument == "--") {
            afterSeparator = true;
            continue;
        }
        if (!afterSeparator && argument == "--help") {
            *showHelp = true;
            continue;
        }
        if (!afterSeparator && argument == "--smoke-test") {
            if (state->smokeTest || index + 1 >= argc) {
                std::cerr << "--smoke-test requires exactly one Markdown path.\n";
                return false;
            }
            state->smokeTest = true;
            state->documents.emplace_back(argv[++index]);
            continue;
        }
        if (!afterSeparator && !argument.empty() && argument.front() == '-') {
            std::cerr << "Unknown option: " << argument << '\n';
            return false;
        }
        state->documents.emplace_back(argument);
    }

    if (state->smokeTest && state->documents.size() != 1) {
        std::cerr << "--smoke-test accepts exactly one Markdown path.\n";
        return false;
    }
    return true;
}

void Activate(GtkApplication* application, gpointer data) {
    auto* state = static_cast<ApplicationState*>(data);
    if (state->documents.empty()) {
        leanmark::linux_host::LinuxApp::Create(
            application, {}, false, nullptr);
        return;
    }

    for (const auto& document : state->documents) {
        leanmark::linux_host::LinuxApp::Create(
            application,
            document,
            state->smokeTest,
            state->smokeTest ? &state->smokeExitCode : nullptr);
    }
}

}  // namespace

int main(int argc, char** argv) {
    ApplicationState state;
    bool showHelp = false;
    if (!ParseArguments(argc, argv, &state, &showHelp)) {
        return 2;
    }
    if (showHelp) {
        std::cout
            << "Usage: leanmark [--] [MARKDOWN ...]\n"
            << "       leanmark --smoke-test MARKDOWN\n";
        return 0;
    }

    auto* application = gtk_application_new(
        "io.github.abooodbah.leanmark",
        G_APPLICATION_NON_UNIQUE);
    g_signal_connect(application, "activate", G_CALLBACK(Activate), &state);

    // LeanMark owns its file argument parsing so dash-prefixed paths remain
    // available after `--` and GTK never interprets document names as options.
    char* applicationArguments[] = {argv[0], nullptr};
    const int applicationStatus =
        g_application_run(G_APPLICATION(application), 1, applicationArguments);
    g_object_unref(application);

    return state.smokeExitCode != 0 ? state.smokeExitCode : applicationStatus;
}
