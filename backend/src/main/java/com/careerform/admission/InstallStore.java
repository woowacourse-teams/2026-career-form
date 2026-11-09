package com.careerform.admission;

import java.util.Optional;

public interface InstallStore {
    Optional<InstallRecord> find(String id);
    Optional<InstallRecord> registration(String keyHash);
    boolean insert(InstallRecord record);
}
