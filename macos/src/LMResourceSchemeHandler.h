#pragma once

#import <Foundation/Foundation.h>
#import <WebKit/WebKit.h>

NS_ASSUME_NONNULL_BEGIN

typedef NS_ENUM(NSUInteger, LMResourceSchemeMode) {
    LMResourceSchemeModeApplication,
    LMResourceSchemeModeDocument,
};

@interface LMResourceSchemeHandler : NSObject <WKURLSchemeHandler>

- (instancetype)initWithMode:(LMResourceSchemeMode)mode
                      rootURL:(NSURL *)rootURL NS_DESIGNATED_INITIALIZER;

- (instancetype)init NS_UNAVAILABLE;

@property(nonatomic, copy) NSURL *rootURL;

@end

NS_ASSUME_NONNULL_END
