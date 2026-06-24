/*
  LightyCoderDoodad ESP32 Arduino example

  Sends stock Arcade Coder BLE commands from an ESP32 without changing firmware.

  What it does:
    1. Scans for the Arcade Coder BLE service, or uses TARGET_ADDRESS if set.
    2. Connects as a BLE client.
    3. Starts the stock built-in "paint" module.
    4. Sends a few pre-compressed compact canvas commands for single pixels.

  Board/library:
    - ESP32 Arduino core
    - Uses the built-in ESP32 BLE Arduino API: #include <BLEDevice.h>

  Notes:
    - This example stores pre-compressed canvas payloads, so it does not need zlib/miniz.
    - To send arbitrary generated images from the ESP32, add raw DEFLATE compression or
      generate compact canvas bytes elsewhere and store them in flash.
    - Wire colour order for frame bytes is B, G, R.
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEClient.h>
#include <BLEScan.h>
#include <BLERemoteService.h>
#include <BLERemoteCharacteristic.h>

// Leave empty to scan for the service UUID. Or set to something like "C4:4F:33:24:15:37".
static const char* TARGET_ADDRESS = "";

static BLEUUID SERVICE_UUID("778d5426-fa29-4363-91fd-a9f5cfcfce85");
static BLEUUID COMMAND_CHAR_UUID("e18d056b-7dae-49c1-b5f2-17684801e446");

static BLEClient* client = nullptr;
static BLERemoteCharacteristic* commandChar = nullptr;
static String foundAddress = "";

// CommandMessage.start_builtin("paint")
static const uint8_t START_PAINT_CMD[] = {
  0x08, 0x02, 0x22, 0x0c, 0x0a, 0x05, 0x70, 0x61, 0x69, 0x6e, 0x74, 0x15,
  0x00, 0x00, 0x80, 0x3f,
};

// Compact-canvas commands, already protobuf-wrapped for COMMAND_CHAR.
// They are 12x12 frames with one lit pixel. These use pre-compressed raw-DEFLATE payloads.
// Pixel coordinates are x,y with 0,0 top-left. "BR" means bottom-right, 11,11.
static const uint8_t PIXEL_RED_BR_CMD[] = {
  0x08, 0x04, 0x3a, 0x0f, 0x08, 0x00, 0x12, 0x0b, 0x0c, 0x0c, 0x63, 0x60,
  0x18, 0x05, 0x43, 0x08, 0xfc, 0x07, 0x00,
};

static const uint8_t PIXEL_GREEN_TOP_LEFT_CMD[] = {
  0x08, 0x04, 0x3a, 0x0f, 0x08, 0x00, 0x12, 0x0b, 0x0c, 0x0c, 0x63, 0xf8,
  0xcf, 0x30, 0x0a, 0x86, 0x10, 0x00, 0x00,
};

static const uint8_t PIXEL_BLUE_CENTER_CMD[] = {
  0x08, 0x04, 0x3a, 0x10, 0x08, 0x00, 0x12, 0x0c, 0x0c, 0x0c, 0x63, 0x60,
  0x18, 0xf2, 0xe0, 0x3f, 0xc3, 0x08, 0x02, 0x00,
};

static const uint8_t CANVAS_OFF_CMD[] = {
  0x08, 0x04, 0x3a, 0x0e, 0x08, 0x00, 0x12, 0x0a, 0x0c, 0x0c, 0x63, 0x60,
  0x18, 0x05, 0x43, 0x09, 0x00, 0x00,
};

static bool writeCommand(const uint8_t* data, size_t len, const char* label) {
  if (!commandChar) {
    Serial.println("No command characteristic");
    return false;
  }
  Serial.printf("Writing %s (%u bytes)\n", label, (unsigned)len);
  commandChar->writeValue((uint8_t*)data, len, false);  // false = write without response
  delay(80);
  return true;
}

class ArcadeScanCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice device) override {
    String name = device.haveName() ? device.getName().c_str() : "";
    bool hasService = device.haveServiceUUID() && device.isAdvertisingService(SERVICE_UUID);
    bool nameLooksLikely = name.length() && (name.indexOf("Arcade") >= 0 || name.indexOf("Coder") >= 0 || name.indexOf("arcade") >= 0 || name.indexOf("coder") >= 0);

    Serial.printf("  %s  %s\n", device.getAddress().toString().c_str(), name.c_str());
    if (hasService || nameLooksLikely) {
      foundAddress = device.getAddress().toString().c_str();
      Serial.printf("Selected %s\n", foundAddress.c_str());
      BLEDevice::getScan()->stop();
    }
  }
};

static bool findArcadeAddress(BLEAddress& outAddress) {
  Serial.println("Scanning for Arcade Coder service...");
  foundAddress = "";
  BLEScan* scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ArcadeScanCallbacks(), true);
  scan->setActiveScan(true);
  scan->start(8, false);
  scan->clearResults();

  if (!foundAddress.length()) return false;
  outAddress = BLEAddress(foundAddress.c_str());
  return true;
}

static bool connectArcade() {
  BLEAddress address("00:00:00:00:00:00");
  if (strlen(TARGET_ADDRESS) > 0) {
    address = BLEAddress(TARGET_ADDRESS);
  } else if (!findArcadeAddress(address)) {
    Serial.println("No Arcade Coder found.");
    return false;
  }

  Serial.printf("Connecting to %s...\n", address.toString().c_str());
  client = BLEDevice::createClient();
  if (!client->connect(address)) {
    Serial.println("Connect failed.");
    return false;
  }

  // Helpful for larger future frames. The sample frames are small enough for default MTU.
  client->setMTU(517);

  BLERemoteService* service = client->getService(SERVICE_UUID);
  if (!service) {
    Serial.println("Service not found.");
    client->disconnect();
    return false;
  }

  commandChar = service->getCharacteristic(COMMAND_CHAR_UUID);
  if (!commandChar) {
    Serial.println("Command characteristic not found.");
    client->disconnect();
    return false;
  }

  Serial.println("Connected and command characteristic ready.");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("LightyCoderDoodad ESP32 paint example");

  BLEDevice::init("LightyCoderDoodadESP32");

  if (!connectArcade()) {
    Serial.println("Stopped. Reset to retry.");
    return;
  }

  writeCommand(START_PAINT_CMD, sizeof(START_PAINT_CMD), "start paint");
  Serial.println("Waiting for paint module to settle...");
  delay(1500);

  writeCommand(PIXEL_RED_BR_CMD, sizeof(PIXEL_RED_BR_CMD), "red pixel 11,11");
  delay(900);
  writeCommand(PIXEL_GREEN_TOP_LEFT_CMD, sizeof(PIXEL_GREEN_TOP_LEFT_CMD), "green pixel 0,0");
  delay(900);
  writeCommand(PIXEL_BLUE_CENTER_CMD, sizeof(PIXEL_BLUE_CENTER_CMD), "blue pixel 5,5");
  delay(900);
  writeCommand(CANVAS_OFF_CMD, sizeof(CANVAS_OFF_CMD), "clear/off canvas");
}

void loop() {
  // Tiny heartbeat demo after setup. Comment this out if you only want one-shot sending.
  static uint32_t last = 0;
  static int step = 0;
  if (!client || !client->isConnected()) return;
  if (millis() - last < 2500) return;
  last = millis();

  switch (step++ % 4) {
    case 0: writeCommand(PIXEL_RED_BR_CMD, sizeof(PIXEL_RED_BR_CMD), "red pixel 11,11"); break;
    case 1: writeCommand(PIXEL_GREEN_TOP_LEFT_CMD, sizeof(PIXEL_GREEN_TOP_LEFT_CMD), "green pixel 0,0"); break;
    case 2: writeCommand(PIXEL_BLUE_CENTER_CMD, sizeof(PIXEL_BLUE_CENTER_CMD), "blue pixel 5,5"); break;
    default: writeCommand(CANVAS_OFF_CMD, sizeof(CANVAS_OFF_CMD), "clear/off canvas"); break;
  }
}
