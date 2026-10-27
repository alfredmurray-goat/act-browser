const $ = id => document.getElementById(id);
const win = window.parent || window;
const ActReadingList = (() => {
  try { return ChromeUtils.importESModule("resource://act/ActReadingList.sys.mjs").ActReadingList; }
  catch { return null; }
})();

const list = $("rl-list");
const empty = $("rl-empty");
let currentFilter = "all";

function el(tag, className, text) {
  let n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

async function refresh() {
  if (!ActReadingList) return;
  list.replaceChildren();
  let items = ActReadingList.list();
  if (currentFilter == "unread") items = items.filter(i => !i.read);
  if (currentFilter == "read") items = items.filter(i => i.read);
  if (!items.length) { empty.hidden = false; return; }
  empty.hidden = true;
  for (let item of items) {
    let row = el("div", "rl-item" + (item.read ? " read" : ""));
    let title = el("div", "rl-title", item.title || item.url);
    row.append(title);
    let url = el("div", "rl-url", item.url);
    row.append(url);
    let actions = el("div", "rl-actions");
    let open = el("button", "rl-btn", "Open");
    open.addEventListener("click", (e) => { e.stopPropagation(); win.gBrowser?.addTab?.(item.url); win.ActPopup?.close?.(); });
    actions.append(open);
    let toggle = el("button", "rl-btn", item.read ? "Mark unread" : "Mark read");
    toggle.addEventListener("click", (e) => { e.stopPropagation(); ActReadingList.markRead(item.url, !item.read); refresh(); });
    actions.append(toggle);
    let remove = el("button", "rl-btn", "Remove");
    remove.addEventListener("click", (e) => { e.stopPropagation(); ActReadingList.remove(item.url); refresh(); });
    actions.append(remove);
    row.append(actions);
    row.addEventListener("click", () => { win.gBrowser?.selectedTab && (win.gBrowser.selectedTab = win.gBrowser.addTab(item.url)); });
    list.append(row);
  }
}

for (let btn of document.querySelectorAll(".rl-filter")) {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".rl-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    refresh();
  });
}

// Listen for storage changes
setInterval(refresh, 2000);
refresh();
