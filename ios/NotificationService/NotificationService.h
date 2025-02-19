#import <CTNotificationService/CTNotificationService.h>
#import <CleverTap.h>

@interface NotificationService : CTNotificationServiceExtension

@property (nonatomic, strong) void (^contentHandler)(UNNotificationContent *contentToDeliver);
@property (nonatomic, strong) UNMutableNotificationContent *bestAttemptContent;

@end
