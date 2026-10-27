/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Workspaces: separate sets of tabs in the same window, Zen style. Tabs in
// other workspaces are hidden with gBrowser.hideTab(), so everything that
// knows about hidden tabs (session restore, extensions, the tab list menu)
// keeps working. Pinned tabs are shared by all workspaces.

"use strict";

var ActWorkspaces = {
  KEY: "actWorkspace",
  DEFAULT_ICONS: ["💼", "🎨", "📚", "🎮", "🧪", "🌍", "🎵", "🛒", "🏡"],

  active: null,
  strip: null,
  _lastSelected: new Map(),
  _menu: null,
  _menuTarget: null,
  _listeners: [],

  get enabled() {
    return ActBrowser.prefs.workspacesEnabled;
  },

  get list() {
    let list;
    try {
      list = JSON.parse(ActBrowser.prefs.workspacesList);
    } catch {}
    if (!Array.isArray(list)) {
      list = [];
    }
    list = list.filter(w => w && typeof w.id == "string");
    if (!list.length) {
      list = [{ id: "home", name: "Home", icon: "🏠" }];
    }
    return list;
  },

  _save(list) {
    ActBrowser.setPref(ActBrowser.PREF.workspacesList, JSON.stringify(list));
  },

  init() {
    this._buildStrip();
    this._buildMenus();

    let on = (target, type, fn) => {
      target.addEventListener(type, fn);
      this._listeners.push([target, type, fn]);
    };
    let container = gBrowser.tabContainer;
    on(container, "TabOpen", e => this._onTabOpen(e.target));
    on(container, "TabSelect", e => this._onTabSelect(e.target));
    on(container, "SSTabRestoring", e => this._onTabRestoring(e.target));
    on(window, "TabGrouped", () => this._scheduleApply());
    on(window, "TabUngrouped", () => this._scheduleApply());
    on(window, "SSWindowRestored", () => this._restoreActive());

    this._restoreActive();
  },

  uninit() {
    for (let [target, type, fn] of this._listeners) {
      target.removeEventListener(type, fn);
    }
    this._listeners = [];
  },

  // Pref changes (list edited, feature toggled) end up here.
  update() {
    let ids = this.list.map(w => w.id);
    if (!ids.includes(this.active)) {
      this.active = ids[0];
    }
    this._renderStrip();
    this._apply();
  },

  _restoreActive() {
    let saved = SessionStore.getCustomWindowValue(window, this.KEY);
    this.active = saved || this.list[0].id;
    for (let tab of gBrowser.tabs) {
      if (!tab.hasAttribute("act-workspace")) {
        let id = SessionStore.getCustomTabValue(tab, this.KEY);
        if (id) {
          tab.setAttribute("act-workspace", id);
        }
      }
    }
    // If the selected tab belongs somewhere else, follow it.
    let selected = gBrowser.selectedTab;
    if (!selected.pinned) {
      this.active = this.workspaceOf(selected);
    }
    this.update();
  },

  workspaceOf(tab) {
    let id = tab.getAttribute("act-workspace");
    let list = this.list;
    return list.some(w => w.id == id) ? id : list[0].id;
  },

  _setTabWorkspace(tab, id) {
    tab.setAttribute("act-workspace", id);
    SessionStore.setCustomTabValue(tab, this.KEY, id);
  },

  _tabsIn(id) {
    return gBrowser.tabs.filter(
      t => !t.pinned && !t.closing && this.workspaceOf(t) == id
    );
  },

  _onTabOpen(tab) {
    // Restored tabs get their real workspace a moment later, in
    // SSTabRestoring. Everything else lands in the current workspace.
    if (!tab.hasAttribute("act-workspace")) {
      this._setTabWorkspace(tab, this.active);
    }
  },

  _onTabRestoring(tab) {
    let id = SessionStore.getCustomTabValue(tab, this.KEY);
    if (id) {
      tab.setAttribute("act-workspace", id);
    }
    this._scheduleApply();
  },

  _onTabSelect(tab) {
    if (!this.enabled || tab.pinned) {
      return;
    }
    let id = this.workspaceOf(tab);
    this._lastSelected.set(id, tab);
    // Selecting a tab from another workspace (switch-to-tab in the urlbar,
    // the all tabs menu...) moves you to that workspace.
    if (id != this.active) {
      this._setActive(id);
      this._apply();
    }
  },

  _setActive(id) {
    this.active = id;
    SessionStore.setCustomWindowValue(window, this.KEY, id);
    this._renderStrip();
  },

  switchTo(id) {
    if (!this.enabled || id == this.active) {
      return;
    }
    let tabs = this._tabsIn(id);
    let target = this._lastSelected.get(id);
    if (!target || !tabs.includes(target)) {
      target = tabs.at(-1);
    }

    this._setActive(id);
    if (target) {
      gBrowser.selectedTab = target;
    } else {
      // Empty workspace, give it a fresh tab.
      gBrowser.selectedTab = gBrowser.addTrustedTab(BROWSER_NEW_TAB_URL);
    }
    this._apply();
  },

  switchToIndex(index) {
    let ws = this.list[index];
    if (ws) {
      this.switchTo(ws.id);
    }
  },

  cycle(step) {
    let list = this.list;
    let i = list.findIndex(w => w.id == this.active);
    this.switchTo(list[(i + step + list.length) % list.length].id);
  },

  _scheduleApply() {
    if (this._applyQueued) {
      return;
    }
    this._applyQueued = true;
    Services.tm.dispatchToMainThread(() => {
      this._applyQueued = false;
      this._apply();
    });
  },

  // Show the tabs of the active workspace and hide the rest. We only ever
  // unhide tabs we hid ourselves, extensions may hide tabs too.
  _apply() {
    let enabled = this.enabled;
    document.documentElement.toggleAttribute("act-workspaces", enabled);
    for (let tab of gBrowser.tabs) {
      if (tab.pinned || tab.closing) {
        continue;
      }
      let visible = !enabled || this.workspaceOf(tab) == this.active;
      if (visible && tab.hasAttribute("act-ws-hidden")) {
        tab.removeAttribute("act-ws-hidden");
        gBrowser.showTab(tab);
      } else if (!visible && !tab.hidden && !tab.selected) {
        gBrowser.hideTab(tab);
        if (tab.hidden) {
          tab.setAttribute("act-ws-hidden", "true");
        }
      }
    }
    // A group shows in the workspace its tabs are in. Its label isn't a
    // tab, so hiding the tabs alone would leave it behind.
    for (let group of gBrowser.tabGroups) {
      let here = !enabled || group.tabs.some(t => this.workspaceOf(t) == this.active);
      group.toggleAttribute("act-ws-hidden", !here);
    }
  },

  // --- Managing workspaces -------------------------------------------------

  _prompt(title, text, value) {
    let result = { value };
    let ok = Services.prompt.prompt(window, title, text, result, null, {});
    return ok ? result.value.trim() : null;
  },

  create() {
    let list = this.list;
    let name = this._prompt("New workspace", "Name:", "");
    if (!name) {
      return;
    }
    let used = new Set(list.map(w => w.icon));
    let icon = this.DEFAULT_ICONS.find(i => !used.has(i)) || "⭐";
    let id = `ws-${Date.now().toString(36)}`;
    list.push({ id, name, icon });
    this._save(list);
    this.switchTo(id);
  },

  rename(id) {
    let list = this.list;
    let ws = list.find(w => w.id == id);
    let name = ws && this._prompt("Rename workspace", "Name:", ws.name);
    if (name) {
      ws.name = name;
      this._save(list);
    }
  },

  changeIcon(id) {
    let list = this.list;
    let ws = list.find(w => w.id == id);
    let icon = ws && this._prompt("Workspace icon", "Emoji or a letter:", ws.icon);
    if (icon) {
      // One grapheme is enough, keep it from blowing up the layout.
      ws.icon = [...new Intl.Segmenter().segment(icon)][0].segment;
      this._save(list);
    }
  },

  remove(id) {
    let list = this.list;
    if (list.length < 2) {
      return;
    }
    let ws = list.find(w => w.id == id);
    let tabs = this._tabsIn(id);
    if (tabs.length) {
      let ok = Services.prompt.confirm(
        window,
        "Delete workspace",
        `Delete "${ws.name}"? Its ${tabs.length} tab(s) will move to "${
          list.find(w => w.id != id).name
        }".`
      );
      if (!ok) {
        return;
      }
    }
    list = list.filter(w => w.id != id);
    let fallback = list[0].id;
    for (let tab of tabs) {
      this._setTabWorkspace(tab, fallback);
    }
    if (this.active == id) {
      this._setActive(fallback);
    }
    this._save(list);
  },

  moveTab(tab, id) {
    if (tab.pinned) {
      return;
    }
    // Groups live in one workspace. Moving a whole group keeps it together,
    // a tab moved on its own leaves its group.
    let group = tab.group;
    if (group && !group.tabs.every(t => t.multiselected || t == tab)) {
      gBrowser.ungroupTab(tab);
    }
    this._setTabWorkspace(tab, id);
    if (tab.selected && id != this.active) {
      this._setActive(id);
    }
    this._apply();
  },

  // --- UI --------------------------------------------------------------------

  _buildStrip() {
    this.strip = document.createXULElement("hbox");
    this.strip.id = "act-workspaces";
    this.strip.setAttribute("align", "center");
    this.strip.setAttribute("context", "act-workspace-menu");
    this.strip.addEventListener("click", e => {
      let button = e.target.closest(".act-workspace");
      if (e.button != 0 || !button) {
        return;
      }
      if (button.id == "act-workspace-add") {
        this.create();
      } else {
        this.switchTo(button.dataset.id);
      }
    });

    // Next to the workspace name at the top of the sidebar (act-layout.js).
    document.getElementById("act-sidebar-titlerow").append(this.strip);
  },

  _renderStrip() {
    if (!this.strip) {
      return;
    }
    let buttons = this.list.map((ws, i) => {
      let button = document.createXULElement("toolbarbutton");
      button.className = "act-workspace";
      button.dataset.id = ws.id;
      button.setAttribute("label", ws.icon || ws.name.slice(0, 1));
      button.setAttribute(
        "tooltiptext",
        i < 9 ? `${ws.name} (Ctrl+Alt+${i + 1})` : ws.name
      );
      button.toggleAttribute("selected", ws.id == this.active);
      let count = this._tabsIn(ws.id).length;
      if (count > 0) {
        button.setAttribute("badge", String(count));
      }
      return button;
    });

    let add = document.createXULElement("toolbarbutton");
    add.id = "act-workspace-add";
    add.className = "act-workspace";
    add.setAttribute("label", "+");
    add.setAttribute("tooltiptext", "New workspace");

    this.strip.replaceChildren(...buttons, add);

    // The name shows as a heading at the top of the sidebar.
    let title = document.getElementById("act-workspace-title");
    let active = this.list.find(w => w.id == this.active);
    title?.setAttribute("value", active?.name || "");
  },

  _buildMenus() {
    // Right click on a workspace button.
    let menu = document.createXULElement("menupopup");
    menu.id = "act-workspace-menu";
    let item = (label, fn) => {
      let mi = document.createXULElement("menuitem");
      mi.setAttribute("label", label);
      mi.addEventListener("command", () => fn(this._menuTarget));
      menu.append(mi);
      return mi;
    };
    item("Rename…", id => this.rename(id));
    item("Change icon…", id => this.changeIcon(id));
    menu.append(document.createXULElement("menuseparator"));
    let removeItem = item("Delete workspace", id => this.remove(id));
    menu.append(document.createXULElement("menuseparator"));
    item("New workspace…", () => this.create());

    menu.addEventListener("popupshowing", e => {
      let button = e.target.triggerNode?.closest?.(".act-workspace[data-id]");
      this._menuTarget = button?.dataset.id || this.active;
      removeItem.disabled = this.list.length < 2;
    });
    document.getElementById("mainPopupSet").append(menu);

    // "Move to workspace" in the tab context menu.
    let tabMenu = document.getElementById("tabContextMenu");
    let moveMenu = document.createXULElement("menu");
    moveMenu.id = "act-context-move-to-workspace";
    moveMenu.setAttribute("label", "Move to Workspace");
    let movePopup = document.createXULElement("menupopup");
    moveMenu.append(movePopup);
    tabMenu.append(moveMenu);

    movePopup.addEventListener("popupshowing", () => {
      let tab = TabContextMenu.contextTab;
      let current = this.workspaceOf(tab);
      movePopup.replaceChildren(
        ...this.list.map(ws => {
          let mi = document.createXULElement("menuitem");
          mi.setAttribute("label", `${ws.icon}  ${ws.name}`);
          mi.disabled = ws.id == current;
          mi.addEventListener("command", () => {
            let tabs = tab.multiselected ? gBrowser.selectedTabs : [tab];
            for (let t of tabs) {
              this.moveTab(t, ws.id);
            }
          });
          return mi;
        })
      );
    });
    tabMenu.addEventListener("popupshowing", e => {
      if (e.target == tabMenu) {
        let tab = TabContextMenu.contextTab;
        moveMenu.hidden =
          !this.enabled || this.list.length < 2 || !tab || tab.pinned;
      }
    });
  },
};
