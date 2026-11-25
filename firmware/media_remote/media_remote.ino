/*
 * CoDriveMate media remote for ESP32 (Arduino, NimBLE-Arduino 2.5 or newer).
 * NOT compiled or run yet.
 *
 * The app connects to this module. The module asks the iPad to pair and then
 * uses the Apple Media Service that iOS offers on the same connection: it reads
 * what is playing in ANY app (YouTube Music, Spotify, podcasts ...) and sends
 * play, pause, next and previous. Everything is passed on to the app through
 * a small service of our own.
 *
 * To add it to the light firmware: copy everything except setup()/loop(), call
 * mediaBegin(server) after creating the server, forward the server callbacks,
 * and call mediaLoop() from loop().
 */
#include <Arduino.h>
#include <NimBLEDevice.h>

// --- our service, used by the app -------------------------------------------
static const char* MEDIA_SERVICE = "6e1a0011-7c3b-4d2a-9f10-5049434153d0";
static const char* MEDIA_COMMAND = "6e1a0012-7c3b-4d2a-9f10-5049434153d0";  // app writes 1 byte
static const char* MEDIA_STATE = "6e1a0013-7c3b-4d2a-9f10-5049434153d0";    // we notify

// Commands from the app. 0-4 are the Apple Media Service command ids.
static const uint8_t CMD_TOGGLE = 2, CMD_NEXT = 3, CMD_PREVIOUS = 4;
static const uint8_t CMD_SEND_STATE = 0xFF;  // "tell me everything again"

// Messages to the app: one byte kind, then the value.
enum Kind : uint8_t { KIND_READY = 0, KIND_APP = 1, KIND_TITLE = 2, KIND_ARTIST = 3, KIND_PLAYING = 4 };

// --- Apple Media Service -----------------------------------------------------
static const char* AMS_SERVICE = "89D3502B-0F36-433A-8EF4-C502AD55F8DC";
static const char* AMS_REMOTE_COMMAND = "9B3C81D8-57B1-4A8A-B8DF-0E56F7CA51C2";
static const char* AMS_ENTITY_UPDATE = "2F7CABCE-808D-411F-9A0C-BB92BA96C102";
static const uint8_t ENTITY_PLAYER = 0, PLAYER_NAME = 0, PLAYER_PLAYBACK = 1;
static const uint8_t ENTITY_TRACK = 2, TRACK_ARTIST = 0, TRACK_TITLE = 2;

static NimBLEServer* bleServer = nullptr;
static NimBLECharacteristic* stateOut = nullptr;
static NimBLERemoteCharacteristic* amsCommand = nullptr;

// Set in callbacks, handled in mediaLoop(): GATT calls must not block callbacks.
static volatile uint16_t peer = BLE_HS_CONN_HANDLE_NONE;
static volatile bool authenticated = false;
static volatile bool amsReady = false;
static volatile bool sendAll = false;
static volatile uint32_t nextTry = 0;
static QueueHandle_t commands = nullptr;

static SemaphoreHandle_t lock = nullptr;
static String appName, title, artist;
static bool playing = false;

static void send(uint8_t kind, const String& value) {
  uint8_t data[1 + 160];
  size_t length = min<size_t>(value.length(), 160);
  // Do not cut a UTF-8 character in half.
  while (length < value.length() && length > 0 && (value[length] & 0xC0) == 0x80) length--;
  data[0] = kind;
  memcpy(data + 1, value.c_str(), length);
  stateOut->setValue(data, length + 1);
  stateOut->notify();
  delay(5);
}

static void sendEverything() {
  xSemaphoreTake(lock, portMAX_DELAY);
  const String a = appName, t = title, r = artist;
  const bool p = playing;
  xSemaphoreGive(lock);
  send(KIND_READY, amsReady ? "1" : "0");
  send(KIND_APP, a);
  send(KIND_TITLE, t);
  send(KIND_ARTIST, r);
  send(KIND_PLAYING, p ? "1" : "0");
}

// [entity, attribute, flags, UTF-8 value]
static void onEntityUpdate(NimBLERemoteCharacteristic*, uint8_t* data, size_t length, bool) {
  if (length < 3) return;
  String value;
  value.concat((const char*)data + 3, length - 3);
  xSemaphoreTake(lock, portMAX_DELAY);
  if (data[0] == ENTITY_PLAYER && data[1] == PLAYER_NAME) appName = value;
  // "state,rate,elapsed"; state 1 = playing
  if (data[0] == ENTITY_PLAYER && data[1] == PLAYER_PLAYBACK) playing = value.startsWith("1");
  if (data[0] == ENTITY_TRACK && data[1] == TRACK_ARTIST) artist = value;
  if (data[0] == ENTITY_TRACK && data[1] == TRACK_TITLE) title = value;
  xSemaphoreGive(lock);
  sendAll = true;
}

