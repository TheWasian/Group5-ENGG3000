//The different biome per level (currently not level 4 or 5)
var EnvironmentService = {
  environmentForLevel: function (level) {
    var themes = {
      1: "grassland",
      2: "freezing",
      3: "fire",
      4: "toxic",
      5: "void",
    };
    return themes[level] || "grassland";
  },
};
