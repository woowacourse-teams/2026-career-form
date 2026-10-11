package com.careerform.quality;

import java.util.Locale;

public record QualitySite(String siteId, String host, Status status) {
    public enum Status { POLICY, TENANT, MANUAL, UNVERIFIED }

    public static QualitySite identify(String sourceHost, String company, boolean greeting, boolean manuallyConfirmed, String runScope) {
        var host = sourceHost.toLowerCase(Locale.ROOT);
        if (!host.matches("[a-z0-9][a-z0-9.-]{0,252}(?::[0-9]{1,5})?")) {
            throw new IllegalArgumentException("Invalid quality site");
        }
        if (!greeting && company != null && company.matches("[A-Za-z0-9_-]{1,64}") && !company.equals("greeting")) {
            return new QualitySite(host + "|company=" + company, host, Status.POLICY);
        }
        if (greeting && host.matches("[a-z0-9][a-z0-9-]*\\.career\\.greetinghr\\.com")) {
            return new QualitySite(host, host, Status.TENANT);
        }
        if (manuallyConfirmed) { return new QualitySite(host, host, Status.MANUAL); }
        return new QualitySite(host + "|unverified=" + QualityProjection.digest(runScope), host, Status.UNVERIFIED);
    }
}
