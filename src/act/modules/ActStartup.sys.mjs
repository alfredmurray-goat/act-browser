/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  ActAgents: "resource://act/ActAgents.sys.mjs",
  ActExtensions: "resource://act/ActExtensions.sys.mjs",
  ActFraming: "resource://act/ActFraming.sys.mjs",
  ActUpdater: "resource://act/ActUpdater.sys.mjs",
  ActUrlbar: "resource://act/ActUrlbar.sys.mjs",
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

const BROWSER_URL = "chrome://browser/content/browser.xhtml";
// Served as plain web content (see chrome.manifest), not with chrome
// privileges, so the page can embed third-party widgets like the weather.
export const NEWTAB_URL = "resource://act-page/newtab/newtab.html";
const OLD_NEWTAB_URL = "chrome://act/content/newtab/newtab.html";

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
  "chrome://act/content/browser/act-upload.js",
  "chrome://act/content/browser/act-updates.js",
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
    // Before any page loads, so the first frames are covered too.
    try {
      lazy.ActFraming.init();
    } catch (e) {
      console.error("Act: framing", e);
    }
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
          event.target.ownerDocument.defaultView.ActPopup?.toggle();
        },
      });
    } catch (e) {
      console.error("Act: couldn't create toolbar button", e);
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

    try {
      this._tidyToolbar();
    } catch (e) {
      console.error("Act: couldn't tidy the toolbar", e);
    }

    try {
      // What the new tab page may ask the browser for.
      ChromeUtils.registerWindowActor("ActNewTab", {
        parent: { esModuleURI: "resource://act/actors/ActNewTabParent.sys.mjs" },
        child: {
          esModuleURI: "resource://act/actors/ActNewTabChild.sys.mjs",
          events: { DOMDocElementInserted: { capture: true } },
        },
        matches: [`${NEWTAB_URL.replace(/[^/]*$/, "")}*`],
        messageManagerGroups: ["browsers"],
        safeForUntrustedWebProcess: true,
      });
    } catch (e) {
      console.error("Act: couldn't register the new tab helper", e);
    }

    try {
      // Opera style "upload from clipboard" for <input type="file">.
      ChromeUtils.registerWindowActor("ActUpload", {
        parent: { esModuleURI: "resource://act/actors/ActUploadParent.sys.mjs" },
        child: {
          esModuleURI: "resource://act/actors/ActUploadChild.sys.mjs",
          events: { click: { capture: true } },
        },
        allFrames: true,
        messageManagerGroups: ["browsers"],
        enablePreference: "act.upload.clipboard",
        // The page side only asks, the parent decides (and only hands over
        // the clipboard when the user picks it), so web processes are fine.
        safeForUntrustedWebProcess: true,
      });
    } catch (e) {
      console.error("Act: couldn't register the upload helper", e);
    }

    try {
      lazy.ActAgents.init();
    } catch (e) {
      console.error("Act: agent control", e);
    }

    try {
      lazy.ActUpdater.init();
    } catch (e) {
      console.error("Act: updater", e);
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
    const VERSION = 4;
    let done = Services.prefs.getIntPref(VERSION_PREF, 0);
    if (done >= VERSION) {
      return;
    }
    let { CustomizableUI } = lazy;
    // v4: downloads get a permanent spot in the sidebar's bottom row.
    CustomizableUI.addWidgetToArea("downloads-button", lazy.ActExtensions.TOOLS_AREA);
    if (done >= 2) {
      Services.prefs.setIntPref(VERSION_PREF, VERSION);
      return;
    }
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
      } else if ([NEWTAB_URL, OLD_NEWTAB_URL].includes(AboutNewTab.newTabURL)) {
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
    // Someone who picked the old address as their home page keeps a working one.
    if (Services.prefs.getStringPref(home, "") == OLD_NEWTAB_URL) {
      Services.prefs.clearUserPref(home);
    }
  },
};
