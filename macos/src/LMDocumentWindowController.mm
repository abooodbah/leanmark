#import "LMDocumentWindowController.h"

#import "LMDocument.h"
#import "LMResourceSchemeHandler.h"

#import <WebKit/WebKit.h>

#include "core/MarkdownCore.h"

#include <algorithm>
#include <charconv>
#include <cmath>
#include <filesystem>
#include <string>
#include <string_view>
#include <system_error>

namespace {

NSString *const LMThemePreferenceKey = @"LeanMarkTheme";
NSString *const LMZoomPreferenceKey = @"LeanMarkZoom";
NSString *const LMTextWidthPreferenceKey = @"LeanMarkTextWidth";

BOOL StringContainsNUL(NSString *value) {
    const unichar nul = 0;
    NSString *needle = [NSString stringWithCharacters:&nul length:1];
    return [value rangeOfString:needle].location != NSNotFound;
}

double SavedZoom(void) {
    NSNumber *zoom = [NSUserDefaults.standardUserDefaults
        objectForKey:LMZoomPreferenceKey];
    return [zoom isKindOfClass:NSNumber.class]
        ? leanmark::core::NormalizeZoom(zoom.doubleValue)
        : leanmark::core::kDefaultZoom;
}

const char *ThemeUTF8(NSString *name) {
    const char *utf8 = name.UTF8String;
    return utf8 != nullptr ? utf8 : "";
}

NSString *ThemeString(leanmark::core::Theme theme) {
    return @(leanmark::core::ThemeName(theme));
}

// An unknown saved name, such as one from a later version, gives "system".
NSString *CurrentTheme(void) {
    NSString *saved = [NSUserDefaults.standardUserDefaults
        stringForKey:LMThemePreferenceKey];
    return ThemeString(leanmark::core::ParseTheme(ThemeUTF8(saved)));
}

// Settings from 0.5.0 have no width; that and any unknown name give
// "narrow", the 0.5.0 column.
NSString *CurrentTextWidth(void) {
    NSString *saved = [NSUserDefaults.standardUserDefaults
        stringForKey:LMTextWidthPreferenceKey];
    return @(leanmark::core::TextWidthName(
        leanmark::core::ParseTextWidth(ThemeUTF8(saved))));
}

// A menu item's key equivalent as the reader's shortcut list writes keys,
// for example "Cmd+Shift+T". An uppercase key equivalent implies Shift.
NSString *ShortcutKeys(NSMenuItem *item) {
    NSString *key = item.keyEquivalent;
    if (key.length == 0) {
        return nil;
    }
    const NSEventModifierFlags flags = item.keyEquivalentModifierMask;
    const BOOL shifted = (flags & NSEventModifierFlagShift) != 0 ||
                         ![key isEqualToString:key.lowercaseString];
    NSMutableString *text = [NSMutableString string];
    if ((flags & NSEventModifierFlagControl) != 0) {
        [text appendString:@"Ctrl+"];
    }
    if ((flags & NSEventModifierFlagOption) != 0) {
        [text appendString:@"Option+"];
    }
    if ((flags & NSEventModifierFlagCommand) != 0) {
        [text appendString:@"Cmd+"];
    }
    if (shifted) {
        [text appendString:@"Shift+"];
    }
    [text appendString:key.uppercaseString];
    return text;
}

// Every menu shortcut, read from the menus themselves so the reader's list
// matches what the menus do.
void CollectMenuShortcuts(NSMenu *menu, NSMutableArray<NSDictionary *> *into) {
    for (NSMenuItem *item in menu.itemArray) {
        if (item.submenu != nil) {
            CollectMenuShortcuts(item.submenu, into);
        }
        NSString *keys = ShortcutKeys(item);
        if (keys != nil && item.title.length > 0 && !item.hidden) {
            [into addObject:@{ @"keys" : keys, @"label" : item.title }];
        }
    }
}

BOOL IsExpectedAppURL(NSURL *URL) {
    return [URL.scheme.lowercaseString isEqualToString:@"leanmark-app"] &&
           [URL.host.lowercaseString isEqualToString:@"app"];
}

bool ParseInteger(NSString *text, long long minimum, long long maximum,
                  long long &value) {
    const char *utf8 = text.UTF8String;
    if (utf8 == nullptr || utf8[0] == '\0') {
        return false;
    }
    const std::string_view digits(utf8);
    long long parsed = 0;
    const auto result =
        std::from_chars(digits.data(), digits.data() + digits.size(), parsed);
    if (result.ec != std::errc() || result.ptr != digits.data() + digits.size() ||
        parsed < minimum || parsed > maximum) {
        return false;
    }
    value = parsed;
    return true;
}

NSString *StringFromUTF8(const std::string &value, NSString *fallback) {
    NSString *text = [[NSString alloc] initWithBytes:value.data()
                                              length:value.size()
                                            encoding:NSUTF8StringEncoding];
    return text != nil ? text : fallback;
}

}  // namespace

