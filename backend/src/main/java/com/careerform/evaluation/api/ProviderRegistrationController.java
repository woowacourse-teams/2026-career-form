package com.careerform.evaluation.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.careerform.evaluation.provider.ProviderChange;
import com.careerform.evaluation.provider.ProviderRegistration;
import com.careerform.evaluation.provider.ProviderRegistry;
import com.careerform.evaluation.provider.ProviderRejected;

/**
 * 평가 공급자 등록 API. 품질 확인 비밀번호로 보호한다(QualityApiFilter). 키 원문은 받지도 돌려주지도 않고, 서버 키 묶음의
 * 이름과 허용 호스트만 보인다. 등록 즉시 평가 공급자 목록에 반영된다.
 */
@RestController
@ConditionalOnProtectedEvaluation
@RequestMapping("/api/v1/evaluations/provider-registrations")
public final class ProviderRegistrationController {

    private static final Pattern REQUESTER = Pattern.compile("[0-9A-Za-z가-힣._-]{1,32}");
    private static final String DEFAULT_REQUESTER = "quality-admin";

    private final ProviderRegistry registry;

    public ProviderRegistrationController(ProviderRegistry registry) {
        this.registry = registry;
    }

    public record KeyView(String name, List<String> hosts) {
    }

    public record RegistrationsView(List<KeyView> keys, List<ProviderRegistration> registrations) {
    }

    @GetMapping
    public RegistrationsView list() {
        List<KeyView> keys = registry.keyHosts().entrySet().stream()
            .map(entry -> new KeyView(entry.getKey(), List.copyOf(entry.getValue()))).toList();
        return new RegistrationsView(keys, registry.list());
    }

    @PostMapping
    public ResponseEntity<ProviderRegistration> save(@RequestBody ProviderRegistry.Input input,
        @RequestHeader(value = "X-Evaluation-Requester", required = false) String requester) {
        return ResponseEntity.status(HttpStatus.CREATED).body(registry.save(input, requester(requester)));
    }

    @PostMapping("/{name}/disable")
    public ProviderRegistration disable(@PathVariable String name,
        @RequestHeader(value = "X-Evaluation-Requester", required = false) String requester) {
        return registry.disable(name, requester(requester));
    }

    @GetMapping("/{name}/changes")
    public List<ProviderChange> changes(@PathVariable String name) {
        return registry.changes(name);
    }

    @ExceptionHandler(ProviderRejected.class)
    ResponseEntity<Map<String, Object>> rejected(ProviderRejected rejected) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("code", rejected.code());
        HttpStatus status = rejected.code() == ProviderRejected.Code.UNKNOWN_PROVIDER
            ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        return ResponseEntity.status(status).body(body);
    }

    private static String requester(String header) {
        return header != null && REQUESTER.matcher(header).matches() ? header : DEFAULT_REQUESTER;
    }
}
