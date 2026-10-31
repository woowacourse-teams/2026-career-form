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
import com.careerform.formanalysis.application.InteractionObservationProjector;
import com.careerform.formanalysis.application.SupportedProfileFields;
import com.careerform.formanalysis.application.port.ChoiceModel;
import com.careerform.formanalysis.dto.InteractionDecisionRequest;
import com.careerform.formanalysis.generic.ChoiceFieldResolver;
import com.careerform.formanalysis.generic.ChoiceInteractionDecisions;
import com.careerform.formanalysis.generic.ChoiceSectionClassifier;
import com.careerform.formanalysis.generic.GenericFieldsRequest;
import com.careerform.formanalysis.generic.GenericFieldsService;
import com.careerform.formanalysis.generic.SectionCategories;
import com.careerform.formanalysis.generic.SectionClassificationRequest;
import com.careerform.formanalysis.generic.SectionClassificationService;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 저장한 요청을 제품 컨트롤러와 같은 방식으로 읽고(엄격 JSON 매퍼, Bean Validation) 제품 서비스에 넣는다.
 * 제품 서비스는 실행이 고른 공급자·모델의 선택 모델로 조립한 사본이다. 질문 구성과 응답 후처리는 제품 코드
 * 그대로이고 모델 호출만 고른 공급자로 간다. 필드 매핑 사본은 실행 설정의 배치 값을 쓴다.
 */
public final class ServiceProductCallGateway implements ProductCallGateway {

    /** 공급자·모델·배치 설정으로 필드 매핑 resolver를 만든다. 제품 resolver가 있으면 서버 동시 호출 상한을 공유한다. */
    @FunctionalInterface
    public interface FieldResolverFactory {
        ChoiceFieldResolver create(ChoiceModel model, int sectionConcurrency, int fieldBatchSize);
    }

    /** 제품 서비스를 조립하는 데 쓰는 공급자 무관 부품. */
    public record ProductParts(FormAnalysisRouter router, SectionCategories categories,
        InteractionObservationProjector projector, FieldInteractionPolicy interactionPolicy,
        SupportedProfileFields fields, FieldResolverFactory resolvers) {
    }

    private record Services(SectionClassificationService classification, InteractionDecisionService interactions,
        GenericFieldsService fields) {
    }

    private final JsonMapper mapper;
    private final Validator validator;
    private final EvaluationProviders providers;
    private final ProductParts parts;
    private final Map<String, Services> services = new ConcurrentHashMap<>();

    public ServiceProductCallGateway(JsonMapper mapper, Validator validator, EvaluationProviders providers,
        ProductParts parts) {
        this.mapper = mapper;
        this.validator = validator;
        this.providers = providers;
        this.parts = parts;
    }

    @Override
    public JsonNode call(CallKind kind, JsonNode request, CallTarget target) {
        Services selected = services(target);
        Object response = switch (kind) {
            case SECTION_CLASSIFY -> selected.classification().classify(read(request, SectionClassificationRequest.class));
            case INTERACTION_DECISION -> selected.interactions().decide(read(request, InteractionDecisionRequest.class));
            case GENERIC_FIELDS -> selected.fields().analyze(read(request, GenericFieldsRequest.class));
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

    private Services services(CallTarget target) {
        int concurrency = Integer.parseInt(target.settings().getOrDefault("section-concurrency", "3"));
        int batch = Integer.parseInt(target.settings().getOrDefault("field-batch-size", "5"));
        String key = target.provider() + "\u0000" + target.model() + "\u0000" + concurrency + "/" + batch;
        return services.computeIfAbsent(key, ignored -> {
            EvaluationProviders.Provider provider = providers.find(target.provider())
                .filter(found -> found.models().contains(target.model()))
                .orElseThrow(() -> new IllegalStateException("평가 공급자를 찾을 수 없습니다"));
            ChoiceModel model = provider.model().apply(target.model());
            return new Services(
                new SectionClassificationService(Optional.of(new ChoiceSectionClassifier(model, parts.categories())),
                    parts.router(), parts.categories()),
                new InteractionDecisionService(Optional.of(new ChoiceInteractionDecisions(model)), parts.router(),
                    parts.projector()),
                new GenericFieldsService(Optional.of(parts.resolvers().create(model, concurrency, batch)),
                    parts.router(), parts.interactionPolicy(), parts.fields()));
        });
    }
}
