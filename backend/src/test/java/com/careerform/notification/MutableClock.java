package com.careerform.notification;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** 테스트에서 시각을 직접 옮기는 가짜 시계. */
final class MutableClock extends Clock {
    private volatile Instant current;

    MutableClock(Instant start) { this.current = start; }

    void set(Instant next) { current = next; }

    void advance(java.time.Duration amount) { current = current.plus(amount); }

    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return current; }
}
