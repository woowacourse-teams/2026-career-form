package com.careerform.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/** fixedDelay 주기(설정값, 기본 60초)로 발송기를 돈다. 한 주기의 예외는 다음 주기를 막지 않는다. */
public final class PushDispatchSchedule {
    private static final Logger log = LoggerFactory.getLogger(PushDispatchSchedule.class);
    private final PushDispatcher dispatcher;

    public PushDispatchSchedule(PushDispatcher dispatcher) { this.dispatcher = dispatcher; }

    @Scheduled(fixedDelayString = "#{@pushSettings.dispatchInterval().toMillis()}", initialDelay = 10000)
    public void dispatch() {
        try {
            dispatcher.dispatch();
        } catch (RuntimeException exception) {
            log.warn("PUSH_DISPATCH_FAILED failure={}", exception.getClass().getSimpleName());
        }
    }
}
