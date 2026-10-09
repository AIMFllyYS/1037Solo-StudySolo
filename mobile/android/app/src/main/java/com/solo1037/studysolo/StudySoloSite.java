package com.solo1037.studysolo;

import java.net.URI;

/** Canonical HTTPS entry point for the external system-browser shell. */
public final class StudySoloSite {
    public static final String START_URL = "https://studysolo.1037solo.com/";
    public static final String CANONICAL_HOST = "studysolo.1037solo.com";

    private StudySoloSite() {
    }

    public static URI startUri() {
        return URI.create(START_URL);
    }

    public static boolean isCanonicalHttpsUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        try {
            URI uri = URI.create(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && CANONICAL_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getUserInfo() == null;
        } catch (IllegalArgumentException error) {
            return false;
        }
    }
}
