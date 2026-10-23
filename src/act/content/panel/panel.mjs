/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { renderMarkdown } from "chrome://act/content/panel/markdown.mjs";

const { ActAI } = ChromeUtils.importESModule("resource://act/ActAI.sys.mjs");
const { Conversation } = ChromeUtils.importESModule(
  "resource://act/ActAssistant.sys.mjs"
);
const { Actuent } = ChromeUtils.importESModule(
  "resource://act/Actuent.sys.mjs"
);
const { ActPrefs, watchPrefs } = ChromeUtils.importESModule(
  "resource://act/ActPrefs.sys.mjs"
);

// The browser window this panel belongs to.
const win = window.browsingContext.topChromeWindow;
const $ = id => document.getElementById(id);

function el(tag, className, text) {
  let node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

let currentView = null;

// --- Views -------------------------------------------------------------------

function viewAvailable(view) {
  if (view == "ask") {
    return ActPrefs.aiEnabled;
  }
  if (view == "explore") {
    return ActPrefs.actuentEnabled;
  }
  return true;
}

function showView(view) {
  if (!viewAvailable(view)) {
    view = ["ask", "explore"].find(viewAvailable) || "settings";
  }
  currentView = view;
  for (let section of document.querySelectorAll(".view")) {
    section.hidden = section.id != `view-${view}`;
  }
  for (let tab of document.querySelectorAll("#tabs [role=tab]")) {
    tab.setAttribute("aria-selected", tab.dataset.view == view);
  }
  $("open-settings").classList.toggle("active", view == "settings");
  $("new-chat").hidden = view != "ask";
  if (view == "settings") {
    loadSettings();
  }
  if (view == "ask") {
    refreshSetupCard();
  }
}

function update() {
  $("tab-ask").hidden = !ActPrefs.aiEnabled;
  $("tab-explore").hidden = !ActPrefs.actuentEnabled;
  $("tabs").hidden = !ActPrefs.aiEnabled && !ActPrefs.actuentEnabled;
  for (let s of document.querySelectorAll("[data-actuent]")) {
    s.hidden = !ActPrefs.actuentEnabled;
  }
  $("ai-settings").disabled = !ActPrefs.aiEnabled;
  $("actuent-settings").disabled = !ActPrefs.actuentEnabled;
  showView(currentView || "ask");
}

function focus() {
  if (currentView == "ask") {
    $("prompt").focus();
  } else if (currentView == "explore") {
    $("explore-query").focus();
  }
}

// --- Ask -----------------------------------------------------------------------

const conversation = new Conversation(win);
let abortController = null;

async function refreshSetupCard() {
  let local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(ActPrefs.aiEndpoint);
  $("setup-card").hidden = local || (await ActAI.hasApiKey());
}

function autosize() {
  let prompt = $("prompt");
  prompt.style.height = "auto";
  prompt.style.height = `${Math.min(prompt.scrollHeight, 200)}px`;
}

function scrollToBottom() {
  let messages = $("messages");
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, text) {
  $("empty-state").hidden = true;
  let message = el("div", `message ${role}`);
  let content = el("div", "content");
  if (role == "user") {
    content.textContent = text;
  }
  message.append(content);
  if (role == "assistant") {
    message.prepend(el("div", "steps"));
  }
  $("messages").append(message);
  scrollToBottom();
  return message;
}

function describeTool(name, args) {
  switch (name) {
    case "actuent_search":
      return `Searching Actuent for “${args.query || ""}”`;
    case "site_actions":
      return `Looking up ${args.domain || "the site"}`;
    case "read_page":
      return "Reading the page";
    case "list_tabs":
      return "Looking at your tabs";
    case "open_url":
      return `Opening ${args.url || "a link"}`;
    default:
      return name;
  }
}

function setBusy(busy) {
  $("send").hidden = busy;
  $("stop").hidden = !busy;
  $("prompt").toggleAttribute("data-busy", busy);
}

async function send(text) {
  text = text.trim();
  if (!text || conversation.busy) {
    return;
  }
  if (!ActPrefs.aiEnabled) {
    return;
  }

  addMessage("user", text);
  let message = addMessage("assistant");
  let content = message.querySelector(".content");
  let steps = message.querySelector(".steps");
  message.classList.add("pending");

  let answer = "";
  let renderQueued = false;
  let render = () => {
    renderQueued = false;
    renderMarkdown(content, answer);
    scrollToBottom();
  };
  let queueRender = () => {
    if (!renderQueued) {
      renderQueued = true;
      requestAnimationFrame(render);
    }
  };

  let toolChips = [];
  abortController = new AbortController();
  setBusy(true);

  try {
    await conversation.send(text, {
      signal: abortController.signal,
      onEvent(event) {
        switch (event.type) {
          case "text":
            message.classList.remove("pending");
            answer += event.text;
            queueRender();
            break;
          case "thinking":
            message.classList.add("thinking");
            break;
          case "round":
            message.classList.remove("thinking");
            if (answer && !answer.endsWith("\n\n")) {
              answer += "\n\n";
            }
            break;
          case "tool": {
            let chip = el("div", "step running", describeTool(event.name, event.args));
            chip.dataset.tool = event.name;
            steps.append(chip);
            toolChips.push(chip);
            scrollToBottom();
            break;
          }
          case "tool-done": {
            let chip = toolChips.find(
              c => c.dataset.tool == event.name && c.classList.contains("running")
            );
            chip?.classList.replace("running", event.ok ? "done" : "failed");
            break;
          }
        }
      },
    });
  } catch (e) {
    if (e.name == "AbortError") {
      answer += answer ? "\n\n*Stopped.*" : "*Stopped.*";
    } else {
      message.classList.add("error");
      answer += (answer ? "\n\n" : "") + (e.message || String(e));
      if (e.status == 401) {
        refreshSetupCard();
      }
    }
  } finally {
    abortController = null;
    setBusy(false);
    message.classList.remove("pending", "thinking");
    if (!answer) {
      answer = "*No answer.*";
    }
    render();
  }
}

function ask(text, { send: autoSend = true } = {}) {
  showView("ask");
  if (autoSend && !conversation.busy) {
    send(text);
  } else {
    $("prompt").value = text;
    autosize();
    $("prompt").focus();
  }
}

function newChat() {
  abortController?.abort();
  conversation.reset();
  for (let m of document.querySelectorAll(".message")) {
    m.remove();
  }
  $("empty-state").hidden = false;
  $("prompt").focus();
}

// --- Explore -------------------------------------------------------------------

let exploreAbort = null;

function formatPrice(price, currency) {
  if (price == null) {
    return "";
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(price);
  } catch {
    return `${price} ${currency}`;
  }
}

function formatDate(iso) {
  let date = new Date(iso);
  if (isNaN(date)) {
    return "";
  }
  return date.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function linkCard(url, className) {
  let card = el(url ? "a" : "div", className);
  if (url) {
    card.href = url;
  }
  return card;
}

function siteCard(site) {
  let card = linkCard(site.url, "result site");
  let top = el("div", "result-top");
  let icon = el("img", "favicon");
  icon.src = `page-icon:https://${site.domain}/`;
  icon.alt = "";
  top.append(icon, el("span", "result-title", site.name));
  if (site.openNow === true) {
    top.append(el("span", "badge open", "Open"));
  } else if (site.openNow === false) {
    top.append(el("span", "badge closed", "Closed"));
  }
  card.append(top);

  let meta = [site.domain, site.category, site.city].filter(Boolean).join(" · ");
  card.append(el("div", "result-meta", meta));
  if (site.summary) {
    card.append(el("p", "result-summary", site.summary));
  }

  let chips = el("div", "chips");
  for (let action of site.actions.slice(0, 5)) {
    if (action.id == "visit") {
      continue;
    }
    let chip = el("button", "chip", action.name);
    chip.title = action.description;
    chip.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      if (action.url) {
        win.ActBrowser.openLink(action.url);
      } else if (ActPrefs.aiEnabled) {
        ask(`On ${site.name} (${site.domain}), help me: ${action.description || action.name}`);
      } else if (site.url) {
        win.ActBrowser.openLink(site.url);
      }
    });
    chips.append(chip);
  }
  if (ActPrefs.aiEnabled) {
    let chip = el("button", "chip ask", "Ask Act");
    chip.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      ask(`Tell me about ${site.name} (${site.domain}).`);
    });
    chips.append(chip);
  }
  if (chips.childElementCount) {
    card.append(chips);
  }
  return card;
}

