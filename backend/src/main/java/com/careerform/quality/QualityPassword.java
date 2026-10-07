package com.careerform.quality;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

final class QualityPassword {

    private final int iterations;
    private final byte[] salt;
    private final byte[] expected;

    private QualityPassword(int iterations, byte[] salt, byte[] expected) {
        this.iterations = iterations;
        this.salt = salt.clone();
        this.expected = expected.clone();
    }

    static Optional<QualityPassword> from(String encoded) {
        if (encoded == null || encoded.length() > 512) {
            return Optional.empty();
        }
        try {
            var parts = encoded.split("\\$", -1);
            if (parts.length != 4 || !parts[0].equals("pbkdf2-sha256")) {
                return Optional.empty();
            }
            var iterations = Integer.parseInt(parts[1]);
            var salt = Base64.getDecoder().decode(parts[2]);
            var expected = Base64.getDecoder().decode(parts[3]);
            if (iterations < 600_000 || iterations > 2_000_000
                || salt.length < 16 || salt.length > 64 || expected.length != 32) {
                return Optional.empty();
            }
            return Optional.of(new QualityPassword(iterations, salt, expected));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    boolean matches(String password) {
        if (password == null || password.isEmpty() || password.length() > 1024) {
            return false;
        }
        var spec = new PBEKeySpec(password.toCharArray(), salt, iterations, expected.length * 8);
        try {
            var actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return MessageDigest.isEqual(expected, actual);
        } catch (GeneralSecurityException exception) {
            return false;
        } finally {
            spec.clearPassword();
        }
    }
}
