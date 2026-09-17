package com.careerform.architecture.fixture.invalid.domain;

import org.springframework.data.repository.Repository;

public final class InvalidRepositoryDomain {

    private final Repository<Object, String> repository;

    public InvalidRepositoryDomain(Repository<Object, String> repository) {
        this.repository = repository;
    }

    public Repository<Object, String> repository() {
        return repository;
    }
}
