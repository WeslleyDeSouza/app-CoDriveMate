import AVFoundation
import Capacitor
import Foundation
import Speech

/// Speaks and listens over the music of other apps: the audio session ducks
/// them and gives them their volume back. NOT compiled or run yet (needs macOS
/// and Xcode). Everything runs on the main thread.
@objc(VoiceNativePlugin)
public class VoiceNativePlugin: CAPPlugin, CAPBridgedPlugin, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    public let identifier = "VoiceNativePlugin"
    public let jsName = "VoiceNative"
    public let pluginMethods: [CAPPluginMethod] = ["play", "speak", "stop", "listen", "stopListening"]
        .map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    /// Sentences that follow each other must not make the music pump.
    private static let releaseDelay = 0.5
    /// Nothing new for this long after a word: the sentence is over.
    private static let silence = 1.6

    private var observers: [NSObjectProtocol] = []
    private var releaseWork: DispatchWorkItem?

    private var output: CAPPluginCall?
    private var player: AVAudioPlayer?
    private var synthesizer: AVSpeechSynthesizer?
    private var utterance: AVSpeechUtterance?

    private var input: CAPPluginCall?
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var recognizer: SFSpeechRecognizer?
    private var heard = ""
    private var deadline: DispatchWorkItem?
    private var pause: DispatchWorkItem?

    override public func load() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
        ) { [weak self] note in
            let type = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            if type == AVAudioSession.InterruptionType.began.rawValue { self?.endAll() }
        })
        observers.append(center.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.endAll() })
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    @objc func play(_ call: CAPPluginCall) {
        guard let data = call.getString("data").flatMap({ Data(base64Encoded: $0) }) else {
            return call.reject("No sound")
        }
        DispatchQueue.main.async {
            self.begin(call)
            do {
                try self.duck()
                let player = try AVAudioPlayer(data: data)
                player.delegate = self
                self.player = player
                if !player.play() { self.endOutput(error: "Sound could not be played") }
            } catch {
                self.endOutput(error: error.localizedDescription)
            }
        }
    }

    @objc func speak(_ call: CAPPluginCall) {
        let utterance = AVSpeechUtterance(string: call.getString("text") ?? "")
        let locale = call.getString("locale") ?? "de-DE"
        let rate = call.getFloat("rate") ?? 1
        let base = AVSpeechUtteranceDefaultSpeechRate
        // Same scale as the text-to-speech plugin on the other platforms.
        utterance.rate = rate >= 1 ? 0.1 * rate + (base - 0.1) : rate * base
        utterance.voice = call.getString("voice").flatMap { AVSpeechSynthesisVoice(identifier: $0) }
            ?? AVSpeechSynthesisVoice(language: locale)
        DispatchQueue.main.async {
            self.begin(call)
            do {
                try self.duck()
                // A new one every time: a stuck one would keep all later sentences waiting.
                let synthesizer = AVSpeechSynthesizer()
                synthesizer.usesApplicationAudioSession = true
                synthesizer.delegate = self
                self.synthesizer = synthesizer
                self.utterance = utterance
                synthesizer.speak(utterance)
            } catch {
                self.endOutput(error: error.localizedDescription)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endOutput()
            call.resolve()
        }
    }

    @objc func listen(_ call: CAPPluginCall) {
        let language = call.getString("language") ?? "de-CH"
        let maxMs = call.getInt("maxMs") ?? 8000
        DispatchQueue.main.async {
            self.endOutput()
            self.endInput()
            guard SFSpeechRecognizer.authorizationStatus() == .authorized,
                  let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)),
                  recognizer.isAvailable else { return call.reject("Speech input not available") }
            self.input = call
            self.heard = ""
            self.releaseWork?.cancel()
            do {
                let session = AVAudioSession.sharedInstance()
                // Music stays on the car's loudspeakers; the device's own microphone listens.
                try session.setCategory(
                    .playAndRecord, mode: .default,
                    options: [.duckOthers, .defaultToSpeaker, .allowBluetoothA2DP]
                )
                try session.setActive(true)
                try self.startRecognition(recognizer)
            } catch {
                return self.endInput(error: error.localizedDescription)
            }
            let deadline = DispatchWorkItem { [weak self] in self?.endInput() }
            self.deadline = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(maxMs), execute: deadline)
        }
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.endInput()
            call.resolve()
        }
    }

    public func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            if player === self.player { self.endOutput() }
        }
    }

    public func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        DispatchQueue.main.async {
            if player === self.player { self.endOutput(error: "Sound could not be played") }
        }
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            if utterance === self.utterance { self.endOutput() }
        }
    }

    private func startRecognition(_ recognizer: SFSpeechRecognizer) throws {
        let engine = AVAudioEngine()
        let format = engine.inputNode.outputFormat(forBus: 0)
        // Installing a tap without a microphone would crash the app.
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "VoiceNative", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone"])
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        self.engine = engine
        self.request = request
        self.recognizer = recognizer
        engine.prepare()
        try engine.start()
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            DispatchQueue.main.async {
                // Not the results of an earlier one.
                guard let self, self.request === request else { return }
                if let result { self.understood(result) } else if error != nil { self.endInput() }
            }
        }
    }

    private func understood(_ result: SFSpeechRecognitionResult) {
        let text = result.bestTranscription.formattedString
        if !text.isEmpty { heard = text }
        if result.isFinal { return endInput() }
        pause?.cancel()
        let pause = DispatchWorkItem { [weak self] in self?.endInput() }
        self.pause = pause
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.silence, execute: pause)
    }

    private func begin(_ call: CAPPluginCall) {
        endInput()
        endOutput()
        releaseWork?.cancel()
        output = call
    }

    private func duck() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
        try session.setActive(true)
    }

    private func endOutput(error: String? = nil) {
        guard let call = output else { return }
        output = nil
        utterance = nil
        player?.stop()
        player = nil
        synthesizer?.stopSpeaking(at: .immediate)
        synthesizer = nil
        if let error { call.reject(error) } else { call.resolve() }
        releaseSession()
    }

    private func endInput(error: String? = nil) {
        guard let call = input else { return }
        input = nil
        deadline?.cancel()
        pause?.cancel()
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        request?.endAudio()
        request = nil
        task?.cancel()
        task = nil
        recognizer = nil
        if let error { call.reject(error) } else { call.resolve(["text": heard]) }
        releaseSession()
    }

    private func endAll() {
        endInput()
        endOutput()
    }

    /// Gives the music its volume back.
    private func releaseSession() {
        releaseWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.output == nil, self.input == nil else { return }
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        releaseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.releaseDelay, execute: work)
    }
}
