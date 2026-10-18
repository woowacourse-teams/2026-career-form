package com.careerform.formanalysis.application.policy;

import java.util.Locale;
import java.util.regex.Pattern;

/** Shared supplier evidence; a site match never substitutes for a DOM fingerprint. */
public final class HplaceApplicantSite {
    public static final String DETAIL_PATH = "/mrs2/applicant/resume/writeResume";
    public static final String REGISTRATION_PATH = "/app/applicant/registResume";
    private static final Pattern HOST = Pattern.compile("^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.(?:recruiter\\.co\\.kr|recruiter\\.im)$");
    private HplaceApplicantSite() { }
    public static boolean supplierHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase(Locale.ROOT);
        if (normalized.endsWith(".")) normalized = normalized.substring(0, normalized.length() - 1);
        return HOST.matcher(normalized).matches();
    }
    public static boolean matches(String host, String path) {
        return supplierHost(host) && path != null
            && (path.equals("/app/applicant") || path.startsWith("/app/applicant/")
                || path.equals("/mrs2/applicant/resume") || path.startsWith("/mrs2/applicant/resume/")
                || path.equals("/v1/applicant") || path.startsWith("/v1/applicant/"));
    }
}
