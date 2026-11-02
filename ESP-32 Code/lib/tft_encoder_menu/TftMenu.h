/*
 * TftMenu.h - header-only rotary-encoder menu for Adafruit_GFX displays
 *
 * Usage (in your .ino):
 *   1. #include your display driver, then optionally #define any MENU_* overrides
 *   2. #include "TftMenu.h"
 *   3. Describe your menus with the SUBMENU / ACTION / TOGGLE / VALUE / BACK macros
 *   4. Create:   TftMenu menu(tft, ENC_A, ENC_B, ENC_BTN);
 *   5. In setup() after the display is initialised:   menu.begin(&mainMenu);
 *   6. In loop():                                      menu.update();
 *
 * Include this header from ONE file only (your main .ino).
 */
#ifndef TFT_MENU_H
#define TFT_MENU_H

#include <Arduino.h>
#include <Adafruit_GFX.h>

// ===========================================================================
// CONFIGURATION - define any of these BEFORE including this header to override
// ===========================================================================
#ifndef MENU_ENCODER_STEPS_PER_DETENT
#define MENU_ENCODER_STEPS_PER_DETENT 4      // Try 2 if one click skips two steps
#endif
#ifndef MENU_ENCODER_REVERSE
#define MENU_ENCODER_REVERSE false           // Flip if rotation feels backwards
#endif
#ifndef MENU_BUTTON_DEBOUNCE_MS
#define MENU_BUTTON_DEBOUNCE_MS 30
#endif
#ifndef MENU_BUTTON_LONG_PRESS_MS
#define MENU_BUTTON_LONG_PRESS_MS 600        // Long press = go back
#endif
#ifndef MENU_MAX_DEPTH
#define MENU_MAX_DEPTH 8
#endif
#ifndef MENU_TOAST_MS
#define MENU_TOAST_MS 600
#endif

// Colors (RGB565)
#ifndef MENU_COL_BG
#define MENU_COL_BG          0x0000   // black
#endif
#ifndef MENU_COL_TEXT
#define MENU_COL_TEXT        0xFFFF   // white
#endif
#ifndef MENU_COL_HEADER_BG
#define MENU_COL_HEADER_BG   0x001F   // blue
#endif
#ifndef MENU_COL_HEADER_TEXT
#define MENU_COL_HEADER_TEXT 0xFFFF   // white
#endif
#ifndef MENU_COL_SEL_BG
#define MENU_COL_SEL_BG      0x07FF   // cyan
#endif
#ifndef MENU_COL_SEL_TEXT
#define MENU_COL_SEL_TEXT    0x0000   // black
#endif
#ifndef MENU_COL_EDIT
#define MENU_COL_EDIT        0xFFE0   // yellow
#endif
#ifndef MENU_COL_DIM
#define MENU_COL_DIM         0x7BEF   // grey
#endif

// Layout
#ifndef MENU_HEADER_H
#define MENU_HEADER_H 16
#endif
#ifndef MENU_ROW_H
#define MENU_ROW_H 16
#endif
#define MENU_LIST_Y (MENU_HEADER_H + 2)

// ===========================================================================
// MENU DATA MODEL
// ===========================================================================
enum ItemType : uint8_t {
  ITEM_SUBMENU,  // opens another menu
  ITEM_ACTION,   // runs a callback
  ITEM_TOGGLE,   // flips an int between 0 and 1
  ITEM_VALUE,    // edits an int between min and max
  ITEM_BACK      // returns to the parent menu
};

struct Menu;  // forward declaration

struct MenuItem {
  const char* label;
  ItemType    type;
  const Menu* submenu;    // ITEM_SUBMENU
  void      (*action)();  // ITEM_ACTION
  int*        value;      // ITEM_TOGGLE / ITEM_VALUE
  int         minVal;     // ITEM_VALUE
  int         maxVal;     // ITEM_VALUE
  int         step;       // ITEM_VALUE
};

struct Menu {
  const char*     title;
  const MenuItem* items;
  uint8_t         count;
};

