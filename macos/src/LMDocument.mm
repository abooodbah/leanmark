#import "LMDocument.h"

#import "LMDocumentWindowController.h"

#include "core/MarkdownCore.h"

#include <filesystem>
#include <string>
#include <utility>

namespace {

NSString *const LMDocumentErrorDomain =
    @"io.github.abooodbah.LeanMark.document";

NSString *NSStringFromUTF8(const std::string& value) {
    NSString *result = [[NSString alloc] initWithBytes:value.data()
                                               length:value.size()
                                             encoding:NSUTF8StringEncoding];
    return result ?: @"";
}

NSError *DocumentError(NSInteger code, NSString *description) {
    return [NSError errorWithDomain:LMDocumentErrorDomain
                               code:code
                           userInfo:@{NSLocalizedDescriptionKey : description}];
}

}  // namespace

@interface LMDocument () {
    leanmark::core::FileRenderResult _rendered;
    NSURL *_sourceURL;
    NSTimer *_pollTimer;
    NSDate *_loadedModificationDate;
    NSNumber *_loadedFileSize;
    NSDate *_pendingModificationDate;
    NSNumber *_pendingFileSize;
    NSTimeInterval _pendingSince;
    BOOL _missingFileReported;
}
@end

@implementation LMDocument

+ (BOOL)autosavesInPlace {
    return NO;
}

+ (BOOL)canConcurrentlyReadDocumentsOfType:(NSString *)typeName {
    (void)typeName;
    return YES;
}

- (BOOL)hasSourceFile {
    return _sourceURL != nil;
}

- (NSURL *)documentDirectoryURL {
    return _sourceURL.URLByDeletingLastPathComponent;
}

- (void)makeWindowControllers {
    LMDocumentWindowController *controller =
        [[LMDocumentWindowController alloc] initWithDocument:self];
    [self addWindowController:controller];
    [self startWatchingSource];
}

- (BOOL)readFromURL:(NSURL *)URL
             ofType:(NSString *)typeName
              error:(NSError **)outError {
    (void)typeName;
    if (!URL.isFileURL) {
        if (outError != nullptr) {
            *outError = DocumentError(
                NSFileReadUnsupportedSchemeError,
                @"LeanMark opens local Markdown files only.");
        }
        return NO;
    }

    const std::filesystem::path requestedPath(URL.fileSystemRepresentation);
    if (!leanmark::core::IsSupportedMarkdownPath(requestedPath)) {
        if (outError != nullptr) {
            *outError = DocumentError(
                NSFileReadUnsupportedSchemeError,
                @"LeanMark supports .md, .markdown, .mdown, and .mkd files.");
        }
        return NO;
    }

    _sourceURL = [URL URLByStandardizingPath].URLByResolvingSymlinksInPath;
    _rendered = leanmark::core::RenderMarkdownFile(
        std::filesystem::path(_sourceURL.fileSystemRepresentation));
    [self captureCurrentFileStamp];
    _missingFileReported = NO;
    return YES;
}

- (NSData *)dataOfType:(NSString *)typeName error:(NSError **)outError {
    (void)typeName;
    if (outError != nullptr) {
        *outError = DocumentError(
            NSFeatureUnsupportedError,
            @"LeanMark is a read-only viewer and does not save documents.");
    }
    return nil;
}

- (BOOL)isDocumentEdited {
    return NO;
}

- (NSDictionary<NSString *, id> *)readerPayloadForTheme:(NSString *)theme {
    if (_sourceURL == nil) {
        return @{ @"type" : @"empty", @"theme" : theme };
    }

    NSString *fileName = _sourceURL.lastPathComponent ?: @"";
    NSString *path = _sourceURL.path ?: @"";
    if (!_rendered.ok) {
        NSString *message = NSStringFromUTF8(_rendered.error);
        if (message.length == 0) {
            message = @"This document could not be opened.";
        }
        return @{
            @"type" : @"error",
            @"theme" : theme,
            @"fileName" : fileName,
            @"path" : path,
            @"message" : message,
        };
    }

    return @{
        @"type" : @"document",
        @"theme" : theme,
        @"fileName" : fileName,
        @"path" : path,
        @"html" : NSStringFromUTF8(_rendered.html),
        @"sourceBytes" : @(_rendered.sourceBytes),
        @"hasMermaid" : @(_rendered.hasMermaid),
        @"documentBaseUrl" : @"leanmark-doc://document/",
    };
}

