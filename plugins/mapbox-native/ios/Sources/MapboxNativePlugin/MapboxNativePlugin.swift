import Capacitor
import CoreLocation
import Foundation
import MapboxMaps
import UIKit

/// Mapbox maps behind the web view, told apart by `mapId`. Logo and attribution stay visible, as
/// Mapbox requires. NOT compiled or run yet (needs macOS and Xcode).
@objc(MapboxNativePlugin)
public class MapboxNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MapboxNativePlugin"
    public let jsName = "MapboxNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFrame", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addLayer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveOffline", returnType: CAPPluginReturnPromise)
    ]

    private final class OpenMap {
        let view: MapView
        var cancelables = Set<AnyCancelable>()
        var pendingCreate: CAPPluginCall?

        init(_ view: MapView) { self.view = view }
    }

    private var maps: [String: OpenMap] = [:]
    private var offlineTask: Cancelable?

    @objc func create(_ call: CAPPluginCall) {
        guard let token = call.getString("token"),
              let style = call.getString("style"), let styleURI = StyleURI(rawValue: style),
              let frame = Self.frame(call.getObject("frame")),
              let camera = Self.camera(call.getObject("camera")) else {
            return call.reject("Invalid map options")
        }
        let mapId = Self.mapId(call)
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else { return call.reject("No web view") }
            self.removeMap(mapId)
            MapboxOptions.accessToken = token

            let map = MapView(
                frame: frame,
                mapInitOptions: MapInitOptions(cameraOptions: camera, styleURI: styleURI))
            map.layer.cornerRadius = 18
            map.clipsToBounds = true
            // The web view handles all touches.
            map.isUserInteractionEnabled = false
            map.ornaments.options.scaleBar.visibility = .hidden
            map.ornaments.options.compass.visibility = .hidden

            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear
            // Capacitor's root view is the web view itself, so the map goes below its content.
            webView.scrollView.insertSubview(map, at: 0)

            let open = OpenMap(map)
            open.pendingCreate = call
            self.maps[mapId] = open
            map.mapboxMap.onStyleLoaded.observe { [weak open] _ in
                open?.pendingCreate?.resolve()
                open?.pendingCreate = nil
            }.store(in: &open.cancelables)
            map.mapboxMap.onMapLoadingError.observe { [weak self] error in
                self?.failed(mapId, error.message, isStyle: error.type == .style)
            }.store(in: &open.cancelables)
        }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.removeMap(Self.mapId(call))
            call.resolve()
        }
    }

    @objc func setFrame(_ call: CAPPluginCall) {
        guard let frame = Self.frame(call.getObject("frame")) else { return call.reject("Invalid frame") }
        withMap(call) { $0.frame = frame }
    }

    @objc func setCamera(_ call: CAPPluginCall) {
        guard let camera = Self.camera(call.getObject("camera")) else { return call.reject("Invalid camera") }
        let duration = (call.getDouble("durationMs") ?? 0) / 1000
        withMap(call) { map in
            map.camera.cancelAnimations()
            if duration > 0 {
                map.camera.ease(to: camera, duration: duration, curve: .linear, completion: nil)
            } else {
                map.mapboxMap.setCamera(to: camera)
            }
        }
    }

    @objc func addSource(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let source = Self.json(call.getString("source")) else {
            return call.reject("Invalid source")
        }
        withMap(call) { try $0.mapboxMap.addSource(withId: id, properties: source) }
    }

    @objc func setData(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let data = Self.json(call.getString("data")) else {
            return call.reject("Invalid data")
        }
        withMap(call) { try $0.mapboxMap.setSourceProperty(for: id, property: "data", value: data) }
    }

    @objc func addLayer(_ call: CAPPluginCall) {
        guard let layer = Self.json(call.getString("layer")) else { return call.reject("Invalid layer") }
        withMap(call) { try $0.mapboxMap.addLayer(with: layer, layerPosition: nil) }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("Invalid layer") }
        let value = call.getBool("visible", true) ? "visible" : "none"
        withMap(call) { try $0.mapboxMap.setLayerProperty(for: id, property: "visibility", value: value) }
    }

    @objc func addImage(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let png = call.getString("png"),
              let data = Data(base64Encoded: png),
              let image = UIImage(data: data, scale: CGFloat(call.getDouble("scale") ?? 1)) else {
            return call.reject("Invalid image")
        }
        withMap(call) { try $0.mapboxMap.addImage(image, id: id) }
    }

    @objc func setConfig(_ call: CAPPluginCall) {
        guard let name = call.getString("name") else { return call.reject("Invalid config") }
        let value: Any = call.getString("value") ?? call.getBool("value", false)
        withMap(call) {
            try $0.mapboxMap.setStyleImportConfigProperty(for: "basemap", config: name, value: value)
        }
    }

    /// Style packs plus the tile packs along the line, in the default tile store
    /// that the map reads from.
    @objc func saveOffline(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let token = call.getString("token"),
              let styles = call.getArray("styles") as? [String],
              let points = call.getArray("points") as? [[Any]] else {
            return call.reject("Invalid offline options")
        }
        let uris = styles.compactMap { StyleURI(rawValue: $0) }
        let coordinates = points.compactMap { point -> CLLocationCoordinate2D? in
            guard point.count == 2, let lon = Self.number(point[0]), let lat = Self.number(point[1]) else { return nil }
            return CLLocationCoordinate2D(latitude: lat, longitude: lon)
        }
        guard !uris.isEmpty, coordinates.count > 1 else { return call.reject("Invalid offline options") }
        MapboxOptions.accessToken = token

        let manager = OfflineManager()
        let descriptors = uris.map { uri in
            manager.createTilesetDescriptor(
                for: TilesetDescriptorOptions(styleURI: uri, zoomRange: 0...16, tilesets: nil))
        }
        guard let packOptions = StylePackLoadOptions(
                glyphsRasterizationMode: .ideographsRasterizedLocally, metadata: nil, acceptExpired: false),
              let regionOptions = TileRegionLoadOptions(
                geometry: .lineString(LineString(coordinates)), descriptors: descriptors,
                metadata: nil, acceptExpired: false) else {
            return call.reject("Invalid offline options")
        }
        loadStyles(uris[...], manager, packOptions) { [weak self] error in
            if let error { return call.reject(error.localizedDescription) }
            self?.offlineTask = TileStore.default.loadTileRegion(forId: id, loadOptions: regionOptions) { progress in
                let required = max(1, progress.requiredResourceCount)
                self?.notifyListeners("offlineProgress", data: [
                    "share": Double(progress.completedResourceCount) / Double(required)
                ])
            } completion: { result in
                _ = manager // alive until the region is loaded
                switch result {
                case .success: call.resolve()
                case .failure(let error): call.reject(error.localizedDescription)
                }
            }
        }
    }

    private func loadStyles(_ uris: ArraySlice<StyleURI>, _ manager: OfflineManager,
                            _ options: StylePackLoadOptions, done: @escaping (Error?) -> Void) {
        guard let uri = uris.first else { return done(nil) }
        offlineTask = manager.loadStylePack(for: uri, loadOptions: options) { _ in } completion: { [weak self] result in
            if case .failure(let error) = result { return done(error) }
            self?.loadStyles(uris.dropFirst(), manager, options, done: done)
        }
    }

    private func withMap(_ call: CAPPluginCall, _ action: @escaping (MapView) throws -> Void) {
        DispatchQueue.main.async {
            guard let map = self.maps[Self.mapId(call)]?.view else { return call.reject("No map") }
            do {
                try action(map)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    private func failed(_ mapId: String, _ message: String, isStyle: Bool) {
        let rejected = message.range(of: "\\b40[13]\\b|unauthori|forbidden|access token",
                                     options: [.regularExpression, .caseInsensitive]) != nil
        // A single missing tile is no reason to give up while the style is loading.
        if let open = maps[mapId], let call = open.pendingCreate, isStyle || rejected {
            open.pendingCreate = nil
            call.reject(message, nil, nil, ["rejected": rejected])
        }
        notifyListeners("mapError", data: ["mapId": mapId, "message": message, "rejected": rejected])
    }

    private func removeMap(_ mapId: String) {
        guard let open = maps.removeValue(forKey: mapId) else { return }
        open.pendingCreate?.reject("Map removed")
        open.pendingCreate = nil
        open.cancelables.removeAll()
        open.view.removeFromSuperview()
    }

    private static func mapId(_ call: CAPPluginCall) -> String {
        call.getString("mapId") ?? "main"
    }

    private static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }

    private static func frame(_ object: JSObject?) -> CGRect? {
        guard let object, let x = number(object["x"]), let y = number(object["y"]),
              let width = number(object["width"]), let height = number(object["height"]) else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    private static func camera(_ object: JSObject?) -> CameraOptions? {
        guard let object, let center = object["center"] as? [Any], center.count == 2,
              let lon = number(center[0]), let lat = number(center[1]) else { return nil }
        return CameraOptions(
            center: CLLocationCoordinate2D(latitude: lat, longitude: lon),
            zoom: number(object["zoom"]).map { CGFloat($0) },
            bearing: number(object["bearing"]),
            pitch: number(object["pitch"]).map { CGFloat($0) })
    }

    private static func json(_ text: String?) -> [String: Any]? {
        guard let data = text?.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
}
