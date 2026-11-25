import Capacitor
import ExternalAccessory
import Foundation
import Network

/// Byte channels to OBD adapters: TCP over WiFi and MFi accessories. NOT
/// compiled or run yet (needs macOS and Xcode). All state lives on the main queue.
@objc(SerialNativePlugin)
public class SerialNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SerialNativePlugin"
    public let jsName = "SerialNative"
    public let pluginMethods: [CAPPluginMethod] = [
        "connectTcp", "listAccessories", "connectAccessory", "write", "close"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private var channels: [String: SerialChannel] = [:]

    @objc func connectTcp(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let host = call.getString("host"), !host.isEmpty,
              let number = call.getInt("port"), number > 0, let raw = UInt16(exactly: number),
              let port = NWEndpoint.Port(rawValue: raw) else { return call.reject("Invalid address") }
        let timeout = Double(call.getInt("timeoutMs") ?? 10000) / 1000
        DispatchQueue.main.async {
            let channel = TcpChannel(host: host, port: port)
            self.add(id, channel)
            channel.connect(timeout: timeout) { [weak self, weak channel] error in
                guard let error else { return call.resolve() }
                if let channel { self?.remove(id, channel) }
                call.reject(error)
            }
        }
    }

    @objc func listAccessories(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let accessories = EAAccessoryManager.shared().connectedAccessories.map { accessory in
                [
                    "id": Self.id(of: accessory),
                    "name": accessory.name,
                    "protocols": accessory.protocolStrings.filter { Self.declaredProtocols.contains($0) }
                ] as [String: Any]
            }
            call.resolve(["accessories": accessories])
        }
    }

    @objc func connectAccessory(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let accessoryId = call.getString("accessoryId"),
              let name = call.getString("protocol") else { return call.reject("Invalid accessory") }
        DispatchQueue.main.async {
            let connected = EAAccessoryManager.shared().connectedAccessories
            guard let accessory = connected.first(where: { Self.id(of: $0) == accessoryId }) else {
                return call.reject("Accessory is not connected")
            }
            // iOS refuses a protocol that Info.plist does not declare.
            guard Self.declaredProtocols.contains(name), accessory.protocolStrings.contains(name) else {
                return call.reject("Protocol not supported")
            }
            let channel = AccessoryChannel(accessory: accessory, target: "mfi:" + accessoryId)
            self.add(id, channel)
            guard channel.connect(protocolName: name) else {
                self.remove(id, channel)
                return call.reject("Opening the accessory failed")
            }
            call.resolve()
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let data = call.getString("data").flatMap({ Data(base64Encoded: $0) }) else {
            return call.reject("Invalid data")
        }
        DispatchQueue.main.async {
            guard let channel = self.channels[id] else { return call.reject("Not connected") }
            channel.write(data) { error in
                if let error { call.reject(error) } else { call.resolve() }
            }
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No id") }
        DispatchQueue.main.async {
            self.channels.removeValue(forKey: id)?.close()
            call.resolve()
        }
    }

    deinit {
        let open = Array(channels.values)
        DispatchQueue.main.async { open.forEach { $0.close() } }
    }

    private func add(_ id: String, _ channel: SerialChannel) {
        // Adapters serve one client: a connection left over from an earlier page must go.
        for (other, old) in channels where other == id || old.target == channel.target {
            channels[other] = nil
            old.close()
            if other != id { notifyListeners("closed", data: ["id": other]) }
        }
        channels[id] = channel
        channel.onData = { [weak self, weak channel] data in
            guard let self, let channel, self.channels[id] === channel else { return }
            self.notifyListeners("data", data: ["id": id, "data": data.base64EncodedString()])
        }
        channel.onClosed = { [weak self, weak channel] in
            guard let self, let channel, self.channels[id] === channel else { return }
            self.remove(id, channel)
            self.notifyListeners("closed", data: ["id": id])
        }
    }

    private func remove(_ id: String, _ channel: SerialChannel) {
        if channels[id] === channel { channels[id] = nil }
        channel.close()
    }

    private static func id(of accessory: EAAccessory) -> String {
        accessory.serialNumber.isEmpty ? accessory.name : accessory.serialNumber
    }

    private static let declaredProtocols =
        Bundle.main.object(forInfoDictionaryKey: "UISupportedExternalAccessoryProtocols") as? [String] ?? []
}

/// One connection. Used on the main queue only.
private protocol SerialChannel: AnyObject {
    var target: String { get }
    var onData: ((Data) -> Void)? { get set }
    /// The other side ended an open connection.
    var onClosed: (() -> Void)? { get set }
    func write(_ data: Data, done: @escaping (String?) -> Void)
    func close()
}

private final class TcpChannel: SerialChannel {
    let target: String
    var onData: ((Data) -> Void)?
    var onClosed: (() -> Void)?
    private let connection: NWConnection
    private var connecting: ((String?) -> Void)?

    init(host: String, port: NWEndpoint.Port) {
        target = "tcp:\(host):\(port.rawValue)"
        let options = NWProtocolTCP.Options()
        options.noDelay = true
        options.enableKeepalive = true
        options.keepaliveIdle = 10
        let parameters = NWParameters(tls: nil, tcp: options)
        // The adapter's WiFi has no internet; never go through mobile data.
        parameters.requiredInterfaceType = .wifi
        connection = NWConnection(host: NWEndpoint.Host(host), port: port, using: parameters)
    }

    func connect(timeout: Double, done: @escaping (String?) -> Void) {
        connecting = done
        connection.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.settle(nil)
                self.receive()
            case .failed(let error):
                self.fail(error.localizedDescription)
            default:
                // Waiting: no WiFi yet, or iOS still asks for local network access.
                break
            }
        }
        connection.start(queue: .main)
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
            self?.settle("Timeout")
        }
    }

    func write(_ data: Data, done: @escaping (String?) -> Void) {
        connection.send(content: data, completion: .contentProcessed { done($0?.localizedDescription) })
    }

    func close() {
        onData = nil
        onClosed = nil
        connection.stateUpdateHandler = nil
        connection.cancel()
        settle("Closed")
    }

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, complete, error in
            guard let self else { return }
            if let data, !data.isEmpty { self.onData?(data) }
            if complete || error != nil { self.onClosed?() } else { self.receive() }
        }
    }

    private func fail(_ message: String) {
        if connecting != nil { settle(message) } else { onClosed?() }
    }

    private func settle(_ error: String?) {
        let done = connecting
        connecting = nil
        done?(error)
    }
}

