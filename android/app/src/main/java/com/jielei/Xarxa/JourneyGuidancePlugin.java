package com.jielei.Xarxa;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.ResultReceiver;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "JourneyGuidance", permissions = {
    @Permission(alias = "journeyLocation", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "journeyNotifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class JourneyGuidancePlugin extends Plugin {
    @Override @PluginMethod public void requestPermissions(PluginCall call) {
        if (JourneyGuidanceService.hasRequiredPermissions(getContext())) { resolve(call, JourneyGuidanceService.response()); return; }
        String[] permissions = Build.VERSION.SDK_INT >= 33 ? new String[] { "journeyLocation", "journeyNotifications" } : new String[] { "journeyLocation" };
        requestPermissionForAliases(permissions, call, "journeyPermissionsResult");
    }

    @PermissionCallback private void journeyPermissionsResult(PluginCall call) {
        if (JourneyGuidanceService.hasRequiredPermissions(getContext())) resolve(call, JourneyGuidanceService.response());
        else result(call, "denied");
    }

    @PluginMethod public void startSession(PluginCall call) { command(call, JourneyGuidanceService.START); }
    @PluginMethod public void updateSession(PluginCall call) { command(call, JourneyGuidanceService.UPDATE); }
    @PluginMethod public void stopSession(PluginCall call) { command(call, JourneyGuidanceService.STOP); }
    @PluginMethod public void getSession(PluginCall call) {
        JSONObject current = JourneyGuidanceService.response();
        if ("active".equals(current.optString("status")) && !JourneyGuidanceService.hasRequiredPermissions(getContext())) result(call, "denied");
        else resolve(call, current);
    }

    private void command(PluginCall call, String action) {
        JSObject session = call.getObject("session");
        if (!JourneyGuidanceService.STOP.equals(action) && (session == null || session.toString().length() > 500_000)) {
            result(call, "unavailable"); return;
        }
        JSONObject current = JourneyGuidanceService.response();
        if (!JourneyGuidanceService.START.equals(action) && !"active".equals(current.optString("status"))) {
            resolve(call, current); return;
        }
        if (!JourneyGuidanceService.STOP.equals(action) && !JourneyGuidanceService.hasRequiredPermissions(getContext())) {
            result(call, "denied"); return;
        }
        getActivity().runOnUiThread(() -> {
            Handler replies = new Handler(Looper.getMainLooper());
            AtomicBoolean replied = new AtomicBoolean(false);
            Runnable timeout = () -> { if (replied.compareAndSet(false, true)) result(call, "unavailable"); };
            Intent intent = new Intent(getContext(), JourneyGuidanceService.class).setAction(action);
            if (session != null) intent.putExtra("session", session.toString());
            intent.putExtra("sessionId", call.getString("sessionId"));
            intent.putExtra("reply", new ResultReceiver(replies) {
                @Override protected void onReceiveResult(int code, Bundle data) {
                    if (!replied.compareAndSet(false, true)) return;
                    replies.removeCallbacks(timeout);
                    try { resolve(call, new JSONObject(data.getString("result"))); }
                    catch (Exception error) { result(call, "unavailable"); }
                }
            });
            replies.postDelayed(timeout, 10_000);
            try {
                if (JourneyGuidanceService.START.equals(action)) ContextCompat.startForegroundService(getContext(), intent);
                else getContext().startService(intent);
            } catch (SecurityException error) { if (replied.compareAndSet(false, true)) result(call, "denied"); replies.removeCallbacks(timeout); }
            catch (Exception error) { if (replied.compareAndSet(false, true)) result(call, "unavailable"); replies.removeCallbacks(timeout); }
        });
    }

    private void result(PluginCall call, String status) {
        JSObject response = new JSObject();
        response.put("supported", true);
        response.put("status", status);
        response.put("session", JSONObject.NULL);
        call.resolve(response);
    }
    private void resolve(PluginCall call, JSONObject response) {
        try { call.resolve(new JSObject(response.toString())); }
        catch (JSONException error) { result(call, "unavailable"); }
    }
}
