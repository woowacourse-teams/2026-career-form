package com.careerform.evaluation.run;

import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import com.careerform.evaluation.scoring.CallKind;
import com.careerform.formanalysis.application.FieldInteractionPolicy;
import com.careerform.formanalysis.application.FormAnalysisRouter;
import com.careerform.formanalysis.application.InteractionDecisionService;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.generic.GenericFieldsRequest;
import com.careerform.formanalysis.generic.GenericFieldsService;
import com.careerform.formanalysis.generic.JevCategoryFieldResolver;
import com.careerform.formanalysis.generic.SectionClassificationRequest;
import com.careerform.formanalysis.generic.SectionClassificationService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 저장한 요청을 제품 컨트롤러와 같은 방식으로 읽고(엄격 JSON 매퍼, Bean Validation) 제품 서비스를 그대로 부른다.
 * 필드 매핑은 실행 설정의 배치 값으로 만든 resolver 사본을 쓰며 서버 전체 동시 호출 상한은 제품과 공유한다.
 */
public final class ServiceProductCallGateway implements ProductCallGateway {

    private final JsonMapper mapper;
    private final Validator validator;
    private final SectionClassificationService classification;
    private final InteractionDecisionService interactions;
    private final Optional<JevCategoryFieldResolver> resolver;
    private final FormAnalysisRouter router;
    private final FieldInteractionPolicy interactionPolicy;
    private final SupportedProfileFields fields;
    private final Map<String, GenericFieldsService> fieldServices = new ConcurrentHashMap<>();

    public ServiceProductCallGateway(JsonMapper mapper, Validator validator,
        SectionClassificationService classification, InteractionDecisionService interactions,
        Optional<JevCategoryFieldResolver> resolver, FormAnalysisRouter router,
        FieldInteractionPolicy interactionPolicy, SupportedProfileFields fields) {
        this.mapper = mapper;
        this.validator = validator;
        this.classification = classification;
        this.interactions = interactions;
        this.resolver = resolver;
        this.router = router;
        this.interactionPolicy = interactionPolicy;
        this.fields = fields;
    }

    @Override
    public JsonNode call(CallKind kind, JsonNode request, Map<String, String> settings) {
        Object response = switch (kind) {
            case SECTION_CLASSIFY -> classification.classify(read(request, SectionClassificationRequest.class));
            case INTERACTION_DECISION -> interactions.decide(read(request, InteractionDecisionRequest.class));
            case GENERIC_FIELDS -> fieldService(settings).analyze(read(request, GenericFieldsRequest.class));
        };
        return mapper.valueToTree(response);
    }

    private <T> T read(JsonNode request, Class<T> type) {
        T value = mapper.treeToValue(request, type);
        Set<ConstraintViolation<T>> violations = validator.validate(value);
        if (!violations.isEmpty()) {
            throw new IllegalArgumentException("제품 요청 형식 검증에 실패했습니다: " + type.getSimpleName());
        }
        return value;
    }

    private GenericFieldsService fieldService(Map<String, String> settings) {
        int concurrency = Integer.parseInt(settings.getOrDefault("section-concurrency", "3"));
        int batch = Integer.parseInt(settings.getOrDefault("field-batch-size", "5"));
        return fieldServices.computeIfAbsent(concurrency + "/" + batch, key -> new GenericFieldsService(
            resolver.map(original -> original.withBatching(concurrency, batch)), router, interactionPolicy, fields));
    }
}