// Helper macros to keep menu tables readable
#define SUBMENU(label, menuPtr)         { label, ITEM_SUBMENU, menuPtr,  nullptr, nullptr, 0, 0, 0 }
#define ACTION(label, fn)               { label, ITEM_ACTION,  nullptr,  fn,      nullptr, 0, 0, 0 }
#define TOGGLE(label, varPtr)           { label, ITEM_TOGGLE,  nullptr,  nullptr, varPtr,  0, 1, 1 }
#define VALUE(label, varPtr, lo, hi, s) { label, ITEM_VALUE,   nullptr,  nullptr, varPtr,  lo, hi, s }
#define BACK()                          { "< Back", ITEM_BACK, nullptr,  nullptr, nullptr, 0, 0, 0 }

// Declares a Menu from an item array:  MENU(settingsMenu, "Settings", settingsItems);
#define MENU(name, title, itemsArray) \
  const Menu name = { title, itemsArray, (uint8_t)(sizeof(itemsArray) / sizeof(MenuItem)) }

// ===========================================================================
// ENCODER ISR (file-scope because interrupts need plain functions)
// ===========================================================================
static volatile int32_t _tmEncoderCount = 0;
static uint8_t          _tmPinA = 0;
static uint8_t          _tmPinB = 0;

// Gray-code transition table: index = (previousState << 2) | currentState
DRAM_ATTR static const int8_t _TM_ENC_TABLE[16] = {
   0, -1,  1,  0,
   1,  0,  0, -1,
  -1,  0,  0,  1,
   0,  1, -1,  0
};

static void IRAM_ATTR _tmEncoderISR() {
  static uint8_t prev = 0;
  uint8_t cur = (digitalRead(_tmPinA) << 1) | digitalRead(_tmPinB);
  _tmEncoderCount += _TM_ENC_TABLE[(prev << 2) | cur];
  prev = cur;
}

// ===========================================================================
// TftMenu CLASS
// ===========================================================================
class TftMenu {
public:
  typedef void (*ChangeCallback)(const MenuItem& item);

  TftMenu(Adafruit_GFX& gfx, uint8_t pinA, uint8_t pinB, uint8_t pinButton)
    : _gfx(gfx), _pinA(pinA), _pinB(pinB), _pinBtn(pinButton) {}

  // Call AFTER the display has been initialised.
  void begin(const Menu* root) {
    _root = _current = root;
    _sel = _top = _depth = 0;
    _editing = false;

    pinMode(_pinA, INPUT_PULLUP);
    pinMode(_pinB, INPUT_PULLUP);
    pinMode(_pinBtn, INPUT_PULLUP);
    _tmPinA = _pinA;
    _tmPinB = _pinB;
    _lastCount = _tmEncoderCount;
    attachInterrupt(digitalPinToInterrupt(_pinA), _tmEncoderISR, CHANGE);
    attachInterrupt(digitalPinToInterrupt(_pinB), _tmEncoderISR, CHANGE);

    _gfx.fillScreen(MENU_COL_BG);
    redraw();
  }

  // Call every loop().
  void update() {
    int delta = readEncoder();
    if (delta != 0) {
      if (_editing) adjustValue(delta);
      else          moveSelection(delta);
    }
    switch (readButton()) {
      case BTN_SHORT: selectItem(); break;
      case BTN_LONG:  goBack();     break;
      default: break;
    }
  }

  // Optional: get notified whenever a TOGGLE or VALUE item changes.
  void onChange(ChangeCallback cb) { _onChange = cb; }

  // Redraw the whole menu (e.g. after you drew something else on the screen).
  void redraw() {
    drawHeader();
    drawList();
  }

  // Flash a short message in the middle of the screen, then restore the menu.
  void showToast(const char* msg) {
    int w = _gfx.width() - 20;
    int h = 24;
    int x = 10;
    int y = (_gfx.height() - h) / 2;
    _gfx.fillRect(x, y, w, h, MENU_COL_HEADER_BG);
    _gfx.drawRect(x, y, w, h, MENU_COL_TEXT);
    _gfx.setTextSize(1);
    _gfx.setTextColor(MENU_COL_TEXT);
    int tw = strlen(msg) * 6;
    _gfx.setCursor(x + (w - tw) / 2, y + 8);
    _gfx.print(msg);
    delay(MENU_TOAST_MS);
    redraw();
  }

