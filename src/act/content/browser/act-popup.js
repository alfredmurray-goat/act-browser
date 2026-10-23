/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The popup behind the Act toolbar button: Actuent search and settings.
// The UI is a page (popup/popup.html) in an iframe, this file only handles
// the panel around it.

"use strict";

var ActPopup = {
  panel: null,
  frame: null,
  _pending: [],

  init() {},

  _build() {
    this.panel = document.createXULElement("panel");
    this.panel.id = "act-popup";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("noautofocus", "true");

    this.frame = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "iframe"
    );
    this.frame.id = "act-popup-frame";
    this.frame.setAttribute("src", "chrome://act/content/popup/popup.html");
    this.panel.append(this.frame);

    this.panel.addEventListener("popupshown", () => {
      this._withUI(ui => ui.focus());
    });
    document.getElementById("mainPopupSet").append(this.panel);
  },

  _withUI(fn) {
    let ui = this.frame?.contentWindow?.ActPopupUI;
    if (ui?.ready) {
      fn(ui);
    } else {
      this._pending.push(fn);
    }
  },

  // Called by popup.mjs once it has loaded.
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

  get isOpen() {
    return this.panel?.state == "open" || this.panel?.state == "showing";
  },

  _anchor() {
    let button = document.getElementById("act-button");
    if (button && button.checkVisibility()) {
      return button;
    }
    return document.getElementById("urlbar");
  },

  open(view) {
    if (!this.panel) {
      this._build();
    }
    if (view) {
      this._withUI(ui => ui.showView(view));
    }
    if (!this.isOpen) {
      this.panel.openPopup(this._anchor(), "bottomleft topleft");
    }
  },

  close() {
    this.panel?.hidePopup();
  },

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  },

  /**
   * Opens the popup with an Actuent search for `query`.
   */
  explore(query) {
    if (!ActBrowser.actuentEnabled) {
      this.open("settings");
      return;
    }
    this.open("explore");
    this._withUI(ui => ui.search(query));
  },
};
