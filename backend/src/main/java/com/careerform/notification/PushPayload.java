package com.careerform.notification;

import tools.jackson.databind.json.JsonMapper;

/** 푸시 payload: 공고 ID, 회사, 직무, 링크, 접수 시작, 마감. 암호화 뒤에도 Web Push 4KB 한도 안에 든다. */
public final class PushPayload {
    /** aes128gcm 헤더 86바이트 + 패딩 구분자 1바이트 + GCM 태그 16바이트. */
    public static final int AES128GCM_OVERHEAD_BYTES = 103;
    public static final int MAX_PLAINTEXT_BYTES = 3900;
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private PushPayload() { }

    public static byte[] of(JobPosting posting) {
        var bytes = MAPPER.writeValueAsBytes(posting.view());
        if (bytes.length > MAX_PLAINTEXT_BYTES) { throw new IllegalStateException("Push payload exceeds " + MAX_PLAINTEXT_BYTES + " bytes"); }
        return bytes;
    }
}