private final class AccessoryChannel: NSObject, SerialChannel, StreamDelegate {
    let target: String
    var onData: ((Data) -> Void)?
    var onClosed: (() -> Void)?
    private let accessory: EAAccessory
    private var session: EASession?
    private var pending: [(data: Data, done: (String?) -> Void)] = []

    init(accessory: EAAccessory, target: String) {
        self.accessory = accessory
        self.target = target
    }

    func connect(protocolName: String) -> Bool {
        guard let session = EASession(accessory: accessory, forProtocol: protocolName),
              let input = session.inputStream, let output = session.outputStream else { return false }
        self.session = session
        for stream in [input, output] as [Stream] {
            stream.delegate = self
            stream.schedule(in: .main, forMode: .common)
            stream.open()
        }
        return true
    }

    func write(_ data: Data, done: @escaping (String?) -> Void) {
        pending.append((data, done))
        flush()
    }

    func close() {
        onData = nil
        onClosed = nil
        let open = session
        session = nil
        let streams: [Stream?] = [open?.inputStream, open?.outputStream]
        for stream in streams.compactMap({ $0 }) {
            stream.close()
            stream.remove(from: .main, forMode: .common)
            stream.delegate = nil
        }
        let waiting = pending
        pending = []
        waiting.forEach { $0.done("Closed") }
    }

    func stream(_ stream: Stream, handle event: Stream.Event) {
        switch event {
        case .hasBytesAvailable: read()
        case .hasSpaceAvailable: flush()
        // Also when the accessory is disconnected.
        case .endEncountered, .errorOccurred: onClosed?()
        default: break
        }
    }

    private func read() {
        guard let input = session?.inputStream else { return }
        var buffer = [UInt8](repeating: 0, count: 1024)
        while input.hasBytesAvailable {
            let count = input.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { return }
            onData?(Data(buffer[0..<count]))
        }
    }

    private func flush() {
        guard let output = session?.outputStream else { return }
        while output.hasSpaceAvailable, let next = pending.first {
            let bytes = [UInt8](next.data)
            let count = output.write(bytes, maxLength: bytes.count)
            guard count >= 0 else {
                onClosed?()
                return
            }
            if count == bytes.count {
                pending.removeFirst()
                next.done(nil)
            } else if count == 0 {
                return
            } else {
                pending[0].data = Data(bytes[count...])
            }
        }
    }
}
