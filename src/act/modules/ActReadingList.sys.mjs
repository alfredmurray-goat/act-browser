/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "act.readingList";

export const ActReadingList = {
  list() {
    try {
      return JSON.parse(Services.prefs.getStringPref(PREF, "[]"));
    } catch {
      return [];
    }
  },

  save(items) {
    Services.prefs.setStringPref(PREF, JSON.stringify(items));
  },

  add(item) {
    let items = this.list();
    if (items.find(i => i.url == item.url)) return items;
    items.unshift({ ...item, read: false, savedAt: Date.now() });
    // Keep last 200
    if (items.length > 200) items = items.slice(0, 200);
    this.save(items);
    return items;
  },

  markRead(url, read = true) {
    let items = this.list();
    let item = items.find(i => i.url == url);
    if (item) item.read = read;
    this.save(items);
    return items;
  },

  remove(url) {
    let items = this.list().filter(i => i.url != url);
    this.save(items);
    return items;
  },

  unreadCount() {
    return this.list().filter(i => !i.read).length;
  },
};
