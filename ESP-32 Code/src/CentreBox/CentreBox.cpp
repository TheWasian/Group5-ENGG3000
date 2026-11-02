#include <Arduino.h>
#include "SensorProcessing.h"
#include "espnow.h"
#include "config.h"

const uint8_t boxId = SET_BOX_ID;

// WebServer server(80);

void setup()
{
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
  Serial.println("CentreBox starting");
  initialiseSensor();
  initEspNow();
  addPeerDevice(BOX_ID1_broadcastAddress, 1);
  addPeerDevice(BOX_ID3_broadcastAddress, 3);
  
}

void loop()
{
  updateSensorData();
  buffer2.push(duration_us);
  // print the value to Serial Monitor
  Serial.print("distance: ");
  Serial.print(distance_cm);
  Serial.print(" cm (echo: ");
  Serial.print(duration_us);
  Serial.println(" us)");
  sendSensorRequest(boxId, BOX_ID1_broadcastAddress, REQUEST_SENSOR_DATA);
  sendSensorRequest(boxId, BOX_ID3_broadcastAddress, REQUEST_SENSOR_DATA);

  delay(100); // Wait for a second before the next loop iteration
  for (int i = 0; i < 10; i++)
  {
    if (!buffer2.isEmpty())
    {
      uint32_t sensorReading = buffer1.shift();
      Serial.print("Sensor reading from BOX_ID1: ");
      Serial.print(sensorReading);
      Serial.println(" us");
    }
  }

  for (int i = 0; i < 10; i++)
  {
    if (!buffer2.isEmpty())
    {
      uint32_t sensorReading = buffer3.shift();
      Serial.print("Sensor reading from BOX_ID3: ");
      Serial.print(sensorReading);
      Serial.println(" us");
    }
  }

  delay(1000);
}
