package com.careerform.formanalysis.generic;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;
import com.careerform.formanalysis.application.port.ChoiceModel;

/** 섹션마다 선택 모델 포트의 answer() 질문 하나를 만든다(공급자 중립). 질문 분할과 토큰 초과 재시도는 하지 않는다. */
@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class ChoiceSectionClassifier implements SectionClassifier, PromptSource {

    static final String BOUNDARIES = "Boundaries: the applicant's own name, birth date and contact details are "
        + "PERSONAL, while contact details of other people such as references, guardians or family are NONE. "
        + "Employment at an organization is CAREER, while individual project work is PROJECT even when it was "
        + "done during employment. Language tests and language skills are LANGUAGE, while overseas stays, study "
        + "abroad or international activities are NONE. Certificates and licenses are CERTIFICATE, while awards "
        + "and contest prizes are NONE. Military service, veteran and disability sections are SENSITIVE; health "
        + "sections are NONE. Choose MIXED only when the section clearly combines several profile categories, "
        + "and ABSTAIN when the evidence is insufficient.";

    private final ChoiceModel client;
    private final SectionCategories categories;

    public ChoiceSectionClassifier(ChoiceModel client, SectionCategories categories) {
        this.client = client;
        this.categories = categories;
    }

    static String instructions(String questionId) {
        return "Classify section " + questionId + " of a job application form into exactly one applicant "
            + "profile category using only its sanitized title, field labels, control kinds, repeated flag and "
            + "parent section. " + BOUNDARIES;
    }

    @Override
    public String promptSourceId() {
        return "section-classification";
    }

    @Override
    public Map<String, String> promptParts() {
        Map<String, String> parts = new java.util.TreeMap<>();
        parts.put("instructions", instructions(QUESTION_ID_PLACEHOLDER));
        criteria().forEach((category, text) -> parts.put("criterion." + category, text));
        return parts;
    }

    @Override
    public Map<String, Classification> classify(List<SectionShape> sections) {
        if (sections.isEmpty()) {
            return Map.of();
        }
        Map<String, String> questionIds = new LinkedHashMap<>();
        for (SectionShape section : sections) {
            questionIds.put(section.sectionId(), "section_" + questionIds.size());
        }
        Map<String, String> criteria = criteria();
        Map<String, Object> state = new LinkedHashMap<>();
        Map<String, ChoiceModel.Question> questions = new LinkedHashMap<>();
        for (SectionShape section : sections) {
            String questionId = questionIds.get(section.sectionId());
            state.put(questionId, sectionState(section, questionIds));
            questions.put(questionId, new ChoiceModel.Question(instructions(questionId), criteria));
        }
        Map<String, ChoiceModel.Judgement> answers = client.answer(Map.of("sections", state), questions);
        Map<String, Classification> results = new LinkedHashMap<>();
        for (SectionShape section : sections) {
            ChoiceModel.Judgement judgement = answers.get(questionIds.get(section.sectionId()));
            if (judgement != null) {
                results.put(section.sectionId(), new Classification(judgement.choice(), judgement.confidence()));
            }
        }
        return results;
    }

    private static Map<String, Object> sectionState(SectionShape section, Map<String, String> questionIds) {
        Map<String, Object> state = new LinkedHashMap<>();
        if (section.parentSectionId() != null) {
            state.put("parent", questionIds.get(section.parentSectionId()));
        }
        if (section.title() != null) {
            state.put("title", section.title());
        }
        state.put("labels", section.labels());
        state.put("controlKinds", section.controlKinds().stream()
            .map(kind -> kind.name().toLowerCase(Locale.ROOT)).toList());
        state.put("repeated", section.repeated());
        return state;
    }

    private Map<String, String> criteria() {
        Map<String, String> criteria = new LinkedHashMap<>();
        for (String category : categories.names()) {
            criteria.put(category, criterion(category));
        }
        return criteria;
    }

    private String criterion(String category) {
        return switch (category) {
            case SectionCategories.MIXED ->
                "The section clearly combines items from two or more applicant profile categories.";
            case SectionCategories.ABSTAIN ->
                "The observed structure is insufficient to decide one category safely.";
            case SectionCategories.NONE ->
                "Not an applicant profile category: references, guardians, self-introduction or essays, consent, "
                    + "application route, file uploads, overseas experience, awards, health information or "
                    + "anything else. Health items: " + leaves(category);
            default -> "The applicant's own " + category + " profile section with items such as: "
                + leaves(category);
        };
    }

    private String leaves(String category) {
        return categories.keysOf(category).stream()
            .map(key -> key.substring(key.indexOf('.') + 1))
            .collect(Collectors.joining(", "));
    }
}
