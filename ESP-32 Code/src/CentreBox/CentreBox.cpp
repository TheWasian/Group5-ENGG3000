/*
  Whack-a-Mole MVP - two ultrasonic sensor lanes.

  This file is a PlatformIO Arduino source file. The browser connects to this
  ESP32 access point and polls /api/hits.
*/

#include <Arduino.h>

const uint8_t TRIG_PIN = 10;
const uint8_t ECHO_PIN = 3;
const float SOUND_CONST_CM = 0.017f;
const uint32_t PULSEIN_TIMEOUT = 30000; // 30 ms, about 5 m maximum range


//const char *AP_SSID = "Wacker5";
//const char *AP_PASSWORD = "PasswordWacker123456!";

//WebServer server(80);

uint32_t duration_us;
float distance_cm;

void setup() {
  // begin serial port
  Serial.begin(115200);
  delay(500);
  Serial.println("CentreBox starting");

  // configure the trigger pin to output mode
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  // configure the echo pin to input mode
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  // generate 10-microsecond pulse to TRIG pin
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // measure duration of pulse from ECHO pin
  duration_us = pulseIn(ECHO_PIN, HIGH);

  // calculate the distance
  distance_cm = SOUND_CONST_CM * duration_us;

  // print the value to Serial Monitor
  Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.print(" cm (echo: ");
  Serial.print(duration_us);
  Serial.println(" us)");
  delay(100);
}
