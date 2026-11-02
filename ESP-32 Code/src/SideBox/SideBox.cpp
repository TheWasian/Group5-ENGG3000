#include <Arduino.h>
#include "SensorProcessing.h"
#include "espnow.h"
#include "config.h"

const uint8_t boxId = SET_BOX_ID;

//WebServer server(80);

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RGB_RED_PIN, OUTPUT);
  pinMode(RGB_GREEN_PIN, OUTPUT);
  pinMode(RGB_BLUE_PIN, OUTPUT);
  digitalWrite(RGB_RED_PIN, HIGH);
  digitalWrite(RGB_GREEN_PIN, HIGH);
  digitalWrite(RGB_BLUE_PIN, HIGH);

  tone(BUZZER_PIN, 8000, 200);
  tone(BUZZER_PIN, 15000, 200);

  // begin serial port
  Serial.begin(115200);
  delay(500);
  Serial.println("SideBox " + String(boxId) + " starting");
  initialiseSensor();
  initEspNow();
  addPeerDevice(BOX_ID2_broadcastAddress, 2);
  //sendHeartbeat(boxId);
}

void loop() {
  if (BOX_ID2_connected) {
    //sendHeartbeat(boxId);
  }
  if (SendSensorDataFlag) {
    updateSensorData();
    SendSensorDataFlag = false;
    sendSensorData(boxId, duration_us);
    Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.print(" cm (echo: ");
  Serial.print(duration_us);
  Serial.println(" us)");
  delay(1);
  }
  // print the value to Serial Monitor
}
