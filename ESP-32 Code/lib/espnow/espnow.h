#pragma once  // Tells the compiler to include this file only once

#include <Arduino.h> // Include dependencies needed for your types
#include <esp_now.h>


extern const char *AP_SSID;
extern const char *AP_PASSWORD;
extern const char *AP_CHANNEL;

extern void initEspNow();
extern void initWiFi();
extern void addPeerDevice(const uint8_t *mac_array, uint8_t boxId);
extern void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status);
extern void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len);
extern void sendSensorData(uint8_t boxId, uint32_t sensorReadingus);
extern void sendHeartbeat(uint8_t boxId);

extern const uint8_t BOX_ID1_broadcastAddress[];
extern const uint8_t BOX_ID2_broadcastAddress[];
extern const uint8_t BOX_ID3_broadcastAddress[];