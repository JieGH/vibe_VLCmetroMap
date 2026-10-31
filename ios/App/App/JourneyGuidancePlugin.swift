import Foundation
import Capacitor
import CoreLocation
import UserNotifications
import AudioToolbox
import UIKit

/// The native half of JourneyGuidance V1. It does not require an active WebView
/// to update call progress or deliver the OS's scheduled estimated alerts.
@objc(JourneyGuidancePlugin)
public final class JourneyGuidancePlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, UNUserNotificationCenterDelegate {
    public let identifier = "JourneyGuidancePlugin"
    public let jsName = "JourneyGuidance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise)
    ]

    private let location = CLLocationManager()
    private let notifications = UNUserNotificationCenter.current()
    private var session: [String: Any]?
    private var status = "stopped"
    private var timer: Timer?
    private var generation = 0
    private var alerted = Set<String>()
    private var announced = Set<String>()
    private var scheduled: [String: Double] = [:]
    private let alertStoreKey = "xarxa.journey.nativeAlerts.v1"
    private var permissionWaiters: [(Bool) -> Void] = []
    private weak var previousNotificationDelegate: UNUserNotificationCenterDelegate?
    private let notificationPrefix = "xarxa.journey."

    public override func load() {
        DispatchQueue.main.async {
            self.location.delegate = self
            self.location.activityType = .otherNavigation
            self.location.desiredAccuracy = kCLLocationAccuracyBest
            self.location.distanceFilter = 15
            self.location.pausesLocationUpdatesAutomatically = false
            self.previousNotificationDelegate = self.notifications.delegate
            self.notifications.delegate = self
        }
    }

    private func milliseconds() -> Double { Date().timeIntervalSince1970 * 1000 }
    private func number(_ value: Any?) -> Double? {
        guard let value = value as? NSNumber, value.doubleValue.isFinite else { return nil }
        return value.doubleValue
    }
    private func integer(_ value: Any?) -> Int? {
        guard let value = number(value), value >= 0, value.rounded(.down) == value, value < Double(Int.max) else { return nil }
        return Int(value)
    }
    private func legs(_ value: [String: Any]) -> [[String: Any]] {
        (value["journey"] as? [String: Any])?["legs"] as? [[String: Any]] ?? []
    }
    private func calls(_ leg: [String: Any]) -> [[String: Any]] {
        guard var from = leg["from"] as? [String: Any], var to = leg["to"] as? [String: Any] else { return [] }
        from["arrivalTime"] = leg["startTime"]
        from["departureTime"] = leg["startTime"]
        to["arrivalTime"] = leg["endTime"]
        to["departureTime"] = leg["endTime"]
        return [from] + (leg["intermediateStops"] as? [[String: Any]] ?? []) + [to]
    }
    private func callTime(_ value: [String: Any]) -> Double? {
        number(value["arrivalTime"]) ?? number(value["departureTime"])
    }
    private func valid(_ value: [String: Any]) -> Bool {
        guard number(value["version"]) == 1, let id = value["id"] as? String, !id.isEmpty,
              let legIndex = integer(value["legIndex"]), let callIndex = integer(value["callIndex"]),
              number(value["scheduleOffset"]) != nil, number(value["updatedAt"]) != nil,
              let journey = value["journey"] as? [String: Any], journey["id"] is String else { return false }
        let portions = legs(value)
        guard !portions.isEmpty, portions.indices.contains(legIndex), calls(portions[legIndex]).indices.contains(callIndex) else { return false }
        return portions.allSatisfy { leg in
            guard let start = number(leg["startTime"]), let end = number(leg["endTime"]), end >= start,
                  let mode = leg["mode"] as? String, ["WALK", "METRO", "TRAM", "BUS"].contains(mode) else { return false }
            return !calls(leg).isEmpty && calls(leg).allSatisfy { callTime($0) != nil }
        }
    }
    private func response() -> [String: Any] {
        ["supported": true, "status": status, "session": session as Any? ?? NSNull()]
    }

    private func ensurePermissions(_ completion: @escaping (Bool) -> Void) {
        guard CLLocationManager.locationServicesEnabled() else { completion(false); return }
        switch location.authorizationStatus {
        case .notDetermined:
            permissionWaiters.append(completion)
            location.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            notifications.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                DispatchQueue.main.async { completion(granted) }
            }
        default:
            completion(false)
        }
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.ensurePermissions { granted in
                call.resolve(["supported": true, "status": granted ? self.status : "denied"])
            }
        }
    }

    @objc public func startSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let value = call.options["session"] as? [String: Any], self.valid(value) else {
                call.resolve(["supported": true, "status": "unavailable"]); return
            }
            self.generation += 1
            let operation = self.generation
            self.ensurePermissions { granted in
                guard operation == self.generation else {
                    call.resolve(["supported": true, "status": "stopped"]); return
                }
                guard granted else {
                    self.stopEngine()
                    self.status = "denied"
                    call.resolve(self.response()); return
                }
                let id = value["id"] as? String ?? ""
                let savedAlerts = UserDefaults.standard.dictionary(forKey: self.alertStoreKey)
                if (self.session?["id"] as? String) != id && savedAlerts?["sessionId"] as? String != id { self.stopEngine() }
                self.session = value
                if savedAlerts?["sessionId"] as? String == id {
                    self.alerted.formUnion(savedAlerts?["alerted"] as? [String] ?? [])
                    self.scheduled.merge(savedAlerts?["scheduled"] as? [String: Double] ?? [:]) { _, saved in saved }
                }
                self.announced.formUnion(value["alertedEventIds"] as? [String] ?? [])
                self.status = "active"
                // WhenInUse is sufficient for a foreground-started continuous
                // background session with the system location indicator.
                self.location.allowsBackgroundLocationUpdates = true
                self.location.showsBackgroundLocationIndicator = true
                self.location.startUpdatingLocation()
                self.timer?.invalidate()
                self.timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.advance() }
                if let timer = self.timer { RunLoop.main.add(timer, forMode: .common) }
                self.advance()
                self.scheduleAlerts()
                call.resolve(self.response())
            }
        }
    }

    @objc public func updateSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.status == "active", let value = call.options["session"] as? [String: Any], self.valid(value),
                  let id = value["id"] as? String, id == self.session?["id"] as? String else {
                call.resolve(["supported": true, "status": self.status == "active" ? "unavailable" : self.status]); return
            }
            self.reconcileScheduledAlerts()
            self.announced.formUnion(value["alertedEventIds"] as? [String] ?? [])
            self.session = value
            self.advance()
            self.scheduleAlerts()
            call.resolve(self.response())
        }
    }

    @objc public func stopSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let requested = call.getString("sessionId")
            if self.session == nil || requested == self.session?["id"] as? String {
                self.generation += 1
                self.stopEngine()
                self.status = "stopped"
            }
            call.resolve(self.response())
        }
    }

    @objc public func getSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.notifications.getNotificationSettings { settings in
                DispatchQueue.main.async {
                    if self.status == "active" && (settings.authorizationStatus != .authorized || !CLLocationManager.locationServicesEnabled()) {
                        self.stopEngine(); self.status = "denied"
                    }
                    self.advance()
                    call.resolve(self.response())
                }
            }
        }
    }

    private func stopEngine() {
        timer?.invalidate(); timer = nil
        location.stopUpdatingLocation()
        location.allowsBackgroundLocationUpdates = false
        let persisted = UserDefaults.standard.dictionary(forKey: alertStoreKey)
        let previousScheduled = persisted?["scheduled"] as? [String: Double] ?? [:]
        let previousAlerted = persisted?["alerted"] as? [String] ?? []
        let identifiers = Set(scheduled.keys).union(alerted).union(previousScheduled.keys).union(previousAlerted).map { notificationPrefix + $0 }
        notifications.removePendingNotificationRequests(withIdentifiers: identifiers)
        notifications.removeDeliveredNotifications(withIdentifiers: identifiers)
        scheduled.removeAll()
        alerted.removeAll()
        announced.removeAll()
        UserDefaults.standard.removeObject(forKey: alertStoreKey)
        session = nil
    }

    private func saveAlertLedger() {
        guard let id = session?["id"] as? String else { return }
        UserDefaults.standard.set(["sessionId": id, "alerted": Array(alerted), "scheduled": scheduled], forKey: alertStoreKey)
    }

    private func reconcileScheduledAlerts() {
        let now = milliseconds()
        for (id, at) in scheduled where at <= now { alerted.insert(id) }
        saveAlertLedger()
    }

    private func advance() {
        guard status == "active", var value = session else { return }
        reconcileScheduledAlerts()
        let portions = legs(value)
        guard let previousLeg = integer(value["legIndex"]), portions.indices.contains(previousLeg) else { return }
        let at = milliseconds() - (number(value["scheduleOffset"]) ?? 0)
        let estimatedLeg = portions.firstIndex { at < (number($0["endTime"]) ?? 0) } ?? portions.count - 1
        let legIndex = max(previousLeg, estimatedLeg)
        let points = calls(portions[legIndex])
        var callIndex = points.lastIndex { (callTime($0) ?? .infinity) <= at } ?? 0
        if legIndex == previousLeg { callIndex = max(integer(value["callIndex"]) ?? 0, callIndex) }
        else { value["boardingConfirmed"] = false }
        value["legIndex"] = legIndex
        value["callIndex"] = callIndex
        // Timetable movement never establishes passenger location or boarding.
        value["progressSource"] = "estimated"
        value["updatedAt"] = milliseconds()
        value["alertedEventIds"] = Array(alerted.union(announced))
        session = value
    }

    private func notification(_ value: [String: Any], leg: [String: Any], estimated: Bool) -> UNMutableNotificationContent {
        let content = UNMutableNotificationContent()
        let labels = value["labels"] as? [String: String] ?? [:]
        content.title = labels["journeyTitle"] ?? "Xarxa"
        let instruction = labels[estimated ? "estimatedAlightNext" : "alightNext"] ?? "Xarxa"
        let destination = (leg["to"] as? [String: Any])?["name"] as? String ?? ""
        content.body = instruction + " · " + destination
        content.sound = (value["soundEnabled"] as? Bool) == true ? .default : nil
        content.threadIdentifier = notificationPrefix + (value["id"] as? String ?? "")
        return content
    }

    private func scheduleAlerts() {
        guard status == "active", let value = session, let sessionID = value["id"] as? String else { return }
        reconcileScheduledAlerts()
        let currentLeg = integer(value["legIndex"]) ?? 0
        let now = milliseconds()
        // Keep elapsed requests queued: iOS may deliver them later. A fresh
        // estimate replaces only still-future requests under the same ID.
        notifications.removePendingNotificationRequests(withIdentifiers: scheduled.filter { $0.value > now }.keys.map { notificationPrefix + $0 })
        scheduled = scheduled.filter { $0.value <= now }
        let offset = number(value["scheduleOffset"]) ?? 0
        for (index, leg) in legs(value).enumerated() where index >= currentLeg && (leg["mode"] as? String) != "WALK" {
            guard let legID = leg["id"] as? String else { continue }
            let points = calls(leg)
            guard points.count >= 2, let beforeAlighting = callTime(points[points.count - 2]) else { continue }
            let eventID = sessionID + ":" + legID + ":alight"
            guard !alerted.contains(eventID) else { continue }
            if index == currentLeg && (integer(value["callIndex"]) ?? 0) >= points.count - 1 { continue }
            let at = beforeAlighting + offset
            let currentConfirmed = index == currentLeg && (value["boardingConfirmed"] as? Bool) == true &&
                (value["progressSource"] as? String) != "estimated"
            let content = notification(value, leg: leg, estimated: !currentConfirmed || at > now)
            content.userInfo = ["journeyEventId": eventID]
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, (at - now) / 1000), repeats: false)
            let request = UNNotificationRequest(identifier: notificationPrefix + eventID, content: content, trigger: trigger)
            scheduled[eventID] = max(at, now + 1000)
            let center = notifications
            notifications.add(request) { [weak self] error in
                DispatchQueue.main.async {
                    guard let self, self.status == "active", self.session?["id"] as? String == sessionID else {
                        center.removePendingNotificationRequests(withIdentifiers: [request.identifier]); return
                    }
                    guard error != nil else { return }
                    self.status = "unavailable"
                    self.stopEngine()
                }
            }
        }
        saveAlertLedger()
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard manager.authorizationStatus != .notDetermined else { return }
        let waiters = permissionWaiters
        permissionWaiters.removeAll()
        for waiter in waiters { ensurePermissions(waiter) }
        if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            stopEngine(); status = "denied"
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        advance()
        guard status == "active", var value = session, let fix = locations.last,
              fix.horizontalAccuracy >= 0, fix.horizontalAccuracy <= 100,
              abs(fix.timestamp.timeIntervalSinceNow) <= 60,
              let legIndex = integer(value["legIndex"]), legs(value).indices.contains(legIndex) else { return }
        let points = calls(legs(value)[legIndex])
        let matches: [(Int, CLLocationDistance)] = points.enumerated().compactMap { index, point in
            guard let coordinates = point["coordinates"] as? [Double], coordinates.count == 2 else { return nil }
            let distance = fix.distance(from: CLLocation(latitude: coordinates[1], longitude: coordinates[0]))
            return distance <= max(45, fix.horizontalAccuracy) ? (index, distance) : nil
        }.sorted { $0.1 < $1.1 }
        guard let match = matches.first,
              matches.count < 2 || matches[1].1 - match.1 > fix.horizontalAccuracy * 2,
              let time = callTime(points[match.0]) else { return }
        value["callIndex"] = match.0
        value["progressSource"] = "location"
        value["scheduleOffset"] = milliseconds() - time
        value["updatedAt"] = milliseconds()
        value["alertedEventIds"] = Array(alerted.union(announced))
        session = value
        scheduleAlerts()
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        if (error as? CLError)?.code == .denied { stopEngine(); status = "denied" }
    }

    public func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                       withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        guard notification.request.identifier.hasPrefix(notificationPrefix) else {
            if let previous = previousNotificationDelegate, previous.responds(to: #selector(userNotificationCenter(_:willPresent:withCompletionHandler:))) {
                previous.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
            } else { completionHandler([]) }
            return
        }
        DispatchQueue.main.async {
            if let id = notification.request.content.userInfo["journeyEventId"] as? String { self.alerted.insert(id) }
            self.saveAlertLedger()
            AudioServicesPlaySystemSound(kSystemSoundID_Vibrate)
            completionHandler(notification.request.content.sound == nil ? [.banner, .list] : [.banner, .list, .sound])
        }
    }
}
