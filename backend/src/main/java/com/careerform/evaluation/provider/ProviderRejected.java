package com.careerform.evaluation.provider;

/** 평가 공급자 등록을 받지 않은 이유. 메시지에 키나 주소 원문을 싣지 않는다. */
public final class ProviderRejected extends RuntimeException {

    public enum Code {
        INVALID,
        RESERVED_NAME,
        UNKNOWN_PROVIDER,
        UNKNOWN_KEY,
        INVALID_URL,
        INSECURE_URL,
        HOST_NOT_ALLOWED_FOR_KEY,
        UNRESOLVABLE_HOST,
        INTERNAL_ADDRESS
    }

    private final Code code;

    public ProviderRejected(Code code) {
        super(code.name());
        this.code = code;
    }

    public Code code() {
        return code;
    }
}
