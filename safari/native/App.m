#import <Cocoa/Cocoa.h>
#import <SafariServices/SafariServices.h>

@interface MarginAppDelegate : NSObject <NSApplicationDelegate>
@property(strong) NSWindow *window;
@property(strong) NSTextField *status;
@end

@implementation MarginAppDelegate
- (NSString *)extensionID {
    return [NSBundle.mainBundle.bundleIdentifier stringByAppendingString:@".Extension"];
}
- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    NSMenu *menu = [NSMenu new];
    NSMenuItem *appItem = [NSMenuItem new];
    [menu addItem:appItem];
    NSMenu *appMenu = [NSMenu new];
    [appMenu addItemWithTitle:@"退出映间" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;
    NSApp.mainMenu = menu;
    self.window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 640, 440)
        styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
        backing:NSBackingStoreBuffered defer:NO];
    self.window.title = @"映间 MARGIN · Safari";
    self.window.releasedWhenClosed = NO;
    [self.window center];
    NSView *view = self.window.contentView;
    NSTextField *title = [NSTextField labelWithString:@"映间 MARGIN"];
    title.font = [NSFont systemFontOfSize:32 weight:NSFontWeightSemibold];
    title.frame = NSMakeRect(40, 348, 560, 48);
    [view addSubview:title];
    NSTextField *subtitle = [NSTextField wrappingLabelWithString:@"给 B 站换一个更清晰的界面。\nSafari 移植版 · 基于 jiuyang5354/bilibili-margin"];
    subtitle.font = [NSFont systemFontOfSize:15];
    subtitle.textColor = NSColor.secondaryLabelColor;
    subtitle.frame = NSMakeRect(40, 280, 560, 54);
    [view addSubview:subtitle];
    NSTextField *instructions = [NSTextField wrappingLabelWithString:@"1. 将本应用保留在固定位置，再启用扩展。\n2. 在 Safari「设置 → 扩展」中勾选映间 MARGIN。\n3. 允许访问 bilibili.com 相关网站，然后刷新 B 站。\n\n本地未签名构建还需在 Safari「设置 → 开发者」允许未签名扩展；退出 Safari 后可能需要重新允许。"];
    instructions.font = [NSFont systemFontOfSize:14];
    instructions.frame = NSMakeRect(40, 122, 560, 150);
    [view addSubview:instructions];
    NSButton *settings = [NSButton buttonWithTitle:@"打开 Safari 扩展设置" target:self action:@selector(openSettings:)];
    settings.bezelStyle = NSBezelStyleRounded;
    settings.frame = NSMakeRect(36, 65, 220, 36);
    [view addSubview:settings];
    NSButton *bili = [NSButton buttonWithTitle:@"打开 B 站" target:self action:@selector(openBilibili:)];
    bili.bezelStyle = NSBezelStyleRounded;
    bili.frame = NSMakeRect(272, 65, 132, 36);
    [view addSubview:bili];
    self.status = [NSTextField wrappingLabelWithString:@"正在检查扩展状态……"];
    self.status.textColor = NSColor.secondaryLabelColor;
    self.status.frame = NSMakeRect(40, 16, 560, 36);
    [view addSubview:self.status];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self refreshStatus];
}
- (void)applicationDidBecomeActive:(NSNotification *)notification { if (self.status) [self refreshStatus]; }
- (void)refreshStatus {
    [SFSafariExtensionManager getStateOfSafariExtensionWithIdentifier:self.extensionID completionHandler:^(SFSafariExtensionState *state, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            self.status.stringValue = error ? @"尚未启用；请打开 Safari 扩展设置完成安装。" : state.enabled ? @"扩展已启用。允许网站访问后，刷新 B 站即可使用。" : @"扩展已安装，等待在 Safari 中启用。";
        });
    }];
}
- (void)openSettings:(id)sender {
    [SFSafariApplication showPreferencesForExtensionWithIdentifier:self.extensionID completionHandler:^(NSError *error) {
        if (error) dispatch_async(dispatch_get_main_queue(), ^{ self.status.stringValue = @"请手动打开 Safari → 设置 → 扩展；本地构建需允许未签名扩展。"; });
    }];
}
- (void)openBilibili:(id)sender {
    [[NSWorkspace sharedWorkspace] openURLs:@[[NSURL URLWithString:@"https://www.bilibili.com/"]]
        withApplicationAtURL:[NSURL fileURLWithPath:@"/Applications/Safari.app"]
        configuration:[NSWorkspaceOpenConfiguration configuration] completionHandler:nil];
}
- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender { return YES; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        NSApplication *app = NSApplication.sharedApplication;
        MarginAppDelegate *delegate = [MarginAppDelegate new];
        app.delegate = delegate;
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
