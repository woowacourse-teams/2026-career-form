package com.careerform.formanalysis.generic;

import java.util.List;

public record SectionClassificationResponse(
    int schemaVersion,
    String snapshotId,
    Status status,
    List<Section> sections
) {

    private static final int SCHEMA_VERSION = 1;

    public SectionClassificationResponse {
        sections = List.copyOf(sections);
    }

    public static SectionClassificationResponse complete(String snapshotId, List<Section> sections) {
        return new SectionClassificationResponse(SCHEMA_VERSION, snapshotId, Status.COMPLETE, sections);
    }

    public static SectionClassificationResponse staticPolicyPresent(String snapshotId) {
        return new SectionClassificationResponse(SCHEMA_VERSION, snapshotId, Status.STATIC_POLICY_PRESENT, List.of());
    }

    public static SectionClassificationResponse policyUnavailable(String snapshotId) {
        return new SectionClassificationResponse(SCHEMA_VERSION, snapshotId, Status.POLICY_UNAVAILABLE, List.of());
    }

    public record Section(String sectionId, String category, double confidence) {

        static Section abstained(String sectionId) {
            return new Section(sectionId, SectionCategories.ABSTAIN, 0.0);
        }
    }

    public enum Status {
        COMPLETE,
        STATIC_POLICY_PRESENT,
        POLICY_UNAVAILABLE
    }
}
