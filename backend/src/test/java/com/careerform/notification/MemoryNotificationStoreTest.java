package com.careerform.notification;

import org.junit.jupiter.api.DisplayName;

@DisplayName("메모리 알림 저장소의 저장 계약")
class MemoryNotificationStoreTest extends NotificationStoreContract {
    @Override protected NotificationStore store() { return new MemoryNotificationStore(); }
}
