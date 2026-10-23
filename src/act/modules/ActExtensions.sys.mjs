/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Extension buttons live in a row at the bottom of the tab sidebar, Zen
// style, instead of behind the puzzle piece menu.
//
// The row is a real CustomizableUI toolbar area, so the buttons are the
// actual extension widgets: popups, badges and context menus all work like
// they do anywhere else in Firefox.

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

export const AREA = "act-extensions-bar";

let registered = false;

function isExtensionWidget(id) {
  return lazy.CustomizableUI.isWebExtensionWidget(id);
}

// Where extension buttons are moved from (and back to).
function sourceAreas() {
  let { AREA_ADDONS, AREA_NAVBAR } = lazy.CustomizableUI;
  return [AREA_ADDONS, AREA_NAVBAR];
}

function moveIn(widgetId) {
  let placement = lazy.CustomizableUI.getPlacementOfWidget(widgetId);
  if (placement && sourceAreas().includes(placement.area)) {
    lazy.CustomizableUI.addWidgetToArea(widgetId, AREA);
  }
}

function moveAllIn() {
  for (let area of sourceAreas()) {
    for (let id of lazy.CustomizableUI.getWidgetIdsInArea(area)) {
      if (isExtensionWidget(id)) {
        moveIn(id);
      }
    }
  }
}

function moveAllOut() {
  for (let id of lazy.CustomizableUI.getWidgetIdsInArea(AREA)) {
    lazy.CustomizableUI.addWidgetToArea(id, lazy.CustomizableUI.AREA_ADDONS);
  }
}

const listener = {
  onWidgetAfterCreation(widgetId) {
    if (ActPrefs.extensionsInSidebar && isExtensionWidget(widgetId)) {
      moveIn(widgetId);
    }
  },
};

export const ActExtensions = {
  AREA,

  register() {
    if (registered) {
      return;
    }
    registered = true;
    lazy.CustomizableUI.registerArea(AREA, {
      type: lazy.CustomizableUI.TYPE_TOOLBAR,
      defaultPlacements: [],
      defaultCollapsed: false,
    });
    lazy.CustomizableUI.addListener(listener);
    watchPrefs([PREF.extensionsInSidebar], () => this.sync());
  },

  // Called once a window has added its toolbar node.
  sync() {
    if (ActPrefs.extensionsInSidebar) {
      moveAllIn();
    } else {
      moveAllOut();
    }
  },

  /**
   * Creates the toolbar for one browser window.
   */
  createToolbar(doc) {
    let toolbar = doc.createXULElement("toolbar");
    toolbar.id = AREA;
    toolbar.className = "browser-toolbar";
    toolbar.setAttribute("customizable", "true");
    toolbar.setAttribute("mode", "icons");
    toolbar.setAttribute("context", "toolbar-context-menu");
    toolbar.setAttribute("toolbarname", "Sidebar extensions");
    toolbar.setAttribute("aria-label", "Extensions");
    return toolbar;
  },
};
