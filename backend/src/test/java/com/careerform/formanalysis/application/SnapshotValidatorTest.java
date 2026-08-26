package com.careerform.formanalysis.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.careerform.formanalysis.domain.FieldsSnapshot;
import com.careerform.formanalysis.domain.FormControl;
import com.careerform.formanalysis.domain.FormElement;
import com.careerform.formanalysis.domain.PreparationSnapshot;
import com.careerform.formanalysis.domain.Site;
import com.careerform.formanalysis.domain.Visibility;

class SnapshotValidatorTest {

    private final SnapshotValidator validator = new SnapshotValidator();

    @Test
    void rejectsUnsupportedSchemaVersion() {
        FieldsSnapshot snapshot = new FieldsSnapshot(
            1,
            "snapshot-1",
            site(),
            List.of(fieldSection("section-1", null, "field-1", "option-1"))
        );

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsDuplicateSectionIds() {
        FieldsSnapshot snapshot = new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(
                fieldSection("section-1", null, "field-1", "option-1"),
                fieldSection("section-1", null, "field-2", "option-2")
            )
        );

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsDuplicateItemIdsAcrossSections() {
        FieldsSnapshot snapshot = new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(
                fieldSectionWithItem("section-1", "item-1", "field-1"),
                fieldSectionWithItem("section-2", "item-1", "field-2")
            )
        );

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsDuplicateCandidateIdsBetweenDirectAndItemFields() {
        FieldsSnapshot snapshot = new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(field("field-1", "option-1")),
                List.of(new FieldsSnapshot.Item(
                    "item-1",
                    List.of(field("field-1", "option-2"))
                ))
            ))
        );

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsMissingParentSection() {
        PreparationSnapshot snapshot = preparationWithParents(Map.of(
            "section-a", "missing-section"
        ));

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsSelfParent() {
        PreparationSnapshot snapshot = preparationWithParents(Map.of(
            "section-a", "section-a"
        ));

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsParentCycle() {
        PreparationSnapshot snapshot = preparationWithParents(Map.of(
            "section-a", "section-b",
            "section-b", "section-a"
        ));

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void rejectsDuplicateOptionIdsWithinOneCandidate() {
        FieldsSnapshot snapshot = new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                List.of(new FieldsSnapshot.FieldCandidate(
                    "field-1",
                    FormElement.SELECT,
                    FormControl.SELECT,
                    Visibility.VISIBLE,
                    "국적",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    List.of(
                        new FieldsSnapshot.Option("option-1", "대한민국"),
                        new FieldsSnapshot.Option("option-1", "기타")
                    )
                )),
                List.of()
            ))
        );

        assertInvalid(() -> validator.validate(snapshot));
    }

    @Test
    void preservesSnapshotTraversalOrder() {
        FieldsSnapshot fields = new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(
                new FieldsSnapshot.Section(
                    "section-a",
                    null,
                    "기본 정보",
                    List.of(field("field-direct-a", "option-a")),
                    List.of(
                        new FieldsSnapshot.Item(
                            "item-a",
                            List.of(
                                field("field-item-a-1", "option-a-1"),
                                field("field-item-a-2", "option-a-2")
                            )
                        )
                    )
                ),
                fieldSection("section-b", "section-a", "field-direct-b", "option-b")
            )
        );
        PreparationSnapshot preparation = new PreparationSnapshot(
            2,
            "snapshot-2",
            site(),
            List.of(new PreparationSnapshot.Section(
                "section-a",
                null,
                "학력",
                List.of(action("action-direct")),
                List.of(new PreparationSnapshot.Item(
                    "item-a",
                    List.of(action("action-item"))
                ))
            ))
        );

        validator.validate(fields);
        validator.validate(preparation);

        assertThat(fields.fieldCandidateIdsInTraversalOrder())
            .containsExactly(
                "field-direct-a",
                "field-item-a-1",
                "field-item-a-2",
                "field-direct-b"
            );
        assertThat(preparation.actionCandidateIdsInTraversalOrder())
            .containsExactly("action-direct", "action-item");
    }

    private static PreparationSnapshot preparationWithParents(
        Map<String, String> parents
    ) {
        Map<String, String> ordered = new LinkedHashMap<>(parents);
        List<PreparationSnapshot.Section> sections = new ArrayList<>();
        ordered.forEach((sectionId, parentSectionId) -> sections.add(
            new PreparationSnapshot.Section(
                sectionId,
                parentSectionId,
                "합성 섹션",
                List.of(action("action-" + sectionId)),
                List.of()
            )
        ));
        return new PreparationSnapshot(2, "snapshot-1", site(), sections);
    }

    private static FieldsSnapshot fieldsWithCandidateIds(List<String> candidateIds) {
        return new FieldsSnapshot(
            2,
            "snapshot-1",
            site(),
            List.of(new FieldsSnapshot.Section(
                "section-1",
                null,
                "기본 정보",
                candidateIds.stream()
                    .map(candidateId -> field(candidateId, candidateId + "-option"))
                    .toList(),
                List.of()
            ))
        );
    }

    private static FieldsSnapshot.Section fieldSection(
        String sectionId,
        String parentSectionId,
        String candidateId,
        String optionId
    ) {
        return new FieldsSnapshot.Section(
            sectionId,
            parentSectionId,
            "합성 섹션",
            List.of(field(candidateId, optionId)),
            List.of()
        );
    }

    private static FieldsSnapshot.Section fieldSectionWithItem(
        String sectionId,
        String itemId,
        String candidateId
    ) {
        return new FieldsSnapshot.Section(
            sectionId,
            null,
            "합성 섹션",
            List.of(),
            List.of(new FieldsSnapshot.Item(
                itemId,
                List.of(field(candidateId, candidateId + "-option"))
            ))
        );
    }

    private static FieldsSnapshot.FieldCandidate field(
        String candidateId,
        String optionId
    ) {
        return new FieldsSnapshot.FieldCandidate(
            candidateId,
            FormElement.INPUT,
            FormControl.TEXT,
            Visibility.VISIBLE,
            "합성 필드",
            "synthetic-id",
            "synthetic-name",
            "합성 안내",
            null,
            null,
            null,
            List.of(new FieldsSnapshot.Option(optionId, "합성 선택지"))
        );
    }

    private static PreparationSnapshot.ActionCandidate action(String candidateId) {
        return new PreparationSnapshot.ActionCandidate(
            candidateId,
            FormElement.BUTTON,
            FormControl.BUTTON,
            Visibility.VISIBLE,
            "합성 버튼",
            "synthetic-id",
            "synthetic-name",
            null,
            null,
            null
        );
    }

    private static Site site() {
        return new Site("example.test", "/application/*");
    }

    private static void assertInvalid(Runnable validation) {
        assertThatThrownBy(validation::run)
            .isInstanceOf(InvalidFormAnalysisRequestException.class)
            .hasMessage("지원서 snapshot 관계를 확인할 수 없습니다");
    }
}