@interface LMWeakScriptMessageHandler : NSObject <WKScriptMessageHandler>
@property(nonatomic, weak) id<WKScriptMessageHandler> delegate;
@end

@implementation LMWeakScriptMessageHandler
- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    [self.delegate userContentController:userContentController
                  didReceiveScriptMessage:message];
}
@end

@interface LMDocumentWindowController ()
    <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler> {
    WKWebView *_webView;
    LMResourceSchemeHandler *_applicationSchemeHandler;
    LMResourceSchemeHandler *_documentSchemeHandler;
    LMWeakScriptMessageHandler *_messageProxy;
    BOOL _readerReady;
}
@end

@implementation LMDocumentWindowController

- (instancetype)initWithDocument:(LMDocument *)document {
    NSRect frame = NSMakeRect(0, 0, 1100, 760);
    NSWindowStyleMask style = NSWindowStyleMaskTitled |
                              NSWindowStyleMaskClosable |
                              NSWindowStyleMaskMiniaturizable |
                              NSWindowStyleMaskResizable;
    NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:style
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    window.title = @"LeanMark";
    window.minSize = NSMakeSize(680, 460);
    window.tabbingMode = NSWindowTabbingModePreferred;

    self = [super initWithWindow:window];
    if (self != nil) {
        [self configureWebViewForDocument:document];
        [self applyWindowTheme:CurrentTheme()];
        [window center];
    }
    return self;
}

- (LMDocument *)leanMarkDocument {
    return (LMDocument *)self.document;
}

- (void)configureWebViewForDocument:(LMDocument *)document {
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    configuration.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;

    NSURL *resourceRoot = NSBundle.mainBundle.resourceURL;
    NSURL *documentRoot = document.documentDirectoryURL;
    if (documentRoot == nil) {
        documentRoot = resourceRoot;
    }
    _applicationSchemeHandler = [[LMResourceSchemeHandler alloc]
        initWithMode:LMResourceSchemeModeApplication
              rootURL:resourceRoot];
    _documentSchemeHandler = [[LMResourceSchemeHandler alloc]
        initWithMode:LMResourceSchemeModeDocument
              rootURL:documentRoot];
    [configuration setURLSchemeHandler:_applicationSchemeHandler
                          forURLScheme:@"leanmark-app"];
    [configuration setURLSchemeHandler:_documentSchemeHandler
                          forURLScheme:@"leanmark-doc"];

    _messageProxy = [[LMWeakScriptMessageHandler alloc] init];
    _messageProxy.delegate = self;
    [configuration.userContentController addScriptMessageHandler:_messageProxy
                                                              name:@"leanmark"];

    _webView = [[WKWebView alloc] initWithFrame:NSZeroRect
                                  configuration:configuration];
    _webView.translatesAutoresizingMaskIntoConstraints = NO;
    _webView.navigationDelegate = self;
    _webView.UIDelegate = self;
    _webView.allowsMagnification = NO;
    // The web view stays at 100% so the toolbar keeps its size; the reader
    // zooms the document to the saved level it receives with the host message.
    _webView.pageZoom = 1.0;
    if (@available(macOS 13.3, *)) {
        _webView.inspectable = NO;
    }

    NSView *contentView = self.window.contentView;
    [contentView addSubview:_webView];
    [NSLayoutConstraint activateConstraints:@[
        [_webView.leadingAnchor constraintEqualToAnchor:contentView.leadingAnchor],
        [_webView.trailingAnchor constraintEqualToAnchor:contentView.trailingAnchor],
        [_webView.topAnchor constraintEqualToAnchor:contentView.topAnchor],
        [_webView.bottomAnchor constraintEqualToAnchor:contentView.bottomAnchor],
    ]];

    NSURL *readerURL = [NSURL URLWithString:@"leanmark-app://app/reader.html"];
    [_webView loadRequest:[NSURLRequest requestWithURL:readerURL
                                           cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                       timeoutInterval:15.0]];
}

