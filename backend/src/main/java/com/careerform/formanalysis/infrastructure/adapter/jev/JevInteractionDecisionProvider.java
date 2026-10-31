package com.careerform.formanalysis.infrastructure.adapter.jev;

import java.util.Map;

import org.springframework.context.annotation.Conditional;
import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider;
import com.careerform.formanalysis.generic.ChoiceInteractionDecisions;
import com.careerform.formanalysis.infrastructure.InteractionProviderConditions;

/**
 * 제품의 JEV 상호작용 공급자. 질문 구성은 공급자 중립 {@link ChoiceInteractionDecisions}에 맡기고
 * JEV choose()(최소 확신도와 단일 최고 확률 컷)로 묻는다.
 */
@Component
@Conditional(InteractionProviderConditions.JevOnly.class)
public final class JevInteractionDecisionProvider implements InteractionDecisionProvider, PromptSource {

    private final ChoiceInteractionDecisions decisions;

    public JevInteractionDecisionProvider(JevClient client) {
        this.decisions = new ChoiceInteractionDecisions(new JevChoiceModel(client));
    }

    @Override
    public String promptSourceId() {
        return decisions.promptSourceId();
    }

    @Override
    public Map<String, String> promptParts() {
        return decisions.promptParts();
    }

    @Override
    public Resolution decide(Batch batch) {
        return decisions.decide(batch);
    }
}
