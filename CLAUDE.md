# CoDriveMate — Project Guidelines

## Overview

**CoDriveMate** turns a tablet into a smart cockpit for older cars. A Bluetooth LE
adapter on the OBD2 port delivers engine data; the app shows speed, RPM,
consumption, range and warnings. On top: navigation with live traffic, a 3D view
of the car in its real surroundings, diagnostics, a logbook, maintenance
reminders, an AI copilot (voice) and control of the LED interior lighting via an
ESP32 module.

First vehicle: **Citroën Xsara Picasso**. Goal: work for any vehicle — never
hard-code vehicle specifics outside a `VehicleProfile`.

Status: the working reference is the single-file prototype **`_index.html`**
("Currus", demo mode only, never tested in a real car). It is the **design and
behaviour reference** and is being ported domain by domain. It is not part of the
build; do not edit it, read it.

User-facing language: German first (Swiss spelling: `ss`, no `ß`), multilingual
via i18n. Code, identifiers and comments: English.

## Stack

- **Angular 22** — standalone components, signals, zoneless, `@if/@for` control
  flow, SCSS. Unit tests: Vitest (`ng test`).
- **Capacitor 8** — Android + iOS from the same codebase; the web build stays a
  first-class target (Chrome, Web Bluetooth).
- **Capawesome Cloud** (console.cloud.capawesome.io) — build and release pipeline
  (replaces Ionic Appflow, decided 2026-11-25). **No Ionic in this repository**:
  no Ionic CLI, no `@ionic/angular`, no `ion-*` components, no Ionic CSS. All
  UI is our own, built from the design tokens in `src/styles.scss`.
- **IndexedDB** (via `idb`) for all persistent data and all caches.
- **`@capacitor-community/bluetooth-le`** for every Bluetooth connection (native
  on Android/iOS, Web Bluetooth in the browser — same API).

Versions are the ones in `package.json` (checked 2026-11-24: Angular 22.3,
Capacitor 8.6, TypeScript 6.0, Vitest 5). `package.json` is the source of truth;
update this section when a major version changes.

## Commands

```bash
npm start                # dev server (web), http://localhost:4200
npm run build            # production build -> dist/app/browser
npm run build:demo       # production build with the demo drive (demo page, GitHub Pages)
npm test                 # unit tests (Vitest)
npm run lint             # ESLint incl. architecture boundaries
npm run cap:sync         # build + copy web assets into android/ and ios/
npm run cap:open:android # open Android Studio
npm run version:set 1.0.1 # release version -> package.json, iOS, Android
npm run translate        # generate en (and others) from de
npm run capawesome:build # build + version/build number (what Capawesome Cloud runs)
```

Build requirements (Capacitor 8): Node ≥ 22, **JDK 21** for Android, compile/target
SDK 36, iOS deployment target 15. iOS builds and signing need macOS + Xcode (or
Capawesome Cloud). Details: `docs/betrieb/release-pipeline.md`.

- `capacitor.config.json` is static JSON. Bundle ID: `app.codrivemate.ch`.
- The Angular project is named `app`; the output path `dist/app/browser` (`webDir`)
  depends on it. Do not rename it.

## Architecture: modular, domain-driven

```
src/app/
  core/        technical building blocks, no business knowledge
    bluetooth/   BleTransport port + Capacitor adapter (shared by OBD and lighting)
    storage/     IndexedDB: key-value, collections, cache, legacy migration, backup
    i18n/        translation setup
    map/         OpenFreeMap with its store on the device (map, 3D, offline routes)
  shared/      reusable, domain-free code
    kernel/      pure helpers (e.g. ProviderChain for fallbacks)
    ui/          our own UI components
  domains/     one folder per bounded context (see below)
  shell/       cockpit layout: left panel, stage with side sheet, dock
```

Every domain has the same four layers:

| Layer | Contains | May import |
| --- | --- | --- |
| `domain/` | models, value objects, pure rules, **ports** (abstract classes) | nothing but `shared/kernel` — **no Angular, no Capacitor, no browser APIs** |
| `application/` | signal stores and use cases | own `domain/`, `core`, `shared` |
| `infrastructure/` | adapters implementing ports: BLE, HTTP, IndexedDB, legacy migration | own `domain/`, `core`, `shared` |
| `feature/` | components, pages, routes | own `application/` + `domain/`, `shared/ui` |

