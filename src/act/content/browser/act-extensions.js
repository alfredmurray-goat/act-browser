/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Puts this window's extension toolbar at the bottom of the tab sidebar.
// The moving of buttons is done once for all windows in ActExtensions.

"use strict";

var ActExtensionsBar = {
  toolbar: null,

  init() {
    let { ActExtensions } = ChromeUtils.importESModule(
      "resource://act/ActExtensions.sys.mjs"
    );
    this.toolbar = ActExtensions.createToolbar(document);

    // Right side of the footer under the tab list (see act-layout.js).
    document.getElementById("act-sidebar-footer").append(this.toolbar);

    CustomizableUI.registerToolbarNode(this.toolbar);
    ActExtensions.sync();
  },
};
