/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Tab groups. Firefox does the real work (gBrowser.addTabGroup, dragging
// tabs onto each other, the "Add Tab to New Group" menu); this adds ways in
// that fit the sidebar: Ctrl+Alt+G, and "New Tab Group" when you right click
// the empty space under the tabs. act-browser.css makes the groups look like
// folders, act-workspaces.js keeps them in their workspace.

"use strict";

var ActTabGroups = {
  item: null,

  get enabled() {
    return Services.prefs.getBoolPref("browser.tabs.groups.enabled", false);
  },

  init() {
    let menu = document.getElementById("toolbar-context-menu");
    this.item = document.createXULElement("menuitem");
    this.item.id = "act-context-new-tab-group";
    this.item.setAttribute("label", "New Tab Group");
    this.item.setAttribute("acceltext", "Ctrl+Alt+G");
    this.item.addEventListener("command", () => this.create({ freshTab: true }));
    let separator = document.createXULElement("menuseparator");
    separator.id = "act-context-new-tab-group-separator";
    menu.prepend(this.item, separator);

    menu.addEventListener("popupshowing", e => {
      if (e.target != menu) {
        return;
      }
      let node = menu.triggerNode;
      let show =
        this.enabled &&
        !!node?.closest?.("#tabbrowser-tabs") &&
        !node.closest("tab, tab-group");
      this.item.hidden = separator.hidden = !show;
    });
  },

  /**
   * Starts a group and opens Firefox's panel to name it. The group holds the
   * selected tab(s), or a new tab when asked for one or when the selected
   * tab is pinned (pinned tabs can't be grouped).
   */
  create({ freshTab = false } = {}) {
    if (!this.enabled) {
      return;
    }
    let tabs = gBrowser.selectedTabs.filter(t => !t.pinned);
    if (freshTab || !tabs.length) {
      tabs = [gBrowser.addTrustedTab(BROWSER_NEW_TAB_URL)];
    }
    let first = tabs[0];
    gBrowser.addTabGroup(tabs, { insertBefore: first.group || first });
    gBrowser.selectedTab = first;
  },
};
