#import <Foundation/Foundation.h>

// All extension features run in WebExtensions JavaScript. No native messaging,
// filesystem bridge or account data is exposed by the containing application.
@interface MarginWebExtensionHandler : NSObject <NSExtensionRequestHandling>
@end
@implementation MarginWebExtensionHandler
- (void)beginRequestWithExtensionContext:(NSExtensionContext *)context {
    [context completeRequestReturningItems:@[] completionHandler:nil];
}
@end
