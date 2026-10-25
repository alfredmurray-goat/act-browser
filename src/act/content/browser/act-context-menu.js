/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Act entries in the page context menu.

"use strict";

var ActContextMenu = {
  item: null,
  askItem: null,

  init() {
    let menu = document.getElementById("contentAreaContextMenu");
    this.item = document.createXULElement("menuitem");
    this.item.id = "act-context-lookup";
    this.item.addEventListener("command", () => {
      ActPopup.explore(this._selection());
    });

    this.askItem = document.createXULElement("menuitem");
    this.askItem.id = "act-context-ask";
    this.askItem.setAttribute("label", "Ask Actuent about this page");
    this.askItem.addEventListener("command", () => {
      this._askActuent();
    });

    let anchor = document.getElementById("context-searchselect");
    if (anchor) {
      anchor.after(this.item);
      this.item.after(this.askItem);
    } else {
      menu.append(this.item);
      menu.append(this.askItem);
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

  _askActuent() {
    if (!ActBrowser.actuentEnabled) {
      ActPopup.open("settings");
      return;
    }
    try {
      let url = gBrowser?.selectedBrowser?.currentURI?.spec || "";
      let title = gBrowser?.selectedBrowser?.contentTitle || "";
      let query = `Summarize and answer questions about: ${title} ${url}`.trim();
      ActPopup.explore(query);
    } catch (e) {
      console.error(e);
    }
  },

  _onShowing() {
    let hasText = !!gContextMenu?.isTextSelected;
    let showLookup = hasText && ActBrowser.actuentEnabled;
    this.item.hidden = !showLookup;
    if (showLookup) {
      let text = this._selection();
      let short = text.length > 24 ? text.slice(0, 24) + "…" : text;
      this.item.setAttribute("label", `Look up “${short}” on Actuent`);
    }
    if (this.askItem) {
      this.askItem.hidden = !ActBrowser.actuentEnabled;
    }
  },
};
