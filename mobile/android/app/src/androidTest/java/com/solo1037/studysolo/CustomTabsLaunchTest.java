package com.solo1037.studysolo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/** Captures the app's actual outbound intent without depending on a browser package in the emulator. */
@RunWith(AndroidJUnit4.class)
public final class CustomTabsLaunchTest {
    private static final class ViewIntentMonitor extends Instrumentation.ActivityMonitor {
        private Intent capturedIntent;

        @Override
        public Instrumentation.ActivityResult onStartActivity(Intent intent) {
            if (intent != null
                    && Intent.ACTION_VIEW.equals(intent.getAction())
                    && Uri.parse(StudySoloSite.START_URL).equals(intent.getData())) {
                capturedIntent = new Intent(intent);
                return new Instrumentation.ActivityResult(Activity.RESULT_OK, null);
            }
            return super.onStartActivity(intent);
        }
    }

    @Test
    public void launcherEmitsCanonicalHttpsActionView() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        ViewIntentMonitor monitor = new ViewIntentMonitor();
        instrumentation.addMonitor(monitor);
        MainActivity activity = null;

        try {
            Intent launch = new Intent(instrumentation.getTargetContext(), MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = (MainActivity) instrumentation.startActivitySync(launch);

            assertNotNull("StudySolo launcher activity did not start", activity);
            assertTrue("Custom Tabs must send an actual ACTION_VIEW to Android", monitor.getHits() >= 1);
            assertNotNull("No browser intent was captured", monitor.capturedIntent);
            assertEquals(Intent.ACTION_VIEW, monitor.capturedIntent.getAction());
            assertEquals(Uri.parse(StudySoloSite.START_URL), monitor.capturedIntent.getData());
            assertEquals("https", monitor.capturedIntent.getData().getScheme());
            assertEquals(StudySoloSite.CANONICAL_HOST, monitor.capturedIntent.getData().getHost());
        } finally {
            instrumentation.removeMonitor(monitor);
            if (activity != null) {
                MainActivity runningActivity = activity;
                instrumentation.runOnMainSync(runningActivity::finish);
            }
        }
    }
}
