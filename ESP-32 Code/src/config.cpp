#include <Arduino.h>
#include "config.h"

// Set the pin numbers for the ultrasonic sensor
const uint8_t TRIG_PIN = 10;
const uint8_t ECHO_PIN = 3;

const float SOUND_CONST_CM = 0.017f;
const uint32_t PULSEIN_TIMEOUT = 30000; // 30 ms, about 5 m maximum range

const char *AP_SSID = "Wacker5";
const char *AP_PASSWORD = "PasswordWacker123456!";
const char *AP_CHANNEL = "1";
const uint8_t SENSOR_BURST_PACKET_SIZE = 10; // Number of sensor readings in a burst
uint8_t SENSOR_BURST_IDLE_TIME = 100; // Time between bursts in milliseconds

bool BOX_ID1_connected = false;
bool BOX_ID2_connected = false;
bool BOX_ID3_connected = false;

uint16_t BOX_ID1_heartbeat_LastReceived = 0;
uint16_t BOX_ID2_heartbeat_LastReceived = 0;
uint16_t BOX_ID3_heartbeat_LastReceived = 0;

const uint8_t BATTERY_PIN = 4;
const uint8_t BATTERY_PIN = 4;
const uint8_t RGB_RED_PIN = 25;
const uint8_t RGB_GREEN_PIN = 15;
const uint8_t RGB_BLUE_PIN = 16;
const uint8_t BUZZER_PIN = 17;
const bool BUZZER_ENABLED = false;

const uint8_t BOX_ID1_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const uint8_t BOX_ID2_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const uint8_t BOX_ID3_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Set the pin numbers for the TFT display and button
const uint8_t TFT_MOSI = 8;
const uint8_t TFT_SCLK = 9;
// const uint8_t TFT_MISO = -1;
// const uint8_t TFT_CS = -1; not connected
const uint8_t TFT_DC = 14;
const uint8_t TFT_RST = 21;
const uint8_t BUTTON_PIN = 40;
