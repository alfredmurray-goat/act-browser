/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Loaded into every browser window by ActStartup. Ties the other act-*.js
// scripts together and owns the window-wide bits: feature switches and
// keyboard shortcuts.

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

  get actuentEnabled() {
    return this.prefs.actuentEnabled;
  },

  init() {
    let { PREF } = this;
    this._applyAttributes();

    this._unwatch = ActPrefsModule.watchPrefs(
      [
        PREF.actuentEnabled,
        PREF.actuentSiteActions,
        PREF.compactMode,
        PREF.sidebarToolbar,
        PREF.extensionsInSidebar,
        PREF.workspacesEnabled,
        PREF.workspacesList,
        "sidebar.verticalTabs",
      ],
      pref => this._onPrefChanged(pref)
    );

    this._onKeyDown = this._onKeyDown.bind(this);
    window.addEventListener("keydown", this._onKeyDown, true);
    window.addEventListener("unload", () => this.uninit(), { once: true });

    // Order matters a little: the extensions bar goes above the workspace
    // switcher, so workspaces come first.
    for (let part of [
      ActLayout,
      ActWorkspaces,
      ActTabGroups,
      ActExtensionsBar,
      ActCorner,
      ActPopup,
      ActSiteActions,
      ActContextMenu,
      ActUploadMenu,
      ActUpdateBar,
      ActCommandPalette,
      ActTabHibernation,
      ActSplitView,
    ]) {
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
    ActLayout.uninit();
    ActUpdateBar.uninit();
  },

  _applyAttributes() {
    let root = document.documentElement;
    let vertical = Services.prefs.getBoolPref("sidebar.verticalTabs", false);
    root.toggleAttribute("act-compact", this.prefs.compactMode);
    root.toggleAttribute("act-actuent", this.prefs.actuentEnabled);
    root.toggleAttribute("act-vertical", vertical);
    root.toggleAttribute(
      "act-sidebar-toolbar",
      vertical && this.prefs.sidebarToolbar
    );
    root.toggleAttribute(
      "act-extensions-in-sidebar",
      vertical && this.prefs.extensionsInSidebar
    );
  },

  _onPrefChanged(pref) {
    let { PREF } = this;
    this._applyAttributes();
    switch (pref) {
      case PREF.actuentEnabled:
      case PREF.actuentSiteActions:
        ActSiteActions.update();
        break;
      case PREF.workspacesEnabled:
      case PREF.workspacesList:
        ActWorkspaces.update();
        break;
      case PREF.sidebarToolbar:
      case "sidebar.verticalTabs":
        ActLayout.update();
        break;
    }
  },

  setCompactMode(on) {
    this.setPref(this.PREF.compactMode, on);
  },

  toggleCompactMode() {
    this.setCompactMode(!this.prefs.compactMode);
  },

  _onKeyDown(event) {
    // Command Palette: Cmd+K on mac, Ctrl+K elsewhere
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() == "k") {
      event.preventDefault();
      event.stopPropagation();
      try {
        ActCommandPalette?.toggle();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    // Split view toggle: Ctrl+Alt+S
    if (event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && event.code == "KeyS") {
      event.preventDefault();
      event.stopPropagation();
      try {
        ActSplitView?.toggle();
      } catch (e) {
        console.error(e);
      }
      return;
    }

    // Ctrl+Alt on every platform, like Zen. Using event.code so it works
    // with Option on macOS, which changes event.key.
    if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) {
      return;
    }
    let handled = true;
    switch (event.code) {
      case "KeyE":
        ActPopup.toggle();
        break;
      case "KeyC":
        this.toggleCompactMode();
        break;
      case "KeyG":
        ActTabGroups.create();
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
   * since the links come from search results.
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


var ActTabHibernation = {
  init() {
    setInterval(() => this._check(), 120000);
  },
  _check() {
    try {
      let tabs = gBrowser?.tabs || [];
      let now = Date.now();
      for (let tab of tabs) {
        if (tab.selected || tab.pinned || tab.closing) continue;
        if (tab.getAttribute("pending") == "true") continue;
        // Heuristic: if not active and browser not loaded? Firefox may have
        // tab.unload() in some builds; otherwise just mark visual state
        if (!tab.hasAttribute("act-unloaded")) {
          try {
            // Try to unload if available
            if (typeof tab.linkedBrowser?.unload == "function") {
              tab.linkedBrowser.unload();
            } else if (gBrowser.discardBrowser) {
              gBrowser.discardBrowser(tab.linkedBrowser);
            }
          } catch {}
          try {
            tab.setAttribute("act-unloaded", "true");
          } catch {}
        }
      }
    } catch (e) {
      console.error(e);
    }
  },
};


var ActSplitView = {
  panels: [],
  active: false,

  init() {
    // add shortcut
  },

  enable() {
    try {
      let panels = document.getElementById("tabbrowser-tabpanels");
      if (!panels || this.active) return;
      panels.classList.add("split-view");
      this.active = true;
    } catch (e) {
      console.error(e);
    }
  },

  disable() {
    try {
      let panels = document.getElementById("tabbrowser-tabpanels");
      if (!panels) return;
      panels.classList.remove("split-view");
      this.active = false;
    } catch (e) {
      console.error(e);
    }
  },

  toggle() {
    if (this.active) this.disable();
    else this.enable();
  },
};
