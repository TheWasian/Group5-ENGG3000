/*
  ESP32 Self-Hosted Controller
  - Starts a Wi-Fi Access Point (AP): SSID "Bridge-CTRL-38", password "bridge123456!"
  - Serves a control webpage at http://192.168.4.1/
*/


#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <AsyncTCP.h>
#include <ESP32Servo.h>


String jsonQuote(const String& s);

// ---------------------- Wi-Fi CONFIG ----------------------
#define USE_AP_MODE 1  // set to 0 if you want STA (join your router)
const char* AP_SSID     = "Wacker5";
const char* AP_PASSWORD = "PasswordWacker123456!";


// If using STA (join home Wi-Fi), fill these and set USE_AP_MODE to 0
const char* STA_SSID     = "YOUR_WIFI";
const char* STA_PASSWORD = "YOUR_PASSWORD";


// ---------------------- PINS ----------------------
#define BUZZER_PIN1 21



void setup() {
  Serial.begin(115200);
 
  // Wi-Fi
  if (USE_AP_MODE) {
    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    delay(500);
    Serial.print("AP IP: "); Serial.println(WiFi.softAPIP());
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.begin(STA_SSID, STA_PASSWORD);
    Serial.print("Connecting to WiFi");
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    delay(500);
    Serial.print("\nIP: "); Serial.println(WiFi.localIP());
  }
  delay(1000);

}

void loop() {
  // put your main code here, to run repeatedly:

}
