#include <MD_MAX72xx.h>
#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define HARDWARE_TYPE MD_MAX72XX::FC16_HW
#define MAX_DEVICES 2

// ESP32 SPI pins
#define DATA_PIN 23
#define CS_PIN   5
#define CLK_PIN  18

MD_MAX72XX mx = MD_MAX72XX(HARDWARE_TYPE, DATA_PIN, CLK_PIN, CS_PIN, MAX_DEVICES);

// Wi-Fi Credentials
const char* ssid     = "Hotspoootttt";
const char* password = "gefe1955";

// Target Endpoint
const char* serverUrl = "http://10.67.178.210:5000/node/NODE-4/status";

// HTTP polling interval
const unsigned long httpInterval = 2000;
unsigned long lastHttpPoll = 0;

// -------- ARROW FRAMES (UPWARD ANIMATION) --------
byte arrow1[8] = {
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011
};

byte arrow2[8] = {
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000
};

byte arrow3[8] = {
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100
};

byte arrow4[8] = {
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110
};

byte arrow5[8] = {
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011
};

byte arrow6[8] = {
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000
};

byte arrow7[8] = {
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100
};

byte arrow8[8] = {
  B11000011,
  B00011000,
  B00111100,
  B01100110,
  B11000011,
  B00011000,
  B00111100,
  B01100110
};

// -------- X SYMBOL --------
byte cross[8] = {
  B10000001,
  B01000010,
  B00100100,
  B00011000,
  B00011000,
  B00100100,
  B01000010,
  B10000001
};

bool flashState = false;
unsigned long lastFlash = 0;

int leftMode = 0;   // 0 = X , 1 = arrow (display_a)
int rightMode = 0;  // 0 = X , 1 = arrow (display_b)

int arrowFrame = 0;
unsigned long lastArrow = 0;

// -------- DRAW SYMBOL --------
void drawSymbol(byte device, byte symbol[8], bool invert = false)
{
  for (int row = 0; row < 8; row++)
  {
    for (int col = 0; col < 8; col++)
    {
      bool state = bitRead(symbol[row], 7 - col);
      if (invert) state = !state;
      mx.setPoint(row, col + device * 8, state);
    }
  }
}

// -------- DRAW ARROW --------
void drawArrowAnimated(byte device)
{
  if (arrowFrame == 0) drawSymbol(device, arrow1);
  if (arrowFrame == 1) drawSymbol(device, arrow2);
  if (arrowFrame == 2) drawSymbol(device, arrow3);
  if (arrowFrame == 3) drawSymbol(device, arrow4);
  if (arrowFrame == 4) drawSymbol(device, arrow5);
  if (arrowFrame == 5) drawSymbol(device, arrow6);
  if (arrowFrame == 6) drawSymbol(device, arrow7);
  if (arrowFrame == 7) drawSymbol(device, arrow8);
}

// -------- CONNECT WIFI --------
void connectToWiFi()
{
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20)
  {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    Serial.println("\nWiFi connected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  }
  else
  {
    Serial.println("\nWiFi connection failed. Will retry later.");
  }
}

// -------- FETCH NODE STATUS VIA HTTP --------
void fetchNodeStatus()
{
  if (WiFi.status() != WL_CONNECTED)
  {
    connectToWiFi();
    return;
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.setTimeout(3000);

  int httpResponseCode = http.GET();

  if (httpResponseCode == HTTP_CODE_OK)
  {
    String payload = http.getString();

    #if ARDUINOJSON_VERSION_MAJOR >= 7
      JsonDocument doc;
    #else
      StaticJsonDocument<512> doc;
    #endif

    DeserializationError error = deserializeJson(doc, payload);

    if (!error)
    {
      const char* displayA = doc["display_a"] | "STOP";
      const char* displayB = doc["display_b"] | "STOP";

      // Print to Serial
      Serial.print("display_a: ");
      Serial.println(displayA);
      Serial.print("display_b: ");
      Serial.println(displayB);

      // Update display modes based on values (FORWARD = arrow, STOP = X)
      if (String(displayA) == "FORWARD" || String(displayA) == "GO")
        leftMode = 1;
      else
        leftMode = 0;

      if (String(displayB) == "FORWARD" || String(displayB) == "GO")
        rightMode = 1;
      else
        rightMode = 0;
    }
    else
    {
      Serial.print("JSON parse failed: ");
      Serial.println(error.f_str());
    }
  }
  else
  {
    Serial.print("HTTP GET error: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}

void setup()
{
  Serial.begin(115200);

  // ESP32 SPI
  SPI.begin(18, 19, 23, 5);

  mx.begin();
  mx.control(MD_MAX72XX::INTENSITY, 5);
  mx.clear();

  // Initial Wi-Fi connection
  connectToWiFi();
}

void loop()
{
  // -------- HTTP POLLING (GET node status) --------
  if (millis() - lastHttpPoll > httpInterval)
  {
    lastHttpPoll = millis();
    fetchNodeStatus();
  }

  // -------- SERIAL MANUAL COMMAND OVERRIDE --------
  if (Serial.available())
  {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();

    if (cmd == "GO")
    {
      leftMode = 1;
      rightMode = 0;
    }
    else if (cmd == "BACK")
    {
      leftMode = 0;
      rightMode = 1;
    }
    else if (cmd == "STOP")
    {
      leftMode = 0;
      rightMode = 0;
    }
  }

  // -------- FLASHING X --------
  if (millis() - lastFlash > 300)
  {
    lastFlash = millis();
    flashState = !flashState;

    if (leftMode == 0)
      drawSymbol(0, cross, flashState);

    if (rightMode == 0)
      drawSymbol(1, cross, flashState);
  }

  // -------- MOVING ARROW --------
  if (millis() - lastArrow > 120)
  {
    lastArrow = millis();

    arrowFrame++;
    if (arrowFrame > 7) arrowFrame = 0;

    if (leftMode == 1)
      drawArrowAnimated(0);

    if (rightMode == 1)
      drawArrowAnimated(1);
  }
}
