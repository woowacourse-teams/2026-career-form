package com.careerform.notification;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/** 발송기와 같은 fixedDelay 주기(설정값, 기본 60초)로 릴레이를 돈다. 한 주기의 예외는 다음 주기를 막지 않는다. */
public final class PushRelaySchedule {
    private static final Logger log = LoggerFactory.getLogger(PushRelaySchedule.class);
    private final PushRelay relay;

    public PushRelaySchedule(PushRelay relay) { this.relay = relay; }

    @Scheduled(fixedDelayString = "#{@pushSettings.dispatchInterval().toMillis()}", initialDelay = 10000)
    public void relay() {
        try {
            relay.relay();
        } catch (RuntimeException exception) {
            log.warn("PUSH_RELAY_FAILED failure={}", exception.getClass().getSimpleName());
        }
    }
}
