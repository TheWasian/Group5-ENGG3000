#pragma once  // Tells the compiler to include this file only once

#include <Arduino.h> // Include dependencies needed for your types

// 1. Macros & Constants
//#define STATUS_OK 1

// 2. Global Variable Declarations (Do NOT instantiate here!)
extern const uint8_t TRIG_PIN;
extern const uint8_t ECHO_PIN;
extern const float SOUND_CONST_CM;
extern const uint32_t PULSEIN_TIMEOUT;

extern uint32_t duration_us;
extern float distance_cm;

// 3. Function Prototypes / Declarations
void initialiseSensor();
void updateSensorData();
uint32_t readSensorRaw();
float readSensorCM();
float convertToCM(uint32_t duration_us);

