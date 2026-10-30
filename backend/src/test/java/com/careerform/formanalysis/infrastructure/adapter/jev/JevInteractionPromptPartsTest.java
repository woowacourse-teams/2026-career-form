package com.careerform.formanalysis.infrastructure.adapter.jev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import com.careerform.formanalysis.application.PromptSource;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider.Batch;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider.Candidate;
import com.careerform.formanalysis.application.port.InteractionDecisionProvider.Decision;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Control;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Element;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.RelationToTarget;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Role;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.TargetKind;
import com.careerform.formanalysis.dto.InteractionDecisionRequest.Visibility;

@DisplayName("버튼 선택 프롬프트 조각이 모든 역할의 실제 요청 문구를 담는다")
class JevInteractionPromptPartsTest {

    @Test
    void everyRoleAndTargetKindIsCovered() {
        List<Decision> decisions = new ArrayList<>();
        for (Role role : Role.values()) {
            if (role == Role.ROW_KIND_OPTION) {
                for (TargetKind kind : TargetKind.values()) {
                    decisions.add(new Decision("d" + decisions.size(), role, "education.university.schoolName",
                        List.of(candidate("c" + decisions.size())), kind));
                }
            }
            else {
                decisions.add(new Decision("d" + decisions.size(), role, "education.university.schoolName",
                    List.of(candidate("c" + decisions.size()))));
            }
        }
        JevClient client = mock(JevClient.class);
        ArgumentCaptor<Map<String, JevClient.Choice>> questions = ArgumentCaptor.captor();
        when(client.choose(any(), questions.capture())).thenReturn(Map.of());
        var provider = new JevInteractionDecisionProvider(client);

        provider.decide(new Batch(2, decisions));

        Collection<String> parts = provider.promptParts().values();
        List<String> missing = new ArrayList<>();
        questions.getValue().forEach((id, choice) -> {
            String instructions = choice.instructions().replace(id, PromptSource.QUESTION_ID_PLACEHOLDER);
            if (!parts.contains(instructions)) missing.add("instructions:" + id);
            choice.criteria().forEach((key, text) -> {
                if (!parts.contains(text)) missing.add("criterion:" + id + ":" + key);
            });
        });
        assertThat(questions.getValue()).hasSize(decisions.size());
        assertThat(missing).isEmpty();
        assertThat(provider.promptSourceId()).isEqualTo("jev-interaction-decisions");
    }

    private static Candidate candidate(String id) {
        return new Candidate(id, Element.BUTTON, Control.BUTTON, Visibility.VISIBLE,
            false, false, false, RelationToTarget.SAME_FIELD_GROUP, List.of(), false);
    }
}
