#pragma once

#import <AppKit/AppKit.h>

@class LMDocument;

NS_ASSUME_NONNULL_BEGIN

@interface LMDocumentWindowController : NSWindowController

- (instancetype)initWithDocument:(LMDocument *)document NS_DESIGNATED_INITIALIZER;
- (instancetype)initWithWindow:(nullable NSWindow *)window NS_UNAVAILABLE;
- (instancetype)initWithCoder:(NSCoder *)coder NS_UNAVAILABLE;

- (void)documentContentDidChange;
- (void)showStatus:(NSString *)message tone:(NSString *)tone;

- (void)focusFind;
- (void)findNext:(BOOL)backwards;
- (void)reloadDocument;
- (void)printDocument;
- (void)zoomBy:(NSInteger)direction;
- (void)resetZoom;
- (void)cycleTheme;

- (void)runSmokeCheckWithCompletion:
    (void (^)(BOOL success, NSString *detail))completion;

@end

NS_ASSUME_NONNULL_END
