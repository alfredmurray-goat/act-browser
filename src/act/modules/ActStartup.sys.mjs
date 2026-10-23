/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  ActUrlbar: "resource://act/ActUrlbar.sys.mjs",
});

const BROWSER_URL = "chrome://browser/content/browser.xhtml";

// Loaded into every browser window, in this order. They share the window's
// global scope, same as Firefox's own browser-*.js scripts.
const WINDOW_SCRIPTS = [
  "chrome://act/content/browser/act-browser.js",
  "chrome://act/content/browser/act-panel.js",
  "chrome://act/content/browser/act-workspaces.js",
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
        tooltiptext: "Act panel (Ctrl+Alt+A)",
        onCommand(event) {
          event.target.ownerGlobal.ActPanel?.toggle();
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
  },
};
