#import "LMAppDelegate.h"

#import "LMDocument.h"
#import "LMDocumentWindowController.h"

#include <cstdio>
#include <cstdlib>

namespace {

NSMenuItem *MenuItem(NSString *title, SEL action, NSString *keyEquivalent,
                     id target) {
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title
                                                 action:action
                                          keyEquivalent:keyEquivalent];
    item.target = target;
    return item;
}

}  // namespace

@interface LMAppDelegate () {
    BOOL _smokeTesting;
    NSString *_smokePath;
    NSArray<NSString *> *_commandLinePaths;
}
@end

@implementation LMAppDelegate

- (instancetype)init {
    self = [super init];
    if (self != nil) {
        [self parseCommandLine];
    }
    return self;
}

- (BOOL)smokeTesting {
    return _smokeTesting;
}

- (void)parseCommandLine {
    NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
    NSMutableArray<NSString *> *paths = [NSMutableArray array];
    BOOL pathsOnly = NO;
    for (NSUInteger index = 1; index < arguments.count; ++index) {
        NSString *argument = arguments[index];
        if ([argument isEqualToString:@"--smoke-test"] && index + 1 < arguments.count) {
            _smokeTesting = YES;
            _smokePath = arguments[++index];
            continue;
        }
        if ([argument isEqualToString:@"--"]) {
            pathsOnly = YES;
            continue;
        }
        if (pathsOnly || ![argument hasPrefix:@"-"]) {
            [paths addObject:argument];
        }
    }
    _commandLinePaths = [paths copy];
}

