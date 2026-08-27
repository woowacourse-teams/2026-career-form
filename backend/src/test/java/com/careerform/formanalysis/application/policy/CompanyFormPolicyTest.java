package com.careerform.formanalysis.application.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionKind;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.ActionStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldRule;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldStructure;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.FieldsFingerprint;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy.PreparationFingerprint;

@DisplayName("회사별 지원서 정책")
class CompanyFormPolicyTest {

    @Test
    @DisplayName("정상 정책은 입력 collection 변경과 무관한 불변 snapshot을 유지한다")
    void keepsAnImmutablePolicySnapshot() {
        Set<String> actionSections = new HashSet<>(Set.of(
            "section-profile",
            "section-detail"
        ));
        List<ActionStructure> actionStructures = new ArrayList<>(List.of(
            actionStructure("detail-toggle")
        ));
        List<ActionRule> actionRules = new ArrayList<>(List.of(
            new ActionRule("detail-toggle", ActionKind.REVEAL, "section-detail")
        ));
        CompanyFormPolicy policy = CompanyFormPolicy.create(
            "sk",
            1,
            new PreparationFingerprint(actionSections, actionStructures),
            fieldsFingerprint(),
            actionRules,
            fieldRules(),
            ignored -> true
        );

        actionSections.add("section-mutated");
        actionStructures.clear();
        actionRules.clear();

        assertThat(policy.companyKey()).isEqualTo("sk");
        assertThat(policy.version()).isEqualTo(1);
        assertThat(policy.preparationFingerprint().requiredSectionIds())
            .containsExactlyInAnyOrder("section-profile", "section-detail");
        assertThat(policy.preparationFingerprint().requiredActions())
            .containsExactly(actionStructure("detail-toggle"));
        assertThat(policy.actionRules()).containsExactly(
            new ActionRule("detail-toggle", ActionKind.REVEAL, "section-detail")
        );
    }

    @Test
    @DisplayName("같은 구조 이름의 action 또는 field rule 중복을 거부한다")
    void rejectsDuplicateRuleStructuralNames() {
        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            preparationFingerprint(),
            fieldsFingerprint(),
            List.of(
                new ActionRule("detail-toggle", ActionKind.REVEAL, "section-detail"),
                new ActionRule("detail-toggle", ActionKind.ADD, null)
            ),
            fieldRules(),
            ignored -> true
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            preparationFingerprint(),
            fieldsFingerprint(),
            actionRules(),
            List.of(
                textRule("applicant-email", "contact.contact.email"),
                textRule("applicant-email", "contact.contact.phoneNumber")
            ),
            ignored -> true
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("필수 section 또는 structure가 없는 fingerprint를 거부한다")
    void rejectsAnEmptyFingerprint() {
        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            new PreparationFingerprint(Set.of(), List.of()),
            fieldsFingerprint(),
            actionRules(),
            fieldRules(),
            ignored -> true
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            preparationFingerprint(),
            new FieldsFingerprint(Set.of(), List.of()),
            actionRules(),
            fieldRules(),
            ignored -> true
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("reveal rule은 존재하는 target section을 명시해야 한다")
    void rejectsARevealRuleWithoutAKnownTargetSection() {
        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            preparationFingerprint(),
            fieldsFingerprint(),
            List.of(new ActionRule(
                "detail-toggle",
                ActionKind.REVEAL,
                "section-unknown"
            )),
            fieldRules(),
            ignored -> true
        )).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("canonical allowlist가 거부한 profile field를 정책에 넣지 않는다")
    void rejectsAProfileFieldOutsideTheCanonicalAllowlist() {
        assertThatThrownBy(() -> CompanyFormPolicy.create(
            "sk",
            1,
            preparationFingerprint(),
            fieldsFingerprint(),
            actionRules(),
            fieldRules(),
            ignored -> false
        )).isInstanceOf(IllegalArgumentException.class);
    }

    private static PreparationFingerprint preparationFingerprint() {
        return new PreparationFingerprint(
            Set.of("section-profile", "section-detail"),
            List.of(actionStructure("detail-toggle"))
        );
    }

    private static FieldsFingerprint fieldsFingerprint() {
        return new FieldsFingerprint(
            Set.of("section-profile"),
            List.of(new FieldStructure(
                "applicant-email",
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
                com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT
            ))
        );
    }

    private static List<FieldRule> fieldRules() {
        return List.of(textRule("applicant-email", "contact.contact.email"));
    }

    private static List<ActionRule> actionRules() {
        return List.of(new ActionRule(
            "detail-toggle",
            ActionKind.REVEAL,
            "section-detail"
        ));
    }

    private static FieldRule textRule(String structuralName, String profileFieldKey) {
        return new FieldRule(
            structuralName,
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement.INPUT,
            com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl.TEXT,
            profileFieldKey
        );
    }

    private static ActionStructure actionStructure(String structuralName) {
        return new ActionStructure(
            structuralName,
            com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormElement.BUTTON,
            com.careerform.formanalysis.dto.PreparationAnalysisRequest.FormControl.BUTTON
        );
    }
}
