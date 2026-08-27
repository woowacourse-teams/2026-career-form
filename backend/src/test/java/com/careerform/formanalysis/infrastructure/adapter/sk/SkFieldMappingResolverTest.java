package com.careerform.formanalysis.infrastructure.adapter.sk;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FieldCandidate;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormControl;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.FormElement;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Section;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Site;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest.Visibility;

import tools.jackson.databind.ObjectMapper;

@DisplayName("SK 필드 매핑 Resolver")
class SkFieldMappingResolverTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    @DisplayName("모든 후보를 순서대로 canonical key 또는 명시적 NO_MATCH로 분류한다")
    void mapsEveryCandidateExactlyOnceInTraversalOrder() throws Exception {
        FieldsAnalysisRequest request = objectMapper.readValue(
            fixture("sk-fields-snapshot-b-v2.json"),
            FieldsAnalysisRequest.class
        );

        FieldMappingResolver.Resolution resolution =
            new SkFieldMappingResolver().resolve(request);

        assertThat(resolution).isEqualTo(new FieldMappingResolver.Resolution(
            2,
            "sk-snapshot-b-synthetic",
            List.of(
                new FieldMappingResolver.Match(
                    "field-family-name",
                    "personal.personal.koreanFamilyName"
                ),
                new FieldMappingResolver.Match(
                    "field-given-name",
                    "personal.personal.koreanGivenName"
                ),
                new FieldMappingResolver.Match(
                    "field-email",
                    "contact.contact.email"
                ),
                new FieldMappingResolver.Match(
                    "field-phone",
                    "contact.contact.phoneNumber"
                ),
                new FieldMappingResolver.NoMatch("field-ambiguous"),
                new FieldMappingResolver.Match(
                    "field-school-name",
                    "education.university.schoolName"
                ),
                new FieldMappingResolver.Match(
                    "field-completion-status",
                    "education.university.completionStatus"
                )
            )
        ));
    }

    @Test
    @DisplayName("알려진 구조 이름도 검증된 control tuple이 아니면 NO_MATCH로 닫는다")
    void rejectsAKnownNameWithAnUnverifiedControlTuple() {
        FieldsAnalysisRequest request = new FieldsAnalysisRequest(
            2,
            "sk-unverified-control",
            new Site("www.skcareers.com", "/Recruit/Apply/{postingId}"),
            List.of(new Section(
                "section-profile",
                null,
                null,
                List.of(new FieldCandidate(
                    "field-wrong-control",
                    FormElement.CUSTOM,
                    FormControl.CUSTOM,
                    Visibility.VISIBLE,
                    null,
                    null,
                    "applicant-email",
                    null,
                    null,
                    null,
                    null,
                    null
                ),
                new FieldCandidate(
                    "field-missing-name",
                    FormElement.INPUT,
                    FormControl.TEXT,
                    Visibility.VISIBLE,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
                )),
                null
            ))
        );

        FieldMappingResolver.Resolution resolution =
            new SkFieldMappingResolver().resolve(request);

        assertThat(resolution.results()).containsExactly(
            new FieldMappingResolver.NoMatch("field-wrong-control"),
            new FieldMappingResolver.NoMatch("field-missing-name")
        );
    }

    private static String fixture(String name) throws Exception {
        return new ClassPathResource("formanalysis/" + name)
            .getContentAsString(StandardCharsets.UTF_8);
    }
}
