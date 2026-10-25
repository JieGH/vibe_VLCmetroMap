package com.jielei.xarxa.nativeapp

import android.app.Application

class XarxaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Perf.once("app_create")
    }
}
