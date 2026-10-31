package com.jielei.Xarxa;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.ResultReceiver;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Owns active navigation while the WebView is suspended. No network requests are made here. */
public class JourneyGuidanceService extends Service implements LocationListener {
    public static final String START = "com.jielei.Xarxa.journey.START";
    public static final String UPDATE = "com.jielei.Xarxa.journey.UPDATE";
    public static final String STOP = "com.jielei.Xarxa.journey.STOP";
    private static final String ONGOING_CHANNEL = "journey-progress-v1";
    private static final String QUIET_CHANNEL = "journey-alight-v1";
    private static final String SOUND_CHANNEL = "journey-alight-sound-v1";
    private static final int ONGOING_ID = 7701, ALERT_ID = 7702;
    private static final long MAX_DURATION_MS = 6 * 60 * 60 * 1000L;
    private static String reportedStatus = "stopped", reportedSession;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
    private final Set<String> notificationTags = new HashSet<>();
    private final Set<String> announcedEventIds = new HashSet<>();
    private SharedPreferences deliveryState;
    private JSONObject template;
    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;
    private long startedElapsed;
    private final Runnable pulse = new Runnable() {
        @Override public void run() {
            if (!runtime.isActive()) return;
            if (!hasRequiredPermissions(JourneyGuidanceService.this) || !channelsEnabled(runtime.getSession().soundEnabled)) { finishSession("denied"); return; }
            if (SystemClock.elapsedRealtime() - startedElapsed >= MAX_DURATION_MS) { finishSession("stopped"); return; }
            advanceAndPublish();
            if (runtime.isActive()) handler.postDelayed(this, 10_000);
        }
    };

    public static boolean hasRequiredPermissions(Context context) {
        boolean location = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        return location && NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
    }

    public static synchronized JSONObject response() {
        JSONObject result = new JSONObject();
        try {
            result.put("supported", true);
            result.put("status", reportedStatus);
            result.put("session", reportedSession == null ? JSONObject.NULL : new JSONObject(reportedSession));
        } catch (JSONException ignored) { /* Reported JSON is generated locally from a validated session. */ }
        return result;
    }

