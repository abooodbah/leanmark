#pragma once

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LMDocument : NSDocument

@property(nonatomic, readonly, nullable) NSURL *documentDirectoryURL;
@property(nonatomic, readonly) BOOL hasSourceFile;

- (NSDictionary<NSString *, id> *)readerPayloadForTheme:(NSString *)theme;
- (void)reloadFromDisk;
- (void)startWatchingSource;
- (void)stopWatchingSource;

@end

NS_ASSUME_NONNULL_END
