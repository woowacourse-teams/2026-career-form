package com.careerform.quality;

public final class QualityAdmissionException extends RuntimeException {
    private final int status;

    public QualityAdmissionException(int status) {
        super("Quality admission unavailable");
        this.status = status;
    }

    public int status() { return status; }
}
