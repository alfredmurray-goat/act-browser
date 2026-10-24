/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// "What's new": CHANGELOG.md from the repo (the build copies it in next to
// this page), turned into cards. Only the bits of Markdown the changelog
// uses: "## version" headings, "- " lists, `code`, **bold** and paragraphs.

const $ = id => document.getElementById(id);

function el(tag, props = {}, children = []) {
  let node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Inline formatting, built as nodes so nothing in the file is ever HTML.
function inline(text) {
  let parts = [];
  let pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  for (let match of text.matchAll(pattern)) {
    parts.push(text.slice(last, match.index));
    parts.push(
      match[1] != null
        ? el("code", { textContent: match[1] })
        : el("strong", { textContent: match[2] })
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function parse(markdown) {
  let releases = [];
  let current = null;
  let list = null;
  for (let line of markdown.split("\n")) {
    let heading = line.match(/^##\s+(.+)/);
    if (heading) {
      current = { version: heading[1].trim(), blocks: [] };
      releases.push(current);
      list = null;
      continue;
    }
    if (!current) {
      // The intro under "# Changelog" is for people reading the repo.
      continue;
    }
    let item = line.match(/^\s*[-*]\s+(.+)/);
    if (item) {
      if (!list) {
        list = [];
        current.blocks.push({ list });
      }
      list.push(item[1]);
    } else if (line.trim()) {
      list = null;
      current.blocks.push({ text: line.trim() });
    } else {
      list = null;
    }
  }
  return releases;
}

function render(releases) {
  let params = new URLSearchParams(location.search);
  let from = params.get("from");
  let latest = releases[0]?.version;
  $("subtitle").textContent = from
    ? `You've been updated from ${from} to ${latest}.`
    : `Version ${latest}`;

  $("releases").replaceChildren(
    ...releases.map((release, i) => {
      let body = release.blocks.map(block =>
        block.list
          ? el("ul", {}, block.list.map(text => el("li", {}, inline(text))))
          : el("p", {}, inline(block.text))
      );
      return el("section", { className: i == 0 ? "release latest" : "release" }, [
        el("h2", {}, [
          release.version,
          i == 0 ? el("span", { className: "badge", textContent: "New" }) : "",
        ]),
        ...body,
      ]);
    })
  );
}

fetch("CHANGELOG.md")
  .then(response => response.text())
  .then(text => render(parse(text)))
  .catch(() => {
    $("subtitle").textContent = "The list of changes couldn't be loaded.";
  });
