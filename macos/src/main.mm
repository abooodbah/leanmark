#import "LMAppDelegate.h"

#import <AppKit/AppKit.h>

int main(int argc, const char *argv[]) {
    (void)argc;
    (void)argv;
    @autoreleasepool {
        NSApplication *application = NSApplication.sharedApplication;
        LMAppDelegate *delegate = [[LMAppDelegate alloc] init];
        application.delegate = delegate;
        [delegate installMainMenu];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    return 0;
}
