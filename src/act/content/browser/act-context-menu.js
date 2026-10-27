/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Act entries in the page context menu.

"use strict";

var ActContextMenu = {
  item: null,
  askItem: null,
  saveItem: null,
  clipItem: null,
  pipItem: null,

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

    this.saveItem = document.createXULElement("menuitem");
    this.saveItem.id = "act-context-save-reading";
    this.saveItem.setAttribute("label", "Save to Reading List");
    this.saveItem.addEventListener("command", () => {
      this._saveToReadingList();
    });

    this.clipItem = document.createXULElement("menuitem");
    this.clipItem.id = "act-context-clip";
    this.clipItem.setAttribute("label", "Clip selection to notes");
    this.clipItem.addEventListener("command", () => {
      this._clipSelection();
    });

    this.pipItem = document.createXULElement("menuitem");
    this.pipItem.id = "act-context-pip";
    this.pipItem.setAttribute("label", "Picture-in-Picture");
    this.pipItem.addEventListener("command", () => {
      ActBrowser.togglePiP();
    });

    let anchor = document.getElementById("context-searchselect");
    if (anchor) {
      anchor.after(this.item);
      this.item.after(this.askItem);
      this.askItem.after(this.saveItem);
      this.saveItem.after(this.clipItem);
      this.clipItem.after(this.pipItem);
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

  _saveToReadingList() {
    try {
      let { ActReadingList } = ChromeUtils.importESModule("resource://act/ActReadingList.sys.mjs");
      let url = gBrowser?.selectedBrowser?.currentURI?.spec || "";
      let title = gBrowser?.selectedBrowser?.contentTitle || url;
      ActReadingList.add({ url, title });
    } catch (e) {
      console.error(e);
    }
  },

  _clipSelection() {
    try {
      let { ActClips } = ChromeUtils.importESModule("resource://act/ActClips.sys.mjs");
      let text = this._selection();
      let url = gBrowser?.selectedBrowser?.currentURI?.spec || "";
      let title = gBrowser?.selectedBrowser?.contentTitle || "";
      ActClips.add({ text, url, title, id: Date.now().toString() });
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
    if (this.saveItem) {
      this.saveItem.hidden = false;
    }
    if (this.clipItem) {
      this.clipItem.hidden = !gContextMenu?.isTextSelected;
    }
    if (this.pipItem) {
      let hasVideo = false;
      try { hasVideo = !!gBrowser?.selectedBrowser?.contentDocument?.querySelector("video"); } catch {}
      this.pipItem.hidden = !hasVideo;
    }
  },
};
