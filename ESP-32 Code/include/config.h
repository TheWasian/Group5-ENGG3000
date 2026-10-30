#pragma once  // Tells the compiler to include this file only once
// include/config.h
#ifndef CONFIG_H_
#define CONFIG_H_

#include <Arduino.h>

extern const uint8_t TRIG_PIN;
extern const uint8_t ECHO_PIN;
extern const float SOUND_CONST_CM;
extern const uint32_t PULSEIN_TIMEOUT;

extern const char *AP_SSID;
extern const char *AP_PASSWORD;
extern int wifi_channel;

extern const uint8_t BOX_ID1_broadcastAddress[];
extern const uint8_t BOX_ID2_broadcastAddress[];
extern const uint8_t BOX_ID3_broadcastAddress[];

extern const uint8_t TFT_MOSI;
extern const uint8_t TFT_SCLK;
extern const uint8_t TFT_DC;
extern const uint8_t TFT_RST;
extern const uint8_t BUTTON_PIN;

#endif // CONFIG_H_

