# Group5-ENGG3000

The three-board player tracker uses one sensor on each ESP32. See
[the setup guide](ESP-32%20Code/CHECKLIST.md) for wiring, the current 36/48 cm
sensor gaps, configurable physical hole positions, calibration and builds.
The single `Access_Point` firmware now serves the live cone dashboard at
http://192.168.4.1/ and connects to the existing game UI. It includes spike
rejection, position smoothing and six target centres within the configured
beam overlap. Held positions remain visible briefly but cannot score hits.
