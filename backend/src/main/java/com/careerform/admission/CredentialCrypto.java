package com.careerform.admission;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

public final class CredentialCrypto {
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public CredentialCrypto(String encoded) {
        byte[] decoded;
        try { decoded = Base64.getDecoder().decode(encoded); }
        catch (IllegalArgumentException error) { throw new IllegalArgumentException("Invalid admission encryption key"); }
        if (decoded.length != 32) throw new IllegalArgumentException("Admission encryption key must contain 32 bytes");
        key = new SecretKeySpec(decoded, "AES");
    }

    public String token() {
        var bytes = new byte[32];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    public String digest(String namespace, String value) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getEncoded(), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((namespace + "\u0000" + value).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException error) { throw AdmissionFailure.unavailable(); }
    }

    public String tokenHash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (GeneralSecurityException error) { throw AdmissionFailure.unavailable(); }
    }

    public boolean matches(String token, String hash) {
        return hash != null && MessageDigest.isEqual(tokenHash(token).getBytes(StandardCharsets.US_ASCII), hash.getBytes(StandardCharsets.US_ASCII));
    }

    public String seal(String value, String identity) {
        var nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            var cipher = cipher(Cipher.ENCRYPT_MODE, nonce, identity);
            var encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (GeneralSecurityException error) { throw AdmissionFailure.unavailable(); }
    }

    public String open(String sealed, String identity) {
        try {
            var buffer = ByteBuffer.wrap(Base64.getDecoder().decode(sealed));
            var nonce = new byte[12];
            buffer.get(nonce);
            var encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            return new String(cipher(Cipher.DECRYPT_MODE, nonce, identity).doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | RuntimeException error) { throw AdmissionFailure.unavailable(); }
    }

    private Cipher cipher(int mode, byte[] nonce, String identity) throws GeneralSecurityException {
        var cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(identity.getBytes(StandardCharsets.UTF_8));
        return cipher;
    }
}
