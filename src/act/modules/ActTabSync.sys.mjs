/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Open tabs and tab groups carried over between computers, through
// Firefox Sync (a Mozilla account).
//
// Sync already uploads every device's open tabs with their window,
// position, pinned state and tab group, and the groups' names and colours.
// Firefox only lists another device's tabs to open one at a time, though.
// This rebuilds a device's tabs, groups included, and offers to do that
// once, after signing in.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  getTabsStore: "resource://services-sync/TabsStore.sys.mjs",
  UIState: "resource://services-sync/UIState.sys.mjs",
  Weave: "resource://services-sync/main.sys.mjs",
});

const OFFERED_PREF = "act.tabSync.offered";
const NOTIFICATION_ID = "act-tab-sync";

function isWebUrl(url) {
  return /^https?:\/\//i.test(url || "");
}

function plural(count, word) {
  return `${count} ${word}${count == 1 ? "" : "s"}`;
}

export const ActTabSync = {
  get signedIn() {
    return lazy.UIState.get().status == lazy.UIState.STATUS_SIGNED_IN;
  },

  get email() {
    return lazy.UIState.get().email || "";
  },

  openAccountSettings(win) {
    win.openPreferences("paneSync");
  },

  /**
   * The other signed in devices with open tabs, most recently used first:
   * [{ id, name, lastModified, tabs: [{ url, title, pinned, groupId }],
   *    groups: Map(id => { name, color, collapsed }) }]
   */
  async devices() {
    if (!this.signedIn) {
      return [];
    }
    let store = await lazy.getTabsStore();
    let records = await store.getAll();
    // Devices that are still connected to the account (the clients engine
    // drops ones that were disconnected), never this one.
    let remote = new Set(
      (lazy.Weave.Service.clientsEngine?.remoteClients || []).map(c => c.fxaDeviceId)
    );
    let devices = [];
    for (let record of records) {
      if (remote.size && !remote.has(record.clientId)) {
        continue;
      }
      let windows = new Map((record.windows || []).map(w => [w.id, w.index]));
      let tabs = record.remoteTabs
        .filter(tab => isWebUrl(tab.urlHistory?.[0]))
        .sort(
          (a, b) =>
            (windows.get(a.windowId) ?? 0) - (windows.get(b.windowId) ?? 0) ||
            (a.index ?? 0) - (b.index ?? 0)
        )
        .map(tab => ({
          url: tab.urlHistory[0],
          title: tab.title,
          pinned: !!tab.pinned,
          groupId: tab.tabGroupId || "",
        }));
      if (!tabs.length) {
        continue;
      }
      let groups = new Map();
      for (let group of record.tabGroups || []) {
        groups.set(group.id, {
          name: group.name || "",
          color: group.color || null,
          collapsed: !!group.collapsed,
        });
      }
      devices.push({
        id: record.clientId,
        name: record.clientName || "Another device",
        lastModified: record.lastModified,
        tabs,
        groups,
      });
    }
    return devices.sort((a, b) => b.lastModified - a.lastModified);
  },

  describe(device) {
    let groups = new Set(device.tabs.map(t => t.groupId).filter(id => device.groups.has(id)));
    let text = plural(device.tabs.length, "tab");
    if (groups.size) {
      text += ` and ${plural(groups.size, "tab group")}`;
    }
    return text;
  },

  /**
   * Opens a device's tabs at the end of the window, pinned tabs pinned and
   * groups rebuilt. Tabs load when they're first selected.
   */
  openDevice(win, device) {
    let gBrowser = win.gBrowser;
    let principal = Services.scriptSecurityManager.getSystemPrincipal();
    let grouped = new Map();
    let opened = [];
    for (let remote of device.tabs) {
      let tab = gBrowser.addTab(remote.url, {
        triggeringPrincipal: principal,
        createLazyBrowser: true,
        lazyTabTitle: remote.title || remote.url,
        skipAnimation: true,
      });
      opened.push(tab);
      if (remote.pinned) {
        gBrowser.pinTab(tab);
      } else if (device.groups.has(remote.groupId)) {
        if (!grouped.has(remote.groupId)) {
          grouped.set(remote.groupId, []);
        }
        grouped.get(remote.groupId).push(tab);
      }
    }
    for (let [id, tabs] of grouped) {
      let info = device.groups.get(id);
      try {
        let group = gBrowser.addTabGroup(tabs, { label: info.name, color: info.color });
        if (group && info.collapsed) {
          group.collapsed = true;
        }
      } catch (e) {
        console.error("Act: tab group from another device", e);
      }
    }
    let show = opened.find(tab => !tab.pinned) || opened[0];
    if (show) {
      gBrowser.selectedTab = show;
    }
  },

  // --- The one-time offer -------------------------------------------------

  init() {
    if (Services.prefs.getBoolPref(OFFERED_PREF, false)) {
      return;
    }
    Services.obs.addObserver(this, "weave:engine:sync:finish");
  },

  observe(subject, topic, data) {
    if (topic == "weave:engine:sync:finish" && data == "tabs") {
      this._maybeOffer().catch(e => console.error("Act: tab sync offer", e));
    }
  },

  async _maybeOffer() {
    if (Services.prefs.getBoolPref(OFFERED_PREF, false)) {
      return;
    }
    let win = lazy.BrowserWindowTracker.getTopWindow({ private: false });
    let [device] = await this.devices();
    if (!device || !win || win.closed) {
      return;
    }
    // Once per profile, the first time another device's tabs arrive (so
    // right after signing in). Later they're in the Act menu's settings.
    Services.prefs.setBoolPref(OFFERED_PREF, true);
    Services.obs.removeObserver(this, "weave:engine:sync:finish");
    win.gNotificationBox.appendNotification(
      NOTIFICATION_ID,
      {
        label: `Open your ${this.describe(device)} from ${device.name}?`,
        priority: win.gNotificationBox.PRIORITY_INFO_MEDIUM,
      },
      [
        {
          label: "Open them",
          accessKey: "O",
          callback: () => this.openDevice(win, device),
        },
        {
          label: "Not now",
          accessKey: "N",
          callback() {},
        },
      ]
    );
  },
};