static bool connectMediaService() {
  NimBLEClient* client = bleServer->getClient(peer);
  if (!client) return false;
  NimBLERemoteService* service = client->getService(AMS_SERVICE);
  if (!service) return false;
  NimBLERemoteCharacteristic* update = service->getCharacteristic(AMS_ENTITY_UPDATE);
  amsCommand = service->getCharacteristic(AMS_REMOTE_COMMAND);
  if (!update || !amsCommand || !update->subscribe(true, onEntityUpdate)) return false;
  const uint8_t player[] = {ENTITY_PLAYER, PLAYER_NAME, PLAYER_PLAYBACK};
  const uint8_t track[] = {ENTITY_TRACK, TRACK_ARTIST, TRACK_TITLE};
  return update->writeValue(player, sizeof(player), true) && update->writeValue(track, sizeof(track), true);
}

static void resetMedia() {
  peer = BLE_HS_CONN_HANDLE_NONE;
  authenticated = amsReady = false;
  amsCommand = nullptr;
  xSemaphoreTake(lock, portMAX_DELAY);
  appName = title = artist = "";
  playing = false;
  xSemaphoreGive(lock);
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*, NimBLEConnInfo& info) override {
    peer = info.getConnHandle();
    // Shows "Pair" on the iPad the first time.
    NimBLEDevice::startSecurity(info.getConnHandle());
  }
  void onAuthenticationComplete(NimBLEConnInfo& info) override {
    authenticated = info.isEncrypted();
    nextTry = 0;
  }
  void onDisconnect(NimBLEServer*, NimBLEConnInfo&, int) override {
    resetMedia();
    NimBLEDevice::startAdvertising();
  }
};

class CommandCallbacks : public NimBLECharacteristicCallbacks {
  // The signature differs between NimBLE versions, so both are here, without
  // "override"; the library calls the one it knows.
  void onWrite(NimBLECharacteristic* characteristic, NimBLEConnInfo&) {
    const NimBLEAttValue value = characteristic->getValue();
    take(value.data(), value.size());
  }
  uint8_t onWrite(NimBLECharacteristic*, NimBLEAttValue& value, NimBLEConnInfo&) {
    take(value.data(), value.size());
    return 0;
  }
  static void take(const uint8_t* data, size_t length) {
    if (length == 1) xQueueSend(commands, data, 0);
  }
};

static ServerCallbacks serverCallbacks;
static CommandCallbacks commandCallbacks;

void mediaBegin(NimBLEServer* server) {
  bleServer = server;
  lock = xSemaphoreCreateMutex();
  commands = xQueueCreate(8, sizeof(uint8_t));
  NimBLEService* service = server->createService(MEDIA_SERVICE);
  // Only a paired tablet may control the music.
  service->createCharacteristic(MEDIA_COMMAND, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_ENC)
      ->setCallbacks(&commandCallbacks);
  stateOut = service->createCharacteristic(MEDIA_STATE, NIMBLE_PROPERTY::NOTIFY);
  service->start();
}

void mediaLoop() {
  if (peer == BLE_HS_CONN_HANDLE_NONE) return;
  if (authenticated && !amsReady && millis() >= nextTry) {
    // iOS does not promise that the service is there at once.
    nextTry = millis() + 3000;
    amsReady = connectMediaService();
    sendAll = true;
  }
  uint8_t command;
  while (xQueueReceive(commands, &command, 0) == pdTRUE) {
    if (command == CMD_SEND_STATE) sendAll = true;
    else if (amsReady && amsCommand && command <= CMD_PREVIOUS) amsCommand->writeValue(&command, 1, true);
  }
  if (sendAll) {
    sendAll = false;
    sendEverything();
  }
}

void setup() {
  Serial.begin(115200);
  NimBLEDevice::init("CoDriveMate Media");
  NimBLEDevice::setMTU(185);
  NimBLEDevice::setSecurityAuth(true, false, true);  // bonding, no PIN, secure connections
  NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);

  NimBLEServer* server = NimBLEDevice::createServer();
  server->setCallbacks(&serverCallbacks);
  mediaBegin(server);

  NimBLEAdvertising* advertising = NimBLEDevice::getAdvertising();
  advertising->addServiceUUID(MEDIA_SERVICE);
  advertising->enableScanResponse(true);
  advertising->setName("CoDriveMate Media");
  advertising->start();
}

void loop() {
  mediaLoop();
  delay(20);
}
