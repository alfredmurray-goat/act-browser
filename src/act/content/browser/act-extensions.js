/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Puts this window's sidebar toolbars in place: downloads in the bottom row,
// extension icons in a column up the right hand side.
// The moving of buttons is done once for all windows in ActExtensions.

"use strict";

var ActExtensionsBar = {
  toolbar: null,
  tools: null,

  init() {
    let { ActExtensions } = ChromeUtils.importESModule(
      "resource://act/ActExtensions.sys.mjs"
    );

    // The bottom row: after the settings/bookmarks/history buttons that
    // act-layout.js put there, the downloads button.
    this.tools = ActExtensions.createToolbar(document, ActExtensions.TOOLS_AREA);
    document.getElementById("act-sidebar-footer").append(this.tools);

    // Extension icons in a column up the right hand side, sitting on the
    // right end of the bottom row.
    this.toolbar = ActExtensions.createToolbar(document);
    document.getElementById("act-sidebar-dock").append(this.toolbar);

    CustomizableUI.registerToolbarNode(this.tools);
    CustomizableUI.registerToolbarNode(this.toolbar);
    ActExtensions.sync();

    // Extension popups (and the downloads panel) line up with their
    // button's right edge, which is right for a toolbar at the top of the
    // window. From the bottom of the sidebar they'd open half off screen,
    // so open them beside the button instead.
    window.addEventListener("popupshowing", this, true);
  },

  handleEvent(event) {
    let popup = event.target;
    let anchor = popup.anchorNode;
    if (
      event.type == "popupshowing" &&
      anchor &&
      popup.localName == "panel" &&
      anchor.closest?.("#act-extensions-bar, #act-sidebar-footer")
    ) {
      popup.moveToAnchor(anchor, "end_after");
    }
  },
};
