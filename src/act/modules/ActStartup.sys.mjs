/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  ActExtensions: "resource://act/ActExtensions.sys.mjs",
  ActUrlbar: "resource://act/ActUrlbar.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

const BROWSER_URL = "chrome://browser/content/browser.xhtml";
export const NEWTAB_URL = "chrome://act/content/newtab/newtab.html";

// Loaded into every browser window, in this order. They share the window's
// global scope, same as Firefox's own browser-*.js scripts.
const WINDOW_SCRIPTS = [
  "chrome://act/content/browser/act-browser.js",
  "chrome://act/content/browser/act-layout.js",
  "chrome://act/content/browser/act-workspaces.js",
  "chrome://act/content/browser/act-extensions.js",
  "chrome://act/content/browser/act-popup.js",
  "chrome://act/content/browser/act-site-actions.js",
  "chrome://act/content/browser/act-context-menu.js",
];

const WINDOW_STYLES = ["chrome://act/content/browser/act-browser.css"];

export const ActStartup = {
  _started: false,
  _globalsReady: false,

  init() {
    if (this._started) {
      return;
    }
    this._started = true;
    this._setHomepage();
    Services.obs.addObserver(this, "chrome-document-global-created");
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
  },

  observe(subject, topic) {
    switch (topic) {
      case "chrome-document-global-created":
        // Styles go in as early as possible so there's no flash of the stock
        // layout. Scripts wait for delayed startup, when gBrowser is ready.
        subject.addEventListener(
          "DOMContentLoaded",
          () => {
            if (subject.location.href == BROWSER_URL) {
              this._loadStyles(subject);
            }
          },
          { once: true }
        );
        break;
      case "browser-delayed-startup-finished":
        this._setupWindow(subject);
        break;
    }
  },

  _loadStyles(win) {
    let utils = win.windowUtils;
    for (let url of WINDOW_STYLES) {
      try {
        utils.loadSheetUsingURIString(url, utils.AUTHOR_SHEET);
      } catch (e) {
        console.error(`Act: couldn't load ${url}`, e);
      }
    }
  },

  _setupWindow(win) {
    this._setupGlobals();

    for (let url of WINDOW_SCRIPTS) {
      try {
        Services.scriptloader.loadSubScript(url, win);
      } catch (e) {
        console.error(`Act: failed to load ${url}`, e);
      }
    }

    try {
      win.ActBrowser.init();
    } catch (e) {
      console.error("Act: window init failed", e);
    }
  },

  // Things that only need to happen once per session, not per window.
  _setupGlobals() {
    if (this._globalsReady) {
      return;
    }
    this._globalsReady = true;

    try {
      lazy.CustomizableUI.createWidget({
        id: "act-button",
        type: "button",
        defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
        label: "Act",
        tooltiptext: "Explore with Actuent (Ctrl+Alt+E)",
        onCommand(event) {
          event.target.ownerGlobal.ActPopup?.toggle();
        },
      });
    } catch (e) {
      console.error("Act: couldn't create toolbar button", e);
    }

    try {
      this._tidyToolbar();
    } catch (e) {
      console.error("Act: couldn't tidy the toolbar", e);
    }

    try {
      lazy.ActUrlbar.register();
    } catch (e) {
      console.error("Act: couldn't register the urlbar provider", e);
    }

    try {
      lazy.ActExtensions.register();
    } catch (e) {
      console.error("Act: couldn't set up the extensions bar", e);
    }

    this._applyNewTab();
    watchPrefs([PREF.newtabEnabled], () => {
      this._applyNewTab();
      this._setHomepage();
    });
  },

  // The toolbar row on top of the tab sidebar only has room for a handful
  // of buttons, so on first run we trim it to the ones people use. Anything
  // can be put back with Customize Toolbar.
  _tidyToolbar() {
    const VERSION_PREF = "act.layout.toolbarVersion";
    const VERSION = 2;
    if (Services.prefs.getIntPref(VERSION_PREF, 0) >= VERSION) {
      return;
    }
    let { CustomizableUI } = lazy;
    // Don't remove sidebar-button: Firefox switches back to horizontal tabs
    // when it disappears. It's hidden with CSS instead.
    for (let id of [
      "home-button",
      "fxa-toolbar-menu-button",
      "alltabs-button",
      "smartwindow-group-tabs-button",
      "ai-window-toggle",
    ]) {
      if (CustomizableUI.getPlacementOfWidget(id)) {
        CustomizableUI.removeWidgetFromArea(id);
      }
    }
    for (let id of CustomizableUI.getWidgetIdsInArea(CustomizableUI.AREA_NAVBAR)) {
      // Springs and spacers, they only push buttons around in a narrow row.
      if (/^(spring|spacer|separator)|^customizableui-special-/.test(id)) {
        CustomizableUI.removeWidgetFromArea(id);
      }
    }
    // Back, forward, reload, Act, then the address bar.
    let order = [
      "sidebar-button",
      "back-button",
      "forward-button",
      "stop-reload-button",
      "act-button",
    ];
    for (let [i, id] of order.entries()) {
      CustomizableUI.addWidgetToArea(id, CustomizableUI.AREA_NAVBAR, i);
    }
    Services.prefs.setIntPref(VERSION_PREF, VERSION);
  },

  // New tabs open the Act start page, unless that's turned off.
  _applyNewTab() {
    try {
      let { AboutNewTab } = lazy;
      if (ActPrefs.newtabEnabled) {
        AboutNewTab.newTabURL = NEWTAB_URL;
      } else if (AboutNewTab.newTabURL == NEWTAB_URL) {
        AboutNewTab.resetNewTabURL();
      }
    } catch (e) {
      console.error("Act: couldn't set the new tab page", e);
    }
  },

  // The home page follows the new tab page, unless the user picked one.
  _setHomepage() {
    let defaults = Services.prefs.getDefaultBranch("");
    let home = "browser.startup.homepage";
    if (ActPrefs.newtabEnabled) {
      defaults.setStringPref(home, NEWTAB_URL);
    } else if (defaults.getStringPref(home, "") == NEWTAB_URL) {
      defaults.setStringPref(home, "about:home");
    }
  },
};
