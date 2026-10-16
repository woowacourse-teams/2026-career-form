package com.careerform.formanalysis.generic;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.FormAnalysisRouter.GenericRouteKind;
import com.careerform.formanalysis.exception.ResolverException;
import com.careerform.formanalysis.exception.TokenLimitExceeded;
import com.careerform.formanalysis.generic.SectionClassificationRequest.Section;
import com.careerform.formanalysis.generic.SectionClassifier.Classification;
import com.careerform.formanalysis.generic.SectionClassifier.SectionShape;
import com.careerform.formanalysis.infrastructure.adapter.ProviderSemanticSanitizer;

@Service
public final class SectionClassificationService {

    private static final Logger log = LoggerFactory.getLogger(SectionClassificationService.class);
    private static final int SCHEMA_VERSION = 1;

    private final Optional<SectionClassifier> classifier;
    private final FormAnalysisRouter router;
    private final SectionCategories categories;

    public SectionClassificationService(
        Optional<SectionClassifier> classifier,
        FormAnalysisRouter router,
        SectionCategories categories
    ) {
        this.classifier = classifier;
        this.router = router;
        this.categories = categories;
    }

    public SectionClassificationResponse classify(SectionClassificationRequest request) {
        validate(request);
        GenericRouteKind route = router.routeGeneric(request.site().host(), request.site().pathPattern());
        if (route == GenericRouteKind.STATIC_POLICY_PRESENT) {
            return SectionClassificationResponse.staticPolicyPresent(request.snapshotId());
        }
        if (route == GenericRouteKind.POLICY_UNAVAILABLE) {
            return SectionClassificationResponse.policyUnavailable(request.snapshotId());
        }
        Map<String, Classification> results = Map.of();
        if (classifier.isPresent()) {
            try {
                results = Objects.requireNonNullElse(classifier.get().classify(shapes(request)), Map.of());
            }
            catch (ResolverException | TokenLimitExceeded exception) {
                log.warn("GENERIC_SECTION_CLASSIFICATION_ABSTAINED reason={}", exception.getClass().getSimpleName());
            }
        }
        Map<String, Classification> classified = results;
        return SectionClassificationResponse.complete(request.snapshotId(), request.sections().stream()
            .map(section -> responseSection(section.sectionId(), classified.get(section.sectionId())))
            .toList());
    }

    private SectionClassificationResponse.Section responseSection(String sectionId, Classification classification) {
        if (classification == null
            || !categories.contains(classification.category())
            || !Double.isFinite(classification.confidence())
            || classification.confidence() < 0
            || classification.confidence() > 1) {
            return SectionClassificationResponse.Section.abstained(sectionId);
        }
        return new SectionClassificationResponse.Section(
            sectionId, classification.category(), classification.confidence());
    }

    private static List<SectionShape> shapes(SectionClassificationRequest request) {
        return request.sections().stream().map(section -> new SectionShape(
            section.sectionId(),
            section.parentSectionId(),
            ProviderSemanticSanitizer.sanitize(section.title()),
            section.labels().stream().map(ProviderSemanticSanitizer::sanitize)
                .filter(Objects::nonNull).distinct().toList(),
            List.copyOf(section.controlKinds()),
            section.repeated()
        )).toList();
    }

    private static void validate(SectionClassificationRequest request) {
        if (request.schemaVersion() != SCHEMA_VERSION) {
            invalid();
        }
        Set<String> ids = new HashSet<>();
        for (Section section : request.sections()) {
            if (!ids.add(section.sectionId())) {
                invalid();
            }
        }
        for (Section section : request.sections()) {
            String parent = section.parentSectionId();
            if (parent != null && (parent.equals(section.sectionId()) || !ids.contains(parent))) {
                invalid();
            }
        }
    }

    private static void invalid() {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "범용 섹션 구조 요청을 처리할 수 없습니다");
    }
}
