package com.careerform.formanalysis.application;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.policy.CompanyFormPolicy;
import com.careerform.formanalysis.application.policy.StoredPolicyActionResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFieldMappingResolver;
import com.careerform.formanalysis.application.policy.StoredPolicyFingerprint;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.Available;
import com.careerform.formanalysis.application.port.CompanyFormPolicyProvider.NotRegistered;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
public final class FormAnalysisRouter {

    private final CompanyFormPolicyProvider policyProvider;
    private final StoredPolicyFingerprint fingerprint = new StoredPolicyFingerprint();

    public FormAnalysisRouter(CompanyFormPolicyProvider policyProvider) {
        this.policyProvider = policyProvider;
    }

    public ActionRoute route(PreparationAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        if (lookup instanceof NotRegistered) {
            return new ActionRoute(RouteKind.GENERIC, null);
        }
        if (!(lookup instanceof Available available)) {
            return new ActionRoute(RouteKind.POLICY_UNAVAILABLE, null);
        }
        CompanyFormPolicy policy = available.policy();
        if (!fingerprint.matches(policy, request)) {
            return new ActionRoute(RouteKind.STRUCTURE_MISMATCH, null);
        }
        return new ActionRoute(
            RouteKind.ADAPTER,
            new StoredPolicyActionResolver(policy)
        );
    }

    public FieldRoute route(FieldsAnalysisRequest request) {
        CompanyFormPolicyProvider.LookupResult lookup = policyProvider.find(
            request.site().host(),
            request.site().pathPattern()
        );
        if (lookup instanceof NotRegistered) {
            return new FieldRoute(RouteKind.GENERIC, null);
        }
        if (!(lookup instanceof Available available)) {
            return new FieldRoute(RouteKind.POLICY_UNAVAILABLE, null);
        }
        CompanyFormPolicy policy = available.policy();
        if (!fingerprint.matches(policy, request)) {
            return new FieldRoute(RouteKind.STRUCTURE_MISMATCH, null);
        }
        return new FieldRoute(
            RouteKind.ADAPTER,
            new StoredPolicyFieldMappingResolver(policy)
        );
    }

    public enum RouteKind {
        GENERIC,
        ADAPTER,
        STRUCTURE_MISMATCH,
        POLICY_UNAVAILABLE
    }

    public record ActionRoute(RouteKind kind, ActionResolver resolver) {
    }

    public record FieldRoute(RouteKind kind, FieldMappingResolver resolver) {
    }
}
