package com.careerform.evaluation.provider;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

/** 테스트와 Mongo 없는 실행용 메모리 저장소. */
public final class InMemoryProviderRegistrationStore implements ProviderRegistrationStore {

    private final Map<String, ProviderRegistration> registrations = new TreeMap<>();
    private final List<ProviderChange> changes = new ArrayList<>();

    @Override
    public synchronized Optional<ProviderRegistration> find(String name) {
        return Optional.ofNullable(registrations.get(name));
    }

    @Override
    public synchronized List<ProviderRegistration> list() {
        return List.copyOf(registrations.values());
    }

    @Override
    public synchronized void save(ProviderRegistration registration) {
        registrations.put(registration.name(), registration);
    }

    @Override
    public synchronized void appendChange(ProviderChange change) {
        changes.add(change);
    }

    @Override
    public synchronized List<ProviderChange> changes(String name) {
        return changes.stream().filter(change -> change.name().equals(name)).toList();
    }
}