- (void)installMainMenu {
    NSMenu *mainMenu = [[NSMenu alloc] initWithTitle:@""];

    NSMenuItem *applicationRoot = [[NSMenuItem alloc] initWithTitle:@"LeanMark"
                                                            action:nil
                                                     keyEquivalent:@""];
    NSMenu *applicationMenu = [[NSMenu alloc] initWithTitle:@"LeanMark"];
    [applicationMenu addItem:MenuItem(@"About LeanMark",
                                      @selector(orderFrontStandardAboutPanel:), @"", NSApp)];
    [applicationMenu addItem:NSMenuItem.separatorItem];
    [applicationMenu addItem:MenuItem(@"Hide LeanMark", @selector(hide:), @"h", NSApp)];
    NSMenuItem *hideOthers = MenuItem(@"Hide Others", @selector(hideOtherApplications:),
                                      @"h", NSApp);
    hideOthers.keyEquivalentModifierMask =
        NSEventModifierFlagCommand | NSEventModifierFlagOption;
    [applicationMenu addItem:hideOthers];
    [applicationMenu addItem:MenuItem(@"Show All", @selector(unhideAllApplications:),
                                      @"", NSApp)];
    [applicationMenu addItem:NSMenuItem.separatorItem];
    NSMenuItem *services = [[NSMenuItem alloc] initWithTitle:@"Services"
                                                     action:nil
                                              keyEquivalent:@""];
    services.submenu = [[NSMenu alloc] initWithTitle:@"Services"];
    NSApp.servicesMenu = services.submenu;
    [applicationMenu insertItem:services atIndex:4];
    [applicationMenu addItem:NSMenuItem.separatorItem];
    [applicationMenu addItem:MenuItem(@"Quit LeanMark", @selector(terminate:), @"q", NSApp)];
    applicationRoot.submenu = applicationMenu;
    [mainMenu addItem:applicationRoot];

    NSMenuItem *fileRoot = [[NSMenuItem alloc] initWithTitle:@"File"
                                                     action:nil
                                              keyEquivalent:@""];
    NSMenu *fileMenu = [[NSMenu alloc] initWithTitle:@"File"];
    [fileMenu addItem:MenuItem(@"Open…", @selector(openDocument:), @"o",
                               NSDocumentController.sharedDocumentController)];
    [fileMenu addItem:NSMenuItem.separatorItem];
    [fileMenu addItem:MenuItem(@"Close", @selector(performClose:), @"w", nil)];
    [fileMenu addItem:NSMenuItem.separatorItem];
    [fileMenu addItem:MenuItem(@"Print…", @selector(printActiveDocument:), @"p", self)];
    fileRoot.submenu = fileMenu;
    [mainMenu addItem:fileRoot];

    NSMenuItem *editRoot = [[NSMenuItem alloc] initWithTitle:@"Edit"
                                                     action:nil
                                              keyEquivalent:@""];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Edit"];
    [editMenu addItem:MenuItem(@"Copy", @selector(copy:), @"c", nil)];
    [editMenu addItem:MenuItem(@"Select All", @selector(selectAll:), @"a", nil)];
    [editMenu addItem:NSMenuItem.separatorItem];
    [editMenu addItem:MenuItem(@"Find…", @selector(focusFind:), @"f", self)];
    [editMenu addItem:MenuItem(@"Find Next", @selector(findNext:), @"g", self)];
    NSMenuItem *findPrevious =
        MenuItem(@"Find Previous", @selector(findPrevious:), @"g", self);
    findPrevious.keyEquivalentModifierMask =
        NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [editMenu addItem:findPrevious];
    editRoot.submenu = editMenu;
    [mainMenu addItem:editRoot];

    NSMenuItem *viewRoot = [[NSMenuItem alloc] initWithTitle:@"View"
                                                     action:nil
                                              keyEquivalent:@""];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
    [viewMenu addItem:MenuItem(@"Reload", @selector(reloadActiveDocument:), @"r", self)];
    [viewMenu addItem:NSMenuItem.separatorItem];
    [viewMenu addItem:MenuItem(@"Actual Size", @selector(resetZoom:), @"0", self)];
    [viewMenu addItem:MenuItem(@"Zoom In", @selector(zoomIn:), @"+", self)];
    [viewMenu addItem:MenuItem(@"Zoom Out", @selector(zoomOut:), @"-", self)];
    [viewMenu addItem:NSMenuItem.separatorItem];
    NSMenuItem *theme = MenuItem(@"Cycle Theme", @selector(cycleTheme:), @"t", self);
    theme.keyEquivalentModifierMask =
        NSEventModifierFlagCommand | NSEventModifierFlagShift;
    [viewMenu addItem:theme];
    viewRoot.submenu = viewMenu;
    [mainMenu addItem:viewRoot];

    NSMenuItem *windowRoot = [[NSMenuItem alloc] initWithTitle:@"Window"
                                                       action:nil
                                                keyEquivalent:@""];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItem:MenuItem(@"Minimize", @selector(performMiniaturize:), @"m", nil)];
    [windowMenu addItem:MenuItem(@"Zoom", @selector(performZoom:), @"", nil)];
    [windowMenu addItem:NSMenuItem.separatorItem];
    [windowMenu addItem:MenuItem(@"Bring All to Front", @selector(arrangeInFront:), @"", NSApp)];
    windowRoot.submenu = windowMenu;
    NSApp.windowsMenu = windowMenu;
    [mainMenu addItem:windowRoot];

    NSApp.mainMenu = mainMenu;
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    (void)notification;
    if (_smokeTesting) {
        NSApp.activationPolicy = NSApplicationActivationPolicyAccessory;
        [self beginSmokeTest];
        return;
    }
    [NSApp activateIgnoringOtherApps:YES];

    if (_commandLinePaths.count > 0) {
        for (NSString *path in _commandLinePaths) {
            [self openURL:[NSURL fileURLWithPath:path]];
        }
        return;
    }

    dispatch_async(dispatch_get_main_queue(), ^{
      if (NSDocumentController.sharedDocumentController.documents.count == 0) {
          [self openWelcomeWindow];
      }
    });
}

