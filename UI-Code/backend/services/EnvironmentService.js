// One visual theme per level. One file owns this: the level->theme map lives here.
// Backend only sets a body class (freezing, fire, toxic, void); level 1 is the
// default page. Real art lands later on the frontend.
// The live game only reaches levels 1-3 (grassland / freezing / fire);
// toxic and void stay as unused hooks for a future level 4-5.
var EnvironmentService = {
  themeFor: function (level) {
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
