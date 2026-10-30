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

const uint8_t BOX_ID1_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const uint8_t BOX_ID2_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
const uint8_t BOX_ID3_broadcastAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Set the pin numbers for the TFT display and button
const uint8_t TFT_MOSI = 8;
const uint8_t TFT_SCLK = 9;
//const uint8_t TFT_MISO = -1;
//const uint8_t TFT_CS = -1; not connected
const uint8_t TFT_DC = 14;
const uint8_t TFT_RST = 21;
const uint8_t BUTTON_PIN = 40;