Rules (enforced by ESLint, see `eslint.config.js`):

1. `domain/` is framework-free and fully unit-tested. Business rules go here,
   not into components or stores.
2. Other code imports a domain **only through its `index.ts`** (public API).
   No deep imports across domains.
3. `core/` and `shared/` never import from `domains/`.
4. Hardware and network access always sits behind a port. `feature/` and
   `application/` never touch `BleClient`, `fetch`, `indexedDB` or
   `localStorage` directly.
5. Wiring (which adapter implements which port) lives in the domain's
   `<domain>.providers.ts`, registered in `app.config.ts`.
6. Each domain is lazy-loaded through its routes; adding a domain must not
   require changes in other domains.

Path aliases: `@core/*`, `@shared/*`, `@domains/*`, `@shell/*`.

### Domains

| Domain | Purpose | State |
| --- | --- | --- |
| `telemetry` | OBD2/ELM327 over BLE, live values, demo source, vehicle profile | ported (core) |
| `settings` | app settings, API keys, vehicle data | ported (core) |
| `logbook` | trips, eco score | ported; car untested |
| `maintenance` | service intervals, MFK, vignette | ported; counting untested in the car |
| `selftest` | device test: plugins, sensors, services, keys | new; untested on a device |
| `lighting` | ESP32 LED module over BLE | ported; module untested |
| `road` | hazards, speed limit, traffic messages | ported; traffic untested |
| `navigation` | map, routing, guidance, live traffic, provider fallback | ported; native SDK untested |
| `scene3d` | three.js car (`public/models/car.glb`) in real surroundings | ported; native second map untested |
| `diagnostics` | fault codes (DTC), vehicle warnings | ported; car untested |
| `copilot` | AI assistant, voice in/out, conversation mode | ported; not tested with a key |
| `media` | Apple Music control, YouTube player | ported; iOS part untested |
| `parking` | parking spot, meter, reminders | ported; notifications untested |
| `fuel` | tank, range, filling stations | ported; counting untested in the car |

To add a domain: create `domains/<name>/{domain,application,infrastructure,feature}`,
an `index.ts`, a `<name>.providers.ts`, a lazy route in `app.routes.ts` and a dock
entry in `shell/dock`. Port the logic from `_index.html` into `domain/` first, with
tests, then build the UI.

## Bluetooth

- One shared layer: `core/bluetooth` (`BleTransport`). OBD adapter and lighting
  module both use it; nothing else talks to the plugin.
- **BLE only.** iOS cannot use classic Bluetooth without MFi, so the Vgate iCar
  Pro 2S must run in BLE mode. The service/characteristic UUIDs in the code come
  from the prototype and are **unverified on real hardware** — check them on the
  device before relying on them.
- The web build keeps working through the plugin's Web Bluetooth implementation
  (Chrome on Android/desktop).
- Permissions are declared in `android/app/src/main/AndroidManifest.xml` and
  `ios/App/App/Info.plist` (Bluetooth, location, background modes). See
  `docs/konzepte/bluetooth.md`.

### OBD2 / ELM327 (`telemetry`)

Behaviour of the prototype (`_index.html`, object `OBD`), to be kept when porting:

- **Start sequence:** `ATZ` (timeout 5 s), wait 800 ms, then `ATE0`, `ATL0`,
  `ATS0`, `ATH0`, `ATAT1`, `ATSP0`, then `0100` (timeout 20 s, protocol search)
  and `ATDP`. No `41 00` answer means "no reply from the ECU, ignition on?".
- **Commands** are strictly serialised (one at a time); a reply ends at the `>`
  prompt. Default timeout 3 s; a timeout or write error is a value
  (`TIMEOUT`/`ERROR`), not an exception.
- **Polling:** no fixed timer. Each cycle queries all fast PIDs (speed, RPM,
  throttle, load, MAP, MAF) plus **one** slow value in rotation (coolant, intake
  air, voltage via `ATRV`, timing advance, fuel trims, O2, fuel level). The
  achieved rate (Hz) is shown in the connection status.
