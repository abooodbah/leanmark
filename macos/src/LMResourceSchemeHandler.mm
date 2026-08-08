#import "LMResourceSchemeHandler.h"

#include "core/MarkdownCore.h"

#include <filesystem>

namespace {

constexpr unsigned long long kMaximumImageBytes = 64ULL * 1024ULL * 1024ULL;

NSString *const LMResourceErrorDomain =
    @"io.github.abooodbah.LeanMark.resource";

NSError *ResourceError(NSInteger code, NSString *description) {
    return [NSError errorWithDomain:LMResourceErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey : description}];
}

NSString *MIMETypeForPath(NSString *path) {
    NSDictionary<NSString *, NSString *> *types = @{
        @"css" : @"text/css",
        @"gif" : @"image/gif",
        @"htm" : @"text/html",
        @"html" : @"text/html",
        @"ico" : @"image/x-icon",
        @"jpeg" : @"image/jpeg",
        @"jpg" : @"image/jpeg",
        @"js" : @"text/javascript",
        @"png" : @"image/png",
        @"svg" : @"image/svg+xml",
        @"webp" : @"image/webp",
        @"woff2" : @"font/woff2",
    };
    return types[path.pathExtension.lowercaseString];
}

NSSet<NSString *> *ApplicationResourceAllowlist(void) {
    static NSSet<NSString *> *allowlist;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
      allowlist = [NSSet setWithArray:@[
          @"reader.html",
          @"reader.css",
          @"reader.js",
          @"vendor/mermaid.min.js",
          @"fonts/ibm-plex-sans-latin-400-normal.woff2",
          @"fonts/ibm-plex-sans-latin-500-normal.woff2",
          @"fonts/ibm-plex-sans-latin-600-normal.woff2",
          @"fonts/ibm-plex-serif-latin-600-normal.woff2",
          @"fonts/ibm-plex-mono-latin-400-normal.woff2",
      ]];
    });
    return allowlist;
}

NSSet<NSString *> *DocumentImageExtensions(void) {
    static NSSet<NSString *> *extensions;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
      extensions = [NSSet setWithArray:@[
          @"gif", @"ico", @"jpeg", @"jpg", @"png", @"svg", @"webp"
      ]];
    });
    return extensions;
}

NSString *DecodedRelativePath(NSURL *URL, NSError **error) {
    NSURLComponents *components =
        [NSURLComponents componentsWithURL:URL resolvingAgainstBaseURL:NO];
    NSString *encoded = components.percentEncodedPath ?: @"";
    NSString *decoded = encoded.stringByRemovingPercentEncoding;
    const unichar nul = 0;
    NSString *nulString = [NSString stringWithCharacters:&nul length:1];
    if (decoded == nil ||
        [decoded rangeOfString:nulString].location != NSNotFound) {
        if (error != nullptr) {
            *error = ResourceError(10, @"The resource path is not valid UTF-8.");
        }
        return nil;
    }

    if ([decoded hasPrefix:@"/"]) {
        decoded = [decoded substringFromIndex:1];
    }
    if (decoded.length == 0 || [decoded hasPrefix:@"/"] ||
        [decoded rangeOfString:@"\\"].location != NSNotFound) {
        if (error != nullptr) {
            *error = ResourceError(11, @"The resource path is not relative.");
        }
        return nil;
    }

    for (NSString *component in decoded.pathComponents) {
        if (component.length == 0 || [component isEqualToString:@"."] ||
            [component isEqualToString:@".."]) {
            if (error != nullptr) {
                *error = ResourceError(12, @"Path traversal is not allowed.");
            }
            return nil;
        }
    }
    return decoded;
}

}  // namespace

@interface LMResourceSchemeHandler () {
    LMResourceSchemeMode _mode;
    dispatch_queue_t _readQueue;
    NSMutableDictionary<NSValue *, NSUUID *> *_activeTasks;
}
@end

@implementation LMResourceSchemeHandler

- (instancetype)initWithMode:(LMResourceSchemeMode)mode rootURL:(NSURL *)rootURL {
    self = [super init];
    if (self != nil) {
        _mode = mode;
        _rootURL = [rootURL URLByResolvingSymlinksInPath];
        _readQueue = dispatch_queue_create(
            "io.github.abooodbah.LeanMark.resource-reader",
            DISPATCH_QUEUE_SERIAL);
        _activeTasks = [NSMutableDictionary dictionary];
    }
    return self;
}

- (NSValue *)keyForTask:(id<WKURLSchemeTask>)task {
    return [NSValue valueWithNonretainedObject:task];
}

