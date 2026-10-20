//This is just calling the main services
FrontendMetrics.init();
GameView.init();
SensorService.init();

// ESP32 hit -> flash, swing, score
SensorService.onHit = function (holeIndex, kind) {

  //Just calls gameservice and ensures that it is free and not to reset streaks and not repeat empty holes
  var game = GameService.game;
  if (kind === "occupancy" && (!game || !game.playing || !game.mole || game.mole.hole !== holeIndex)) return;
  GameView.flashSensorHit(holeIndex);

  //Sensors now swing when hit
  var result = GameService.whackHole(holeIndex, "sensor");
  if (result && result.hit) GameView.swingHammer();
};

// Buttons
document.getElementById("start-button").addEventListener("click", function () {
  GameService.startGame();
  SensorService.armSensorsForGameStart(); // rearming the ESP32 (won't work if offline)
});
document.querySelectorAll(".restart-button").forEach(function (button) {
  button.addEventListener("click", function () {
    GameService.startGame();
    SensorService.armSensorsForGameStart();
  });
});

// Mouse whacks (for testing)
GameView.holes.forEach(function (hole) {
  hole.addEventListener("click", function () {
    var result = GameService.whackHole(Number(hole.dataset.hole), "mouse");
    if (result && result.hit) GameView.swingHammer();
  });
});

// Start listening to the ESP32
SensorService.start();
