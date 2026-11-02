#include "espnow.h"
#include "config.h"
#include <WiFi.h>
#include <esp_now.h>

enum PacketType : uint8_t
{
    HEARTBEAT_PACKET = 0,
    SENSOR_DATA_PACKET = 1,
    SENSOR_BURST_DATA_PACKET = 2,
    SENSOR_REQUEST_PACKET = 3
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

typedef struct __attribute__((packed)) sensor_burst_msg
{
    PacketType type = SENSOR_BURST_DATA_PACKET;
    uint8_t boxId;
    uint32_t sensorReadingBurst[SENSOR_BURST_PACKET_SIZE]; // Array to hold burst readings
} sensor_burst_msg;

typedef struct __attribute__((packed)) sensor_request_msg
{
    PacketType type = SENSOR_REQUEST_PACKET;
    RequestType requestType;
    uint8_t boxId;
} sensor_request_msg;

esp_now_peer_info_t peerInfo;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status)
{
    Serial.print("\r\nLast Packet Send Status:\t");
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "Delivery Success" : "Delivery Fail");
}

void OnDataRecv(const uint8_t *mac_addr, const uint8_t *incomingData, int len)
{
    if (len < 1)
        return; // Guard clause against empty packets

    // Peek at the very first byte and cast it to our enum type
    PacketType receivedType = (PacketType)incomingData[0];

    switch (receivedType)
    {
    case HEARTBEAT_PACKET:
    {
        heartbeat_msg heartbeat;
        if (len == sizeof(heartbeat_msg))
        {
            memcpy(&heartbeat, incomingData, sizeof(heartbeat));
            if (heartbeat.boxId == 1)
            {
                BOX_ID1_heartbeat_LastReceived = 0;
            }
            else if (heartbeat.boxId == 2)
            {
                BOX_ID2_heartbeat_LastReceived = 0;
            }
            else if (heartbeat.boxId == 3)
            {
                BOX_ID3_heartbeat_LastReceived = 0;
            }
        }
        break;
    }

    case SENSOR_DATA_PACKET:
    {
        sensor_msg sensorData;
        if (len == sizeof(sensor_msg))
        {
            memcpy(&sensorData, incomingData, sizeof(sensorData));
            Serial.printf("Sensor structure parsed. Node: %d, Value: %lu\n",
                          sensorData.boxId, sensorData.sensorReadingus);
            if (sensorData.boxId == 1)
            {
                buffer1.push(sensorData.sensorReadingus);
            }
            else if (sensorData.boxId == 2)
            {
                buffer2.push(sensorData.sensorReadingus);
            }
            else if (sensorData.boxId == 3)
            {
                buffer3.push(sensorData.sensorReadingus);
            }
        }
        break;
    }

    case SENSOR_BURST_DATA_PACKET:
    {
        sensor_burst_msg sensorBurstData;
        if (len == sizeof(sensor_burst_msg))
        {
            memcpy(&sensorBurstData, incomingData, sizeof(sensorBurstData));
            for (int i = 0; i < SENSOR_BURST_PACKET_SIZE; i++)
            {
                Serial.printf("Sensor Burst structure parsed. Node: %d, Value: %lu\n",
                              sensorBurstData.boxId, sensorBurstData.sensorReadingBurst[i]);
            }
        }
        break;
    }
    case SENSOR_REQUEST_PACKET:
    {
        sensor_request_msg sensorRequest;
        if (len == sizeof(sensor_request_msg))
        {
            memcpy(&sensorRequest, incomingData, sizeof(sensorRequest));
            Serial.printf("Sensor Request structure parsed. Node: %d, Request Type: %d\n",
                          sensorRequest.boxId, sensorRequest.requestType);

            if (sensorRequest.requestType == REQUEST_SENSOR_DATA)
            {
                SendSensorDataFlag = true;
            }
            if (sensorRequest.requestType == REQUEST_SENSOR_BURST_DATA)
            {
                // SendSensorDataFlag = true;
            }
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

void sendSensorRequest(uint8_t boxId, const uint8_t broadcastAddress[], RequestType requestType)
{
    sensor_request_msg sensorRequest;
    sensorRequest.boxId = boxId;
    sensorRequest.requestType = requestType;
    esp_err_t result = esp_now_send(broadcastAddress, (uint8_t *)&sensorRequest, sizeof(sensorRequest));
    if (result == ESP_OK)
    {
        Serial.println("Sent sensor request successfully-1");
    }
    else
    {
        Serial.println("Error sending the sensor request-1");
    }
}

void sendSensorBurstData(uint8_t boxId, uint32_t *sensorReadingBurst, size_t burstSize)
{
    if (burstSize > SENSOR_BURST_PACKET_SIZE)
    {
        Serial.println("Error: Burst size exceeds maximum allowed size.");
        return;
    }

    sensor_burst_msg sensorBurstData;
    sensorBurstData.boxId = boxId;
    memcpy(sensorBurstData.sensorReadingBurst, sensorReadingBurst, burstSize * sizeof(uint32_t));

    esp_err_t result = esp_now_send(BOX_ID1_broadcastAddress, (uint8_t *)&sensorBurstData, sizeof(sensorBurstData));
    if (result == ESP_OK)
    {
        Serial.println("Sent sensor burst data successfully");
    }
    else
    {
        Serial.println("Error sending the sensor burst data");
    }
}

void sendSensorData(uint8_t boxId, uint32_t sensorReadingus)
{
    sensor_msg sensorData;
    sensorData.boxId = boxId;
    sensorData.sensorReadingus = sensorReadingus;

    esp_err_t result = esp_now_send(BOX_ID2_broadcastAddress, (uint8_t *)&sensorData, sizeof(sensorData));
    if (result == ESP_OK)
    {
        Serial.println("Sent sensor data successfully");
    }
    else
    {
        Serial.println("Error sending the sensor data");
    }
}