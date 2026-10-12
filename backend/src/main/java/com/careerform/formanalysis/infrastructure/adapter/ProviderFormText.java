package com.careerform.formanalysis.infrastructure.adapter;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

/** Projects common form text for providers: normalized, pattern-masked and length-limited. */
public final class ProviderFormText {

    static final int MAX_CODE_POINTS = 120;

    private static final Pattern FORMAT_CHARACTERS = Pattern.compile("\\p{Cf}");
    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("\\p{Cc}");
    private static final Pattern SPACES = Pattern.compile("[\\s\\p{Z}]+");
    private static final Pattern EMAIL = Pattern.compile(
        "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
    );
    private static final Pattern URL = Pattern.compile(
        "(?i)\\b(?:[a-z][a-z0-9+.-]*://|www\\.)\\S+"
    );
    private static final Pattern DOMAIN = Pattern.compile(
        "(?i)\\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+"
            + "(?:com|net|org|kr|io|co|ai|dev|app|me|info|biz|jp|cn|us|uk|edu|gov)\\b(?:/\\S*)?"
    );
    private static final Pattern RESIDENT_NUMBER = Pattern.compile(
        "(?<!\\d)\\d{6}\\s*-\\s*[1-8]\\d{6}(?!\\d)"
    );
    private static final Pattern PHONE = Pattern.compile(
        "(?:\\+\\s?82[\\s.-]?0?|(?<!\\d)0)(?:1[016789]|2|[3-6][1-5]|70|50[2-8]?)"
            + "[\\s.-]?\\d{3,4}[\\s.-]?\\d{4}(?!\\d)"
    );
    private static final Pattern LONG_NUMBER = Pattern.compile("\\d{6,}");
    private static final Pattern PARTIAL_TOKEN = Pattern.compile("\\[[A-Z0-9_]*$");

    private ProviderFormText() {
    }

    public static String project(String raw) {
        if (raw == null) {
            return null;
        }
        String text = Normalizer.normalize(raw, Normalizer.Form.NFKC);
        text = FORMAT_CHARACTERS.matcher(text).replaceAll("");
        text = CONTROL_CHARACTERS.matcher(text).replaceAll(" ");
        text = SPACES.matcher(text).replaceAll(" ").trim();
        text = EMAIL.matcher(text).replaceAll("[EMAIL]");
        text = URL.matcher(text).replaceAll("[URL]");
        text = DOMAIN.matcher(text).replaceAll("[URL]");
        text = RESIDENT_NUMBER.matcher(text).replaceAll("[ID_NUMBER]");
        text = PHONE.matcher(text).replaceAll("[PHONE]");
        text = maskLongNumbers(text);
        text = limit(text);
        return text.isEmpty() ? null : text;
    }

    public static List<Label> projectFields(
        List<FieldsAnalysisRequest.SemanticLabel> labels
    ) {
        if (labels == null) {
            return null;
        }
        List<Label> projected = new ArrayList<>();
        labels.forEach(label -> add(projected, label.source().name(), label.text()));
        return projected.isEmpty() ? null : List.copyOf(projected);
    }

    public static List<Label> projectActions(
        List<PreparationAnalysisRequest.SemanticLabel> labels
    ) {
        if (labels == null) {
            return null;
        }
        List<Label> projected = new ArrayList<>();
        labels.forEach(label -> add(projected, label.source().name(), label.text()));
        return projected.isEmpty() ? null : List.copyOf(projected);
    }

    private static void add(List<Label> target, String sourceName, String raw) {
        String text = project(raw);
        if (text != null) {
            target.add(new Label(
                sourceName.toLowerCase(Locale.ROOT).replace('_', '-'),
                text
            ));
        }
    }

    private static String maskLongNumbers(String text) {
        Matcher matcher = LONG_NUMBER.matcher(text);
        StringBuilder masked = new StringBuilder();
        while (matcher.find()) {
            matcher.appendReplacement(
                masked,
                Matcher.quoteReplacement("[NUMBER_" + matcher.group().length() + "]")
            );
        }
        matcher.appendTail(masked);
        return masked.toString();
    }

    private static String limit(String text) {
        if (text.codePointCount(0, text.length()) <= MAX_CODE_POINTS) {
            return text;
        }
        String cut = text.substring(0, text.offsetByCodePoints(0, MAX_CODE_POINTS));
        return PARTIAL_TOKEN.matcher(cut).replaceAll("").trim();
    }

    public record Label(String source, String text) {
    }
}
