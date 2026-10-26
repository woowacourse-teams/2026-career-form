package com.careerform.notification;

import java.time.Instant;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonInclude;

import tools.jackson.databind.json.JsonMapper;

/** 푸시 payload: 공고 ID, 회사, 직무(없으면 생략), 링크, 접수 시작, 마감, FCM 요청 시각. 암호화 뒤에도 Web Push 4KB 한도 안에 든다. */
public final class PushPayload {
    /** aes128gcm 헤더 86바이트 + 패딩 구분자 1바이트 + GCM 태그 16바이트. */
    public static final int AES128GCM_OVERHEAD_BYTES = 103;
    public static final int MAX_PLAINTEXT_BYTES = 3900;
    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private PushPayload() { }

    /** 목록 항목과 같은 필드에 sentAt(FCM 요청 시각)을 더한 모양. 확장은 sentAt으로 표시 지연을 계측한다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Message(String id, String company, String role, String link, Instant opensAt, Instant closesAt, Instant sentAt) { }

    public static byte[] of(JobPosting posting, Instant sentAt) {
        var view = posting.view();
        var bytes = MAPPER.writeValueAsBytes(new Message(view.id(), view.company(), view.role(), view.link(), view.opensAt(), view.closesAt(),
            Objects.requireNonNull(sentAt)));
        if (bytes.length > MAX_PLAINTEXT_BYTES) { throw new IllegalStateException("Push payload exceeds " + MAX_PLAINTEXT_BYTES + " bytes"); }
        return bytes;
    }
}
