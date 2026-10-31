import Capacitor

final class JourneyBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(JourneyGuidancePlugin())
    }
}
