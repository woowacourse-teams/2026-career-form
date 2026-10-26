package com.careerform.notification;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;

/** 테스트 실행 시점에 생성하는 합성 VAPID 키. 저장소에는 어떤 키 값도 두지 않는다. */
final class VapidTestKeys {
    final KeyPair pair;
    final String publicKey;
    final String privateKey;
    final String pkcs8PrivateKey;

    private VapidTestKeys(KeyPair pair) {
        this.pair = pair;
        var ecPublic = (ECPublicKey) pair.getPublic();
        var ecPrivate = (ECPrivateKey) pair.getPrivate();
        var point = new byte[65];
        point[0] = 4;
        System.arraycopy(fixed(ecPublic.getW().getAffineX(), 32), 0, point, 1, 32);
        System.arraycopy(fixed(ecPublic.getW().getAffineY(), 32), 0, point, 33, 32);
        this.publicKey = base64Url(point);
        this.privateKey = base64Url(fixed(ecPrivate.getS(), 32));
        this.pkcs8PrivateKey = base64Url(ecPrivate.getEncoded());
    }

    static VapidTestKeys generate() {
        try {
            var generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"));
            return new VapidTestKeys(generator.generateKeyPair());
        } catch (java.security.GeneralSecurityException exception) {
            throw new IllegalStateException(exception);
        }
    }

    static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static byte[] fixed(BigInteger value, int length) {
        var raw = value.toByteArray();
        if (raw.length == length) { return raw; }
        if (raw.length > length) { return Arrays.copyOfRange(raw, raw.length - length, raw.length); }
        var padded = new byte[length];
        System.arraycopy(raw, 0, padded, length - raw.length, raw.length);
        return padded;
    }
}
