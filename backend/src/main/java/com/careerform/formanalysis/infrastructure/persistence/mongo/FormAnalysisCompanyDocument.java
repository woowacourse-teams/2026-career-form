package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.List;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("form_analysis_companies")
public record FormAnalysisCompanyDocument(
    @Id String id,
    @Indexed(unique = true) String companyKey,
    @Indexed(unique = true) String host,
    List<String> pathPrefixes,
    long activePolicyVersion
) {

    public FormAnalysisCompanyDocument {
        pathPrefixes = pathPrefixes == null ? null : List.copyOf(pathPrefixes);
    }
}
