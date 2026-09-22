// Bootstrap: wires buttons + sensors to GameService. One file owns this: startup lives here.
// The game is a state machine run by GameService; rules live in services, drawing in GameView.
// Flow: init views + sensors, route ESP32/mouse input to whack(), start polling.
GameView.init();
SensorService.init();

// When the ESP32 thinks you have whacked the mole it flashes the hole, and then scores it.
SensorService.onHit = function (holeIndex) {
  GameView.flashSensorHit(holeIndex);
  GameService.whack(holeIndex, "sensor");
};

// Buttons.
document.getElementById("start-button").addEventListener("click", function () {
  GameService.start();
  SensorService.notifyGameStart(); // re-arm the ESP32 (won't work if offline)
});
document.querySelectorAll(".restart-button").forEach(function (button) {
  button.addEventListener("click", function () {
    GameService.start();
    SensorService.notifyGameStart();
  });
});

// Mouse whacks
GameView.holes.forEach(function (hole) {
  hole.addEventListener("click", function () {
    GameService.whack(Number(hole.dataset.hole), "mouse");
  });
});

// Start listening to the ESP32
SensorService.start();