- (void)application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)URLs {
    (void)application;
    [self closeWelcomeDocuments];
    for (NSURL *URL in URLs) {
        [self openURL:URL];
    }
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender
                    hasVisibleWindows:(BOOL)flag {
    (void)sender;
    if (!flag) {
        NSArray<NSDocument *> *documents =
            NSDocumentController.sharedDocumentController.documents;
        if (documents.count == 0) {
            [self openWelcomeWindow];
        } else {
            for (NSDocument *document in documents) {
                [document showWindows];
            }
        }
    }
    return YES;
}

- (BOOL)applicationSupportsSecureRestorableState:(NSApplication *)app {
    (void)app;
    return YES;
}

- (void)openWelcomeWindow {
    LMDocument *document = [[LMDocument alloc] init];
    [NSDocumentController.sharedDocumentController addDocument:document];
    [document makeWindowControllers];
    [document showWindows];
}

- (void)closeWelcomeDocuments {
    for (NSDocument *document in
         [NSDocumentController.sharedDocumentController.documents copy]) {
        if ([document isKindOfClass:LMDocument.class] &&
            ![(LMDocument *)document hasSourceFile]) {
            [document close];
        }
    }
}

- (void)openURL:(NSURL *)URL {
    [NSDocumentController.sharedDocumentController
        openDocumentWithContentsOfURL:URL
                              display:YES
                    completionHandler:^(NSDocument *document, BOOL wasOpen,
                                        NSError *error) {
      (void)document;
      (void)wasOpen;
      if (error != nil) {
          [NSApp presentError:error];
          if (NSDocumentController.sharedDocumentController.documents.count == 0) {
              [self openWelcomeWindow];
          }
      }
    }];
}

- (LMDocumentWindowController *)activeReader {
    NSWindowController *controller = NSApp.keyWindow.windowController;
    return [controller isKindOfClass:LMDocumentWindowController.class]
        ? (LMDocumentWindowController *)controller
        : nil;
}

- (void)printActiveDocument:(id)sender {
    (void)sender;
    [[self activeReader] printDocument];
}

- (void)focusFind:(id)sender {
    (void)sender;
    [[self activeReader] focusFind];
}

- (void)findNext:(id)sender {
    (void)sender;
    [[self activeReader] findNext:NO];
}

- (void)findPrevious:(id)sender {
    (void)sender;
    [[self activeReader] findNext:YES];
}

- (void)reloadActiveDocument:(id)sender {
    (void)sender;
    [[self activeReader] reloadDocument];
}

- (void)resetZoom:(id)sender {
    (void)sender;
    [[self activeReader] resetZoom];
}

- (void)zoomIn:(id)sender {
    (void)sender;
    [[self activeReader] zoomBy:1];
}

- (void)zoomOut:(id)sender {
    (void)sender;
    [[self activeReader] zoomBy:-1];
}

- (void)cycleTheme:(id)sender {
    (void)sender;
    [[self activeReader] cycleTheme];
}

- (BOOL)validateMenuItem:(NSMenuItem *)menuItem {
    SEL action = menuItem.action;
    if (action == @selector(printActiveDocument:) || action == @selector(focusFind:) ||
        action == @selector(findNext:) || action == @selector(findPrevious:) ||
        action == @selector(reloadActiveDocument:) || action == @selector(resetZoom:) ||
        action == @selector(zoomIn:) || action == @selector(zoomOut:) ||
        action == @selector(cycleTheme:)) {
        return [self activeReader] != nil;
    }
    return YES;
}

- (void)beginSmokeTest {
    if (_smokePath.length == 0) {
        [self finishSmokeTest:NO detail:@"--smoke-test requires a Markdown path"];
        return;
    }
    NSURL *URL = [NSURL fileURLWithPath:_smokePath];
    [NSDocumentController.sharedDocumentController
        openDocumentWithContentsOfURL:URL
                              display:YES
                    completionHandler:^(NSDocument *document, BOOL wasOpen,
                                        NSError *error) {
      (void)wasOpen;
      if (error != nil || document == nil) {
          NSString *detail = error.localizedDescription;
          if (detail == nil) {
              detail = @"document did not open";
          }
          [self finishSmokeTest:NO detail:detail];
          return;
      }
      LMDocumentWindowController *controller =
          (LMDocumentWindowController *)document.windowControllers.firstObject;
      if (![controller isKindOfClass:LMDocumentWindowController.class]) {
          [self finishSmokeTest:NO detail:@"reader window was not created"];
          return;
      }
      [controller runSmokeCheckWithCompletion:^(BOOL success, NSString *detail) {
        [self finishSmokeTest:success detail:detail];
      }];
    }];
}

- (void)finishSmokeTest:(BOOL)success detail:(NSString *)detail {
    FILE *stream = success ? stdout : stderr;
    const char *detailUTF8 = detail.UTF8String;
    if (detailUTF8 == nullptr) {
        detailUTF8 = "unknown";
    }
    std::fprintf(stream, "LeanMark macOS smoke: %s: %s\n",
                 success ? "PASS" : "FAIL", detailUTF8);
    std::fflush(stream);
    std::exit(success ? EXIT_SUCCESS : EXIT_FAILURE);
}

@end
