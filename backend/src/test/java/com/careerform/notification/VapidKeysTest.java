package com.careerform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("VAPID 키 설정 해석")
class VapidKeysTest {
    private static final String SUBJECT = "mailto:synthetic@example.test";
    private final VapidTestKeys keys = VapidTestKeys.generate();

    @Test
    @DisplayName("base64url 비압축 공개키와 32바이트 비공개키를 읽는다")
    void parsesRawBase64UrlKeyPair() {
        var parsed = VapidKeys.parse(keys.publicKey, keys.privateKey, SUBJECT);
        assertThat(parsed.publicKey()).isEqualTo(keys.publicKey);
        assertThat(parsed.subject()).isEqualTo(SUBJECT);
        assertThat(parsed.ecPublicKey().getW()).isEqualTo(((ECPublicKey) keys.pair.getPublic()).getW());
        assertThat(parsed.ecPrivateKey().getS()).isEqualTo(((ECPrivateKey) keys.pair.getPrivate()).getS());
    }

    @Test
    @DisplayName("PKCS#8 형식 비공개키도 읽는다")
    void parsesPkcs8PrivateKey() {
        var parsed = VapidKeys.parse(keys.publicKey, keys.pkcs8PrivateKey, "https://career-form.example.test");
        assertThat(parsed.ecPrivateKey().getS()).isEqualTo(((ECPrivateKey) keys.pair.getPrivate()).getS());
        assertThat(parsed.subject()).isEqualTo("https://career-form.example.test");
    }

    @Test
    @DisplayName("공개키와 비공개키가 한 쌍이 아니면 키 값을 드러내지 않고 거절한다")
    void rejectsMismatchedPairWithoutLeakingKeys() {
        var other = VapidTestKeys.generate();
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, other.privateKey, SUBJECT))
            .isInstanceOf(IllegalArgumentException.class)
            .satisfies(exception -> assertThat(exception.getMessage())
                .doesNotContain(keys.publicKey, other.privateKey, keys.privateKey)
                .doesNotContain(keys.publicKey.substring(0, 20)));
    }

    @Test
    @DisplayName("빈 값, 잘못된 인코딩, mailto나 https가 아닌 subject는 거절한다")
    void rejectsMissingOrMalformedConfiguration() {
        assertThatThrownBy(() -> VapidKeys.parse("", keys.privateKey, SUBJECT)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, " ", SUBJECT)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, null, SUBJECT)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse("not-base64!!", keys.privateKey, SUBJECT)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, "AQID", SUBJECT)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, keys.privateKey, "synthetic@example.test")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, keys.privateKey, "")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VapidKeys.parse(keys.publicKey, keys.privateKey, "http://career-form.example.test")).isInstanceOf(IllegalArgumentException.class);
    }
}
