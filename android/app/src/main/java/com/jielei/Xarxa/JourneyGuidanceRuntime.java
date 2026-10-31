package com.jielei.Xarxa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Native passenger session: advances without a WebView and never assumes boarding from a clock. */
public final class JourneyGuidanceRuntime {
    public static final class Call {
        public final String name;
        public final double longitude, latitude;
        public final long time;
        public Call(String name, double longitude, double latitude, long time) {
            this.name = name;
            this.longitude = longitude;
            this.latitude = latitude;
            this.time = time;
        }
    }

    public static final class Leg {
        public final String id, mode;
        public final List<Call> calls;
        public Leg(String id, String mode, List<Call> calls) {
            if (id == null || id.isEmpty() || calls == null || calls.size() < 2) throw new IllegalArgumentException("Invalid Journey leg");
            this.id = id;
            this.mode = mode;
            this.calls = Collections.unmodifiableList(new ArrayList<>(calls));
        }
        public long startTime() { return calls.get(0).time; }
        public long endTime() { return calls.get(calls.size() - 1).time; }
    }

    /** Version-one native bridge data, independent of Android permission/notification APIs. */
    public static final class Session {
        public final String id, journeyId;
        public final List<Leg> legs;
        public int legIndex, callIndex;
        public boolean boardingConfirmed, soundEnabled;
        public String progressSource = "estimated";
        public long startedAt, updatedAt, scheduleOffset;
        public final Set<String> alertedEventIds = new LinkedHashSet<>();
        public Session(String id, String journeyId, List<Leg> legs) {
            if (id == null || id.isEmpty() || journeyId == null || journeyId.isEmpty() || legs == null || legs.isEmpty()) {
                throw new IllegalArgumentException("Invalid Journey session");
            }
            this.id = id;
            this.journeyId = journeyId;
            this.legs = Collections.unmodifiableList(new ArrayList<>(legs));
        }
        Session copy() {
            Session result = new Session(id, journeyId, legs);
            result.legIndex = legIndex;
            result.callIndex = callIndex;
            result.boardingConfirmed = boardingConfirmed;
            result.soundEnabled = soundEnabled;
            result.progressSource = progressSource;
            result.startedAt = startedAt;
            result.updatedAt = updatedAt;
            result.scheduleOffset = scheduleOffset;
            result.alertedEventIds.addAll(alertedEventIds);
            return result;
        }
    }

    public static final class Alert {
        public final String eventId, destination;
        public final boolean estimated, soundEnabled;
        Alert(String eventId, String destination, boolean estimated, boolean soundEnabled) {
            this.eventId = eventId;
            this.destination = destination;
            this.estimated = estimated;
            this.soundEnabled = soundEnabled;
        }
    }

    private Session session;
    private boolean active;
    private long confirmedAt, lastExternalUpdatedAt;

    public void startSession(Session input) {
        validate(input);
        session = input.copy();
        active = true;
        confirmedAt = "estimated".equals(input.progressSource) ? 0 : input.updatedAt;
        lastExternalUpdatedAt = input.updatedAt;
    }

    public boolean updateSession(Session input) {
        validate(input);
        if (!active || !session.id.equals(input.id) || !session.journeyId.equals(input.journeyId) || input.updatedAt < lastExternalUpdatedAt) return false;
        Set<String> delivered = new LinkedHashSet<>(session.alertedEventIds);
        session = input.copy();
        session.alertedEventIds.addAll(delivered);
        lastExternalUpdatedAt = input.updatedAt;
        confirmedAt = "estimated".equals(input.progressSource) ? 0 : input.updatedAt;
        return true;
    }

    public boolean stopSession(String sessionId) {
        if (!active || !session.id.equals(sessionId)) return false;
        active = false;
        session = null;
        return true;
    }

    public Session getSession() { return session == null ? null : session.copy(); }
    public boolean isActive() { return active; }

    public Alert tick(long now) {
        if (!active) return null;
        long effectiveNow = now - session.scheduleOffset;
        int nextLeg = session.legs.size() - 1;
        for (int i = 0; i < session.legs.size(); i++) {
            if (effectiveNow < session.legs.get(i).endTime()) { nextLeg = i; break; }
        }
        nextLeg = Math.max(session.legIndex, nextLeg);
        Leg leg = session.legs.get(nextLeg);
        int nextCall = 0;
        for (int i = 0; i < leg.calls.size(); i++) if (leg.calls.get(i).time <= effectiveNow) nextCall = i;
        boolean changedLeg = nextLeg != session.legIndex;
        if (!changedLeg) nextCall = Math.max(session.callIndex, nextCall);
        boolean sameCall = !changedLeg && nextCall == session.callIndex;
        if (changedLeg) session.boardingConfirmed = false;
        if (!sameCall || now - confirmedAt >= 60_000) session.progressSource = "estimated";
        session.legIndex = nextLeg;
        session.callIndex = nextCall;
        session.updatedAt = now;
        return alertIfDue(now);
    }

    public Alert updateLocation(double longitude, double latitude, double accuracy, long fixAt, long now) {
        if (!active || !Double.isFinite(longitude) || !Double.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 ||
            !Double.isFinite(accuracy) || accuracy < 0 || accuracy > 100 || now - fixAt > 60_000 || fixAt > now + 10_000 || fixAt < confirmedAt) return null;
        Leg leg = session.legs.get(session.legIndex);
        int nearest = -1;
        double best = Double.POSITIVE_INFINITY, second = Double.POSITIVE_INFINITY;
        for (int i = 0; i < leg.calls.size(); i++) {
            Call call = leg.calls.get(i);
            if (!Double.isFinite(call.longitude) || !Double.isFinite(call.latitude)) continue;
            double distance = distanceMetres(longitude, latitude, call.longitude, call.latitude);
            if (distance > Math.max(45, accuracy)) continue;
            if (distance < best) { second = best; best = distance; nearest = i; }
            else if (distance < second) second = distance;
        }
        if (nearest < 0 || second - best <= accuracy * 2) return null;
        session.callIndex = nearest;
        session.scheduleOffset = now - leg.calls.get(nearest).time;
        session.progressSource = "location";
        session.updatedAt = now;
        confirmedAt = now;
        return alertIfDue(now);
    }

    private static double distanceMetres(double lonA, double latA, double lonB, double latB) {
        double dLat = Math.toRadians(latB - latA), dLon = Math.toRadians(lonB - lonA);
        double a = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(Math.toRadians(latA)) * Math.cos(Math.toRadians(latB)) * Math.pow(Math.sin(dLon / 2), 2);
        return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private Alert alertIfDue(long now) {
        Leg leg = session.legs.get(session.legIndex);
        String eventId = session.id + ":" + leg.id + ":alight";
        if (!"WALK".equals(leg.mode) && session.callIndex == leg.calls.size() - 2 &&
            (session.boardingConfirmed || now - session.scheduleOffset >= leg.startTime()) && session.alertedEventIds.add(eventId)) {
            return new Alert(eventId, leg.calls.get(leg.calls.size() - 1).name, "estimated".equals(session.progressSource), session.soundEnabled);
        }
        return null;
    }

    private static void validate(Session input) {
        if (input == null || input.legIndex < 0 || input.legIndex >= input.legs.size() || input.callIndex < 0 ||
            input.callIndex >= input.legs.get(input.legIndex).calls.size() ||
            !("estimated".equals(input.progressSource) || "manual".equals(input.progressSource) || "location".equals(input.progressSource))) {
            throw new IllegalArgumentException("Invalid Journey progress");
        }
    }
}