- (void)dealloc {
    [_webView.configuration.userContentController
        removeScriptMessageHandlerForName:@"leanmark"];
    _webView.navigationDelegate = nil;
    _webView.UIDelegate = nil;
}

- (void)windowDidLoad {
    [super windowDidLoad];
    NSString *displayName = self.leanMarkDocument.displayName;
    self.window.title = displayName != nil ? displayName : @"LeanMark";
}

- (void)documentContentDidChange {
    NSURL *documentRoot = self.leanMarkDocument.documentDirectoryURL;
    if (documentRoot != nil) {
        _documentSchemeHandler.rootURL = documentRoot;
    }
    NSString *displayName = self.leanMarkDocument.displayName;
    self.window.title = displayName != nil ? displayName : @"LeanMark";
    [self sendCurrentDocument];
}

- (void)sendCurrentDocument {
    if (!_readerReady) {
        return;
    }
    NSDictionary<NSString *, id> *payload =
        [self.leanMarkDocument readerPayloadForTheme:CurrentTheme()];
    [_webView callAsyncJavaScript:@"window.LeanMarkHost.receive(payload)"
                        arguments:@{ @"payload" : payload }
                          inFrame:nil
                   inContentWorld:WKContentWorld.pageWorld
                completionHandler:^(id result, NSError *error) {
      (void)result;
      if (error != nil) {
          NSLog(@"LeanMark could not deliver the document to its reader: %@", error);
      }
    }];
}

- (void)showStatus:(NSString *)message tone:(NSString *)tone {
    if (!_readerReady) {
        return;
    }
    NSDictionary<NSString *, id> *payload = @{
        @"type" : @"status",
        @"message" : message,
        @"tone" : tone,
    };
    [_webView callAsyncJavaScript:@"window.LeanMarkHost.receive(payload)"
                        arguments:@{ @"payload" : payload }
                          inFrame:nil
                   inContentWorld:WKContentWorld.pageWorld
                completionHandler:nil];
}

- (void)userContentController:(WKUserContentController *)userContentController
      didReceiveScriptMessage:(WKScriptMessage *)message {
    (void)userContentController;
    NSURL *frameURL = message.frameInfo.request.URL;
    if (!message.frameInfo.isMainFrame || !IsExpectedAppURL(frameURL) ||
        ![message.body isKindOfClass:NSString.class]) {
        return;
    }

    NSString *command = (NSString *)message.body;
    if (command.length == 0 || command.length > 8192 || StringContainsNUL(command)) {
        return;
    }
    if ([command isEqualToString:@"ready"]) {
        _readerReady = YES;
        NSMutableArray<NSDictionary *> *menuShortcuts = [NSMutableArray array];
        if (NSApp.mainMenu != nil) {
            CollectMenuShortcuts(NSApp.mainMenu, menuShortcuts);
        }
        [self deliverPayload:@{
            @"type" : @"host",
            @"copySource" : @YES,
            @"tabs" : @NO,
            @"platform" : @"macos",
            @"zoom" : @(std::lround(SavedZoom() * 100.0)),
            @"width" : CurrentTextWidth(),
            @"shortcuts" : menuShortcuts,
        }];
        [self sendCurrentDocument];
        return;
    }
    if ([command isEqualToString:@"open-file"]) {
        [NSDocumentController.sharedDocumentController openDocument:nil];
        return;
    }
    if ([command isEqualToString:@"reload"]) {
        [self reloadDocument];
        return;
    }
    if ([command hasPrefix:@"open-link|"]) {
        [self handleLink:[command substringFromIndex:@"open-link|".length]];
        return;
    }
    if ([command hasPrefix:@"copy-source|"]) {
        [self copySource:[command substringFromIndex:@"copy-source|".length]];
        return;
    }
    if ([command hasPrefix:@"zoom|"]) {
        NSString *action = [command substringFromIndex:@"zoom|".length];
        if ([action isEqualToString:@"in"]) {
            [self zoomBy:1];
        } else if ([action isEqualToString:@"out"]) {
            [self zoomBy:-1];
        } else if ([action isEqualToString:@"reset"]) {
            [self resetZoom];
        }
        return;
    }
    if ([command hasPrefix:@"width|"]) {
        NSString *width = [command substringFromIndex:@"width|".length];
        NSString *name = @(leanmark::core::TextWidthName(
            leanmark::core::ParseTextWidth(ThemeUTF8(width))));
        [NSUserDefaults.standardUserDefaults setObject:name
                                                forKey:LMTextWidthPreferenceKey];
        return;
    }
    if ([command hasPrefix:@"theme|"]) {
        NSString *theme = [command substringFromIndex:@"theme|".length];
        // Only exact theme names are saved; anything else is ignored.
        if (![ThemeString(leanmark::core::ParseTheme(ThemeUTF8(theme)))
                isEqualToString:theme]) {
            return;
        }
        [NSUserDefaults.standardUserDefaults setObject:theme
                                                forKey:LMThemePreferenceKey];
        [self applyWindowTheme:theme];
    }
}

