#pragma once
#include <stddef.h>
#include <stdint.h>

namespace wam {
constexpr uint32_t PACKET_MAGIC = 0x57414D35UL;
constexpr uint8_t PROTOCOL_VERSION = 2;
// MEASURE is the ESP-NOW request used by the game AP. UDP ARM/READY/FIRE is
// kept for the calibration logger, which still talks to nodes over UDP.
enum PacketType : uint8_t { ARM = 1, RANGES = 2, READY = 3, FIRE = 4, MEASURE = 5 };
enum LedState : uint8_t { LED_IDLE = 0, LED_GAME = 1 };
constexpr uint16_t AP_UDP_PORT = 4210, NODE_UDP_PORT = 4211;
// The AP's softAP channel. Nodes stay on it so ESP-NOW works even while they
// are not associated with Wacker5.
constexpr uint8_t ESPNOW_CHANNEL = 1;
constexpr uint32_t ARM_LIFETIME_MS = 50;
constexpr uint32_t REPLY_TIMEOUT_MS = 90;
constexpr uint32_t QUIET_MS = 60;
constexpr uint32_t ECHO_TIMEOUT_US = 27000;
struct __attribute__((packed)) ControlPacket {
  uint32_t magic;
  uint8_t version, type, nodeId, reserved;
  uint32_t session, sequence, crc;
};
struct __attribute__((packed)) RangePacket {
  uint32_t magic;
  uint8_t version, type, nodeId, validMask;
  uint32_t session, sequence;
  uint16_t distanceMm, batteryMv;
  uint32_t crc;
};
static_assert(sizeof(ControlPacket) == 20, "Control packet layout changed");
static_assert(sizeof(RangePacket) == 24, "Range packet layout changed");
inline uint32_t crc32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xFFFFFFFFUL;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit)
      crc = (crc >> 1) ^ (0xEDB88320UL & (0UL - (crc & 1UL)));
  }
  return ~crc;
}
template <typename T> inline uint32_t packetCrc(const T &p) {
  return crc32(reinterpret_cast<const uint8_t *>(&p), offsetof(T, crc));
}
inline bool deadlineReached(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}
// A FIRE packet is useful only briefly after this node sent READY. Consuming
// the arm before emitting ultrasound makes duplicate FIRE packets harmless.
struct TriggerGate {
  uint32_t session = 0, sequence = 0, armedMs = 0;
  bool seen = false, armed = false;
  bool arm(uint32_t newSession, uint32_t newSequence, uint32_t now) {
    if (seen && session == newSession && static_cast<int32_t>(newSequence - sequence) <= 0) return false;
    session = newSession; sequence = newSequence; armedMs = now;
    seen = armed = true;
    return true;
  }
  bool fire(uint32_t s, uint32_t q, uint32_t now) {
    if (!armed || s != session || q != sequence) return false;
    armed = false;
    return now - armedMs <= ARM_LIFETIME_MS;
  }
};
// ESP-NOW delivers in a few ms or not at all, so one MEASURE packet fires
// immediately. Duplicates and older sequences of the same session are ignored.
struct MeasureGate {
  uint32_t session = 0, sequence = 0;
  bool seen = false;
  bool accept(uint32_t newSession, uint32_t newSequence) {
    if (seen && session == newSession && static_cast<int32_t>(newSequence - sequence) <= 0) return false;
    session = newSession; sequence = newSequence; seen = true;
    return true;
  }
};
} // namespace wam
