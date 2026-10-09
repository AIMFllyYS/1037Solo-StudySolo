package com.solo1037.studysolo;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;

import androidx.browser.customtabs.CustomTabsIntent;

/** Thin launcher: authentication and StudySolo data stay in the system browser. */
public final class MainActivity extends Activity {
    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        statusView = findViewById(R.id.launch_status);
        Button openButton = findViewById(R.id.open_studysolo_button);
        openButton.setOnClickListener(view -> openStudySolo());

        if (savedInstanceState == null) {
            openStudySolo();
        }
    }

    private void openStudySolo() {
        if (!StudySoloSite.isCanonicalHttpsUrl(StudySoloSite.START_URL)) {
            statusView.setText(R.string.invalid_site_configuration);
            return;
        }

        try {
            CustomTabsIntent browserTab = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build();
            browserTab.launchUrl(this, Uri.parse(StudySoloSite.START_URL));
            statusView.setText(R.string.browser_handoff_status);
        } catch (ActivityNotFoundException | IllegalArgumentException error) {
            statusView.setText(R.string.browser_unavailable_status);
        }
    }
}
