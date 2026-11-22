import Capacitor
public final class ArizeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() { bridge?.registerPluginInstance(ArizeKeychainPlugin()) }
}
