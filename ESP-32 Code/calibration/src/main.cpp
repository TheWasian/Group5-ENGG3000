#include <Arduino.h>

constexpr uint8_t TRIG_PIN = 10;
constexpr uint8_t ECHO_PIN = 3;
constexpr uint8_t BATTERY_PIN = 4;
constexpr uint8_t RGB_RED_PIN = 7;
constexpr uint8_t RGB_GREEN_PIN = 15;
constexpr uint8_t RGB_BLUE_PIN = 16;
constexpr uint8_t BUZZER_PIN = 17;
constexpr bool RGB_LED_COMMON_ANODE = false;
constexpr unsigned long RGB_UPDATE_INTERVAL_MS = 10;
constexpr unsigned long RGB_CYCLE_PERIOD_MS = 6000;
constexpr unsigned long BATTERY_DISPLAY_DURATION_MS = 5000;
constexpr float NIMH_EMPTY_VOLTAGE = 1.0f;
constexpr float NIMH_FULL_VOLTAGE = 1.4f;
constexpr unsigned long ECHO_TIMEOUT_US = 30000;

struct SoundNote
{
  uint16_t frequency;
  uint16_t durationMs;
  uint16_t pauseMs;
};

const SoundNote startupJingle[] = {{523, 120, 20}, {659, 120, 20}, {784, 220, 0}};
const SoundNote calibrateSound[] = {{659, 100, 30}, {784, 160, 0}};
const SoundNote pulseSound[] = {{784, 100, 30}, {988, 160, 0}};
const SoundNote roomTestSound[] = {{440, 120, 30}, {440, 120, 30}, {659, 180, 0}};
const SoundNote idleSound[] = {{784, 100, 30}, {523, 180, 0}};

enum class SensorMode
{
  CALIBRATE,
  PULSE_TIME,
  ROOM_TEST,
  IDLE
};

SensorMode sensorMode = SensorMode::IDLE;
uint8_t roomTestSamples = 0;
unsigned long roomTestDelayMs = 0;
const SoundNote *activeSoundNotes = nullptr;
uint8_t activeSoundCount = 0;
uint8_t activeSoundIndex = 0;
bool soundNoteStarted = false;
unsigned long soundPhaseStartedMs = 0;

float readDistanceCm();
unsigned long readEchoDurationUs();
void runRoomTest();
void updateLedForMode();
void updateIdleLed();
void writeRgb(uint8_t red, uint8_t green, uint8_t blue);
void showBatteryLevel();
void startSound(const SoundNote *notes, uint8_t noteCount);
void updateBuzzer();
void playModeSound();

void setup()
{
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(RGB_RED_PIN, OUTPUT);
  pinMode(RGB_GREEN_PIN, OUTPUT);
  pinMode(RGB_BLUE_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);
  showBatteryLevel();
  delay(BATTERY_DISPLAY_DURATION_MS);
  updateLedForMode();
  startSound(startupJingle, sizeof(startupJingle) / sizeof(startupJingle[0]));

  Serial.begin(115200);
  delay(500);
}