- (void)deliverPayload:(NSDictionary<NSString *, id> *)payload {
    if (!_readerReady) {
        return;
    }
    [_webView callAsyncJavaScript:@"window.LeanMarkHost.receive(payload)"
                        arguments:@{ @"payload" : payload }
                          inFrame:nil
                   inContentWorld:WKContentWorld.pageWorld
                completionHandler:nil];
}

- (void)sendCopyResult:(long long)requestId ok:(BOOL)ok {
    [self deliverPayload:@{
        @"type" : @"copied",
        @"requestId" : @(requestId),
        @"ok" : @(ok),
    }];
}

// requestId|tabId|headingIndex|headingCount. Each document has its own window
// here, so the tab id is ignored and the copy comes from this window's file.
- (void)copySource:(NSString *)arguments {
    NSArray<NSString *> *fields = [arguments componentsSeparatedByString:@"|"];
    long long requestId = 0;
    long long headingIndex = 0;
    long long headingCount = 0;
    if (fields.count != 4 ||
        !ParseInteger(fields[0], 0, 4294967295LL, requestId) ||
        !ParseInteger(fields[2], -1, 2147483647LL, headingIndex) ||
        !ParseInteger(fields[3], 0, 2147483647LL, headingCount)) {
        return;
    }

    NSURL *fileURL = self.leanMarkDocument.fileURL;
    if (fileURL == nil || !self.leanMarkDocument.hasSourceFile) {
        [self sendCopyResult:requestId ok:NO];
        [self showStatus:@"Open a document before copying." tone:@"warning"];
        return;
    }

    // The copy comes from the file, so it is the exact Markdown. If the heading
    // count no longer matches the page, show the new version first.
    std::string bytes;
    std::string error;
    if (!leanmark::core::ReadDocumentFile(
            std::filesystem::path(fileURL.fileSystemRepresentation), bytes, error)) {
        [self sendCopyResult:requestId ok:NO];
        [self showStatus:StringFromUTF8(error, @"LeanMark could not read this file.")
                    tone:@"error"];
        return;
    }
    const auto section = leanmark::core::ExtractSection(bytes, headingIndex);
    if (headingIndex >= 0 &&
        section.headingCount != static_cast<std::size_t>(headingCount)) {
        [self sendCopyResult:requestId ok:NO];
        [self reloadDocument];
        [self showStatus:@"The file changed on disk, so LeanMark reloaded it. Copy "
                         @"again to get the current text."
                    tone:@"warning"];
        return;
    }
    NSString *text = section.ok ? StringFromUTF8(section.markdown, nil) : nil;
    if (text == nil) {
        [self sendCopyResult:requestId ok:NO];
        [self showStatus:StringFromUTF8(section.error, @"That section could not be copied.")
                    tone:@"warning"];
        return;
    }
    NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
    [pasteboard clearContents];
    const BOOL stored = [pasteboard setString:text forType:NSPasteboardTypeString];
    [self sendCopyResult:requestId ok:stored];
}

