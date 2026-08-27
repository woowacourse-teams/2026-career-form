package com.careerform.formanalysis.application;

import java.util.List;

import org.springframework.stereotype.Component;

import com.careerform.formanalysis.application.port.ActionResolver;
import com.careerform.formanalysis.application.port.CompanyFormAnalysisAdapter;
import com.careerform.formanalysis.application.port.FieldMappingResolver;
import com.careerform.formanalysis.dto.FieldsAnalysisRequest;
import com.careerform.formanalysis.dto.PreparationAnalysisRequest;

@Component
public final class FormAnalysisRouter {

    private final List<CompanyFormAnalysisAdapter> adapters;

    public FormAnalysisRouter(List<CompanyFormAnalysisAdapter> adapters) {
        this.adapters = List.copyOf(adapters);
    }

    public ActionRoute route(PreparationAnalysisRequest request) {
        for (CompanyFormAnalysisAdapter adapter : adapters) {
            if (!adapter.isCandidate(request)) {
                continue;
            }
            if (!adapter.matchesFingerprint(request)) {
                return new ActionRoute(RouteKind.STRUCTURE_MISMATCH, null);
            }
            return new ActionRoute(RouteKind.ADAPTER, adapter.actionResolver());
        }
        return new ActionRoute(RouteKind.GENERIC, null);
    }

    public FieldRoute route(FieldsAnalysisRequest request) {
        for (CompanyFormAnalysisAdapter adapter : adapters) {
            if (!adapter.isCandidate(request)) {
                continue;
            }
            if (!adapter.matchesFingerprint(request)) {
                return new FieldRoute(RouteKind.STRUCTURE_MISMATCH, null);
            }
            return new FieldRoute(RouteKind.ADAPTER, adapter.fieldMappingResolver());
        }
        return new FieldRoute(RouteKind.GENERIC, null);
    }

    public enum RouteKind {
        GENERIC,
        ADAPTER,
        STRUCTURE_MISMATCH
    }

    public record ActionRoute(RouteKind kind, ActionResolver resolver) {
    }

    public record FieldRoute(RouteKind kind, FieldMappingResolver resolver) {
    }
}
