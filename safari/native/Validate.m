#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        [NSApplication sharedApplication];
        if (argc != 2) return 2;
        __block BOOL done = NO;
        __block int status = 1;
        __block WKWebExtensionController *controller;
        __block WKWebExtensionContext *context;
        [WKWebExtension extensionWithAppExtensionBundle:[NSBundle bundleWithPath:[NSString stringWithUTF8String:argv[1]]] completionHandler:^(WKWebExtension *extension, NSError *error) {
            NSLog(@"Extension: %@, version: %@, error: %@, manifest errors: %@", extension.displayName, extension.version, error, extension.errors);
            status = (!error && extension && extension.errors.count == 0) ? 0 : 1;
            if (status) { done = YES; return; }
            controller = [[WKWebExtensionController alloc] initWithConfiguration:WKWebExtensionControllerConfiguration.nonPersistentConfiguration];
            context = [WKWebExtensionContext contextForExtension:extension];
            for (WKWebExtensionPermission permission in extension.requestedPermissions) [context setPermissionStatus:WKWebExtensionContextPermissionStatusGrantedExplicitly forPermission:permission];
            NSError *loadError;
            if (![controller loadExtensionContext:context error:&loadError]) { NSLog(@"Load error: %@", loadError); status = 1; done = YES; return; }
            [context loadBackgroundContentWithCompletionHandler:^(NSError *backgroundError) {
                NSLog(@"Background load: %@; context errors: %@", backgroundError, context.errors);
                status = backgroundError || context.errors.count ? 1 : 0;
                done = YES;
            }];
        }];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:20];
        while (!done && deadline.timeIntervalSinceNow > 0) [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        if (!done) NSLog(@"Timed out while loading extension background content");
        return done ? status : 1;
    }
}
