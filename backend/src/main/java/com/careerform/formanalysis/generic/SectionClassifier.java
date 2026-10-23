package com.careerform.formanalysis.generic;

import java.util.List;
import java.util.Map;

import com.careerform.formanalysis.generic.SectionClassificationRequest.ControlKind;

/** 정제된 섹션 구조를 범주로 분류하는 공급자 포트다. 결과 키는 sectionId다. */
public interface SectionClassifier {

    Map<String, Classification> classify(List<SectionShape> sections);

    record SectionShape(
        String sectionId,
        String parentSectionId,
        String title,
        List<String> labels,
        List<ControlKind> controlKinds,
        boolean repeated
    ) {
    }

    record Classification(String category, double confidence) {
    }
}
