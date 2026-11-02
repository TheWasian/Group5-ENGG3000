#pragma once  // Tells the compiler to include this file only once
// include/config.h
#ifndef GROUP5_CONFIG_H_
#define GROUP5_CONFIG_H_

#include <Arduino.h>
#include <CircularBuffer.h>

extern const uint8_t TRIG_PIN;
extern const uint8_t ECHO_PIN;
extern const float SOUND_CONST_CM;
extern const uint32_t PULSEIN_TIMEOUT;

extern const char *AP_SSID;
extern const char *AP_PASSWORD;
extern int wifi_channel;

extern CircularBuffer<uint32_t, 10> buffer1;
extern CircularBuffer<uint32_t, 10> buffer2;
extern CircularBuffer<uint32_t, 10> buffer3;
extern uint8_t SensorBufferHeadIndex;
extern bool SendSensorDataFlag;
struct Point2D {
    double x;
    double y;
};

extern const uint8_t BOX_ID1_broadcastAddress[];
extern const uint8_t BOX_ID2_broadcastAddress[];
extern const uint8_t BOX_ID3_broadcastAddress[];
extern const uint8_t SENSOR_BURST_IDLE_TIME;
extern const uint8_t BATTERY_PIN;
extern const uint8_t RGB_RED_PIN;
extern const uint8_t RGB_GREEN_PIN;
extern const uint8_t RGB_BLUE_PIN;
extern const uint8_t BUZZER_PIN;
extern const bool BUZZER_ENABLED;

extern const uint8_t TFT_MOSI;
extern const uint8_t TFT_SCLK;
extern const uint8_t TFT_DC;
extern const uint8_t TFT_RST;
extern const uint8_t BUTTON_PIN;

#endif // GROUP5_CONFIG_H_
