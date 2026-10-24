/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The bottom of the tab sidebar is a mirrored L: a row of tools along the
// bottom (settings, bookmarks, history, downloads) and extension buttons
// stacked up the right hand side, instead of the puzzle piece menu.
//
// Both are real CustomizableUI toolbar areas, so the buttons are the actual
// widgets: popups, badges and context menus all work like anywhere else in
// Firefox.

import { ActPrefs, PREF, watchPrefs } from "resource://act/ActPrefs.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI:
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
});

export const AREA = "act-extensions-bar";
// The bottom row. Only downloads lives here as a widget, the other tools
// are plain buttons (act-layout.js).
export const TOOLS_AREA = "act-sidebar-tools";

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
    if (isExtensionWidget(id)) {
      lazy.CustomizableUI.addWidgetToArea(id, lazy.CustomizableUI.AREA_ADDONS);
    }
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
  TOOLS_AREA,

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
    lazy.CustomizableUI.registerArea(TOOLS_AREA, {
      type: lazy.CustomizableUI.TYPE_TOOLBAR,
      defaultPlacements: ["downloads-button"],
      defaultCollapsed: false,
    });
    lazy.CustomizableUI.addListener(listener);
    watchPrefs([PREF.extensionsInSidebar], () => this.sync());
  },

  // Called once a window has added its toolbar node.
  sync() {
    // Downloads belongs in the bottom row. Profiles from 0.4.0 can have it
    // stuck in the extensions column, where its panel won't open.
    let downloads = lazy.CustomizableUI.getPlacementOfWidget("downloads-button");
    if (downloads?.area != TOOLS_AREA) {
      lazy.CustomizableUI.addWidgetToArea("downloads-button", TOOLS_AREA);
    }
    if (ActPrefs.extensionsInSidebar) {
      moveAllIn();
    } else {
      moveAllOut();
    }
  },

  /**
   * Creates one of the two toolbars for a browser window.
   */
  createToolbar(doc, area = AREA) {
    let toolbar = doc.createXULElement("toolbar");
    toolbar.id = area;
    toolbar.className = "browser-toolbar";
    toolbar.setAttribute("customizable", "true");
    toolbar.setAttribute("mode", "icons");
    toolbar.setAttribute("context", "toolbar-context-menu");
    let name = area == AREA ? "Extensions" : "Sidebar tools";
    toolbar.setAttribute("toolbarname", name);
    toolbar.setAttribute("aria-label", name);
    return toolbar;
  },
};