function productRow(product) {
  let row = linkCard(product.url, "result product");
  row.append(el("span", "result-title", product.name));
  let price = el("span", "price", formatPrice(product.price, product.currency));
  let meta = el("div", "result-meta", product.domain);
  if (!product.available) {
    meta.textContent += " · out of stock";
  }
  row.append(price, meta);
  return row;
}

function eventRow(event) {
  let row = linkCard(event.url, "result event");
  row.append(el("span", "result-title", event.name));
  let when = formatDate(event.start);
  let where = [event.venue, event.city].filter(Boolean).join(", ");
  row.append(el("div", "result-meta", [when, where].filter(Boolean).join(" · ")));
  if (event.price != null) {
    row.append(el("span", "price", formatPrice(event.price, event.currency)));
  }
  return row;
}

function section(title, nodes) {
  let wrap = el("section", "result-group");
  wrap.append(el("h3", null, title), ...nodes);
  return wrap;
}

async function explore(query) {
  query = (query ?? $("explore-query").value).trim();
  $("explore-query").value = query;
  showView("explore");
  if (!query) {
    $("explore-results").replaceChildren();
    $("explore-status").textContent = "";
    return;
  }

  exploreAbort?.abort();
  let abort = (exploreAbort = new AbortController());
  $("explore-status").textContent = "Searching…";

  let result;
  try {
    result = await Actuent.search(query, {
      city: $("explore-city").value.trim(),
      openNow: $("explore-open").checked,
      kind: $("explore-news").checked ? "news" : "web",
      limit: 12,
      signal: abort.signal,
    });
  } catch (e) {
    if (e.name != "AbortError") {
      $("explore-status").textContent = e.message;
    }
    return;
  }
  if (abort.signal.aborted) {
    return;
  }

  let groups = [];
  if (result.answer?.sentences.length) {
    let box = el("div", "answer");
    for (let sentence of result.answer.sentences) {
      let p = el("p");
      p.append(sentence.text, " ");
      if (sentence.url) {
        let source = el("a", "source", "source");
        source.href = sentence.url;
        p.append(source);
      }
      box.append(p);
    }
    groups.push(section(`From ${result.answer.domain}`, [box]));
  }
  if (result.events.length) {
    groups.push(section("Events", result.events.map(eventRow)));
  }
  if (result.products.length) {
    groups.push(section("Products", result.products.map(productRow)));
  }
  if (result.sites.length) {
    groups.push(section("Sites", result.sites.map(siteCard)));
  }
  if (result.related.length) {
    let chips = el("div", "chips");
    for (let related of result.related) {
      let chip = el("button", "chip", related);
      chip.addEventListener("click", () => explore(related));
      chips.append(chip);
    }
    groups.push(section("Related", [chips]));
  }

  let status = result.message;
  if (!groups.length) {
    status = result.didYouMean
      ? `Nothing found. Did you mean “${result.didYouMean}”?`
      : "Nothing found.";
  }
  $("explore-status").textContent = status || "";
  $("explore-results").replaceChildren(...groups);
  $("explore-results").scrollTop = 0;
}

