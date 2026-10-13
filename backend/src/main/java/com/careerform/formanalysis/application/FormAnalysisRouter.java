package com.careerform.formanalysis.application;

import java.util.regex.Pattern;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Optional;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.StoredPolicyActionResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFingerprint;
import com.careerform.formanalysis.application.policy.GreetingFormFingerprint;
import com.careerform.formanalysis.application.policy.HplaceFormFingerprint;
import com.careerform.formanalysis.application.port.HplacePolicyProvider;
import com.careerform.formanalysis.application.policy.GreetingFieldMappingResolver;
import com.careerform.formanalysis.application.policy.GreetingActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.application.port.GreetingDomainEvidence;
import com.careerform.formanalysis.application.port.GreetingPolicyProvider;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver;
import com.careerform.formanalysis.application.port.AnalysisRouteObserver.Operation;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
public final class FormAnalysisRouter {

    private static final Logger log = LoggerFactory.getLogger(FormAnalysisRouter.class);
    private static final Pattern HPLACE_HOST = Pattern.compile(
        "^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.(?:recruiter\\.co\\.kr|recruiter\\.im)$",
        Pattern.CASE_INSENSITIVE
    );
    private final HplacePolicyProvider hplacePolicyProvider;
    private final HplaceFormFingerprint hplaceFingerprint = new HplaceFormFingerprint();
    private final CompanyFormPolicyProvider policyProvider;
    private final GreetingPolicyProvider greetingPolicyProvider;
    private final GreetingDomainEvidence greetingDomainEvidence;
    private final Optional<AnalysisRouteObserver> observer;
    private final StoredPolicyFingerprint fingerprint = new StoredPolicyFingerprint();
    private final GreetingFormFingerprint greetingFingerprint = new GreetingFormFingerprint();

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider) {
        this(policyProvider, (host, path) -> GreetingDomainEvidence.Decision.NO_POSITIVE_EVIDENCE,
            CompanyFormPolicyProvider.Unavailable::new);
    }

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider) {
        this(policyProvider, greetingDomainEvidence, greetingPolicyProvider,
            CompanyFormPolicyProvider.Unavailable::new, Optional.empty());
    }

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider,
        HplacePolicyProvider hplacePolicyProvider) {
        this(policyProvider, greetingDomainEvidence, greetingPolicyProvider, hplacePolicyProvider, Optional.empty());
    }

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider,
        Optional<AnalysisRouteObserver> observer) {
        this(policyProvider, greetingDomainEvidence, greetingPolicyProvider,
            CompanyFormPolicyProvider.Unavailable::new, observer);
    }

    @Autowired
    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider,
        GreetingDomainEvidence greetingDomainEvidence, GreetingPolicyProvider greetingPolicyProvider,
        HplacePolicyProvider hplacePolicyProvider, Optional<AnalysisRouteObserver> observer) {
        this.hplacePolicyProvider = hplacePolicyProvider;
        this.policyProvider = policyProvider;
        this.greetingDomainEvidence = greetingDomainEvidence;
        this.greetingPolicyProvider = greetingPolicyProvider;
        this.observer = observer;
    }

    public ActionRoute route(PreparationAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        boolean greetingCandidate = false;
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(request.site().host(), request.site().pathPattern());
            if (lookup instanceof NotRegistered) {
                return observed(new ActionRoute(RouteKind.GENERIC, null), null);
            }
            greetingCandidate = !isHplaceApplicant(request.site().host(), request.site().pathPattern());
        }
        if (!(lookup instanceof Available available)) {
            return observed(new ActionRoute(RouteKind.POLICY_UNAVAILABLE, null, greetingCandidate), null);
        }
        CompanyFormPolicy policy = available.policy();
        if (!("hplace".equals(policy.companyKey())
            ? hplaceFingerprint.matches(request) : fingerprint.matches(policy, request))) {
            return observed(new ActionRoute(RouteKind.STRUCTURE_MISMATCH, null, greetingCandidate), policy);
        }
        return observed(new ActionRoute(
            RouteKind.ADAPTER,
            "greeting".equals(policy.companyKey()) ? new GreetingActionResolver()
                : new StoredPolicyActionResolver(policy),
            "greeting".equals(policy.companyKey())
        ), policy);
    }

    public FieldRoute route(FieldsAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        boolean greetingCandidate = false;
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(request.site().host(), request.site().pathPattern());
            if (lookup instanceof NotRegistered) {
                return observed(new FieldRoute(RouteKind.GENERIC, null), null, false);
            }
            greetingCandidate = !isHplaceApplicant(request.site().host(), request.site().pathPattern());
        }
        if (!(lookup instanceof Available available)) {
            return observed(new FieldRoute(RouteKind.POLICY_UNAVAILABLE, null), null, greetingCandidate);
        }
        CompanyFormPolicy policy = available.policy();
        boolean greeting = "greeting".equals(policy.companyKey());
        boolean hplace = "hplace".equals(policy.companyKey());
        if (!(hplace ? hplaceFingerprint.matches(request) : greeting
            ? greetingFingerprint.matches(request)
            : fingerprint.matches(policy, request))) {
            return observed(new FieldRoute(RouteKind.STRUCTURE_MISMATCH, null), policy, greeting);
        }
        return observed(new FieldRoute(
            RouteKind.ADAPTER,
            greeting ? new GreetingFieldMappingResolver(policy)
                : new StoredPolicyFieldMappingResolver(policy, hplace), greeting
        ), policy, greeting);
    }

    public GenericRouteKind routeGeneric(String host, String pathPattern) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            host,
            pathPattern
        );
        var greetingCandidate = false;
        if (lookup instanceof NotRegistered) {
            lookup = sharedLookup(host, pathPattern);
            greetingCandidate = !(lookup instanceof NotRegistered) && !isHplaceApplicant(host, pathPattern);
        }
        if (lookup instanceof NotRegistered) {
            observe(Operation.INTERACTION, RouteKind.GENERIC, false, null);
            return GenericRouteKind.GENERIC;
        }
        if (lookup instanceof Available available) {
            observe(Operation.INTERACTION, RouteKind.ADAPTER,
                "greeting".equals(available.policy().companyKey()), available.policy());
            return GenericRouteKind.STATIC_POLICY_PRESENT;
        }
        observe(Operation.INTERACTION, RouteKind.POLICY_UNAVAILABLE, greetingCandidate, null);
        return GenericRouteKind.POLICY_UNAVAILABLE;
    }

    private CompanyFormPolicyProvider.LookupResult sharedLookup(String host, String pathPattern) {
        if (isHplaceApplicant(host, pathPattern)) {
            if (!"/app/applicant/registResume".equals(pathPattern)) {
                return new CompanyFormPolicyProvider.Unavailable();
            }
            var lookup = hplacePolicyProvider.find();
            return lookup instanceof Available ? lookup : new CompanyFormPolicyProvider.Unavailable();
        }
        return greetingLookup(host, pathPattern);
    }

    private static boolean isHplaceApplicant(String host, String pathPattern) {
        return host != null && HPLACE_HOST.matcher(host).matches() && pathPattern != null
            && (pathPattern.startsWith("/app/applicant/") || pathPattern.equals("/app/applicant")
                || pathPattern.startsWith("/v1/applicant/") || pathPattern.equals("/v1/applicant"));
    }

    private ActionRoute observed(ActionRoute route, CompanyFormPolicy policy) {
        observe(Operation.PREPARATION, route.kind(), route.greeting()
            || (policy != null && "greeting".equals(policy.companyKey())), policy);
        return route;
    }

    private FieldRoute observed(FieldRoute route, CompanyFormPolicy policy, boolean greeting) {
        observe(Operation.FIELDS, route.kind(), greeting, policy);
        return route;
    }

    private void observe(Operation operation, RouteKind kind, boolean greeting, CompanyFormPolicy policy) {
        try {
            observer.ifPresent(value -> value.selected(new AnalysisRouteObserver.Decision(
                operation, kind, greeting, policy == null ? null : policy.companyKey(),
                policy == null ? null : policy.version())));
        } catch (RuntimeException exception) {
            log.warn("QUALITY_ROUTE_OBSERVATION_UNAVAILABLE operation={}", operation);
        }
    }

    private CompanyFormPolicyProvider.LookupResult greetingLookup(
        String host,
        String pathPattern
    ) {
        return switch (greetingDomainEvidence.classify(host, pathPattern)) {
            case POSITIVE -> greetingPolicyProvider.find();
            case NO_POSITIVE_EVIDENCE -> new NotRegistered();
            case RETRYABLE_FAILURE -> new CompanyFormPolicyProvider.Unavailable();
        };
    }

    public enum RouteKind {
        GENERIC,
        ADAPTER,
        STRUCTURE_MISMATCH,
        POLICY_UNAVAILABLE
    }

    public enum GenericRouteKind {
        GENERIC,
        STATIC_POLICY_PRESENT,
        POLICY_UNAVAILABLE
    }

    public record ActionRoute(RouteKind kind, ActionResolver resolver, boolean greeting) {

        public ActionRoute(RouteKind kind, ActionResolver resolver) {
            this(kind, resolver, false);
        }
    }

    public record FieldRoute(RouteKind kind, FieldMappingResolver resolver, boolean greeting) {
        public FieldRoute(RouteKind kind, FieldMappingResolver resolver) {
            this(kind, resolver, false);
        }
    }
}
