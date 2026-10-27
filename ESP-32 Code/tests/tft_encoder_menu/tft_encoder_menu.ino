#include <Adafruit_GFX.h>      // Core graphics library
#include <Adafruit_ST7735.h>   // ST7735 driver library
#include <SPI.h>

// Optional overrides - uncomment/change BEFORE including TftMenu.h
// #define MENU_ENCODER_STEPS_PER_DETENT 2
// #define MENU_ENCODER_REVERSE true
// #define MENU_COL_SEL_BG ST77XX_GREEN

#include "TftMenu.h"

// ---------------------------------------------------------------------------
// Hardware
// ---------------------------------------------------------------------------
#define TFT_DC      14
#define TFT_RST     21
#define CUSTOM_SCK   9
#define CUSTOM_MISO -1
#define CUSTOM_MOSI  8
#define CUSTOM_SS   -1

#define ENCODER_A       42
#define ENCODER_B       1
#define ENCODER_BUTTON  40

Adafruit_ST7735 tft = Adafruit_ST7735(CUSTOM_SS, TFT_DC, TFT_RST);
TftMenu menu(tft, ENCODER_A, ENCODER_B, ENCODER_BUTTON);

// ---------------------------------------------------------------------------
// Your variables (edited by the menu)
// ---------------------------------------------------------------------------
int settingBrightness = 80;
int settingContrast   = 50;
int settingSound      = 1;
int settingAutoSave   = 0;
int settingSpeed      = 5;

// ---------------------------------------------------------------------------
// Your action callbacks
// ---------------------------------------------------------------------------
void actionStart() {
  Serial.println("Action: Start");
  // TODO: your code here
}

void actionStop() {
  Serial.println("Action: Stop");
  // TODO: your code here
}

void actionReset() {
  settingBrightness = 80;
  settingContrast   = 50;
  settingSound      = 1;
  settingAutoSave   = 0;
  settingSpeed      = 5;
  Serial.println("Action: Settings reset");
}

// Called whenever a TOGGLE or VALUE item changes
void onSettingChanged(const MenuItem& item) {
  Serial.printf("%s = %d\n", item.label, *item.value);
  // TODO: e.g. apply brightness to your backlight here
}

// ---------------------------------------------------------------------------
// Menu definitions - define leaf menus FIRST, the root menu LAST
// ---------------------------------------------------------------------------
const MenuItem displayItems[] = {
  VALUE("Brightness", &settingBrightness, 0, 100, 10),
  VALUE("Contrast",   &settingContrast,   0, 100, 5),
  BACK()
};
MENU(displayMenu, "Display", displayItems);

const MenuItem settingsItems[] = {
  SUBMENU("Display",   &displayMenu),
  TOGGLE ("Sound",     &settingSound),
  TOGGLE ("Auto-save", &settingAutoSave),
  ACTION ("Reset all", actionReset),
  BACK()
};
MENU(settingsMenu, "Settings", settingsItems);

const MenuItem controlItems[] = {
  ACTION("Start", actionStart),
  ACTION("Stop",  actionStop),
  VALUE ("Speed", &settingSpeed, 1, 10, 1),
  BACK()
};
MENU(controlMenu, "Control", controlItems);

const MenuItem mainItems[] = {
  SUBMENU("Control",  &controlMenu),
  SUBMENU("Settings", &settingsMenu),
  ACTION ("Item 3",   []() { Serial.println("Item 3"); }),
  ACTION ("Item 4",   []() { Serial.println("Item 4"); }),
  ACTION ("Item 5",   []() { Serial.println("Item 5"); }),
  ACTION ("Item 6",   []() { Serial.println("Item 6"); }),
  ACTION ("Item 7",   []() { Serial.println("Item 7"); }),
  ACTION ("Item 8",   []() { Serial.println("Item 8"); }),
  ACTION ("Item 9",   []() { Serial.println("Item 9"); }),
  ACTION ("Item 10",  []() { Serial.println("Item 10"); })
};
MENU(mainMenu, "Main Menu", mainItems);

// ---------------------------------------------------------------------------
// Setup / loop
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(9600);
  SPI.begin(CUSTOM_SCK, CUSTOM_MISO, CUSTOM_MOSI, CUSTOM_SS);

  tft.initR(INITR_BLACKTAB);   // Initialization for most 1.8-inch modules
  tft.setRotation(0);          // 0 = portrait (128x160)

  menu.onChange(onSettingChanged);  // optional
  menu.begin(&mainMenu);            // call after the display is initialised

  Serial.println("Menu ready.");
}

void loop() {
  menu.update();
  // Your own non-blocking code can go here
}
