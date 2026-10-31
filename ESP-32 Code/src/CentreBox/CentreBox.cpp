#include <Arduino.h>
#include "SensorProcessing.h"
#include "espnow.h"
#include "config.h"

const uint8_t ThisBoxId = 2;

// WebServer server(80);

void setup()
{
  delay(1000); // Wait for a second before starting the setup
  // begin serial port
  Serial.begin(115200);
  delay(500);
  Serial.println("CentreBox starting");
  initialiseSensor();
  initEspNow();
  addPeerDevice(BOX_ID1_broadcastAddress, 1);
  addPeerDevice(BOX_ID3_broadcastAddress, 3);
}

void loop()
{
  updateSensorData();
  // print the value to Serial Monitor
  Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.print(" cm (echo: ");
  Serial.print(duration_us);
  Serial.println(" us)");

  BOX_ID1_heartbeat_LastReceived = 0;
  BOX_ID2_heartbeat_LastReceived = 0;
  BOX_ID3_heartbeat_LastReceived = 0;

  delay(1000);
}
