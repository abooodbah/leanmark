#import "LMDocumentWindowController.h"

#import "LMDocument.h"
#import "LMResourceSchemeHandler.h"

#import <WebKit/WebKit.h>

#include "core/MarkdownCore.h"

#include <algorithm>
#include <charconv>
#include <filesystem>
#include <string>
#include <string_view>
#include <system_error>

namespace {

NSString *const LMThemePreferenceKey = @"LeanMarkTheme";

BOOL StringContainsNUL(NSString *value) {
    const unichar nul = 0;
    NSString *needle = [NSString stringWithCharacters:&nul length:1];
    return [value rangeOfString:needle].location != NSNotFound;
}

NSString *CurrentTheme(void) {
    NSString *theme = [NSUserDefaults.standardUserDefaults
        stringForKey:LMThemePreferenceKey];
    if ([theme isEqualToString:@"light"] || [theme isEqualToString:@"dark"]) {
        return theme;
    }
    return @"system";
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
        [self deliverPayload:@{
            @"type" : @"host",
            @"copySource" : @YES,
            @"tabs" : @NO,
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
    if ([command hasPrefix:@"theme|"]) {
        NSString *theme = [command substringFromIndex:@"theme|".length];
        if (![theme isEqualToString:@"light"] &&
            ![theme isEqualToString:@"dark"] &&
            ![theme isEqualToString:@"system"]) {
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

- (void)zoomBy:(NSInteger)direction {
    _webView.pageZoom = std::clamp(
        _webView.pageZoom + (direction > 0 ? 0.1 : -0.1), 0.5, 3.0);
}

- (void)resetZoom {
    _webView.pageZoom = 1.0;
}

- (void)cycleTheme {
    NSString *theme = CurrentTheme();
    NSString *next = [theme isEqualToString:@"system"]
        ? @"light"
        : ([theme isEqualToString:@"light"] ? @"dark" : @"system");
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
    if ([theme isEqualToString:@"dark"]) {
        self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    } else if ([theme isEqualToString:@"light"]) {
        self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    } else {
        self.window.appearance = nil;
    }
}

- (void)runSmokeCheckWithCompletion:
    (void (^)(BOOL success, NSString *detail))completion {
    NSTimeInterval deadline = NSProcessInfo.processInfo.systemUptime + 15.0;
    [self pollSmokeUntil:deadline completion:completion];
}

- (void)pollSmokeUntil:(NSTimeInterval)deadline
            completion:(void (^)(BOOL success, NSString *detail))completion {
    NSString *script =
        @"(function(){var root=document.documentElement;var article=document.getElementById('article');"
         @"return {state:root.dataset.renderState||'', bridge:!!(window.LeanMarkHost&&window.LeanMarkHost.receive),"
         @"content:!!(article&&article.textContent.trim().length), remote:Array.from(document.images).some(function(i){return /^https?:/i.test(i.src);})};}())";
    [_webView evaluateJavaScript:script completionHandler:^(id result, NSError *error) {
      NSDictionary *values = [result isKindOfClass:NSDictionary.class] ? result : nil;
      BOOL ready = [values[@"state"] isEqualToString:@"ready"];
      BOOL bridge = [values[@"bridge"] boolValue];
      BOOL content = [values[@"content"] boolValue];
      BOOL remote = [values[@"remote"] boolValue];
      if (error == nil && ready && bridge && content && !remote) {
          completion(YES, @"reader ready, bridge active, content rendered, remote images absent");
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
