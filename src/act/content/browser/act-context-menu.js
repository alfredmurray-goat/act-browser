/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Act entries in the page context menu.

"use strict";

var ActContextMenu = {
  items: {},

  init() {
    let menu = document.getElementById("contentAreaContextMenu");
    let anchor = document.getElementById("context-searchselect");

    let separator = document.createXULElement("menuseparator");
    separator.id = "act-context-separator";

    let make = (id, onCommand) => {
      let item = document.createXULElement("menuitem");
      item.id = id;
      item.addEventListener("command", onCommand);
      return item;
    };

    this.items = {
      separator,
      ask: make("act-context-ask", () => {
        ActPanel.ask(`Explain this:\n\n> ${this._selection()}`);
      }),
      lookup: make("act-context-lookup", () => {
        ActPanel.explore(this._selection());
      }),
      summarize: make("act-context-summarize", () => {
        ActPanel.ask("Summarize this page.");
      }),
    };
    this.items.summarize.setAttribute("label", "Summarize Page with Act");

    let { ask, lookup, summarize } = this.items;
    if (anchor) {
      anchor.after(separator, ask, lookup);
    } else {
      menu.append(separator, ask, lookup);
    }
    menu.append(summarize);

    menu.addEventListener("popupshowing", e => {
      if (e.target == menu) {
        this._onShowing();
      }
    });
  },

  _selection() {
    let text = gContextMenu?.selectionInfo?.fullText || "";
    return text.trim().slice(0, 2000);
  },

  _short(text) {
    text = text.replace(/\s+/g, " ");
    return text.length > 24 ? text.slice(0, 24) + "…" : text;
  },

  _onShowing() {
    let { separator, ask, lookup, summarize } = this.items;
    let hasSelection = !!gContextMenu?.isTextSelected;
    let ai = ActBrowser.aiEnabled;
    let actuent = ActBrowser.actuentEnabled;

    if (hasSelection) {
      let short = this._short(this._selection());
      ask.setAttribute("label", `Ask Act about “${short}”`);
      lookup.setAttribute("label", `Look up “${short}” on Actuent`);
    }
    ask.hidden = !hasSelection || !ai;
    lookup.hidden = !hasSelection || !actuent;
    separator.hidden = ask.hidden && lookup.hidden;

    // Only on plain web pages, when nothing in particular was clicked.
    let onPage =
      gContextMenu &&
      !gContextMenu.onLink &&
      !gContextMenu.onImage &&
      !gContextMenu.onTextInput &&
      !hasSelection &&
      /^https?:/.test(gBrowser.currentURI.spec);
    summarize.hidden = !ai || !onPage;
  },
};