- **Supported PIDs:** the `0100` bitmask only covers PIDs 01–20. Higher PIDs are
  probed and dropped after 3 failed attempts. Which PIDs a vehicle is expected
  to deliver, and how missing ones are derived (e.g. consumption from MAP when
  there is no MAF), belongs in the `VehicleProfile`. Older petrol cars like the
  Picasso deliver only a few — every value is nullable and the UI must cope.
- **Reconnect:** the prototype does not reconnect; a dropped link ends the
  session. The port must reconnect automatically with backoff and re-run the
  start sequence, without user interaction while driving. A running trip in the
  logbook survives a short drop.

### Demo mode

The demo is a **full data source behind the same port** as the OBD adapter, not
a special case in the UI. Everything must be testable without a car:

- `?demo` starts the demo source on load.
- `?demo&fault=cool` (coolant climbs to 108 °C) and `?demo&fault=volt` (voltage
  around 12.1 V) trigger the warning paths; `fault=fuel` gives a short range. Add a fault scenario for every new
  vehicle warning.

### Lighting module (`lighting`)

- ESP32 module, firmware `licht/currus_licht` — **not in this repository**. The
  byte protocol is defined by the prototype (`lsend`/`lstate`, service
  `6e1a0001-7c3b-4d2a-9f10-5049434153d0`, command `…0002`, state `…0003`) and must
  be documented in `docs/konzepte/bluetooth.md` when the domain is ported.
- Discovery must find the service UUID **and** both name prefixes:
  «Currus Licht» and the old firmware's «Picasso Licht».
- If the module gets a new name (e.g. CoDriveMate), change the firmware too and
  keep the old prefixes in the scan filter.

## Runtime: background, battery, performance

- **Screen stays on** as long as the app is open (changed on request 2026-11-25).
  The prototype uses the Screen Wake Lock API and re-requests it on
  `visibilitychange`; native needs a keep-awake plugin. Both sit behind one
  port.
- **App in background:** native keeps the OBD connection and the trip recording
  alive (background modes are declared); rendering, map updates and
  conversation mode pause when the app is not visible. The web build cannot run
  in the background — on return it reconnects and resumes.
- **Bluetooth drops are normal** (ignition off, adapter sleep, range). They
  never crash a store, never lose logbook data and are shown as a state, not as
  an error dialog.
- **three.js budget:** the tablet is the target, not the dev machine. Pixel
  ratio capped at 2, render loop stops when the scene is hidden or the app is
  in the background, one scene instance, dispose geometries/materials/textures
  on teardown. The 3D scene is optional (`scene3d` setting) and must degrade to
  the 2D map on weak devices.

## Data

- Everything persistent lives in IndexedDB database `codrivemate`
  (`core/storage`): `kv` (settings and single documents), collections (e.g.
  `trips`), and `cache` (buckets with pruning) for tiles, areas, TTS audio, API
  responses. No new `localStorage` usage.
- **Existing user data must survive.** The prototype stored data in
  `localStorage` (`pdrive2`, `pd_*`) and IndexedDB `picasso-drive`. Legacy
  migrations (`LEGACY_MIGRATIONS`, one per domain) import it once and never
  delete the source. When changing a stored shape, add a migration — never break
  existing records.
- Web storage is per origin: the native apps cannot see the browser's data.
  Moving from web to native goes through backup export/import
  (`BackupService`). See `docs/konzepte/datenhaltung.md`.
- Only cache what the provider's terms allow (OpenStreetMap, swisstopo: yes;
  Google data: no).

## Keys and services

- **No API keys in the code or the build** (Google, Mapbox, TomTom, Anthropic, OpenAI, ElevenLabs).
  Keys are entered by the user in settings (stored locally) or requests go
  through a proxy. Never commit keys, never put them into `environment` files.
- Every external service is optional and has a fallback; the app must stay
  usable offline and without any key. Fallback chains are documented in
  `docs/konzepte/ausfallsicherung.md` and implemented with `ProviderChain`.
