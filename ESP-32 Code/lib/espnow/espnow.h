#pragma once  // Tells the compiler to include this file only once

#include <Arduino.h> // Include dependencies needed for your types
#include <esp_now.h>

enum RequestType : uint8_t
{
    REQUEST_SENSOR_DATA = 0,
    REQUEST_SENSOR_BURST_DATA = 1
};

constexpr uint8_t SENSOR_BURST_PACKET_SIZE = 10;

extern const char *AP_SSID;
extern const char *AP_PASSWORD;
extern const char *AP_CHANNEL;

extern const uint8_t SENSOR_BURST_IDLE_TIME;

extern const uint8_t SENSOR_BUFFER_SIZE;
extern float sensorData[][3]; // 2D array to hold sensor readings for each box
extern uint8_t SensorBufferHeadIndex;
extern bool SendSensorDataFlag;
extern void initEspNow();
extern void initWiFi();
extern void addPeerDevice(const uint8_t *mac_array, uint8_t boxId);
extern void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status);
extern void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len);
extern void sendSensorData(uint8_t boxId, uint32_t sensorReadingus);
extern void sendHeartbeat(uint8_t boxId);
extern void sendSensorBurstData(uint8_t boxId, uint32_t *sensorReadingBurst, size_t burstSize);
extern void sendSensorRequest(uint8_t boxId, const uint8_t broadcastAddress[], RequestType requestType);

extern const uint8_t BOX_ID1_broadcastAddress[];
extern const uint8_t BOX_ID2_broadcastAddress[];
extern const uint8_t BOX_ID3_broadcastAddress[];

extern bool BOX_ID1_connected;
extern bool BOX_ID2_connected;
extern bool BOX_ID3_connected;

extern uint16_t BOX_ID1_heartbeat_LastReceived;
extern uint16_t BOX_ID2_heartbeat_LastReceived;
extern uint16_t BOX_ID3_heartbeat_LastReceived;