  void goBack() {
    if (_editing) {              // exit edit mode first
      _editing = false;
      drawRow(_sel);
      return;
    }
    if (_depth == 0) return;     // already at root
    _depth--;
    _current = _menuStack[_depth];
    _sel     = _selStack[_depth];
    _top     = _topStack[_depth];
    redraw();
  }

  bool isEditing() const { return _editing; }
  const Menu* currentMenu() const { return _current; }

private:
  enum ButtonEvent { BTN_NONE, BTN_SHORT, BTN_LONG };

  Adafruit_GFX& _gfx;
  uint8_t _pinA, _pinB, _pinBtn;

  // Navigation state
  const Menu* _root = nullptr;
  const Menu* _current = nullptr;
  uint8_t _sel = 0;
  uint8_t _top = 0;
  bool    _editing = false;
  const Menu* _menuStack[MENU_MAX_DEPTH];
  uint8_t _selStack[MENU_MAX_DEPTH];
  uint8_t _topStack[MENU_MAX_DEPTH];
  uint8_t _depth = 0;

  // Input state
  int32_t _lastCount = 0;
  bool _lastRaw = HIGH, _stable = HIGH, _longFired = false;
  unsigned long _lastChange = 0, _pressedAt = 0;

  ChangeCallback _onChange = nullptr;

  // ----- Input -----------------------------------------------------------
  int readEncoder() {
    int32_t c = _tmEncoderCount;
    int32_t delta = (c - _lastCount) / MENU_ENCODER_STEPS_PER_DETENT;
    if (delta != 0) _lastCount += delta * MENU_ENCODER_STEPS_PER_DETENT;
    return MENU_ENCODER_REVERSE ? -(int)delta : (int)delta;
  }

  ButtonEvent readButton() {
    bool raw = digitalRead(_pinBtn);
    unsigned long now = millis();

    if (raw != _lastRaw) {
      _lastRaw = raw;
      _lastChange = now;
    }
    if ((now - _lastChange) > MENU_BUTTON_DEBOUNCE_MS && raw != _stable) {
      _stable = raw;
      if (_stable == LOW) {            // pressed
        _pressedAt = now;
        _longFired = false;
      } else if (!_longFired) {        // released after a short press
        return BTN_SHORT;
      }
    }
    if (_stable == LOW && !_longFired && (now - _pressedAt) >= MENU_BUTTON_LONG_PRESS_MS) {
      _longFired = true;
      return BTN_LONG;
    }
    return BTN_NONE;
  }

  // ----- Drawing ---------------------------------------------------------
  uint8_t visibleRows() { return (_gfx.height() - MENU_LIST_Y) / MENU_ROW_H; }

  void drawHeader() {
    _gfx.fillRect(0, 0, _gfx.width(), MENU_HEADER_H, MENU_COL_HEADER_BG);
    _gfx.setTextSize(1);
    _gfx.setTextColor(MENU_COL_HEADER_TEXT);
    _gfx.setCursor(4, 4);
    _gfx.print(_current->title);
  }

