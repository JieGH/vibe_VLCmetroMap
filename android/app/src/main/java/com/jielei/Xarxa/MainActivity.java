package com.jielei.Xarxa;

import android.content.res.Configuration;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(JourneyGuidancePlugin.class);
        SplashScreen.installSplashScreen(this);
        // Transparent system bars; icon colour follows the system night mode.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }

    // uiMode is handled in the manifest, so the activity is not recreated on a
    // live light/dark switch: flip the bar icon colour by hand.
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        boolean night = (newConfig.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        var controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(!night);
        controller.setAppearanceLightNavigationBars(!night);
    }
}