- (void)handleLink:(NSString *)href {
    if (href.length == 0 || href.length > 8192 || StringContainsNUL(href)) {
        return;
    }

    NSURLComponents *components = [NSURLComponents componentsWithString:href];
    NSString *scheme = components.scheme.lowercaseString;
    if ([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"] ||
        [scheme isEqualToString:@"mailto"]) {
        NSURL *externalURL = components.URL;
        BOOL validHTTP = !([scheme isEqualToString:@"http"] ||
                           [scheme isEqualToString:@"https"]) ||
                         externalURL.host.length > 0;
        if (externalURL != nil && validHTTP &&
            ![NSWorkspace.sharedWorkspace openURL:externalURL]) {
            [self showStatus:@"macOS could not open that link." tone:@"error"];
        }
        return;
    }
    if (scheme.length > 0 || [href hasPrefix:@"//"] || [href hasPrefix:@"#"] ||
        self.leanMarkDocument.documentDirectoryURL == nil) {
        return;
    }

    NSRange suffix = [href rangeOfCharacterFromSet:
        [NSCharacterSet characterSetWithCharactersInString:@"?#"]];
    NSString *pathPart = suffix.location == NSNotFound
        ? href
        : [href substringToIndex:suffix.location];
    pathPart = pathPart.stringByRemovingPercentEncoding;
    if (pathPart.length == 0 || StringContainsNUL(pathPart)) {
        [self showStatus:@"That local link is not a valid UTF-8 path."
                    tone:@"warning"];
        return;
    }
    pathPart = [pathPart stringByReplacingOccurrencesOfString:@"\\"
                                                   withString:@"/"];

    std::filesystem::path relative(pathPart.fileSystemRepresentation);
    if (relative.is_absolute() || relative.has_root_name() ||
        !leanmark::core::IsSupportedMarkdownPath(relative)) {
        [self showStatus:@"LeanMark opens relative local Markdown links only."
                    tone:@"warning"];
        return;
    }

    std::error_code pathError;
    std::filesystem::path root(
        self.leanMarkDocument.documentDirectoryURL.fileSystemRepresentation);
    std::filesystem::path resolved =
        std::filesystem::weakly_canonical(root / relative, pathError);
    if (pathError || !std::filesystem::is_regular_file(resolved, pathError)) {
        [self showStatus:@"That linked Markdown file could not be found."
                    tone:@"warning"];
        return;
    }

    NSString *resolvedPath = [[NSString alloc]
        initWithBytes:resolved.native().data()
               length:resolved.native().size()
             encoding:NSUTF8StringEncoding];
    if (resolvedPath == nil) {
        [self showStatus:@"That local link is not a valid UTF-8 path."
                    tone:@"warning"];
        return;
    }
    NSURL *URL = [NSURL fileURLWithPath:resolvedPath isDirectory:NO];
    [NSDocumentController.sharedDocumentController
        openDocumentWithContentsOfURL:URL
                              display:YES
                    completionHandler:^(NSDocument *document, BOOL wasOpen,
                                        NSError *error) {
      (void)document;
      (void)wasOpen;
      if (error != nil) {
          [self showStatus:error.localizedDescription tone:@"error"];
      }
    }];
}

- (void)focusFind {
    [_webView evaluateJavaScript:
                  @"document.getElementById('findInput')?.focus(); "
                   @"document.getElementById('findInput')?.select();"
                 completionHandler:nil];
}

- (void)findNext:(BOOL)backwards {
    NSString *script = backwards
        ? @"document.querySelector('#findInput')?.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', shiftKey:true, bubbles:true}));"
        : @"document.querySelector('#findInput')?.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));";
    [_webView evaluateJavaScript:script completionHandler:nil];
}

- (void)reloadDocument {
    [self.leanMarkDocument reloadFromDisk];
}

- (void)printDocument {
    NSPrintOperation *operation =
        [_webView printOperationWithPrintInfo:self.leanMarkDocument.printInfo];
    [operation runOperationModalForWindow:self.window
                                 delegate:nil
                           didRunSelector:nullptr
                              contextInfo:nullptr];
}

- (void)applyZoom:(double)zoom {
    const double level = leanmark::core::NormalizeZoom(zoom);
    [NSUserDefaults.standardUserDefaults setDouble:level forKey:LMZoomPreferenceKey];
    [self deliverPayload:@{
        @"type" : @"zoom",
        @"percent" : @(std::lround(level * 100.0)),
    }];
}

- (void)zoomBy:(NSInteger)direction {
    [self applyZoom:leanmark::core::StepZoom(
                        SavedZoom(), direction > 0 ? 1 : -1)];
}

- (void)resetZoom {
    [self applyZoom:leanmark::core::kDefaultZoom];
}

- (void)zoomCommand:(NSString *)action {
    if (!_readerReady) {
        if ([action isEqualToString:@"in"]) {
            [self zoomBy:1];
        } else if ([action isEqualToString:@"out"]) {
            [self zoomBy:-1];
        } else {
            [self resetZoom];
        }
        return;
    }
    // The reader answers with zoom|<action> when no figure is expanded.
    [self deliverPayload:@{ @"type" : @"zoom-command", @"action" : action }];
}

- (void)widthCommand {
    [self deliverPayload:@{ @"type" : @"command", @"name" : @"width" }];
}

- (void)settingsCommand {
    [self deliverPayload:@{ @"type" : @"command", @"name" : @"settings" }];
}

- (void)cycleTheme {
    NSString *next =
        ThemeString(leanmark::core::NextTheme(
            leanmark::core::ParseTheme(ThemeUTF8(CurrentTheme()))));
    [NSUserDefaults.standardUserDefaults setObject:next forKey:LMThemePreferenceKey];
    [self applyWindowTheme:next];
    NSDictionary *payload = @{ @"type" : @"theme", @"value" : next };
    if (_readerReady) {
        [_webView callAsyncJavaScript:@"window.LeanMarkHost.receive(payload)"
                            arguments:@{ @"payload" : payload }
                              inFrame:nil
                       inContentWorld:WKContentWorld.pageWorld
                    completionHandler:nil];
    }
}

- (void)applyWindowTheme:(NSString *)theme {
    const leanmark::core::Theme parsed = leanmark::core::ParseTheme(ThemeUTF8(theme));
    if (parsed == leanmark::core::Theme::System) {
        self.window.appearance = nil;
    } else if (leanmark::core::IsDarkTheme(parsed, false)) {
        self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    } else {
        self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    }
}

- (void)runSmokeCheckWithCompletion:
    (void (^)(BOOL success, NSString *detail))completion {
    NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 15.0;
    [self pollSmokeUntil:deadline completion:completion];
}

- (void)pollSmokeUntil:(NSTimeInterval)deadline
            completion:(void (^)(BOOL success, NSString *detail))completion {
    // Once the page is ready, a document with a figure also has it expanded
    // and closed again: the viewer must fit it and put it back.
    NSString *script =
        @"(function(){var root=document.documentElement;var article=document.getElementById('article');"
         @"var ready=root.dataset.renderState==='ready';var viewer='none';"
         @"if(ready&&document.querySelector('#article .figure-frame[data-expandable]')){"
         @"var opened=window.LeanMarkTest.openViewer(0);var s=window.LeanMarkTest.viewerState();"
         @"var moved=!!document.querySelector('#viewerCanvas > svg, #viewerCanvas > img');"
         @"document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));"
         @"viewer=(opened&&s&&s.mode==='fit'&&s.scale>0&&moved&&document.getElementById('figureViewer').hidden&&"
         @"!document.querySelector('.viewer-placeholder'))?'ok':'failed';}"
         @"return {state:root.dataset.renderState||'', zoom:root.dataset.zoom||'', bridge:!!(window.LeanMarkHost&&window.LeanMarkHost.receive),"
         @"content:!!(article&&article.textContent.trim().length), remote:Array.from(document.images).some(function(i){return /^https?:/i.test(i.src);}),"
         @"viewer:viewer};}())";
    [_webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
      NSDictionary *values = [result isKindOfClass:NSDictionary.class] ? result : nil;
      BOOL ready = [values[@"state"] isEqualToString:@"ready"];
      BOOL bridge = [values[@"bridge"] boolValue];
      BOOL content = [values[@"content"] boolValue];
      BOOL remote = [values[@"remote"] boolValue];
      NSString *viewer = values[@"viewer"];
      // Zoom is the page's job: the web view stays at 100% and the page
      // shows the saved level.
      NSString *expectedZoom =
          [NSString stringWithFormat:@"%ld", std::lround(SavedZoom() * 100.0)];
      if (ready && (self->_webView.pageZoom != 1.0 ||
                    ![values[@"zoom"] isEqual:expectedZoom])) {
          completion(NO, [NSString stringWithFormat:
              @"zoom is not applied by the page (web view %.2f, page %@, saved %@)",
              self->_webView.pageZoom, values[@"zoom"], expectedZoom]);
          return;
      }
      if ([viewer isEqualToString:@"failed"]) {
          completion(NO, @"the figure viewer did not open, fit, and restore a figure");
          return;
      }
      if (error == nil && ready && bridge && content && !remote) {
          completion(YES, [viewer isEqualToString:@"ok"]
              ? @"reader ready, bridge active, content rendered, remote images absent, figure viewer works"
              : @"reader ready, bridge active, content rendered, remote images absent");
          return;
      }
      if (NSProcessInfo.processInfo.systemUptime >= deadline) {
          NSString *detail = error.localizedDescription;
          if (detail == nil) {
              NSString *state = values[@"state"];
              if (state == nil) {
                  state = @"missing";
              }
              detail = [NSString stringWithFormat:
                  @"timed out (state=%@ bridge=%d content=%d remote=%d)",
                  state, bridge, content, remote];
          }
          completion(NO, detail);
          return;
      }
      dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.2 * NSEC_PER_SEC)),
                     dispatch_get_main_queue(), ^{
        [self pollSmokeUntil:deadline completion:completion];
      });
    }];
}

