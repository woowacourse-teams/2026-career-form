package com.careerform.notification;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.interfaces.ECPrivateKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPublicKeySpec;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** 브라우저(수신 측) 역할의 RFC 8291 aes128gcm 복호화. 라이브러리 출력이 실제 수신기에서 풀리는지 확인한다. */
final class WebPushReceiver {
    private WebPushReceiver() { }

    static byte[] decrypt(ECPrivateKey uaPrivate, byte[] uaPublic, byte[] authSecret, byte[] body) throws GeneralSecurityException {
        var buffer = ByteBuffer.wrap(body);
        var salt = new byte[16];
        buffer.get(salt);
        buffer.getInt();
        var asPublic = new byte[buffer.get() & 0xff];
        buffer.get(asPublic);
        var ciphertext = new byte[buffer.remaining()];
        buffer.get(ciphertext);

        var agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(uaPrivate);
        agreement.doPhase(publicKey(asPublic), true);
        var ecdhSecret = agreement.generateSecret();
        var ikm = expand(hmac(authSecret, ecdhSecret), concat("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), uaPublic, asPublic), 32);
        var prk = hmac(salt, ikm);
        var contentKey = expand(prk, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        var nonce = expand(prk, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(contentKey, "AES"), new GCMParameterSpec(128, nonce));
        var padded = cipher.doFinal(ciphertext);
        var end = padded.length - 1;
        while (end >= 0 && padded[end] == 0) { end--; }
        if (end < 0 || padded[end] != 2) { throw new GeneralSecurityException("Missing last-record delimiter"); }
        return Arrays.copyOf(padded, end);
    }

    private static java.security.PublicKey publicKey(byte[] uncompressed) throws GeneralSecurityException {
        var parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        var point = new ECPoint(new BigInteger(1, Arrays.copyOfRange(uncompressed, 1, 33)), new BigInteger(1, Arrays.copyOfRange(uncompressed, 33, 65)));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(point, parameters.getParameterSpec(ECParameterSpec.class)));
    }

    private static byte[] expand(byte[] prk, byte[] info, int length) throws GeneralSecurityException {
        return Arrays.copyOf(hmac(prk, concat(info, new byte[] {1})), length);
    }

    private static byte[] hmac(byte[] key, byte[] data) throws GeneralSecurityException {
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key, "HmacSHA256"));
        return mac.doFinal(data);
    }

    private static byte[] concat(byte[]... parts) {
        var length = Arrays.stream(parts).mapToInt(part -> part.length).sum();
        var result = new byte[length];
        var offset = 0;
        for (var part : parts) {
            System.arraycopy(part, 0, result, offset, part.length);
            offset += part.length;
        }
        return result;
    }
}
