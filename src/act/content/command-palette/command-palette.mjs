/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const $ = id => document.getElementById(id);
const input = $("palette-input");
const resultsEl = $("palette-results");

let items = [];
let selected = 0;

const win = window.browsingContext?.top?.window || window.parent;

function el(tag, className) {
  let node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function close() {
  try {
    win.ActCommandPalette?.close();
  } catch {}
}

function openTab(tab) {
  try {
    win.gBrowser.selectedTab = tab;
  } catch {}
  close();
}

function runAction(action) {
  try {
    action(win);
  } catch (e) {
    console.error(e);
  }
  close();
}

async function gather() {
  items = [];
  let gBrowser = win.gBrowser;
  if (gBrowser?.tabs) {
    for (let tab of gBrowser.tabs) {
      if (tab.closing) continue;
      let contentText = "";
      try {
        let browser = tab.linkedBrowser;
        if (browser?.contentDocument?.body) {
          contentText = (browser.contentDocument.body.innerText || "").slice(0, 500);
        }
      } catch {}
      items.push({
        type: "tab",
        title: tab.label || tab.textLabel || "",
        subtitle: tab.linkedBrowser?.currentURI?.spec || "",
        content: contentText,
        icon: "tab",
        tab,
        score: 0,
      });
    }
  }

  // Workspaces
  try {
    if (win.ActWorkspaces) {
      for (let ws of win.ActWorkspaces.list()) {
        items.push({
          type: "workspace",
          title: `Switch to ${ws.name}`,
          subtitle: "Workspace",
          icon: ws.icon || "workspace",
          action: w => w.ActWorkspaces?.switchTo?.(ws.id),
          score: 0,
        });
      }
    }
  } catch {}

  // Settings/actions
  items.push(
    { type: "action", title: "Open Settings", subtitle: "Act preferences", icon: "settings", action: w => { w.ActPopup?.open("settings"); }, score: 0 },
    { type: "action", title: "Explore with Actuent", subtitle: "Search the live web", icon: "explore", action: w => { w.ActPopup?.open("explore"); w.ActPopup?._withUI?.(ui => ui.showView?.("explore")); }, score: 0 },
    { type: "action", title: "Toggle Compact Mode", subtitle: "Sidebar", icon: "compact", action: w => w.ActBrowser?.toggleCompactMode?.(), score: 0 },
    { type: "action", title: "New Private Window", subtitle: "Private Browsing", icon: "private", action: w => w.OpenBrowserWindow?.({ private: true }), score: 0 },
  );

  render();
}

function scoreItem(item, q) {
  if (!q) return 1;
  let t = (item.title + " " + item.subtitle + " " + (item.content || "")).toLowerCase();
  if (t.includes(q)) return 2;
  // simple fuzzy
  let i = 0;
  for (let c of q) {
    i = t.indexOf(c, i);
    if (i == -1) return 0;
    i++;
  }
  return 1;
}

function render() {
  let q = input.value.trim().toLowerCase();
  let filtered = items
    .map(it => ({ it, s: scoreItem(it, q) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map(x => x.it);

  if (selected >= filtered.length) selected = Math.max(0, filtered.length - 1);
  resultsEl.replaceChildren();

  if (filtered.length == 0) {
    let empty = el("div", "result-item");
    empty.textContent = "No results";
    resultsEl.append(empty);
    return;
  }

  for (let [idx, item] of filtered.entries()) {
    let row = el("div", "result-item");
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", idx == selected ? "true" : "false");
    row.addEventListener("click", () => {
      if (item.type == "tab") openTab(item.tab);
      else if (item.action) runAction(item.action);
      else close();
    });

    let icon = el("div", "result-icon");
    if (item.type == "tab" && item.tab?.image) {
      let img = document.createElement("img");
      img.src = item.tab.image;
      icon.append(img);
    } else {
      icon.textContent = item.type == "workspace" ? "◇" : item.type == "tab" ? "◉" : "⌘";
    }
    row.append(icon);

    let text = el("div", "result-text");
    let title = el("div", "result-title");
    title.textContent = item.title;
    text.append(title);
    if (item.subtitle) {
      let sub = el("div", "result-subtitle");
      sub.textContent = item.subtitle;
      text.append(sub);
    }
    row.append(text);

    if (item.type == "tab") {
      let sc = el("span", "result-shortcut");
      sc.textContent = "Switch to tab";
      row.append(sc);
    } else if (item.action) {
      let sc = el("span", "result-shortcut");
      sc.textContent = "Run";
      row.append(sc);
    }

    resultsEl.append(row);
  }

  // scroll selected into view
  let sel = resultsEl.querySelector('[aria-selected="true"]');
  sel?.scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", () => {
  selected = 0;
  render();
});

input.addEventListener("keydown", e => {
  let items = resultsEl.querySelectorAll(".result-item");
  if (e.key == "ArrowDown") {
    e.preventDefault();
    selected = Math.min(items.length - 1, selected + 1);
    render();
  } else if (e.key == "ArrowUp") {
    e.preventDefault();
    selected = Math.max(0, selected - 1);
    render();
  } else if (e.key == "Enter") {
    e.preventDefault();
    let filtered = [];
    let q = input.value.trim().toLowerCase();
    for (let it of items) {
      if (scoreItem(it, q) > 0) filtered.push(it);
    }
    filtered.sort((a, b) => scoreItem(b, q) - scoreItem(a, q));
    let item = filtered[selected];
    if (item?.type == "tab") openTab(item.tab);
    else if (item?.action) runAction(item.action);
    else close();
  } else if (e.key == "Escape") {
    e.preventDefault();
    close();
  }
});

window.addEventListener("keydown", e => {
  if (e.key == "Escape") {
    e.preventDefault();
    close();
  }
}, true);

gather();
setTimeout(() => input.focus(), 10);
