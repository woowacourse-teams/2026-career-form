package com.careerform.formanalysis.domain;

public final class FormAnalysisConstraints {

    public static final int SCHEMA_VERSION = 2;
    public static final int ID_MAX_LENGTH = 128;
    public static final int METADATA_MAX_LENGTH = 120;
    public static final int HOST_MAX_LENGTH = 253;
    public static final int PATH_PATTERN_MAX_LENGTH = 512;
    public static final int MAX_REQUEST_BYTES = 65_536;

    private FormAnalysisConstraints() {
    }
}
