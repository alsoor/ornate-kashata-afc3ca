#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// يسجّل الإضافة في كابستور باسم StooornaNearby (نفس الاسم المستخدم في nearbyPatch.tsx)
CAP_PLUGIN(StooornaNearbyPlugin, "StooornaNearby",
    CAP_PLUGIN_METHOD(start, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(send, CAPPluginReturnPromise);
)
