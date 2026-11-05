package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;

/** JEV typed-question API를 선택 모델 포트로 감싼다. 전송, 검증, 재시도, 측정은 {@link JevClient} 그대로다. */
@Component
@Conditional(InteractionProviderConditions.JevClient.class)
public final class JevChoiceModel implements ChoiceModel {

    private final JevClient client;

    public JevChoiceModel(JevClient client) {
        this.client = client;
    }

    @Override
    public String provider() {
        return "jev";
    }

    @Override
    public String model() {
        return client.model();
    }

    @Override
    public Map<String, Judgement> answer(Object state, Map<String, Question> questions) {
        Map<String, Judgement> result = new LinkedHashMap<>();
        client.answer(state, choices(questions)).forEach((id, judgement) -> result.put(id,
            new Judgement(judgement.choice(), judgement.confidence(), judgement.probabilities())));
        return result;
    }

    @Override
    public Map<String, String> choose(Object state, Map<String, Question> questions) {
        return client.choose(state, choices(questions));
    }

    private static Map<String, JevClient.Choice> choices(Map<String, Question> questions) {
        Map<String, JevClient.Choice> choices = new LinkedHashMap<>();
        questions.forEach((id, question) -> choices.put(id,
            new JevClient.Choice(question.instructions(), question.criteria())));
        return choices;
    }
}
