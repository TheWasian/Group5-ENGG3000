#pragma once  // Tells the compiler to include this file only once

#include <Arduino.h> // Include dependencies needed for your types
#include <cmath>
#include <CircularBuffer.h>
#include "config.h"  // Point2D

// 1. Macros & Constants
//#define STATUS_OK 1

// 2. Global Variable Declarations (Do NOT instantiate here!)
extern const uint8_t TRIG_PIN;
extern const uint8_t ECHO_PIN;
extern const float SOUND_CONST_CM;
extern const uint32_t PULSEIN_TIMEOUT;

extern uint32_t duration_us;
extern float distance_cm;

extern CircularBuffer<uint32_t, 10> buffer1;
extern CircularBuffer<uint32_t, 10> buffer2;
extern CircularBuffer<uint32_t, 10> buffer3;

// 3. Function Prototypes / Declarations
void initialiseSensor();
void updateSensorData();
uint32_t readSensorRaw();
float readSensorCM();
float convertToCM(uint32_t duration_us);

// Trilateration for sensors whose centres all lie on the x-axis (y = 0).
// Pass two or three radii and the matching centre x coordinates, all in the
// same units. The third radius/coordinate pair may be omitted (or set to NAN)
// when only two sensors have a reading.
// Returns the position with y >= 0, or {NAN, NAN} if no solution exists.
Point2D trilaterate(float radius1, float radius2, float x1, float x2,
                    float radius3 = NAN, float x3 = NAN);



