/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Command Palette (Cmd+K / Ctrl+K): unified search across tabs, history,
// bookmarks, workspaces, settings, actions and Actuent.

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  History: "resource://gre/modules/History.sys.mjs",
});

var ActCommandPalette = {
  panel: null,
  frame: null,

  init() {
    // Will build on first use
  },

  _build() {
    if (this.panel) {
      return;
    }
    this.panel = document.createXULElement("panel");
    this.panel.id = "act-command-palette";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("noautofocus", "true");
    this.panel.setAttribute("level", "floating");

    this.frame = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "iframe"
    );
    this.frame.id = "act-command-palette-frame";
    this.frame.setAttribute("src", "chrome://act/content/command-palette/command-palette.html");
    this.panel.append(this.frame);

    document.getElementById("mainPopupSet").append(this.panel);
  },

  get isOpen() {
    return this.panel?.state == "open" || this.panel?.state == "showing";
  },

  open() {
    if (!this.panel) {
      this._build();
    }
    if (!this.isOpen) {
      // Center-ish near top
      this.panel.openPopupAtScreen(
        (screen.availWidth - 640) / 2,
        Math.max(80, screen.availHeight * 0.15),
        false
      );
    }
    setTimeout(() => {
      try {
        this.frame?.contentWindow?.focus();
        this.frame?.contentWindow?.document?.getElementById("palette-input")?.focus();
      } catch {}
    }, 50);
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
};
