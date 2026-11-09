package com.careerform.admission;

import java.time.Instant;

public final class AdmissionFailure extends RuntimeException {
    private final String code;
    private final int status;
    private final Instant retryAt;

    public AdmissionFailure(String code, int status, Instant retryAt) {
        super(code);
        this.code = code;
        this.status = status;
        this.retryAt = retryAt;
    }

    public String code() { return code; }
    public int status() { return status; }
    public Instant retryAt() { return retryAt; }
    public static AdmissionFailure unavailable() { return new AdmissionFailure("ADMISSION_UNAVAILABLE", 503, null); }
}
