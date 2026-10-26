package com.careerform.notification;

import java.security.SecureRandom;
import java.util.HexFormat;

final class Identifiers {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Identifiers() { }

    static String random() {
        var bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
