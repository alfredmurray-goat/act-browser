/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Downloads sidebar panel: replaces Firefox's default downloads popup with
// a richer panel showing progress, history and quick actions.

"use strict";

var ActDownloads = {
  panel: null,
  frame: null,

  init() {},

  _build() {
    if (this.panel) return;
    this.panel = document.createXULElement("panel");
    this.panel.id = "act-downloads-panel";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("noautofocus", "true");

    this.frame = document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
    this.frame.id = "act-downloads-frame";
    this.frame.setAttribute("src", "chrome://act/content/downloads/downloads.html");
    this.panel.append(this.frame);

    document.getElementById("mainPopupSet").append(this.panel);
  },

  get isOpen() {
    return this.panel?.state == "open" || this.panel?.state == "showing";
  },

  open() {
    if (!this.panel) this._build();
    if (!this.isOpen) {
      let anchor = document.getElementById("downloads-button");
      if (anchor && anchor.checkVisibility()) {
        this.panel.openPopup(anchor, "bottomleft topleft");
      } else {
        this.panel.openPopupAtScreen((screen.availWidth - 360) / 2, 100, false);
      }
    }
  },

  close() {
    this.panel?.hidePopup();
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },
};