#pragma mark - WKNavigationDelegate

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
                    decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    (void)webView;
    NSURL *URL = navigationAction.request.URL;
    BOOL allow = IsExpectedAppURL(URL) ||
                 [URL.absoluteString isEqualToString:@"about:blank"];
    if (allow && IsExpectedAppURL(URL) &&
        ![URL.path isEqualToString:@"/reader.html"]) {
        allow = NO;
    }
    decisionHandler(allow ? WKNavigationActionPolicyAllow
                          : WKNavigationActionPolicyCancel);
}

- (void)webView:(WKWebView *)webView
    decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse
                    decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    (void)webView;
    BOOL allow = IsExpectedAppURL(navigationResponse.response.URL) &&
                 navigationResponse.canShowMIMEType;
    decisionHandler(allow ? WKNavigationResponsePolicyAllow
                          : WKNavigationResponsePolicyCancel);
}

- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView {
    _readerReady = NO;
    [webView reload];
}

#pragma mark - WKUIDelegate

- (WKWebView *)webView:(WKWebView *)webView
    createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
               forNavigationAction:(WKNavigationAction *)navigationAction
                    windowFeatures:(WKWindowFeatures *)windowFeatures {
    (void)webView;
    (void)configuration;
    (void)navigationAction;
    (void)windowFeatures;
    return nil;
}

