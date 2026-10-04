package com.solo1037.studysolo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.net.URI;

import org.junit.Test;

public final class StudySoloSiteTest {
    @Test
    public void launchUrlUsesTheCanonicalHttpsOrigin() {
        URI uri = StudySoloSite.startUri();

        assertEquals("https", uri.getScheme());
        assertEquals(StudySoloSite.CANONICAL_HOST, uri.getHost());
        assertEquals("/", uri.getPath());
        assertTrue(StudySoloSite.isCanonicalHttpsUrl(StudySoloSite.START_URL));
    }

    @Test
    public void launchUrlPolicyRejectsHttpAndOtherHosts() {
        assertFalse(StudySoloSite.isCanonicalHttpsUrl("http://studysolo.1037solo.com/"));
        assertFalse(StudySoloSite.isCanonicalHttpsUrl("https://example.com/"));
        assertFalse(StudySoloSite.isCanonicalHttpsUrl("https://studysolo.1037solo.com@evil.example/"));
        assertFalse(StudySoloSite.isCanonicalHttpsUrl(null));
    }
}
