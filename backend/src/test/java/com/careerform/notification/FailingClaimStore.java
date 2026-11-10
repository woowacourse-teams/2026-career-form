package com.careerform.notification;

import java.lang.reflect.Proxy;

/** 워커 선점만 예외로 끝나는 저장소. 나머지는 원래 저장소에 넘긴다. */
final class FailingClaimStore {
    private FailingClaimStore() { }

    static NotificationStore of(NotificationStore delegate) {
        return (NotificationStore) Proxy.newProxyInstance(NotificationStore.class.getClassLoader(), new Class<?>[] {NotificationStore.class},
            (proxy, method, arguments) -> {
                if (method.getName().equals("claimQueuedDelivery")) { throw new IllegalStateException("synthetic store failure"); }
                try { return method.invoke(delegate, arguments); }
                catch (java.lang.reflect.InvocationTargetException exception) { throw exception.getCause(); }
            });
    }
}
