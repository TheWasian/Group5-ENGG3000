#include <Arduino.h>

constexpr uint8_t TRIG_PIN = 26;
constexpr uint8_t ECHO_PIN = 27;
constexpr unsigned long ECHO_TIMEOUT_US = 30000;
uint8_t burstNumber = 0;

float readDistanceCm();

void setup()
{
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Serial.begin(115200);
  delay(500);
}

void loop()
{

  if (Serial.available() > 0)
  {

    // Read the incoming integer
    burstNumber = Serial.parseInt();
    if (burstNumber < 1 || burstNumber > 100)
      burstNumber = 1; // Default to 1 if out of range

        String output = "";

        output += readDistanceCm();

    for (int i = 1; i < burstNumber; ++i)
    {
      output += ",";
      output += readDistanceCm();
      delay(10); // Small delay between readings to avoid overwhelming the sensor
    }

    Serial.println(output);
  }
}

float readDistanceCm()
{
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  if (duration == 0)
  {
    return -1.0f;
  }

  return duration * 0.0343f / 2.0f;
}