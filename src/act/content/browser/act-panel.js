/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The Act panel on the right side of the window. The UI itself is a normal
// page (panel/panel.html) living in an iframe, this file only handles the
// box around it: creating it, resizing and showing/hiding.

"use strict";

var ActPanel = {
  box: null,
  splitter: null,
  frame: null,
  _pending: [],

  init() {
    this.splitter = document.createXULElement("splitter");
    this.splitter.id = "act-panel-splitter";
    this.splitter.className = "chromeclass-extrachrome sidebar-splitter";
    this.splitter.setAttribute("resizebefore", "sibling");
    this.splitter.setAttribute("resizeafter", "sibling");

    this.box = document.createXULElement("vbox");
    this.box.id = "act-panel";
    this.box.className = "chromeclass-extrachrome";
    this.box.style.width = `${ActBrowser.prefs.panelWidth}px`;

    this.frame = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "iframe"
    );
    this.frame.id = "act-panel-frame";
    this.frame.setAttribute("flex", "1");
    this.box.append(this.frame);

    // Right after the web content, so the splitter resizes content and panel.
    document
      .getElementById("tabbrowser-tabbox")
      .after(this.splitter, this.box);

    // The splitter changes the box width directly, remember it.
    this.splitter.addEventListener("command", () => this._saveWidth());
    this.splitter.addEventListener("mouseup", () => this._saveWidth());

    this.update();
    if (ActBrowser.prefs.panelOpen) {
      this.open();
    } else {
      this._setOpen(false);
    }
  },

  get isOpen() {
    return !this.box.hidden;
  },

  /**
   * Calls `fn(ui)` once the panel page has loaded.
   */
  _withUI(fn) {
    let ui = this.frame.contentWindow?.ActPanelUI;
    if (ui?.ready) {
      fn(ui);
    } else {
      this._pending.push(fn);
    }
  },

  // Called by panel.js when it's done loading.
  _uiReady(ui) {
    let pending = this._pending;
    this._pending = [];
    for (let fn of pending) {
      try {
        fn(ui);
      } catch (e) {
        console.error(e);
      }
    }
  },

  _ensureLoaded() {
    if (!this.frame.getAttribute("src")) {
      this.frame.setAttribute("src", "chrome://act/content/panel/panel.html");
    }
  },

  _setOpen(open) {
    this.box.hidden = !open;
    this.splitter.hidden = !open;
    document.documentElement.toggleAttribute("act-panel-open", open);
    let button = document.getElementById("act-button");
    button?.toggleAttribute("checked", open);
  },

  open(view) {
    this._ensureLoaded();
    this._setOpen(true);
    ActBrowser.setPref(ActBrowser.PREF.panelOpen, true);
    this._withUI(ui => {
      if (view) {
        ui.showView(view);
      }
      ui.focus();
    });
  },

  close() {
    this._setOpen(false);
    ActBrowser.setPref(ActBrowser.PREF.panelOpen, false);
    gBrowser.selectedBrowser.focus();
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  /**
   * Opens the panel and asks the assistant something.
   */
  ask(text, { send = true } = {}) {
    if (!ActBrowser.aiEnabled) {
      return;
    }
    this.open("ask");
    this._withUI(ui => ui.ask(text, { send }));
  },

  /**
   * Opens the Explore view with an Actuent search.
   */
  explore(query) {
    if (!ActBrowser.actuentEnabled) {
      return;
    }
    this.open("explore");
    this._withUI(ui => ui.explore(query));
  },

  update() {
    let ui = this.frame.contentWindow?.ActPanelUI;
    if (ui?.ready) {
      ui.update();
    }
  },

  _saveWidth() {
    let width = Math.round(this.box.getBoundingClientRect().width);
    if (width > 200) {
      ActBrowser.setPref(ActBrowser.PREF.panelWidth, width);
    }
  },
};
