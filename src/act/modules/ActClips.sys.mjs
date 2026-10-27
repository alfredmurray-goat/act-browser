/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF = "act.clips.list";

export const ActClips = {
  list() {
    try { return JSON.parse(Services.prefs.getStringPref(PREF, "[]")); }
    catch { return []; }
  },
  save(clips) { Services.prefs.setStringPref(PREF, JSON.stringify(clips)); },
  add(clip) {
    let clips = this.list();
    clips.unshift({ ...clip, savedAt: Date.now() });
    if (clips.length > 100) clips = clips.slice(0, 100);
    this.save(clips);
    return clips;
  },
  remove(id) {
    let clips = this.list().filter(c => c.id != id && c.savedAt != id);
    this.save(clips);
    return clips;
  },
  exportMarkdown() {
    return this.list().map(c => `## ${c.title || "Untitled"}\n\n${c.text || ""}\n\nSource: ${c.url}\n`).join("\n---\n\n");
  },
};
