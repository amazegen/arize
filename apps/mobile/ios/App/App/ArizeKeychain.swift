import Foundation
import Security
import Capacitor

@objc(ArizeKeychainPlugin)
public class ArizeKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ArizeKeychainPlugin"
    public let jsName = "ArizeKeychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private var service: String { (Bundle.main.bundleIdentifier ?? "com.amazegen.arize.dev") + ".adult.auth" }
    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard prepareInstall() else { call.reject("Unlock your device and retry secure account storage."); return nil }
        guard let key = call.getString("key"), key.hasPrefix("arize.native.adult."), key.count <= 100 else {
            call.reject("Invalid secure storage key."); return nil
        }
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                kSecAttrAccount as String: key, kSecAttrSynchronizable as String: false]
    }
    public override func load() {
        // Keychain can outlive uninstall. A new app installation clears only
        // this app's own dedicated service; tokens never sync via iCloud.
        _ = prepareInstall()
    }
    private func prepareInstall() -> Bool {
        if !UserDefaults.standard.bool(forKey: "arize.native.install.v1") {
            let status = SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { return false }
            UserDefaults.standard.set(true, forKey: "arize.native.install.v1")
        }
        return true
    }
    @objc func get(_ call: CAPPluginCall) {
        guard var query = query(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Secure session storage is unavailable. Unlock your device and try again."); return
        }
        call.resolve(["value": value])
    }
    @objc func set(_ call: CAPPluginCall) {
        guard var query = query(call), let value = call.getString("value"), value.utf8.count <= 32768 else {
            call.reject("Invalid secure storage value."); return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            query.merge(attributes) { _, new in new }
            status = SecItemAdd(query as CFDictionary, nil)
        }
        if status == errSecSuccess { call.resolve() } else { call.reject("Secure session storage is unavailable.") }
    }
    @objc func remove(_ call: CAPPluginCall) {
        guard let query = query(call) else { return }
        let status = SecItemDelete(query as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound { call.resolve() } else { call.reject("Secure session cleanup failed. Unlock your device and retry.") }
    }
}
