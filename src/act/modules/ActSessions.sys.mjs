/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "act.sessions.list";

export const ActSessions = {
  list() {
    try { return JSON.parse(Services.prefs.getStringPref(PREF, "[]")); }
    catch { return []; }
  },

  save(sessions) {
    Services.prefs.setStringPref(PREF, JSON.stringify(sessions));
  },

  capture(name) {
    let tabs = [];
    for (let t of gBrowser.tabs) {
      if (t.closing) continue;
      tabs.push({
        url: t.linkedBrowser?.currentURI?.spec || "",
        title: t.label || "",
        pinned: !!t.pinned,
      });
    }
    let sessions = this.list();
    sessions.unshift({ id: Date.now().toString(), name: name || `Session ${sessions.length + 1}`, tabs, savedAt: Date.now() });
    if (sessions.length > 20) sessions = sessions.slice(0, 20);
    this.save(sessions);
    return sessions;
  },

  restore(id) {
    let session = this.list().find(s => s.id == id);
    if (!session) return;
    let principal = Services.scriptSecurityManager.getSystemPrincipal();
    for (let t of session.tabs) {
      if (!t.url || t.url == "about:blank") continue;
      let tab = gBrowser.addTab(t.url, { triggeringPrincipal: principal, createLazyBrowser: true, lazyTabTitle: t.title || t.url });
      if (t.pinned) gBrowser.pinTab(tab);
    }
  },

  remove(id) {
    let sessions = this.list().filter(s => s.id != id);
    this.save(sessions);
    return sessions;
  },
};