void loop()
{
  updateBuzzer();

  if (Serial.available() > 0)
  {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.equalsIgnoreCase("CALIBRATE"))
    {
      sensorMode = SensorMode::CALIBRATE;
      updateLedForMode();
      playModeSound();
      Serial.println("MODE:CALIBRATE");
      return;
    }
    if (command.equalsIgnoreCase("PULSE"))
    {
      sensorMode = SensorMode::PULSE_TIME;
      updateLedForMode();
      playModeSound();
      Serial.println("MODE:PULSE");
      return;
    }
    if (command.equalsIgnoreCase("STOP"))
    {
      sensorMode = SensorMode::IDLE;
      updateLedForMode();
      playModeSound();
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
      updateLedForMode();
      playModeSound();
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

  if (sensorMode == SensorMode::IDLE)
  {
    updateIdleLed();
  }

  updateBuzzer();
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
  updateLedForMode();
}

void updateLedForMode()
{
  bool red = false;
  bool green = false;
  bool blue = false;

  switch (sensorMode)
  {
  case SensorMode::CALIBRATE:
    green = true;
    break;
  case SensorMode::PULSE_TIME:
    blue = true;
    break;
  case SensorMode::ROOM_TEST:
    red = true;
    green = true;
    break;
  case SensorMode::IDLE:
    updateIdleLed();
    return;
  }

  writeRgb(red ? 255 : 0, green ? 255 : 0, blue ? 255 : 0);
}

void updateIdleLed()
{
  static unsigned long lastUpdateMs = 0;
  const unsigned long now = millis();

  if (lastUpdateMs != 0 && now - lastUpdateMs < RGB_UPDATE_INTERVAL_MS)
  {
    return;
  }

  lastUpdateMs = now;

  const float hue = (now % RGB_CYCLE_PERIOD_MS) * 6.0f / RGB_CYCLE_PERIOD_MS;
  const uint8_t sector = static_cast<uint8_t>(hue);
  const float fraction = hue - sector;
  const uint8_t rising = static_cast<uint8_t>(fraction * 255.0f);
  const uint8_t falling = 255 - rising;

  switch (sector)
  {
  case 0:
    writeRgb(255, rising, 0);
    break;
  case 1:
    writeRgb(falling, 255, 0);
    break;
  case 2:
    writeRgb(0, 255, rising);
    break;
  case 3:
    writeRgb(0, falling, 255);
    break;
  case 4:
    writeRgb(rising, 0, 255);
    break;
  default:
    writeRgb(255, 0, falling);
    break;
  }
}

void writeRgb(uint8_t red, uint8_t green, uint8_t blue)
{
  analogWrite(RGB_RED_PIN, RGB_LED_COMMON_ANODE ? 255 - red : red);
  analogWrite(RGB_GREEN_PIN, RGB_LED_COMMON_ANODE ? 255 - green : green);
  analogWrite(RGB_BLUE_PIN, RGB_LED_COMMON_ANODE ? 255 - blue : blue);
}

void showBatteryLevel()
{
  const float voltage = analogReadMilliVolts(BATTERY_PIN) / 1000.0f;
  const float charge = constrain(
      (voltage - NIMH_EMPTY_VOLTAGE) / (NIMH_FULL_VOLTAGE - NIMH_EMPTY_VOLTAGE),
      0.0f,
      1.0f);

  if (charge < 0.5f)
  {
    const uint8_t green = static_cast<uint8_t>(charge * 2.0f * 165.0f);
    writeRgb(255, green, 0);
    return;
  }

  const float greenCharge = (charge - 0.5f) * 2.0f;
  const uint8_t red = static_cast<uint8_t>((1.0f - greenCharge) * 255.0f);
  const uint8_t green = static_cast<uint8_t>(165.0f + greenCharge * 90.0f);
  writeRgb(red, green, 0);
}

void startSound(const SoundNote *notes, uint8_t noteCount)
{
  noTone(BUZZER_PIN);
  activeSoundNotes = notes;
  activeSoundCount = noteCount;
  activeSoundIndex = 0;
  soundNoteStarted = false;
  soundPhaseStartedMs = millis();
}

void updateBuzzer()
{
  if (activeSoundNotes == nullptr || activeSoundIndex >= activeSoundCount)
  {
    return;
  }

  const SoundNote &note = activeSoundNotes[activeSoundIndex];
  const unsigned long now = millis();

  if (!soundNoteStarted)
  {
    if (now - soundPhaseStartedMs < note.pauseMs)
    {
      return;
    }

    tone(BUZZER_PIN, note.frequency, note.durationMs);
    soundPhaseStartedMs = now;
    soundNoteStarted = true;
    return;
  }

  if (now - soundPhaseStartedMs < note.durationMs)
  {
    return;
  }

  noTone(BUZZER_PIN);
  activeSoundIndex++;
  soundNoteStarted = false;
  soundPhaseStartedMs = now;

  if (activeSoundIndex >= activeSoundCount)
  {
    activeSoundNotes = nullptr;
  }
}

void playModeSound()
{
  switch (sensorMode)
  {
  case SensorMode::CALIBRATE:
    startSound(calibrateSound, sizeof(calibrateSound) / sizeof(calibrateSound[0]));
    break;
  case SensorMode::PULSE_TIME:
    startSound(pulseSound, sizeof(pulseSound) / sizeof(pulseSound[0]));
    break;
  case SensorMode::ROOM_TEST:
    startSound(roomTestSound, sizeof(roomTestSound) / sizeof(roomTestSound[0]));
    break;
  case SensorMode::IDLE:
    startSound(idleSound, sizeof(idleSound) / sizeof(idleSound[0]));
    break;
  }
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