- **Network:** all HTTP goes through one port in `core`. On native the adapter
  uses `CapacitorHttp` (no CORS in the WebView's way); on the web it uses
  `fetch`, so a service without CORS headers needs the proxy there.
- **Swiss traffic function:** the prototype calls
  `/.netlify/functions/verkehr` (ASTRA/Viasuisse via opentransportdata.swiss).
  The function is not in this repository and the native apps have no Netlify
  origin. Its base URL must be configurable; where it is hosted is an open
  decision (see below).
- No CDN at runtime, except the Google Maps API, which Google only serves itself
  (loaded only for the Google map with a key). The prototype loads MapLibre, Mapbox GL, three.js and the
  icons from CDNs; the app bundles them.

## Privacy

- There is no CoDriveMate backend and no telemetry, analytics or crash upload.
  Trips, positions, logbook and settings stay in IndexedDB on the device and
  leave it only through a backup export the user starts.
- Data leaves the device only as requests to the services the user enabled:
  position/route to the map, routing, geocoding, weather and traffic providers;
  spoken text to the chosen voice provider (Google, OpenAI or ElevenLabs).
- **AI copilot (Anthropic or OpenAI API, user's own key):** each request sends the
  question, the chat history of the session and a snapshot — vehicle name and
  engine, live OBD values, current street, speed limit, outside temperature,
  nearby traffic messages, destination/ETA with the delay by traffic, trip and tank figures, and for a planned drive
  its topic and description (decided 2026-11-26). Conversation
  mode also sends destination/ETA with that topic and description, street, nearby place names, time and remarks about the car
  (tank almost empty with range, engine cold, standing still) and figures of the
  current drive (distance, duration, hard braking/acceleration, eco score), the fact that
  the driver just braked hard (for a light remark), averages of earlier drives (eco score,
  consumption, hard events per 10 km) only if the driver switched this on (off by default,
  privacy settings, decided 2026-11-26), and up to five remembered
  preferences of the driver (about 80 words). Learning them sends the answers of the talk and
  the list of known ones (up to 100); it can be switched off, seen and deleted on the copilot
  page (decided 2026-11-25). When the copilot may act (tools, switch in the
  privacy settings, on by default, decided 2026-11-26), the results of its tools
  go along too: place names and addresses from the search, names, addresses and
  distances of filling stations, the range, names of light scenes, the saved day and topic of a
  destination saved for later by voice; never
  coordinates. A tool that starts something the driver did not plainly ask for
  (a route) asks for a spoken or tapped yes first. The usual destination
  is worked out on the device and never goes to the copilot. Wikipedia gets the
  position rounded to about 100 m for them. Never sent: coordinates
  as a track, the logbook, single stored trips, API keys of other services. Keep this
  list true — extending the snapshot means updating it and the settings text.
- Without a key, nothing goes to the copilot. Do not log positions or keys.

## Safety while driving

Existing rules of the prototype; they are requirements, not details:

- Speech priority: navigation prompts and warnings interrupt everything;
  conversation mode is interrupted by everything else.
- Conversation mode stays silent within 20 s of the next manoeuvre (at least 300 m, at
  most 700 m, 700 m if the speed is unknown; changed on request 2026-11-25), while a
  vehicle warning is active, within 100 m of a hazard notice, while another voice
  output runs and when the app is not visible. Between two manoeuvres it says only what
  fits before the quiet window (short contribution from 15 s, normal from 45 s). It is
  stopped by one tap or by voice.
- **Conversation first** (setting `ai.talkFirst`, off by default, decided 2026-11-27):
  for routes the driver knows. Manoeuvres and hazard notices no longer keep it quiet,
  and turn prompts are left out while it speaks. Hazard announcements, vehicle
  warnings and copilot answers still interrupt it.
- Interior lighting is dimmed to the driving brightness as soon as the car
  moves (> 5 km/h) and restored when it stands.
- Hazard notices (level crossings, schools, signs from OpenStreetMap) are
  allowed; **no speed-camera or control locations, fixed or mobile** (illegal
  in Switzerland, see Legal).
- Warnings are glanceable and spoken; nothing requires reading or typing while
  moving. Never add interactions that demand attention while driving.

## Licences and attribution

- Map attribution is mandatory and must stay visible on the map and in the 3D
  view: «© OpenStreetMap», «© swisstopo», Mapbox logo and attribution, «© Google»
  where Google tiles are shown. Do not hide or cover the attribution control.
- `public/models/car.glb`: own work, exported from the prototype's procedural
  model (confirmed by the owner 2026-11-24). A replacement model needs a clear
  licence before it ships.
- Icons: Tabler Icons (MIT), via `@tabler/icons-webfont`.
- When adding a dependency or asset, record its licence and source in `docs/`.

## Legal and store compliance (Switzerland first)

Overview from our own research, **not legal advice**. Fine amounts and the
lighting rules could not be confirmed from a primary source. Before a public
launch a lawyer reviews privacy and liability. Details and sources go into
`docs/analysen/`.

**Status (2026-11-24): private use by the owner only.** A store release may
follow later and is not planned yet. Consequences:

- Road traffic law applies to private use too (attention, no camera/control
  warnings, lighting, read-only OBD).
- Everything under "Before publishing" is parked until a release is actually
  decided. Do not build for it now (no privacy policy, terms, store forms,
  onboarding notices) and do not raise it as a blocker.
- Do not make choices that would block a later release without saying so
  (e.g. keys in the build, unlicensed assets, caching Google data).

### Rules that shape the code

- **Distraction** (SVG Art. 31, VRV Art. 3): the driver must keep full
  attention; operating a mounted tablet is only allowed briefly and simply.
  Design for it: voice first, large targets, glanceable values. Apple and
  Google expect "distraction protection". **Decision (2026-11-24): noted only —
  do not implement locks** (no speed-dependent menu lock, no blocked screens)
  unless explicitly asked.
- **Safety notice at first start** (mount the tablet firmly, keep the view and
  airbags clear, operate only when stationary): only needed for a release, not
  built now. Liability cannot be excluded for gross negligence, so such a
  notice would not replace safe behaviour of the app.
- **No speed-camera or control warnings of any kind** — not mobile controls,
  not fixed cameras, not a database of them (Federal Supreme Court). Fixed
  hazards (level crossings, schools, roadworks) are fine. There must be no
  hazard category, OSM tag filter, traffic-message category or copilot answer
  that amounts to "control". Filter such entries out of third-party feeds and
  instruct the copilot accordingly.
- **Interior lighting:** must not shine outwards or dazzle; while driving
  nothing red, blue or blinking that is visible from outside. Driving mode
  dims, as in the prototype. Blocking red/blue for zones visible from outside
  (dashboard) is a known point for the store launch — **noted only, no colour
  or effect lock is implemented** unless explicitly asked.
- **OBD is read-only:** read live data and fault codes, clear fault codes on
  explicit user action while stationary. Never write to a control unit, no
  coding, no actuator tests, no mode `08`/manufacturer-specific write commands.
- **Google data only on Google maps:** Google's terms forbid showing Google
  routes, places or traffic on a Mapbox or OSM map — the prototype does this in
  mixed mode. In the port, map and route always match:
  - Mapbox map → Mapbox routing with live traffic (profile `driving-traffic`,
    already used by the prototype)
  - OSM/OpenFreeMap map → free OSRM
  - Google routing, places and traffic → only while the Google map is active

  Google is an optional extra, no longer the first choice of the automatic
  order. `ProviderChain` falls back to the next matching pair, never to Google
  content on a foreign map. Google data is not cached (see Data).
- **Privacy by default:** position and trips are personal data. Local storage
  only, every external service opt-in, and the settings state per service what
  is sent and to whom (Google, Mapbox, Anthropic — all US recipients). See
  Privacy.

### Before publishing (checklist, nothing of this is done)

These points are taken note of for the CoDriveMate planning. They are not
implemented in the prototype and not built now.

- Privacy policy under Swiss DSG (GDPR too if offered to EU users), with a
  public URL — both stores require it. Legal basis for transfers to the US;
  check whether the logbook with positions needs a risk assessment.
- Terms of use: navigation, warnings and AI answers without guarantee.
- **Mapbox:** in-vehicle/navigation use needs a separate commercial licence —
  clarify before relying on Mapbox in a released app.
- **Apple:** a pure WebView app risks rejection for too little native
  functionality (native Bluetooth and an offline map count towards it);
  Bluetooth and background permissions are reviewed closely —
  every usage string in `Info.plist` must describe the real purpose, and no
  background mode is declared that is not used.
- **Google Play:** background location needs the declaration form and a short
  demo video. Request background location only if a feature really needs it.
- **Trademarks:** check «CoDriveMate» at swissreg.ch. «Citroën» (and other
  makes) only as a factual vehicle designation in a `VehicleProfile`, never in
  the app name, logo, store listing or marketing.
- **ESP32 lighting module:** selling it requires CE and radio conformity. As
  long as that is missing it is a private build, not a product.

## Open decisions

Not decided — do not build on either option without asking:

- **Offline routing**: built on the device from stored OpenFreeMap tiles. The
  Mapbox Navigation SDK follows for offline routes on the Mapbox map, after the
  first working iOS build (decided 2026-11-24; needs SPM instead of CocoaPods and a
  secret download token in Capawesome Cloud, support for it unchecked). (Decided
  2026-11-24: the native Maps SDK is used in the apps, `plugins/mapbox-native`;
  Mapbox GL JS on the web. See `docs/konzepte/navigation.md`.)
- **Parking aid** (Parkhilfe): scope and hardware.
- **Swiss traffic messages**: the official API has no coordinates, only TMC codes;
  needs the ASTRA location table and a host for the proxy, or is dropped.
- App and lighting module name: Currus → CoDriveMate, including the firmware.
- **Mapbox at all** (commercial in-vehicle licence) and how much native
  functionality the iOS app needs to pass review.
- Whether the lighting module is ever sold (CE/radio conformity).

## UI and design

- Design reference: `_index.html`. Tokens (colours, radius, glass, shadow) are
  CSS custom properties in `src/styles.scss`, dark by default, `body.light` for
  the light theme. Use the tokens, do not introduce new colours ad hoc.
- First target device: **iPad** (decided 2026-11-24), Android later.
- Built for a tablet in landscape, operated while driving: large touch targets
  (≥ 48 px), glanceable values, no small text for anything safety-relevant.
- Icons: Tabler icon font (`<i class="ti ti-…">`), bundled locally — no CDN
  links anywhere (the car may be offline).
- No Ionic components (see Stack).
- Test hooks: every interactive element and key value carries
  `data-section-test="<section>-<action>"` (e.g. `settings-save`, `dock-open-engine`).
  Tests select by it, never by text or CSS class.

## i18n

All user-facing text goes through translation keys — no hard-coded UI strings in
templates or stores. German (`de`) is the source language. Details in
`core/i18n` and `docs/konzepte/mehrsprachigkeit.md`.

## Documentation

`docs/` is organised like this (German, one folder per purpose, index in
`docs/README.md`):

- `produkt/` — what the app does and the state of each area
- `konzepte/` — architecture, Bluetooth, data, fallbacks, i18n
- `betrieb/` — release pipeline, build requirements
- `analysen/` — investigations and fact checks

When you build or change something, update the matching file in `docs/` and the
index. `docs/produkt/funktionsuebersicht.md` moves with every feature change.

## Working rules

- Verify with `npm run build`, `npm test` and `npm run lint` before calling
  something done.
- Nothing has been tested in a real car yet. Do not describe hardware behaviour
  as verified unless it was tested on the device.
- Safety: see "Safety while driving".

## Git and definition of done

- `main` always builds. Work on short-lived branches: `feat/<domain>-<topic>`,
  `fix/<topic>`, `docs/<topic>`, `chore/<topic>`.
- Commits: Conventional Commits in English, scope = domain or layer
  (`feat(telemetry): reconnect with backoff`). One logical change per commit.
- Commit or push only when asked. Never commit keys, `.env` files or build
  output.
- **Done** means: `npm run build`, `npm test` and `npm run lint` are green;
  business rules live in `domain/` with tests; all UI text goes through i18n
  keys; the demo mode covers the feature; existing stored data still loads
  (migration added if a shape changed); `docs/` and
  `docs/produkt/funktionsuebersicht.md` are updated; anything not tested on real
  hardware is stated as untested.

## ⏱ Working Style

- **Implement first, test once.** Make all changes of a task, then build and
  test together at the end. Do not stop to test after every single edit.
- **Run long checks in the background.** Builds, test suites, dev servers and
  client regeneration start in the background while the next piece of work
  continues; check the result when it is needed, not by waiting idle.
