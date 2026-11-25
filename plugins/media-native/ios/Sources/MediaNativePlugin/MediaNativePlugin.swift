import Capacitor
import Foundation
import MediaPlayer
import UIKit
import WebKit

/// Controls the Apple Music app and shows YouTube's player. NOT compiled or
/// run yet (needs macOS and Xcode).
@objc(MediaNativePlugin)
public class MediaNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MediaNativePlugin"
    public let jsName = "MediaNative"
    public let pluginMethods: [CAPPluginMethod] = [
        "musicStatus", "musicConnect", "musicNowPlaying", "musicToggle", "musicNext",
        "musicPrevious", "musicPlaylists", "musicPlay", "youtubeShow", "youtubeFrame", "youtubeHide"
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private var observers: [NSObjectProtocol] = []
    private var youtube: WKWebView?
    /// Artwork is only encoded again when the song changes.
    private var artworkFor: MPMediaEntityPersistentID?
    private var artwork = ""

    // Touching the player before access is granted would ask for it.
    private lazy var player = MPMusicPlayerController.systemMusicPlayer

    @objc func musicStatus(_ call: CAPPluginCall) {
        call.resolve(["granted": MPMediaLibrary.authorizationStatus() == .authorized])
    }

    @objc func musicConnect(_ call: CAPPluginCall) {
        MPMediaLibrary.requestAuthorization { status in
            DispatchQueue.main.async {
                if status == .authorized { self.observe() }
                call.resolve(["granted": status == .authorized])
            }
        }
    }

    @objc func musicNowPlaying(_ call: CAPPluginCall) {
        withMusic(call) { call.resolve(self.nowPlaying()) }
    }

    @objc func musicToggle(_ call: CAPPluginCall) {
        withMusic(call) {
            if self.player.playbackState == .playing { self.player.pause() } else { self.player.play() }
            call.resolve()
        }
    }

    @objc func musicNext(_ call: CAPPluginCall) {
        withMusic(call) {
            self.player.skipToNextItem()
            call.resolve()
        }
    }

    @objc func musicPrevious(_ call: CAPPluginCall) {
        withMusic(call) {
            // Like the music app: first back to the beginning, then to the previous song.
            if self.player.currentPlaybackTime > 4 {
                self.player.skipToBeginning()
            } else {
                self.player.skipToPreviousItem()
            }
            call.resolve()
        }
    }

    @objc func musicPlaylists(_ call: CAPPluginCall) {
        withMusic(call) {
            let playlists = (MPMediaQuery.playlists().collections ?? []).compactMap { $0 as? MPMediaPlaylist }
            call.resolve(["playlists": playlists.map { [
                "id": String($0.persistentID), "name": $0.name ?? "", "count": $0.count
            ] as [String: Any] }])
        }
    }

    @objc func musicPlay(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { return call.reject("No id") }
        withMusic(call) {
            let playlists = MPMediaQuery.playlists().collections ?? []
            guard let playlist = playlists.first(where: { String($0.persistentID) == id }) else {
                return call.reject("No such playlist")
            }
            self.player.setQueue(with: playlist)
            self.player.play()
            call.resolve()
        }
    }

    @objc func youtubeShow(_ call: CAPPluginCall) {
        guard let url = call.getString("url"), url.hasPrefix("https://www.youtube.com/embed"),
              let frame = Self.frame(call.getObject("frame")) else { return call.reject("Invalid player options") }
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else { return call.reject("No web view") }
            self.youtube?.removeFromSuperview()
            let configuration = WKWebViewConfiguration()
            configuration.allowsInlineMediaPlayback = true
            let view = WKWebView(frame: frame, configuration: configuration)
            view.isOpaque = false
            view.backgroundColor = .black
            view.scrollView.isScrollEnabled = false
            let source = url.replacingOccurrences(of: "&", with: "&amp;")
            let html = """
            <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>html,body,iframe{margin:0;border:0;width:100%;height:100%;background:#000;display:block}</style>
            <iframe src="\(source)" allow="autoplay; encrypted-media; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
            """
            // YouTube identifies apps by a referrer made of the bundle id.
            let identity = (Bundle.main.bundleIdentifier ?? "app.codrivemate.ch").lowercased()
            view.loadHTMLString(html, baseURL: URL(string: "https://\(identity)"))
            webView.addSubview(view)
            self.youtube = view
            call.resolve()
        }
    }

    @objc func youtubeFrame(_ call: CAPPluginCall) {
        guard let frame = Self.frame(call.getObject("frame")) else { return call.reject("Invalid frame") }
        DispatchQueue.main.async {
            self.youtube?.frame = frame
            call.resolve()
        }
    }

    @objc func youtubeHide(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.youtube?.removeFromSuperview()
            self.youtube = nil
            call.resolve()
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    private func observe() {
        guard observers.isEmpty else { return }
        player.beginGeneratingPlaybackNotifications()
        let names: [Notification.Name] = [
            .MPMusicPlayerControllerNowPlayingItemDidChange, .MPMusicPlayerControllerPlaybackStateDidChange
        ]
        observers = names.map { name in
            NotificationCenter.default.addObserver(forName: name, object: player, queue: .main) { [weak self] _ in
                guard let self else { return }
                self.notifyListeners("musicChanged", data: self.nowPlaying())
            }
        }
    }

    private func nowPlaying() -> [String: Any] {
        guard let item = player.nowPlayingItem else { return ["item": NSNull()] }
        if artworkFor != item.persistentID || artwork.isEmpty {
            artworkFor = item.persistentID
            let image = item.artwork?.image(at: CGSize(width: 96, height: 96))
            artwork = image?.jpegData(compressionQuality: 0.8)
                .map { "data:image/jpeg;base64," + $0.base64EncodedString() } ?? ""
        }
        return ["item": [
            "title": item.title ?? "",
            "artist": item.artist ?? "",
            "artwork": artwork,
            "playing": player.playbackState == .playing
        ] as [String: Any]]
    }

    private func withMusic(_ call: CAPPluginCall, _ action: @escaping () -> Void) {
        DispatchQueue.main.async {
            guard MPMediaLibrary.authorizationStatus() == .authorized else {
                return call.reject("No access to the music app")
            }
            action()
        }
    }

    private static func frame(_ object: JSObject?) -> CGRect? {
        func number(_ key: String) -> Double? { (object?[key] as? NSNumber)?.doubleValue }
        guard let x = number("x"), let y = number("y"),
              let width = number("width"), let height = number("height") else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }
}
