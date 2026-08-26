package com.careerform.formanalysis.application;

public final class ResolverUnavailableException extends RuntimeException {

    public ResolverUnavailableException(String message) {
        super(message);
    }

    public ResolverUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
