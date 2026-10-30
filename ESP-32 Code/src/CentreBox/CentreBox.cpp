/*
  Whack-a-Mole MVP - two ultrasonic sensor lanes.

  This file is a PlatformIO Arduino source file. The browser connects to this
  ESP32 access point and polls /api/hits.
*/

#include <Arduino.h>
#include <WebServer.h>
#include <WiFi.h>
#include <math.h>

#define TRIG_PINS {32, 25}
#define ECHO_PINS {35, 33}
#define uint32_t ECHO_TIMEOUT_US = 30000;
#define float MIN_RANGE_M = 0.02f;
#define float MAX_RANGE_M = 4.50f;

#define char *AP_SSID = "Wacker5";
#define char *AP_PASSWORD = "PasswordWacker123456!";

WebServer server(80);

float duration_us, distance_cm;

void setup() {
  // begin serial port
  Serial.begin (9600);

  // configure the trigger pin to output mode
  pinMode(TRIG_PINS[0], OUTPUT);
  // configure the echo pin to input mode
  pinMode(ECHO_PINS[0], INPUT);
}

void loop() {
  // generate 10-microsecond pulse to TRIG pin
  digitalWrite(TRIG_PINS[0], HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PINS[0], LOW);

  // measure duration of pulse from ECHO pin
  duration_us = pulseIn(ECHO_PINS[0], HIGH);

  // calculate the distance
  distance_cm = 0.017 * duration_us;

  // print the value to Serial Monitor
  Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.println(" cm");

  delay(500);
}

