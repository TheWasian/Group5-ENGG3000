#include <Arduino.h>
#include "SensorProcessing.h"
#include "espnow.h"
#include "config.h"

const uint8_t boxId = SET_BOX_ID;

//WebServer server(80);

void setup() {
  delay(1000); // Wait for a second before starting the setup
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