  void drawRow(uint8_t index) {
    uint8_t rows = visibleRows();
    if (index < _top || index >= _top + rows || index >= _current->count) return;

    const MenuItem& item = _current->items[index];
    int y = MENU_LIST_Y + (index - _top) * MENU_ROW_H;
    bool isSel = (index == _sel);

    uint16_t bg = isSel ? MENU_COL_SEL_BG   : MENU_COL_BG;
    uint16_t fg = isSel ? MENU_COL_SEL_TEXT : MENU_COL_TEXT;

    _gfx.fillRect(0, y, _gfx.width(), MENU_ROW_H, bg);
    _gfx.setTextSize(1);
    _gfx.setTextColor(fg);
    _gfx.setCursor(4, y + 4);
    _gfx.print(item.label);

    char buf[12] = "";
    switch (item.type) {
      case ITEM_SUBMENU: strcpy(buf, ">"); break;
      case ITEM_TOGGLE:  strcpy(buf, *item.value ? "ON" : "OFF"); break;
      case ITEM_VALUE:   snprintf(buf, sizeof(buf), "%d", *item.value); break;
      default: break;
    }
    if (buf[0]) {
      int w = strlen(buf) * 6;
      int x = _gfx.width() - w - 4;
      if (isSel && _editing && item.type == ITEM_VALUE) {
        _gfx.fillRect(x - 2, y + 1, w + 4, MENU_ROW_H - 2, MENU_COL_EDIT);
        _gfx.setTextColor(MENU_COL_SEL_TEXT);
      }
      _gfx.setCursor(x, y + 4);
      _gfx.print(buf);
    }
  }

  void drawScrollIndicators() {
    uint8_t rows = visibleRows();
    int x = _gfx.width() - 5;
    _gfx.fillRect(x - 1, MENU_HEADER_H, 6, 2, MENU_COL_BG);
    _gfx.fillRect(x - 1, _gfx.height() - 2, 6, 2, MENU_COL_BG);
    if (_top > 0)
      _gfx.fillTriangle(x, MENU_HEADER_H + 1, x + 4, MENU_HEADER_H + 1,
                        x + 2, MENU_HEADER_H - 1, MENU_COL_HEADER_TEXT);
    if (_top + rows < _current->count)
      _gfx.fillTriangle(x, _gfx.height() - 2, x + 4, _gfx.height() - 2,
                        x + 2, _gfx.height() - 1, MENU_COL_DIM);
  }

  void drawList() {
    uint8_t rows = visibleRows();
    _gfx.fillRect(0, MENU_LIST_Y, _gfx.width(), _gfx.height() - MENU_LIST_Y, MENU_COL_BG);
    for (uint8_t i = _top; i < _current->count && i < _top + rows; i++) drawRow(i);
    drawScrollIndicators();
  }

  // ----- Navigation ------------------------------------------------------
  void enterMenu(const Menu* menu) {
    if (_depth < MENU_MAX_DEPTH) {
      _menuStack[_depth] = _current;
      _selStack[_depth]  = _sel;
      _topStack[_depth]  = _top;
      _depth++;
    }
    _current = menu;
    _sel = _top = 0;
    _editing = false;
    redraw();
  }

  void moveSelection(int delta) {
    int count = _current->count;
    uint8_t rows = visibleRows();
    uint8_t old = _sel;

    _sel = (uint8_t)((((int)_sel + delta) % count + count) % count);   // wraps around

    uint8_t oldTop = _top;
    if (_sel < _top)               _top = _sel;
    else if (_sel >= _top + rows)  _top = _sel - rows + 1;

    if (_top != oldTop) {
      drawList();                  // scrolled: redraw everything
    } else {
      drawRow(old);                // otherwise only redraw the two changed rows
      drawRow(_sel);
    }
  }

  void adjustValue(int delta) {
    const MenuItem& item = _current->items[_sel];
    int v = *item.value + delta * item.step;
    *item.value = constrain(v, item.minVal, item.maxVal);
    drawRow(_sel);
    if (_onChange) _onChange(item);
  }

  void selectItem() {
    const MenuItem& item = _current->items[_sel];
    switch (item.type) {
      case ITEM_SUBMENU:
        enterMenu(item.submenu);
        break;
      case ITEM_BACK:
        goBack();
        break;
      case ITEM_ACTION:
        if (item.action) item.action();
        showToast(item.label);
        break;
      case ITEM_TOGGLE:
        *item.value = !*item.value;
        drawRow(_sel);
        if (_onChange) _onChange(item);
        break;
      case ITEM_VALUE:
        _editing = !_editing;
        drawRow(_sel);
        break;
    }
  }
};

#endif  // TFT_MENU_H
