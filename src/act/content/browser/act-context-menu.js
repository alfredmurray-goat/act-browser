/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Act entries in the page context menu.

"use strict";

var ActContextMenu = {
  item: null,

  init() {
    let menu = document.getElementById("contentAreaContextMenu");
    this.item = document.createXULElement("menuitem");
    this.item.id = "act-context-lookup";
    this.item.addEventListener("command", () => {
      ActPopup.explore(this._selection());
    });

    let anchor = document.getElementById("context-searchselect");
    if (anchor) {
      anchor.after(this.item);
    } else {
      menu.append(this.item);
    }

    menu.addEventListener("popupshowing", e => {
      if (e.target == menu) {
        this._onShowing();
      }
    });
  },

  _selection() {
    let text = gContextMenu?.selectionInfo?.fullText || "";
    return text.trim().replace(/\s+/g, " ").slice(0, 200);
  },

  _onShowing() {
    let show = !!gContextMenu?.isTextSelected && ActBrowser.actuentEnabled;
    this.item.hidden = !show;
    if (show) {
      let text = this._selection();
      let short = text.length > 24 ? text.slice(0, 24) + "…" : text;
      this.item.setAttribute("label", `Look up “${short}” on Actuent`);
    }
  },
};
