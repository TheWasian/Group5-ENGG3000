#include <Arduino.h>

constexpr uint8_t TRIG_PIN = 26;
constexpr uint8_t ECHO_PIN = 27;
constexpr unsigned long ECHO_TIMEOUT_US = 30000;

enum class SensorMode
{
  CALIBRATE,
  PULSE_TIME,
  ROOM_TEST,
  IDLE
};

SensorMode sensorMode = SensorMode::CALIBRATE;
uint8_t roomTestSamples = 0;
unsigned long roomTestDelayMs = 0;

float readDistanceCm();
unsigned long readEchoDurationUs();
void runRoomTest();

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
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.equalsIgnoreCase("CALIBRATE"))
    {
      sensorMode = SensorMode::CALIBRATE;
      Serial.println("MODE:CALIBRATE");
      return;
    }
    if (command.equalsIgnoreCase("PULSE"))
    {
      sensorMode = SensorMode::PULSE_TIME;
      Serial.println("MODE:PULSE");
      return;
    }
    if (command.equalsIgnoreCase("STOP"))
    {
      sensorMode = SensorMode::IDLE;
      Serial.println("MODE:IDLE");
      return;
    }
    int requestedSamples = 0;
    unsigned long requestedDelayMs = 0;
    if (sscanf(command.c_str(), "ROOM_TEST %d %lu", &requestedSamples, &requestedDelayMs) == 2)
    {
      if (requestedSamples < 1 || requestedSamples > 100 || requestedDelayMs > 60000)
      {
        Serial.println("ERROR:ROOM_TEST arguments must be 1-100 samples and 0-60000 ms delay");
        return;
      }

      roomTestSamples = static_cast<uint8_t>(requestedSamples);
      roomTestDelayMs = requestedDelayMs;
      sensorMode = SensorMode::ROOM_TEST;
      runRoomTest();
      return;
    }

    if (sensorMode == SensorMode::CALIBRATE)
    {
      const int burstNumber = command.toInt();
      const int samples = (burstNumber >= 1 && burstNumber <= 100) ? burstNumber : 1;
      String output = String(readDistanceCm(), 2);

      for (int i = 1; i < samples; ++i)
      {
        output += ",";
        output += String(readDistanceCm(), 2);
        delay(50);
      }

      Serial.println(output);
    }
  }

  if (sensorMode == SensorMode::PULSE_TIME)
  {
    Serial.println(readEchoDurationUs());
    delay(50);
  }
}

void runRoomTest()
{
  Serial.println("ROOM_TEST_START");
  for (uint8_t sample = 0; sample < roomTestSamples; ++sample)
  {
    Serial.print("ROOM_TEST,");
    Serial.print(roomTestDelayMs);
    Serial.print(",");
    Serial.print(sample + 1);
    Serial.print(",");
    Serial.println(readEchoDurationUs());

    if (sample + 1 < roomTestSamples)
    {
      delay(roomTestDelayMs);
    }
  }
  Serial.println("ROOM_TEST_DONE");
  sensorMode = SensorMode::IDLE;
}

float readDistanceCm()
{
  const unsigned long duration = readEchoDurationUs();
  if (duration == 0)
  {
    return -1.0f;
  }

  return duration * 0.0343f / 2.0f;
}

unsigned long readEchoDurationUs()
{
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
  return duration;
}