- (void)reloadFromDisk {
    if (_sourceURL == nil) {
        return;
    }

    leanmark::core::FileRenderResult candidate =
        leanmark::core::RenderMarkdownFile(
            std::filesystem::path(_sourceURL.fileSystemRepresentation));
    [self captureCurrentFileStamp];
    _pendingModificationDate = nil;
    _pendingFileSize = nil;
    if (!candidate.ok) {
        NSString *detail = NSStringFromUTF8(candidate.error);
        NSString *message = detail.length == 0
            ? @"The file could not be reloaded. The last complete view is still shown."
            : [NSString stringWithFormat:
                  @"The file could not be reloaded. The last complete view is still shown. %@",
                  detail];
        [self broadcastStatus:message tone:@"warning"];
        return;
    }

    _rendered = std::move(candidate);
    for (NSWindowController *controller in self.windowControllers) {
        if ([controller isKindOfClass:LMDocumentWindowController.class]) {
            [(LMDocumentWindowController *)controller documentContentDidChange];
        }
    }
}

- (void)startWatchingSource {
    if (_sourceURL == nil || _pollTimer != nil) {
        return;
    }
    __weak LMDocument *weakSelf = self;
    _pollTimer = [NSTimer timerWithTimeInterval:0.5
                                       repeats:YES
                                         block:^(NSTimer *timer) {
      (void)timer;
      [weakSelf pollSourceFile];
    }];
    [NSRunLoop.mainRunLoop addTimer:_pollTimer forMode:NSRunLoopCommonModes];
}

- (void)stopWatchingSource {
    [_pollTimer invalidate];
    _pollTimer = nil;
}

- (void)close {
    [self stopWatchingSource];
    [super close];
}

- (BOOL)readCurrentFileStampDate:(NSDate **)date size:(NSNumber **)size {
    if (_sourceURL == nil) {
        return NO;
    }
    NSError *error = nil;
    NSDictionary<NSURLResourceKey, id> *values =
        [_sourceURL resourceValuesForKeys:@[
            NSURLContentModificationDateKey,
            NSURLFileSizeKey,
            NSURLIsRegularFileKey,
        ]
                                error:&error];
    if (error != nil || ![values[NSURLIsRegularFileKey] boolValue]) {
        return NO;
    }
    NSDate *modificationDate = values[NSURLContentModificationDateKey];
    NSNumber *fileSize = values[NSURLFileSizeKey];
    if (modificationDate == nil || fileSize == nil) {
        return NO;
    }
    if (date != nullptr) {
        *date = modificationDate;
    }
    if (size != nullptr) {
        *size = fileSize;
    }
    return YES;
}

- (void)captureCurrentFileStamp {
    NSDate *date = nil;
    NSNumber *size = nil;
    if ([self readCurrentFileStampDate:&date size:&size]) {
        _loadedModificationDate = date;
        _loadedFileSize = size;
    }
}

- (void)pollSourceFile {
    NSDate *date = nil;
    NSNumber *size = nil;
    if (![self readCurrentFileStampDate:&date size:&size]) {
        if (!_missingFileReported) {
            [self broadcastStatus:
                      @"The file was moved or deleted. The last complete view is still shown."
                             tone:@"warning"];
            _missingFileReported = YES;
        }
        return;
    }
    _missingFileReported = NO;

    BOOL matchesLoaded =
        [_loadedModificationDate isEqualToDate:date] && [_loadedFileSize isEqual:size];
    if (matchesLoaded) {
        _pendingModificationDate = nil;
        _pendingFileSize = nil;
        return;
    }

    BOOL matchesPending =
        [_pendingModificationDate isEqualToDate:date] && [_pendingFileSize isEqual:size];
    if (!matchesPending) {
        _pendingModificationDate = date;
        _pendingFileSize = size;
        _pendingSince = NSProcessInfo.processInfo.systemUptime;
        return;
    }

    if (NSProcessInfo.processInfo.systemUptime - _pendingSince >= 0.35) {
        [self reloadFromDisk];
    }
}

- (void)broadcastStatus:(NSString *)message tone:(NSString *)tone {
    for (NSWindowController *controller in self.windowControllers) {
        if ([controller isKindOfClass:LMDocumentWindowController.class]) {
            [(LMDocumentWindowController *)controller showStatus:message tone:tone];
        }
    }
}

@end
