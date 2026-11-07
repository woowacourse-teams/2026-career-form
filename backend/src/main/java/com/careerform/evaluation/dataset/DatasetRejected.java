package com.careerform.evaluation.dataset;

/** 등록 검사를 통과하지 못한 데이터셋. 메시지에는 파일 경로나 항목 이름만 담고 내용은 담지 않는다. */
public final class DatasetRejected extends RuntimeException {

    public enum Code {
        NOT_FOUND,
        DIGEST_MISMATCH,
        REVIEW_MISSING,
        IDENTITY_UNVERIFIED,
        SCHEMA_INVALID,
        SPLIT_OVERLAP
    }

    private final Code code;

    DatasetRejected(Code code, String detail) {
        super(code + ": " + detail, null, false, false);
        this.code = code;
    }

    public Code code() {
        return code;
    }
}
