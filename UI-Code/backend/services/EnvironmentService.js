// One visual theme per level. One file owns this: the level->theme map lives here.
// Backend only sets a body class (freezing, fire, toxic, void); level 1 is the
// default page. Real art lands later on the frontend.
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
