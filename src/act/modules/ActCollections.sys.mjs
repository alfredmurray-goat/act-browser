/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "act.collections.list";

export const ActCollections = {
  list() {
    try {
      let raw = Services.prefs.getStringPref(PREF, "[]");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  save(items) {
    try {
      Services.prefs.setStringPref(PREF, JSON.stringify(items));
    } catch {}
  },

  addCollection(name) {
    let list = this.list();
    if (!name) return;
    if (list.find(c => c.name == name)) return;
    list.push({ id: Date.now().toString(), name, items: [] });
    this.save(list);
    return list;
  },

  addItem(collectionId, item) {
    let list = this.list();
    let col = list.find(c => c.id == collectionId);
    if (!col) return;
    if (!col.items) col.items = [];
    if (col.items.find(i => i.url == item.url && i.title == item.title)) return;
    col.items.push({ ...item, savedAt: Date.now() });
    this.save(list);
    return list;
  },

  removeItem(collectionId, itemId) {
    let list = this.list();
    let col = list.find(c => c.id == collectionId);
    if (!col || !col.items) return;
    col.items = col.items.filter(i => i.id != itemId && i.savedAt != itemId);
    this.save(list);
    return list;
  },
};