// --- Settings ------------------------------------------------------------------

function readPref(name, type) {
  if (type == "checkbox") {
    return Services.prefs.getBoolPref(name, false);
  }
  return Services.prefs.getStringPref(name, "");
}

function loadSettings() {
  for (let input of document.querySelectorAll("[data-pref]")) {
    let value = readPref(input.dataset.pref, input.type);
    if (input.type == "checkbox") {
      input.checked = value;
    } else if (document.activeElement != input) {
      input.value = value;
    }
  }
  $("compact-toggle").checked = ActPrefs.compactMode;
  $("version").textContent = `built on Firefox ${Services.appinfo.version}`;
  fillModels([ActPrefs.aiModel]);
  ActAI.hasApiKey().then(has => {
    $("api-key").placeholder = has ? "•••••••• (saved)" : "gsk_…";
  });
}

function fillModels(models) {
  let select = $("model");
  let current = ActPrefs.aiModel;
  let ids = [...new Set([current, ...models].filter(Boolean))];
  select.replaceChildren(
    ...ids.map(id => {
      let option = el("option", null, id);
      option.value = id;
      option.selected = id == current;
      return option;
    })
  );
}

async function refreshModels() {
  let button = $("refresh-models");
  button.disabled = true;
  try {
    fillModels(await ActAI.listModels());
    $("key-status").textContent = "Models loaded.";
  } catch (e) {
    $("key-status").textContent = e.message;
  } finally {
    button.disabled = false;
  }
}