- (void)webView:(WKWebView *)webView
    runJavaScriptAlertPanelWithMessage:(NSString *)message
                      initiatedByFrame:(WKFrameInfo *)frame
                     completionHandler:(void (^)(void))completionHandler {
    (void)webView;
    (void)message;
    (void)frame;
    completionHandler();
}

- (void)webView:(WKWebView *)webView
    runJavaScriptConfirmPanelWithMessage:(NSString *)message
                        initiatedByFrame:(WKFrameInfo *)frame
                       completionHandler:(void (^)(BOOL result))completionHandler {
    (void)webView;
    (void)message;
    (void)frame;
    completionHandler(NO);
}

- (void)webView:(WKWebView *)webView
    runJavaScriptTextInputPanelWithPrompt:(NSString *)prompt
                              defaultText:(NSString *)defaultText
                         initiatedByFrame:(WKFrameInfo *)frame
                        completionHandler:(void (^)(NSString *result))completionHandler {
    (void)webView;
    (void)prompt;
    (void)defaultText;
    (void)frame;
    completionHandler(nil);
}

- (void)webView:(WKWebView *)webView
    runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
              initiatedByFrame:(WKFrameInfo *)frame
             completionHandler:(void (^)(NSArray<NSURL *> *URLs))completionHandler {
    (void)webView;
    (void)parameters;
    (void)frame;
    completionHandler(nil);
}

- (void)webView:(WKWebView *)webView
    requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin
                          initiatedByFrame:(WKFrameInfo *)frame
                                      type:(WKMediaCaptureType)type
                           decisionHandler:(void (^)(WKPermissionDecision decision))decisionHandler {
    (void)webView;
    (void)origin;
    (void)frame;
    (void)type;
    decisionHandler(WKPermissionDecisionDeny);
}

@end
