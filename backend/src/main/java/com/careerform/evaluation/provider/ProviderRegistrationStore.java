package com.careerform.evaluation.provider;

import java.util.List;
import java.util.Optional;

/** 평가 공급자 등록과 변경 기록 저장소. */
public interface ProviderRegistrationStore {

    Optional<ProviderRegistration> find(String name);

    /** 이름 순서. */
    List<ProviderRegistration> list();

    void save(ProviderRegistration registration);

    void appendChange(ProviderChange change);

    /** 오래된 순서. */
    List<ProviderChange> changes(String name);
}
