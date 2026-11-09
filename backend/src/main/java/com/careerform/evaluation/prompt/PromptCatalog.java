package com.careerform.evaluation.prompt;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import com.careerform.formanalysis.application.PromptSource;

/**
 * 프롬프트 출처들의 조각을 "출처/조각" 이름으로 모아 sha256 해시를 만든다.
 * 해시 입력은 이름 순서로 정렬한 (이름 길이, 이름, 내용 길이, 내용)의 나열이라 출처 순서와 무관하다.
 */
public final class PromptCatalog {

    public PromptSnapshot snapshot(List<? extends PromptSource> sources) {
        if (sources.isEmpty()) {
            throw new IllegalStateException("프롬프트 출처가 없습니다");
        }
        SortedMap<String, String> parts = new TreeMap<>();
        java.util.Set<String> ids = new java.util.HashSet<>();
        for (PromptSource source : sources) {
            if (!ids.add(source.promptSourceId())) {
                throw new IllegalStateException("프롬프트 출처 이름이 중복됩니다: " + source.promptSourceId());
            }
            for (Map.Entry<String, String> part : source.promptParts().entrySet()) {
                if (part.getValue() == null || part.getValue().isBlank()) {
                    throw new IllegalStateException("빈 프롬프트 조각입니다: " + part.getKey());
                }
                parts.put(source.promptSourceId() + "/" + part.getKey(), part.getValue());
            }
        }
        return new PromptSnapshot(digest(parts), parts);
    }

    private static String digest(SortedMap<String, String> parts) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            for (Map.Entry<String, String> part : parts.entrySet()) {
                update(sha, part.getKey());
                update(sha, part.getValue());
            }
            return HexFormat.of().formatHex(sha.digest());
        }
        catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static void update(MessageDigest sha, String text) {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        sha.update((bytes.length + ":").getBytes(StandardCharsets.US_ASCII));
        sha.update(bytes);
    }
}
