package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.util.Optional;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface FormAnalysisCompanyMongoRepository
    extends MongoRepository<FormAnalysisCompanyDocument, String> {

    Optional<FormAnalysisCompanyDocument> findByHost(String host);
}
