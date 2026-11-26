package com.careerform.notification;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.util.List;
import java.util.function.BiConsumer;

/** 알림 저장소 호출 사이에 장애를 주입하는 테스트 프록시. 등록이 중간에 끊기는 지점을 재현한다. */
final class StoreFaults {
    private StoreFaults() { }

    static final class InjectedFailure extends RuntimeException {
        InjectedFailure(String method) { super("Injected failure: " + method); }
    }

    /** 모든 호출에서 before를 먼저 실행하고 실제 저장소에 넘긴다. */
    static NotificationStore intercepting(NotificationStore target, BiConsumer<String, Object[]> before) {
        return (NotificationStore) Proxy.newProxyInstance(NotificationStore.class.getClassLoader(), new Class<?>[] {NotificationStore.class},
            (proxy, method, arguments) -> {
                before.accept(method.getName(), arguments);
                try { return method.invoke(target, arguments); }
                catch (InvocationTargetException exception) { throw exception.getCause(); }
            });
    }

    /** 지정한 메서드가 불리면 실제 저장소에 넘기지 않고 실패한다. */
    static NotificationStore failing(NotificationStore target, String methodName) {
        return intercepting(target, (method, arguments) -> {
            if (method.equals(methodName)) { throw new InjectedFailure(method); }
        });
    }

    /** 발송 문서 묶음 가운데 앞의 saved건만 저장한 뒤 실패한다. */
    @SuppressWarnings("unchecked")
    static NotificationStore partialDeliveries(NotificationStore target, int saved) {
        return intercepting(target, (method, arguments) -> {
            if (!method.equals("insertDeliveries")) { return; }
            List<PushDelivery> deliveries = (List<PushDelivery>) arguments[0];
            target.insertDeliveries(deliveries.subList(0, Math.min(saved, deliveries.size())));
            throw new InjectedFailure(method);
        });
    }
}
