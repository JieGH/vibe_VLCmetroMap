package com.jielei.Xarxa;

import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

public class JourneyGuidanceRuntimeTest {
    private static final long START = 1_800_000_000_000L;

    private JourneyGuidanceRuntime.Session journey() {
        JourneyGuidanceRuntime.Leg leg = new JourneyGuidanceRuntime.Leg("metro", "METRO", Arrays.asList(
            new JourneyGuidanceRuntime.Call("Boarding station", -0.38, 39.47, START),
            new JourneyGuidanceRuntime.Call("Middle station", -0.38, 39.48, START + 300_000),
            new JourneyGuidanceRuntime.Call("Library station", -0.38, 39.49, START + 600_000)
        ));
        JourneyGuidanceRuntime.Session session = new JourneyGuidanceRuntime.Session("session-1", "journey-1", Collections.singletonList(leg));
        session.startedAt = START;
        session.updatedAt = START;
        return session;
    }

    @Test
    public void nativeClockProvidesEstimatedProgressAndOneAlightingAlertWithoutClaimingBoarding() {
        JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
        runtime.startSession(journey());
        assertNull(runtime.tick(START));
        JourneyGuidanceRuntime.Alert alert = runtime.tick(START + 310_000);
        assertNotNull(alert);
        assertEquals("Library station", alert.destination);
        assertTrue(alert.estimated);
        assertFalse(runtime.getSession().boardingConfirmed);
        assertEquals(1, runtime.getSession().callIndex);
        assertEquals("estimated", runtime.getSession().progressSource);
        assertNull(runtime.tick(START + 320_000));
    }

    @Test
    public void manualDelayAndStopApplyToNativeGuidanceEvenWhenOlderUpdatesArriveLater() {
        JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
        runtime.startSession(journey());
        runtime.tick(START + 310_000);
        JourneyGuidanceRuntime.Session correction = journey();
        correction.progressSource = "manual";
        correction.updatedAt = START + 500_000;
        correction.scheduleOffset = 300_000;
        assertTrue(runtime.updateSession(correction));
        assertNull(runtime.tick(START + 510_000));
        assertEquals(0, runtime.getSession().callIndex);
        assertEquals("manual", runtime.getSession().progressSource);
        JourneyGuidanceRuntime.Session stale = journey();
        stale.updatedAt = START + 400_000;
        assertFalse(runtime.updateSession(stale));
        assertEquals(300_000, runtime.getSession().scheduleOffset);
        assertNull(runtime.tick(START + 610_000)); // This leg's alert was already delivered before correction.
        assertFalse(runtime.stopSession("another-session"));
        assertTrue(runtime.isActive());
        assertTrue(runtime.stopSession("session-1"));
        assertFalse(runtime.isActive());
        assertNull(runtime.getSession());
        assertNull(runtime.tick(START + 700_000));
    }

    @Test
    public void onlyFreshAccurateUnambiguousLocationsCanCorrectTheNativeCall() {
        JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
        runtime.startSession(journey());
        runtime.updateLocation(-0.38, 39.48, 500, START + 100_000, START + 100_000);
        assertEquals(0, runtime.getSession().callIndex);
        runtime.updateLocation(-0.38, 39.48, 15, START, START + 100_000);
        assertEquals(0, runtime.getSession().callIndex);
        runtime.updateLocation(-0.38, 39.48, 15, START + 100_000, START + 100_000);
        assertEquals(1, runtime.getSession().callIndex);
        assertEquals("location", runtime.getSession().progressSource);
        assertEquals(-200_000, runtime.getSession().scheduleOffset);
        assertFalse(runtime.getSession().boardingConfirmed);

        JourneyGuidanceRuntime.Leg closeCalls = new JourneyGuidanceRuntime.Leg("nearby", "TRAM", Arrays.asList(
            new JourneyGuidanceRuntime.Call("A", -0.38, 39.47, START),
            new JourneyGuidanceRuntime.Call("B", -0.38, 39.4701, START + 300_000),
            new JourneyGuidanceRuntime.Call("C", -0.38, 39.49, START + 600_000)
        ));
        runtime.startSession(new JourneyGuidanceRuntime.Session("session-2", "journey-2", Collections.singletonList(closeCalls)));
        runtime.updateLocation(-0.38, 39.4701, 15, START, START);
        assertEquals(0, runtime.getSession().callIndex);
        assertEquals("estimated", runtime.getSession().progressSource);
    }

    @Test
    public void restoringKnownNativeDeliveryDoesNotNotifyAgainAndSnapshotsCannotConfirmBoarding() {
        JourneyGuidanceRuntime.Session restored = journey();
        restored.alertedEventIds.add("session-1:metro:alight");
        JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
        runtime.startSession(restored);
        assertNull(runtime.tick(START + 310_000));
        JourneyGuidanceRuntime.Session exposed = runtime.getSession();
        exposed.boardingConfirmed = true;
        exposed.alertedEventIds.clear();
        assertFalse(runtime.getSession().boardingConfirmed);
        assertTrue(runtime.getSession().alertedEventIds.contains("session-1:metro:alight"));
    }

    @Test
    public void walkingDoesNotAlertAndAChangeOfVehicleDoesNotCarryBoardingConfirmation() {
        JourneyGuidanceRuntime.Leg walk = new JourneyGuidanceRuntime.Leg("walk", "WALK", Arrays.asList(
            new JourneyGuidanceRuntime.Call("Street", -0.38, 39.46, START),
            new JourneyGuidanceRuntime.Call("Station", -0.38, 39.47, START + 60_000)
        ));
        JourneyGuidanceRuntime.Session session = new JourneyGuidanceRuntime.Session("transfer", "journey-2", Arrays.asList(walk, journey().legs.get(0)));
        session.boardingConfirmed = true;
        JourneyGuidanceRuntime runtime = new JourneyGuidanceRuntime();
        runtime.startSession(session);
        assertNull(runtime.tick(START));
        assertNotNull(runtime.tick(START + 310_000));
        assertEquals(1, runtime.getSession().legIndex);
        assertFalse(runtime.getSession().boardingConfirmed);
    }
}
