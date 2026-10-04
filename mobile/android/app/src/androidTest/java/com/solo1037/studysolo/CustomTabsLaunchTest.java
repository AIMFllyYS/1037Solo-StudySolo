package com.solo1037.studysolo;

import static androidx.test.espresso.intent.Intents.intended;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasData;
import static org.hamcrest.Matchers.allOf;

import android.content.Intent;
import android.net.Uri;

import androidx.test.espresso.intent.rule.IntentsTestRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public final class CustomTabsLaunchTest {
    @Rule
    public final IntentsTestRule<MainActivity> activityRule =
            new IntentsTestRule<>(MainActivity.class, true, false);

    @Test
    public void launcherHandsCanonicalHttpsUrlToSystemBrowser() {
        activityRule.launchActivity(new Intent());

        intended(allOf(
                hasAction(Intent.ACTION_VIEW),
                hasData(Uri.parse(StudySoloSite.START_URL))));
    }
}
