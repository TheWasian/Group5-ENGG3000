/*
 * This ESP32 code is created by esp32io.com
 *
 * This ESP32 code is released in the public domain
 *
 * For more detail (instruction and wiring diagram), visit https://esp32io.com/tutorials/esp32-ultrasonic-sensor
 */

#define TRIG_PINA 25  // ESP32 pin GPIO23 connected to Ultrasonic Sensor's TRIG pin
#define ECHO_PINA 33  // ESP32 pin GPIO22 connected to Ultrasonic Sensor's ECHO pin
#define TRIG_PINB 27  // ESP32 pin GPIO23 connected to Ultrasonic Sensor's TRIG pin
#define ECHO_PINB 26  // ESP32 pin GPIO22 connected to Ultrasonic Sensor's ECHO pin

float duration_usA, distance_cmA, duration_usB, distance_cmB;
unsigned int measurementsRemaining = 0;
unsigned int measurementNumber = 0;

void readDistances() {
  digitalWrite(TRIG_PINA, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PINA, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PINA, LOW);
  duration_usA = pulseIn(ECHO_PINA, HIGH, 30000);

  digitalWrite(TRIG_PINB, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PINB, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PINB, LOW);
  duration_usB = pulseIn(ECHO_PINB, HIGH, 30000);

  distance_cmA = 0.017f * duration_usA;
  distance_cmB = 0.017f * duration_usB;
}

void handleSerialCommand() {
  String command = Serial.readStringUntil('\n');
  command.trim();

  if (command.startsWith("START,")) {
    long requestedMeasurements = command.substring(6).toInt();
    if (requestedMeasurements > 0 && requestedMeasurements <= 1000) {
      measurementsRemaining = (unsigned int)requestedMeasurements;
      measurementNumber = 0;
      Serial.print("BEGIN,");
      Serial.println(measurementsRemaining);
    } else {
      Serial.println("ERROR,count must be between 1 and 1000");
    }
  }
}

void setup() {
  // begin serial port
  Serial.begin(9600);

  // configure the trigger pin to output mode
  pinMode(TRIG_PINA, OUTPUT);
  // configure the echo pin to input mode
  pinMode(ECHO_PINA, INPUT);
  pinMode(TRIG_PINB, OUTPUT);
  // configure the echo pin to input mode
  pinMode(ECHO_PINB, INPUT);

  Serial.println("READY");
}

void loop() {
  if (Serial.available() > 0) {
    handleSerialCommand();
  }

  if (measurementsRemaining > 0) {
    readDistances();
    measurementNumber++;
    Serial.print("DATA,");
    Serial.print(measurementNumber);
    Serial.print(",");
    Serial.print(distance_cmA, 2);
    Serial.print(",");
    Serial.println(distance_cmB, 2);
    measurementsRemaining--;
    delay(100);

    if (measurementsRemaining == 0) {
      Serial.println("DONE");
    }
  }
}
