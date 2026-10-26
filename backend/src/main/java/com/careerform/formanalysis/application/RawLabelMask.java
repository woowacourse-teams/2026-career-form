package com.careerform.formanalysis.application;

import java.text.Normalizer;

/** 공급자에 보내는 원문 라벨에서 이메일·URL·전화번호·두 자리 이상 숫자를 가리고 120자로 자른다. */
public final class RawLabelMask {

    private RawLabelMask() {
    }

    public static String mask(String raw) {
        if (raw == null) {
            return null;
        }
        String masked = Normalizer.normalize(raw, Normalizer.Form.NFKC)
            .replaceAll("(?U)\\s+", " ")
            .trim()
            .replaceAll("(?i)[\\p{L}\\p{N}._%+\\-]+@[\\p{L}\\p{N}.\\-]+\\.[\\p{L}]{2,}", "<email>")
            .replaceAll("(?i)(?:[a-z][a-z0-9+.-]*://|www\\.)[^\\s<>]+", "<url>")
            .replaceAll("(?U)(?<![\\p{L}\\p{N}_])\\+?\\(?\\d(?:[\\d ().-]*\\d){6,}(?!\\d)", "<number>")
            .replaceAll("(?U)\\d{2,}", "<number>");
        return masked.isEmpty() ? null : masked.substring(0, Math.min(masked.length(), 120));
    }
}