    private static synchronized void report(String status, JSONObject session) {
        reportedStatus = status;
        reportedSession = session == null ? null : session.toString();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { finishSession("stopped"); return START_NOT_STICKY; }
        ResultReceiver receiver = intent.getParcelableExtra("reply");
        try {
            if (STOP.equals(intent.getAction())) {
                if (runtime.stopSession(intent.getStringExtra("sessionId"))) {
                    getSharedPreferences("journey-guidance-delivery", MODE_PRIVATE).edit().clear().apply();
                    finishSession("stopped");
                }
                if (!runtime.isActive()) stopSelf();
                reply(receiver);
                return START_NOT_STICKY;
            }
            JSONObject incoming = new JSONObject(intent.getStringExtra("session"));
            JourneyGuidanceRuntime.Session model = decode(incoming);
            if (!hasRequiredPermissions(this)) { finishSession("denied"); reply(receiver); return START_NOT_STICKY; }
            if (START.equals(intent.getAction())) {
                releaseResources();
                deliveryState = getSharedPreferences("journey-guidance-delivery", MODE_PRIVATE);
                for (String tag : deliveryState.getStringSet("delivered", new HashSet<>())) {
                    NotificationManagerCompat.from(this).cancel(tag, ALERT_ID);
                }
                announcedEventIds.clear();
                announcedEventIds.addAll(model.alertedEventIds);
                // JS IDs mean an in-app announcement, not proof of OS notification delivery.
                model.alertedEventIds.clear();
                if (model.id.equals(deliveryState.getString("sessionId", null))) {
                    model.alertedEventIds.addAll(deliveryState.getStringSet("delivered", new HashSet<>()));
                } else deliveryState.edit().clear().putString("sessionId", model.id).apply();
                runtime.startSession(model);
                template = incoming;
                createChannels();
                if (!channelsEnabled(model.soundEnabled)) { finishSession("denied"); reply(receiver); return START_NOT_STICKY; }
                ServiceCompat.startForeground(this, ONGOING_ID, progressNotification(),
                    Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
                startedElapsed = SystemClock.elapsedRealtime();
                // A foreground service does not itself keep timers running when the CPU sleeps.
                // Scope the lock to this explicit session, with a hard upper bound and cleanup on every stop path.
                PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
                wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Xarxa:JourneyGuidance");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(MAX_DURATION_MS);
                startLocationUpdates();
                handler.post(pulse);
            } else if (UPDATE.equals(intent.getAction())) {
                announcedEventIds.addAll(model.alertedEventIds);
                model.alertedEventIds.clear(); // Runtime retains its own OS-delivery IDs across updates.
                if (!runtime.updateSession(model)) {
                    if (!runtime.isActive()) stopSelf();
                    reply(receiver); return START_NOT_STICKY;
                }
                template = incoming;
                if (!channelsEnabled(model.soundEnabled)) { finishSession("denied"); reply(receiver); return START_NOT_STICKY; }
            } else throw new IllegalArgumentException("Unknown Journey command");
            advanceAndPublish();
            reply(receiver);
        } catch (SecurityException error) {
            finishSession("denied");
            reply(receiver);
        } catch (Exception error) {
            finishSession("unavailable");
            reply(receiver);
        }
        return START_NOT_STICKY;
    }

    private void startLocationUpdates() {
        locations = (LocationManager) getSystemService(LOCATION_SERVICE);
        boolean subscribed = false;
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4_000, 10, this, Looper.getMainLooper());
            subscribed = true;
        }
        if (locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000, 10, this, Looper.getMainLooper());
            subscribed = true;
        }
        if (!subscribed) throw new IllegalStateException("Location services unavailable");
    }

    @Override public void onLocationChanged(Location location) {
        if (!runtime.isActive()) return;
        long now = System.currentTimeMillis();
        // Timetable progress remains explicitly estimated when a fresh, accurate fix is unavailable.
        if (!location.hasAccuracy()) return;
        JourneyGuidanceRuntime.Alert alert = runtime.updateLocation(location.getLongitude(), location.getLatitude(), location.getAccuracy(), location.getTime(), now);
        if (alert != null) showAlert(alert);
        publish();
    }
    @Override public void onStatusChanged(String provider, int status, Bundle extras) { }
    @Override public void onProviderEnabled(String provider) { }
    @Override public void onProviderDisabled(String provider) {
        try {
            if (locations != null && !locations.isProviderEnabled(LocationManager.GPS_PROVIDER) && !locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) finishSession("unavailable");
        } catch (SecurityException error) { finishSession("denied"); }
    }

    private void advanceAndPublish() {
        JourneyGuidanceRuntime.Alert alert = runtime.tick(System.currentTimeMillis());
        if (alert != null) showAlert(alert);
        publish();
    }

    private void publish() {
        if (!runtime.isActive()) return;
        try {
            JSONObject session = new JSONObject(template.toString());
            JourneyGuidanceRuntime.Session current = runtime.getSession();
            Set<String> allAnnouncements = new HashSet<>(announcedEventIds);
            allAnnouncements.addAll(current.alertedEventIds);
            session.put("legIndex", current.legIndex).put("callIndex", current.callIndex)
                .put("boardingConfirmed", current.boardingConfirmed).put("progressSource", current.progressSource)
                .put("scheduleOffset", current.scheduleOffset).put("updatedAt", current.updatedAt)
                .put("alertedEventIds", new JSONArray(allAnnouncements));
            report("active", session);
            NotificationManagerCompat.from(this).notify(ONGOING_ID, progressNotification());
        } catch (SecurityException error) { finishSession("denied"); }
        catch (JSONException error) { finishSession("unavailable"); }
    }

    private String label(String key, int fallback) {
        JSONObject labels = template == null ? null : template.optJSONObject("labels");
        String text = labels == null ? "" : labels.optString(key);
        return text.isEmpty() ? getString(fallback) : text;
    }

    private PendingIntent openApp() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(this, ONGOING_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification progressNotification() {
        JourneyGuidanceRuntime.Session current = runtime.getSession();
        JourneyGuidanceRuntime.Leg leg = current.legs.get(current.legIndex);
        String currentName = leg.calls.get(current.callIndex).name;
        String nextName = current.callIndex + 1 < leg.calls.size() ? leg.calls.get(current.callIndex + 1).name : "";
        Intent stop = new Intent(this, JourneyGuidanceService.class).setAction(STOP).putExtra("sessionId", current.id);
        PendingIntent stopIntent = PendingIntent.getService(this, 7703, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, ONGOING_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(label("journeyTitle", R.string.journey_guidance_title))
            .setContentText(currentName + (nextName.isEmpty() ? "" : " → " + nextName))
            .setSubText("estimated".equals(current.progressSource) ? getString(R.string.journey_guidance_estimated_progress) : null)
            .setContentIntent(openApp()).setOngoing(true).setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION).setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.journey_guidance_stop), stopIntent).build();
    }

    private void showAlert(JourneyGuidanceRuntime.Alert alert) {
        if (!hasRequiredPermissions(this)) return;
        String channel = alert.soundEnabled ? SOUND_CHANNEL : QUIET_CHANNEL;
        boolean estimated = alert.estimated || !runtime.getSession().boardingConfirmed;
        Notification notification = new NotificationCompat.Builder(this, channel)
            .setSmallIcon(android.R.drawable.ic_menu_directions)
            .setContentTitle(label(estimated ? "estimatedAlightNext" : "alightNext",
                estimated ? R.string.journey_guidance_estimated_alight : R.string.journey_guidance_alight))
            .setContentText(alert.destination).setContentIntent(openApp()).setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION).setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVibrate(new long[] { 0, 300, 100, 300 })
            .setSound(alert.soundEnabled ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) : null).build();
        notificationTags.add(alert.eventId);
        try {
            NotificationManagerCompat.from(this).notify(alert.eventId, ALERT_ID, notification);
            Set<String> delivered = new HashSet<>(deliveryState.getStringSet("delivered", new HashSet<>()));
            delivered.add(alert.eventId);
            deliveryState.edit().putStringSet("delivered", delivered).apply();
        } catch (SecurityException error) { finishSession("denied"); }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel progress = new NotificationChannel(ONGOING_CHANNEL, getString(R.string.journey_guidance_title), NotificationManager.IMPORTANCE_LOW);
        progress.setSound(null, null);
        progress.enableVibration(false);
        manager.createNotificationChannel(progress);
        for (boolean sound : new boolean[] { false, true }) {
            NotificationChannel alert = new NotificationChannel(sound ? SOUND_CHANNEL : QUIET_CHANNEL,
                getString(sound ? R.string.journey_guidance_sound_channel : R.string.journey_guidance_quiet_channel), NotificationManager.IMPORTANCE_HIGH);
            alert.enableVibration(true);
            alert.setVibrationPattern(new long[] { 0, 300, 100, 300 });
            alert.setSound(sound ? RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION) : null,
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT).build());
            manager.createNotificationChannel(alert);
        }
    }

    private boolean channelsEnabled(boolean sound) {
        if (Build.VERSION.SDK_INT < 26) return true;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        NotificationChannel progress = manager.getNotificationChannel(ONGOING_CHANNEL);
        NotificationChannel alerts = manager.getNotificationChannel(sound ? SOUND_CHANNEL : QUIET_CHANNEL);
        return progress != null && progress.getImportance() != NotificationManager.IMPORTANCE_NONE && alerts != null && alerts.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    private void reply(ResultReceiver receiver) {
        if (receiver == null) return;
        Bundle data = new Bundle();
        data.putString("result", response().toString());
        receiver.send(0, data);
    }

    private void releaseResources() {
        handler.removeCallbacks(pulse);
        if (locations != null) {
            try { locations.removeUpdates(this); } catch (SecurityException ignored) { }
            locations = null;
        }
        if (wakeLock != null) {
            try { if (wakeLock.isHeld()) wakeLock.release(); } catch (RuntimeException ignored) { }
            wakeLock = null;
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(this);
        for (String tag : notificationTags) manager.cancel(tag, ALERT_ID);
        notificationTags.clear();
    }

    private void finishSession(String status) {
        JourneyGuidanceRuntime.Session current = runtime.getSession();
        if (current != null) runtime.stopSession(current.id);
        releaseResources();
        template = null;
        report(status, null);
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override public void onDestroy() {
        if (runtime.isActive()) finishSession("stopped");
        else releaseResources();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }

    private static long time(JSONObject object, String key) throws JSONException {
        Object value = object.get(key);
        if (!(value instanceof Number) || !Double.isFinite(((Number) value).doubleValue())) throw new JSONException("Invalid Journey timestamp");
        return ((Number) value).longValue();
    }
    private static JourneyGuidanceRuntime.Call call(JSONObject place, long at) {
        JSONArray coordinates = place.optJSONArray("coordinates");
        return new JourneyGuidanceRuntime.Call(place.optString("name"), coordinates == null ? Double.NaN : coordinates.optDouble(0, Double.NaN),
            coordinates == null ? Double.NaN : coordinates.optDouble(1, Double.NaN), at);
    }
    private static JourneyGuidanceRuntime.Session decode(JSONObject input) throws JSONException {
        if (input.getInt("version") != 1) throw new JSONException("Unsupported Journey session version");
        JSONObject journey = input.getJSONObject("journey");
        JSONArray legs = journey.getJSONArray("legs");
        List<JourneyGuidanceRuntime.Leg> modelLegs = new ArrayList<>();
        for (int i = 0; i < legs.length(); i++) {
            JSONObject leg = legs.getJSONObject(i);
            List<JourneyGuidanceRuntime.Call> calls = new ArrayList<>();
            calls.add(call(leg.getJSONObject("from"), time(leg, "startTime")));
            JSONArray intermediate = leg.optJSONArray("intermediateStops");
            if (intermediate != null) for (int j = 0; j < intermediate.length(); j++) {
                JSONObject stop = intermediate.getJSONObject(j);
                calls.add(call(stop, time(stop, stop.isNull("arrivalTime") ? "departureTime" : "arrivalTime")));
            }
            calls.add(call(leg.getJSONObject("to"), time(leg, "endTime")));
            modelLegs.add(new JourneyGuidanceRuntime.Leg(leg.getString("id"), leg.getString("mode"), calls));
        }
        JourneyGuidanceRuntime.Session session = new JourneyGuidanceRuntime.Session(input.getString("id"), journey.getString("id"), modelLegs);
        session.legIndex = input.getInt("legIndex");
        session.callIndex = input.getInt("callIndex");
        session.boardingConfirmed = input.optBoolean("boardingConfirmed", false);
        session.progressSource = input.getString("progressSource");
        session.startedAt = time(input, "startedAt");
        session.updatedAt = time(input, "updatedAt");
        session.scheduleOffset = time(input, "scheduleOffset");
        session.soundEnabled = input.optBoolean("soundEnabled", false);
        JSONArray alerted = input.optJSONArray("alertedEventIds");
        if (alerted != null) for (int i = 0; i < alerted.length(); i++) session.alertedEventIds.add(alerted.getString(i));
        return session;
    }
}