async function saveKey() {
  let input = $("api-key");
  let status = $("key-status");
  try {
    await ActAI.setApiKey(input.value);
    input.value = "";
    let has = await ActAI.hasApiKey();
    input.placeholder = has ? "•••••••• (saved)" : "gsk_…";
    status.textContent = has ? "Saved to the Firefox password manager." : "Key removed.";
    refreshSetupCard();
    if (has) {
      refreshModels();
    }
  } catch (e) {
    status.textContent = `Couldn't save the key: ${e.message}`;
  }
}

function bindSettings() {
  for (let input of document.querySelectorAll("[data-pref]")) {
    let name = input.dataset.pref;
    input.addEventListener("change", () => {
      if (input.type == "checkbox") {
        Services.prefs.setBoolPref(name, input.checked);
      } else {
        let value = input.value.trim();
        if (value) {
          Services.prefs.setStringPref(name, value);
        } else {
          Services.prefs.clearUserPref(name);
          input.value = readPref(name, input.type);
        }
      }
    });
  }
  $("compact-toggle").addEventListener("change", e => {
    win.ActBrowser.setCompactMode(e.target.checked);
  });
  $("model").addEventListener("change", e => {
    Services.prefs.setStringPref("act.ai.model", e.target.value);
  });
  $("refresh-models").addEventListener("click", e => {
    e.preventDefault();
    refreshModels();
  });
  $("save-key").addEventListener("click", e => {
    e.preventDefault();
    saveKey();
  });
  $("api-key").addEventListener("keydown", e => {
    if (e.key == "Enter") {
      e.preventDefault();
      saveKey();
    }
  });
}

// --- Wiring --------------------------------------------------------------------

function setup() {
  for (let tab of document.querySelectorAll("#tabs [role=tab]")) {
    tab.addEventListener("click", () => {
      showView(tab.dataset.view);
      focus();
    });
  }
  $("open-settings").addEventListener("click", () => {
    showView(currentView == "settings" ? "ask" : "settings");
  });
  $("close-panel").addEventListener("click", () => win.ActPanel.close());
  $("new-chat").addEventListener("click", newChat);

  $("composer").addEventListener("submit", e => {
    e.preventDefault();
    let text = $("prompt").value;
    $("prompt").value = "";
    autosize();
    send(text);
  });
  $("prompt").addEventListener("input", autosize);
  $("prompt").addEventListener("keydown", e => {
    if (e.key == "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("composer").requestSubmit();
    }
  });
  $("stop").addEventListener("click", () => abortController?.abort());

  for (let button of document.querySelectorAll(".suggestion")) {
    button.addEventListener("click", () => send(button.dataset.prompt));
  }
  $("setup-get-key").addEventListener("click", () =>
    win.ActBrowser.openLink("https://console.groq.com/keys")
  );
  $("setup-open-settings").addEventListener("click", () => showView("settings"));

  $("explore-form").addEventListener("submit", e => {
    e.preventDefault();
    explore();
  });
  for (let id of ["explore-open", "explore-news"]) {
    $(id).addEventListener("change", () => explore());
  }

  // Links never navigate this panel, they open in a tab.
  document.addEventListener("click", e => {
    let a = e.target.closest("a[href]");
    if (a) {
      e.preventDefault();
      win.ActBrowser.openLink(a.href, { background: e.ctrlKey || e.metaKey });
    }
  });

  bindSettings();

  let unwatch = watchPrefs(
    [
      "act.ai.enabled",
      "act.actuent.enabled",
      "act.ai.model",
      "act.ai.endpoint",
      "act.compactMode",
      "act.workspaces.enabled",
      "sidebar.verticalTabs",
    ],
    () => {
      update();
      if (currentView == "settings") {
        loadSettings();
      }
    }
  );
  window.addEventListener("unload", unwatch, { once: true });

  update();
}

setup();

window.ActPanelUI = {
  ready: true,
  showView,
  focus,
  ask,
  explore,
  update,
};
win.ActPanel?._uiReady(window.ActPanelUI);
