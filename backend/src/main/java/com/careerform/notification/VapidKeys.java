package com.careerform.notification;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;

/**
 * VAPID(RFC 8292) 키 설정. 공개키는 base64url 65바이트 비압축 P-256 점, 비공개키는 base64url 32바이트 스칼라 또는 PKCS#8이다.
 * 오류 메시지에 키 값을 넣지 않는다.
 */
public final class VapidKeys {
    private static final int UNCOMPRESSED_POINT_LENGTH = 65;
    private static final int SCALAR_LENGTH = 32;
    private static final byte[] PROBE = "career-form vapid self-test".getBytes(StandardCharsets.UTF_8);
    private final ECPublicKey publicKey;
    private final ECPrivateKey privateKey;
    private final String encodedPublicKey;
    private final String subject;

    private VapidKeys(ECPublicKey publicKey, ECPrivateKey privateKey, String encodedPublicKey, String subject) {
        this.publicKey = publicKey;
        this.privateKey = privateKey;
        this.encodedPublicKey = encodedPublicKey;
        this.subject = subject;
    }

    public static VapidKeys parse(String publicKey, String privateKey, String subject) {
        var publicBytes = decode(publicKey, "VAPID public key");
        var privateBytes = decode(privateKey, "VAPID private key");
        if (subject == null || subject.length() > 256 || !(subject.startsWith("mailto:") && subject.length() > 7 || subject.startsWith("https://") && subject.length() > 8)) {
            throw new IllegalArgumentException("VAPID subject must be a mailto: or https: URI");
        }
        if (publicBytes.length != UNCOMPRESSED_POINT_LENGTH || publicBytes[0] != 4) {
            throw new IllegalArgumentException("VAPID public key must be a 65-byte uncompressed P-256 point");
        }
        try {
            var parameters = p256();
            var factory = KeyFactory.getInstance("EC");
            var point = new ECPoint(new BigInteger(1, Arrays.copyOfRange(publicBytes, 1, 33)), new BigInteger(1, Arrays.copyOfRange(publicBytes, 33, 65)));
            var ecPublic = (ECPublicKey) factory.generatePublic(new ECPublicKeySpec(point, parameters));
            var ecPrivate = (ECPrivateKey) (privateBytes.length == SCALAR_LENGTH
                ? factory.generatePrivate(new ECPrivateKeySpec(new BigInteger(1, privateBytes), parameters))
                : factory.generatePrivate(new PKCS8EncodedKeySpec(privateBytes)));
            verifyPair(ecPublic, ecPrivate);
            return new VapidKeys(ecPublic, ecPrivate, Base64.getUrlEncoder().withoutPadding().encodeToString(publicBytes), subject);
        } catch (GeneralSecurityException | IllegalStateException exception) {
            throw new IllegalArgumentException("VAPID key pair cannot be read as P-256 keys");
        }
    }

    /** 확장이 pushManager.subscribe의 applicationServerKey로 쓰는 base64url 공개키. */
    public String publicKey() { return encodedPublicKey; }

    public String subject() { return subject; }

    public ECPublicKey ecPublicKey() { return publicKey; }

    public ECPrivateKey ecPrivateKey() { return privateKey; }

    @Override
    public String toString() { return "VapidKeys[subject=" + subject + "]"; }

    private static byte[] decode(String value, String name) {
        if (value == null || value.isBlank()) { throw new IllegalArgumentException(name + " is not configured"); }
        var trimmed = value.strip();
        try {
            return Base64.getUrlDecoder().decode(trimmed);
        } catch (IllegalArgumentException urlFailure) {
            try {
                return Base64.getDecoder().decode(trimmed);
            } catch (IllegalArgumentException failure) {
                throw new IllegalArgumentException(name + " is not base64url");
            }
        }
    }

    private static ECParameterSpec p256() throws GeneralSecurityException {
        var parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        return parameters.getParameterSpec(ECParameterSpec.class);
    }

    private static void verifyPair(ECPublicKey ecPublic, ECPrivateKey ecPrivate) throws GeneralSecurityException {
        var signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(ecPrivate);
        signature.update(PROBE);
        var signed = signature.sign();
        signature.initVerify(ecPublic);
        signature.update(PROBE);
        if (!signature.verify(signed)) { throw new IllegalArgumentException("VAPID public key does not match the private key"); }
        Objects.requireNonNull(ecPublic.getW());
    }
}
