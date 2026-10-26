/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const $ = id => document.getElementById(id);
const win = window.parent || window;

const Downloads = (function () {
  try {
    return ChromeUtils.importESModule("resource://gre/modules/Downloads.sys.mjs").Downloads;
  } catch {
    return null;
  }
})();

const list = $("dl-list");
const empty = $("dl-empty");

function el(tag, className, text) {
  let n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function refresh() {
  list.replaceChildren();
  if (!Downloads) {
    empty.hidden = false;
    empty.textContent = "Downloads API unavailable.";
    return;
  }
  try {
    let downloads = await Downloads.getList(Downloads.ALL);
    let items = await downloads.getAll();
    if (!items.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (let d of items.slice().reverse()) {
      let item = el("div", "dl-item");
      let icon = el("div", "dl-icon");
      icon.textContent = "⬇";
      item.append(icon);

      let info = el("div", "dl-info");
      let name = el("div", "dl-name", d.target?.path?.split("/").pop() || d.source?.url || "Download");
      info.append(name);
      let meta = el("div", "dl-meta", `${formatSize(d.currentBytes)} / ${formatSize(d.totalBytes)} · ${d.succeeded ? "Done" : d.canceled ? "Canceled" : "In progress"}`);
      info.append(meta);

      if (!d.succeeded && !d.canceled && d.totalBytes > 0) {
        let prog = el("div", "dl-progress");
        let bar = el("div", "dl-progress-bar");
        bar.style.width = `${(d.currentBytes / d.totalBytes) * 100}%`;
        prog.append(bar);
        info.append(prog);
      }
      item.append(info);

      let actions = el("div", "dl-actions");
      if (d.succeeded) {
        let open = el("button", "dl-btn", "Open");
        open.addEventListener("click", () => {
          try { d.launch(); } catch {}
        });
        actions.append(open);
      }
      if (!d.succeeded && !d.canceled) {
        let cancel = el("button", "dl-btn", "Cancel");
        cancel.addEventListener("click", () => { try { d.cancel(); } catch {} refresh(); });
        actions.append(cancel);
      }
      let remove = el("button", "dl-btn", "×");
      remove.addEventListener("click", async () => {
        try { await d.finalize(true); } catch {}
        refresh();
      });
      actions.append(remove);
      item.append(actions);

      list.append(item);
    }
  } catch (e) {
    empty.hidden = false;
    empty.textContent = "Error loading downloads: " + e.message;
  }
}

$("dl-clear").addEventListener("click", async () => {
  if (!Downloads) return;
  try {
    let downloads = await Downloads.getList(Downloads.ALL);
    await downloads.removeFinished();
  } catch {}
  refresh();
});

refresh();
// Poll for progress
setInterval(refresh, 1500);
