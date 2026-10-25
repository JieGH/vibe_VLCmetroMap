package com.jielei.xarxa.nativeapp

import android.graphics.Color
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.DisposableEffect
import com.jielei.xarxa.nativeapp.ui.MainViewModel
import com.jielei.xarxa.nativeapp.ui.ThemeMode
import com.jielei.xarxa.nativeapp.ui.XarxaScreen
import org.maplibre.android.MapLibre

class MainActivity : AppCompatActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        Perf.once("act_create")
        if (BuildConfig.PERF) { vm.fakeTrains = intent.getBooleanExtra("fakeTrains", false); vm.fakeMany = intent.getBooleanExtra("fakeMany", false) }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        MapLibre.getInstance(this)
        setContent {
            val systemDark = isSystemInDarkTheme()
            val dark = when (vm.themeMode) {
                ThemeMode.System -> systemDark
                ThemeMode.Light -> false
                ThemeMode.Dark -> true
            }
            // Bar icons contrast with the map behind them, which follows the app theme.
            DisposableEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                    navigationBarStyle = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
                )
                onDispose { }
            }
            XarxaScreen(vm)
        }
    }
}
