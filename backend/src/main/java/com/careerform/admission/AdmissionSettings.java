package com.careerform.admission;

import java.time.Duration;

public record AdmissionSettings(int userHourly, int installMinute, int globalHourly, int concurrency, int waiting,
                                int installActive, Duration queueWait, Duration requestTimeout, Duration reservationTimeout) {
    public AdmissionSettings {
        if (userHourly < 1 || userHourly > 10000 || installMinute < 1 || installMinute > 10000
            || globalHourly < 1 || globalHourly > 10000 || concurrency < 1 || waiting < 0 || installActive < 1
            || queueWait.isNegative() || queueWait.isZero() || requestTimeout.isNegative() || requestTimeout.isZero()
            || reservationTimeout.compareTo(requestTimeout) <= 0) throw new IllegalArgumentException("Invalid admission limits");
    }

    public static AdmissionSettings defaults() {
        return new AdmissionSettings(100, 60, 10000, 20, 100, 10, Duration.ofSeconds(5), Duration.ofSeconds(55), Duration.ofSeconds(120));
    }
}
