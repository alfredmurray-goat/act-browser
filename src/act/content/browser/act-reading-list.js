/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var ActReadingListUI = {
  panel: null,
  frame: null,

  init() {},

  _build() {
    if (this.panel) return;
    this.panel = document.createXULElement("panel");
    this.panel.id = "act-reading-list-panel";
    this.panel.setAttribute("type", "arrow");
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("noautofocus", "true");

    this.frame = document.createElementNS("http://www.w3.org/1999/xhtml", "iframe");
    this.frame.id = "act-reading-list-frame";
    this.frame.setAttribute("src", "chrome://act/content/reading-list/reading-list.html");
    this.panel.append(this.frame);

    document.getElementById("mainPopupSet").append(this.panel);
  },

  get isOpen() {
    return this.panel?.state == "open" || this.panel?.state == "showing";
  },

  open() {
    if (!this.panel) this._build();
    if (!this.isOpen) {
      let anchor = document.getElementById("act-button");
      if (anchor && anchor.checkVisibility()) {
        this.panel.openPopup(anchor, "bottomleft topleft");
      } else {
        this.panel.openPopupAtScreen((screen.availWidth - 380) / 2, 100, false);
      }
    }
  },

  close() { this.panel?.hidePopup(); },
  toggle() { if (this.isOpen) this.close(); else this.open(); },
};
