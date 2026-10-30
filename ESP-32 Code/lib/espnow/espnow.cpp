#include "espnow.h"
#include "config.h"
#include <WiFi.h>
#include <esp_now.h>

enum PacketType : uint8_t
{
    HEARTBEAT_PACKET = 0,
    SENSOR_DATA_PACKET = 1
};

typedef struct __attribute__((packed)) heartbeat_msg
{
    PacketType type = HEARTBEAT_PACKET; 
    uint8_t boxId;
} heartbeat_msg;

typedef struct __attribute__((packed)) sensor_msg
{
    PacketType type = SENSOR_DATA_PACKET;
    uint8_t boxId;
    uint32_t sensorReadingus;
} sensor_msg;

esp_now_peer_info_t peerInfo;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status)
{
    Serial.print("\r\nLast Packet Send Status:\t");
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len) {
    if (len < 1) return; // Guard clause against empty packets

    // Peek at the very first byte and cast it to our enum type
    PacketType receivedType = (PacketType)incomingData[0];

    switch (receivedType) {
        case HEARTBEAT_PACKET: {
            heartbeat_msg heartbeat;
            if (len == sizeof(heartbeat_msg)) {
                memcpy(&heartbeat, incomingData, sizeof(heartbeat));
                Serial.printf("Heartbeat structure parsed from Node %d\n", heartbeat.boxId);
            }
            break;
        }
            
        case SENSOR_DATA_PACKET: {
            sensor_msg sensorData;
            if (len == sizeof(sensor_msg)) {
                memcpy(&sensorData, incomingData, sizeof(sensorData));
                Serial.printf("Sensor structure parsed. Node: %d, Value: %lu\n", 
                              sensorData.boxId, sensorData.sensorReadingus);
            }
            break;
        }

        default:
            Serial.println("Unknown packet type received!");
            break;
    }
}


void initEspNow()
{

    WiFi.mode(WIFI_STA);
    if (esp_now_init() != ESP_OK)
    {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    esp_now_register_send_cb(OnDataSent);
    esp_now_register_recv_cb(OnDataRecv);
}

void initWiFi()
{
    WiFi.mode(WIFI_STA);
    WiFi.softAP(AP_SSID, AP_PASSWORD, atoi(AP_CHANNEL), 0, 10);
}

void addPeerDevice(const uint8_t *mac_array, uint8_t boxId)
{
    esp_now_peer_info_t peerInfo = {};
    memcpy(peerInfo.peer_addr, mac_array, 6);
    peerInfo.channel = atoi(AP_CHANNEL);
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK)
    {
        Serial.println("BOX_ID: " + String(boxId) + " Failed to add peer device.");
    }
    else
    {
        Serial.println("BOX_ID: " + String(boxId) + " Successfully added peer device.");
    }
}

void sendHeartbeat(uint8_t boxId)
{
    heartbeat_msg heartbeat;
    heartbeat.boxId = boxId;

    esp_err_t result = esp_now_send(BOX_ID1_broadcastAddress, (uint8_t *)&heartbeat, sizeof(heartbeat));
    if (result == ESP_OK)
    {
        Serial.println("Sent heartbeat successfully");
    }
    else
    {
        Serial.println("Error sending the heartbeat");
    }
}

void sendSensorData(uint8_t boxId, uint32_t sensorReadingus)
{
    sensor_msg sensorData;
    sensorData.boxId = boxId;
    sensorData.sensorReadingus = sensorReadingus;

    esp_err_t result = esp_now_send(BOX_ID1_broadcastAddress, (uint8_t *)&sensorData, sizeof(sensorData));
    if (result == ESP_OK)
    {
        Serial.println("Sent sensor data successfully");
    }
    else
    {
        Serial.println("Error sending the sensor data");
    }
}