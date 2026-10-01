package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface FormAnalysisPolicyMongoRepository
    extends MongoRepository<FormAnalysisPolicyDocument, String> {

    Optional<FormAnalysisPolicyDocument> findByCompanyKeyAndVersion(
        String companyKey,
        long version
    );
}
