/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Loaded into every browser window by ActStartup. Ties the other act-*.js
// scripts together and owns the window-wide bits: feature switches,
// compact mode and keyboard shortcuts.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  Actuent: "resource://act/Actuent.sys.mjs",
});
ChromeUtils.defineLazyGetter(this, "ActPrefsModule", () =>
  ChromeUtils.importESModule("resource://act/ActPrefs.sys.mjs")
);

var ActBrowser = {
  _unwatch: null,

  get prefs() {
    return ActPrefsModule.ActPrefs;
  },

  get PREF() {
    return ActPrefsModule.PREF;
  },

  setPref(name, value) {
    ActPrefsModule.setActPref(name, value);
  },

  init() {
    let { PREF } = this;
    this._applyAttributes();

    this._unwatch = ActPrefsModule.watchPrefs(
      [
        PREF.aiEnabled,
        PREF.actuentEnabled,
        PREF.actuentSiteActions,
        PREF.compactMode,
        PREF.workspacesEnabled,
        PREF.workspacesList,
      ],
      pref => this._onPrefChanged(pref)
    );

    this._onKeyDown = this._onKeyDown.bind(this);
    window.addEventListener("keydown", this._onKeyDown, true);
    window.addEventListener("unload", () => this.uninit(), { once: true });

    for (let part of [ActPanel, ActWorkspaces, ActSiteActions, ActContextMenu]) {
      try {
        part.init();
      } catch (e) {
        console.error("Act: init failed", e);
      }
    }
  },

  uninit() {
    this._unwatch?.();
    window.removeEventListener("keydown", this._onKeyDown, true);
    ActSiteActions.uninit();
    ActWorkspaces.uninit();
  },

  get aiEnabled() {
    return this.prefs.aiEnabled;
  },

  get actuentEnabled() {
    return this.prefs.actuentEnabled;
  },

  _applyAttributes() {
    let root = document.documentElement;
    root.toggleAttribute("act-compact", this.prefs.compactMode);
    root.toggleAttribute("act-ai", this.prefs.aiEnabled);
    root.toggleAttribute("act-actuent", this.prefs.actuentEnabled);
  },

  _onPrefChanged(pref) {
    let { PREF } = this;
    this._applyAttributes();
    switch (pref) {
      case PREF.aiEnabled:
      case PREF.actuentEnabled:
        ActPanel.update();
        ActSiteActions.update();
        break;
      case PREF.actuentSiteActions:
        ActSiteActions.update();
        break;
      case PREF.workspacesEnabled:
      case PREF.workspacesList:
        ActWorkspaces.update();
        break;
    }
  },

  toggleCompactMode() {
    this.setCompactMode(!this.prefs.compactMode);
  },

  // Compact mode hides the toolbar until you hover the top of the window and
  // collapses the tab sidebar to icons. For the sidebar we borrow Firefox's
  // own expand-on-hover mode and put the user's choice back afterwards.
  setCompactMode(on) {
    const VIS = "sidebar.visibility";
    const SAVED = "act.compactMode.savedVisibility";
    if (on == this.prefs.compactMode) {
      return;
    }
    if (on) {
      let current = Services.prefs.getStringPref(VIS, "always-show");
      if (current != "expand-on-hover") {
        Services.prefs.setStringPref(SAVED, current);
        Services.prefs.setStringPref(VIS, "expand-on-hover");
      }
    } else {
      let saved = Services.prefs.getStringPref(SAVED, "always-show");
      Services.prefs.setStringPref(VIS, saved);
      Services.prefs.clearUserPref(SAVED);
    }
    this.setPref(this.PREF.compactMode, on);
  },

  _onKeyDown(event) {
    // Ctrl+Alt on every platform, like Zen. Using event.code so it works
    // with Option on macOS, which changes event.key.
    if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) {
      return;
    }
    let handled = true;
    switch (event.code) {
      case "KeyA":
        ActPanel.toggle();
        break;
      case "KeyE":
        ActPanel.open("explore");
        break;
      case "KeyC":
        this.toggleCompactMode();
        break;
      case "ArrowRight":
        ActWorkspaces.cycle(1);
        break;
      case "ArrowLeft":
        ActWorkspaces.cycle(-1);
        break;
      default:
        if (/^Digit[1-9]$/.test(event.code)) {
          ActWorkspaces.switchToIndex(parseInt(event.code.slice(5)) - 1);
        } else {
          handled = false;
        }
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  },

  /**
   * Opens an http(s) link from Act UI in a new tab. Anything else is ignored,
   * since the links come from model output or search results.
   */
  openLink(url, { background = false } = {}) {
    let uri;
    try {
      uri = new URL(url);
    } catch {
      return;
    }
    if (uri.protocol != "https:" && uri.protocol != "http:") {
      return;
    }
    openWebLinkIn(uri.href, "tab", { inBackground: background });
  },
};
