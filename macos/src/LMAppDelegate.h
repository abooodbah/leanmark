#pragma once

#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LMAppDelegate : NSObject <NSApplicationDelegate, NSMenuItemValidation>

@property(nonatomic, readonly) BOOL smokeTesting;

- (void)installMainMenu;

@end

NS_ASSUME_NONNULL_END
