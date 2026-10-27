// Frontend performance panel
// Used just for testing and getting data
var FrontendMetrics = {
  pageLoadTime: null,

  init: function () {
    if (!document.getElementById("performance-metrics")) return;
    // Page-load time
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("load", function () {
        FrontendMetrics.pageLoadTime = performance.now();
        FrontendMetrics.show("load-time", FrontendMetrics.pageLoadTime, 2);
      });
    }
    // Frames per second
    if (typeof requestAnimationFrame === "function") {
      var frames = 0;
      var mark = performance.now();
      var loop = function (now) {
        frames += 1;
        if (now - mark >= 1000) {
          FrontendMetrics.show("fps", (frames * 1000) / (now - mark), 1);
          frames = 0;
          mark = now;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  },

  show: function (id, value, decimals) {
    var el = typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null;
    if (!el) return;
    el.textContent = decimals === undefined ? Math.round(value * 100) / 100 : value.toFixed(decimals);
  },

  recordMoleRender: function (ms) {
    this.show("mole-render-time", ms, 2);
  },

  recordWhack: function (ms, type) {
    this.show("whack-response-time", ms, 2);
    if (type === "frozen") this.show("frozen-response-time", ms, 2);
    else if (type === "normal") this.show("normal-response-time", ms, 2);
  },

  recordLevelTransition: function (ms) {
    this.show("level-transition-time", ms, 2);
  },

  recordFreeze: function (ms) {
    this.show("freeze-duration", ms, 2);
  },

  recordGoldenLifetime: function (ms) {
    this.show("golden-lifetime", ms, 2);
  },
};