- (BOOL)consumeTask:(id<WKURLSchemeTask>)task token:(NSUUID *)token {
    @synchronized(self) {
        NSValue *key = [self keyForTask:task];
        NSUUID *current = _activeTasks[key];
        if (current == nil || ![current isEqual:token]) {
            return NO;
        }
        [_activeTasks removeObjectForKey:key];
        return YES;
    }
}

- (void)webView:(WKWebView *)webView
    startURLSchemeTask:(id<WKURLSchemeTask>)schemeTask {
    (void)webView;
    NSURL *requestURL = schemeTask.request.URL;
    NSUUID *token = [NSUUID UUID];
    @synchronized(self) {
        _activeTasks[[self keyForTask:schemeTask]] = token;
    }

    LMResourceSchemeMode mode = _mode;
    NSURL *rootURL = self.rootURL;
    dispatch_async(_readQueue, ^{
      NSError *error = nil;
      NSString *expectedScheme =
          mode == LMResourceSchemeModeApplication ? @"leanmark-app" : @"leanmark-doc";
      NSString *expectedHost =
          mode == LMResourceSchemeModeApplication ? @"app" : @"document";
      if (requestURL == nil ||
          ![requestURL.scheme.lowercaseString isEqualToString:expectedScheme] ||
          ![requestURL.host.lowercaseString isEqualToString:expectedHost]) {
          error = ResourceError(20, @"The resource origin is not allowed.");
      }

      NSString *relativePath = error == nil
          ? DecodedRelativePath(requestURL, &error)
          : nil;
      if (error == nil && mode == LMResourceSchemeModeApplication &&
          ![ApplicationResourceAllowlist() containsObject:relativePath]) {
          error = ResourceError(21, @"The application resource is not allowlisted.");
      }

      if (error == nil && mode == LMResourceSchemeModeDocument &&
          ![DocumentImageExtensions()
              containsObject:relativePath.pathExtension.lowercaseString]) {
          error = ResourceError(22, @"Only supported local images may be loaded.");
      }

      NSURL *candidateURL = nil;
      if (error == nil) {
          candidateURL = [[rootURL URLByAppendingPathComponent:relativePath]
              URLByStandardizingPath];
          candidateURL = candidateURL.URLByResolvingSymlinksInPath;

          const std::filesystem::path rootPath(rootURL.fileSystemRepresentation);
          const std::filesystem::path candidatePath(
              candidateURL.fileSystemRepresentation);
          if (!leanmark::core::IsPathWithin(rootPath, candidatePath)) {
              error = ResourceError(23, @"The resource escapes its allowed directory.");
          }
      }

      NSNumber *isRegularFile = nil;
      NSNumber *fileSize = nil;
      if (error == nil &&
          (![candidateURL getResourceValue:&isRegularFile
                                     forKey:NSURLIsRegularFileKey
                                      error:&error] ||
           !isRegularFile.boolValue)) {
          if (error == nil) {
              error = ResourceError(24, @"The resource is not a regular file.");
          }
      }
      if (error == nil &&
          ![candidateURL getResourceValue:&fileSize
                                   forKey:NSURLFileSizeKey
                                    error:&error]) {
          fileSize = nil;
      }
      if (error == nil && mode == LMResourceSchemeModeDocument &&
          fileSize.unsignedLongLongValue > kMaximumImageBytes) {
          error = ResourceError(25, @"The local image exceeds the 64 MiB safety limit.");
      }

      NSString *MIMEType = error == nil ? MIMETypeForPath(relativePath) : nil;
      if (error == nil && MIMEType == nil) {
          error = ResourceError(26, @"The resource type is not supported.");
      }

      NSData *data = nil;
      if (error == nil) {
          data = [NSData dataWithContentsOfURL:candidateURL
                                      options:NSDataReadingMappedIfSafe
                                        error:&error];
      }

      NSURLResponse *response = nil;
      if (error == nil) {
          NSString *encoding =
              ([MIMEType hasPrefix:@"text/"] || [MIMEType isEqualToString:@"text/javascript"])
                  ? @"utf-8"
                  : nil;
          response = [[NSURLResponse alloc] initWithURL:requestURL
                                               MIMEType:MIMEType
                                  expectedContentLength:(NSInteger)data.length
                                       textEncodingName:encoding];
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        if (![self consumeTask:schemeTask token:token]) {
            return;
        }
        if (error != nil) {
            [schemeTask didFailWithError:error];
            return;
        }
        [schemeTask didReceiveResponse:response];
        [schemeTask didReceiveData:data];
        [schemeTask didFinish];
      });
    });
}

- (void)webView:(WKWebView *)webView
    stopURLSchemeTask:(id<WKURLSchemeTask>)schemeTask {
    (void)webView;
    @synchronized(self) {
        [_activeTasks removeObjectForKey:[self keyForTask:schemeTask]];
    }
}

@end
