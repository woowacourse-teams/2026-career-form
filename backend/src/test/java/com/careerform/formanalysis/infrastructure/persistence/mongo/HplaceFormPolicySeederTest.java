package com.careerform.formanalysis.infrastructure.persistence.mongo;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class HplaceFormPolicySeederTest {
    @Test
    void preservesExistingPolicyDocumentsOnRestart() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        when(policies.findByCompanyKeyAndVersion(any(), anyLong()))
            .thenReturn(Optional.of(HplaceCompanyFormPolicyFactory.create()));
        new HplaceFormPolicySeeder(policies).run(null);
        verify(policies, never()).save(any());
        verify(policies, never()).insert(any(FormAnalysisPolicyDocument.class));
    }

    @Test
    void insertsBothHplaceVersionsWhenMissing() {
        var policies = mock(FormAnalysisPolicyMongoRepository.class);
        when(policies.findByCompanyKeyAndVersion(any(), anyLong())).thenReturn(Optional.empty());
        new HplaceFormPolicySeeder(policies).run(null);
        var inserted = org.mockito.ArgumentCaptor.forClass(FormAnalysisPolicyDocument.class);
        verify(policies, times(2)).insert(inserted.capture());
        org.assertj.core.api.Assertions.assertThat(inserted.getAllValues()).extracting(FormAnalysisPolicyDocument::version).containsExactly(3L, 4L);
        verify(policies, never()).save(any());
    }

    @Test
    void seedsEveryDeployedProfileLikeTheStartupSeeder() {
        var profiles = HplaceFormPolicySeeder.class.getAnnotation(org.springframework.context.annotation.Profile.class).value();
        org.assertj.core.api.Assertions.assertThat(profiles).containsExactlyInAnyOrder("local", "dev", "staging", "prod");
        org.assertj.core.api.Assertions.assertThat(profiles)
            .containsExactlyInAnyOrder(StartupPolicySeeder.class.getAnnotation(org.springframework.context.annotation.Profile.class).value());
    }

    @Test
    void shippedNativePolicyIsPinnedToItsVersion() throws Exception {
        // Insert-only seeding never updates a stored version. Any change to this file must ship as a
        // new version (hplace-mrs2-v5.json + factory + active-version default), then update this hash.
        try (var source = getClass().getResourceAsStream("/policies/hplace-mrs2-v4.json")) {
            var digest = java.security.MessageDigest.getInstance("SHA-256").digest(source.readAllBytes());
            org.assertj.core.api.Assertions.assertThat(java.util.HexFormat.of().formatHex(digest))
                .as("hplace-mrs2-v4.json은 insert-only 시드 대상입니다. 정책을 바꾸면 v5로 추가하고 이 해시를 갱신하세요")
                .isEqualTo("1e249f24cdad2cf7d5ff74fe459093b7b29e0f4dee16c904cb5a5bf889578979");
        }
    }
}
