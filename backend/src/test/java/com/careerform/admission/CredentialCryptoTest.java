package com.careerform.admission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.util.Base64;
import org.junit.jupiter.api.Test;

class CredentialCryptoTest {
    @Test
    void authenticatedEncryptionRejectsTamperingAndAnotherRegistration() {
        var crypto = new CredentialCrypto(Base64.getEncoder().encodeToString(new byte[32]));
        var sealed = crypto.seal("synthetic-token", "registration-a");
        assertThat(sealed).doesNotContain("synthetic-token");
        assertThat(crypto.open(sealed, "registration-a")).isEqualTo("synthetic-token");
        assertThatThrownBy(() -> crypto.open(sealed, "registration-b")).isInstanceOf(AdmissionFailure.class);
        var tampered = Base64.getDecoder().decode(sealed);
        tampered[tampered.length - 1] ^= 1;
        assertThatThrownBy(() -> crypto.open(Base64.getEncoder().encodeToString(tampered), "registration-a"))
            .isInstanceOf(AdmissionFailure.class);
        assertThatThrownBy(() -> new CredentialCrypto("invalid")).isInstanceOf(IllegalArgumentException.class);
        assertThat(crypto.digest("network", "synthetic")).isNotEqualTo(crypto.digest("registration", "synthetic"));
        assertThat(crypto.token()).hasSize(64).isNotEqualTo(crypto.token());
    }
}
