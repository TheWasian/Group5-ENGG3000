/*
  Whack-a-Mole MVP - two ultrasonic sensor lanes.

  This file is a PlatformIO Arduino source file. The browser connects to this
  ESP32 access point and polls /api/hits.
*/

#include <Arduino.h>
#include "SensorProcessing.h"
#include "config.h"

//WebServer server(80);

void setup() {
  // begin serial port
  Serial.begin(115200);
  delay(500);
  Serial.println("CentreBox starting");
  initialiseSensor();
}

void loop() {
  readSensorValue();
  // print the value to Serial Monitor
  Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.print(" cm (echo: ");
  Serial.print(duration_us);
  Serial.println(" us)");
  delay(100);
}
