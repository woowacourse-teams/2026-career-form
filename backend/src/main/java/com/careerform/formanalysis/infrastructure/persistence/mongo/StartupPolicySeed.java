package com.careerform.formanalysis.infrastructure.persistence.mongo;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.bson.Document;
import org.springframework.stereotype.Component;

/** The policy seed bundled with the deployed commit. It names each company's active policy version. */
@Component
public final class StartupPolicySeed {
    static final String RESOURCE = "/policies/startup-policy-seed-v1.json";

    public record Company(String id, String companyKey, String host, long activePolicyVersion) {}

    private final Document document;

    public StartupPolicySeed() {
        try (var source = getClass().getResourceAsStream(RESOURCE)) {
            if (source == null) throw new IllegalStateException("Startup policy seed missing");
            document = Document.parse(new String(source.readAllBytes(), StandardCharsets.UTF_8));
        } catch (java.io.IOException unreadable) {
            throw new IllegalStateException("Startup policy seed unreadable", unreadable);
        }
    }

    Document document() {
        return document;
    }

    public List<Company> companies() {
        return document.getList("companies", Document.class).stream()
            .map(c -> new Company(c.getString("_id"), c.getString("companyKey"), c.getString("host"),
                c.get("activePolicyVersion", Number.class).longValue()))
            .toList();
    }

    public boolean hasPolicy(String companyKey, long version) {
        return document.getList("policies", Document.class).stream().anyMatch(p ->
            companyKey.equals(p.getString("companyKey")) && p.get("version", Number.class).longValue() == version);
    }
}
