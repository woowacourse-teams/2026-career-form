package com.careerform.formanalysis.generic;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 범용 섹션 구조만 담는다. 프로필 값, 현재 입력값, 항목 개수 필드는 두지 않는다. */
public record SectionClassificationRequest(
    int schemaVersion,
    @NotBlank @Size(max = 128) String snapshotId,
    @NotNull @Valid Site site,
    @NotNull @Size(min = 1, max = 128) List<@NotNull @Valid Section> sections
) {

    static final String OPAQUE_ID = "[A-Za-z][A-Za-z0-9_-]{0,63}";

    public record Site(
        @NotBlank @Size(max = 253) String host,
        @NotBlank @Size(max = 512) String pathPattern
    ) {
    }

    public record Section(
        @NotNull @Pattern(regexp = OPAQUE_ID) String sectionId,
        @Pattern(regexp = OPAQUE_ID) String parentSectionId,
        @Size(max = 200) String title,
        @NotNull @Size(max = 32) List<@NotNull @Size(max = 200) String> labels,
        @NotNull @Size(max = 32) List<@NotNull ControlKind> controlKinds,
        boolean repeated
    ) {
    }

    public enum ControlKind {
        TEXT,
        TEXTAREA,
        SELECT,
        RADIO,
        CHECKBOX,
        DATE,
        FILE,
        BUTTON,
        OTHER
    }
}
