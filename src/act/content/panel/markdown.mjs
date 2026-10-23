/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// A small markdown renderer for assistant replies.
//
// This page runs with chrome privileges and renders text from a language
// model, so it never touches innerHTML. Everything is built with
// createElement/textContent, and links are only http(s).

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)|(\[[^\]\n]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function safeHref(href) {
  try {
    let url = new URL(href);
    return url.protocol == "https:" || url.protocol == "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function link(doc, text, href) {
  let safe = safeHref(href);
  if (!safe) {
    return doc.createTextNode(text);
  }
  let a = doc.createElement("a");
  a.href = safe;
  a.textContent = text;
  a.title = safe;
  return a;
}

function renderInline(doc, text, parent) {
  let last = 0;
  for (let match of text.matchAll(INLINE)) {
    if (match.index > last) {
      parent.append(text.slice(last, match.index));
    }
    let [token, code, bold, em, mdLink, bare] = match;
    if (code) {
      let el = doc.createElement("code");
      el.textContent = code.slice(1, -1);
      parent.append(el);
    } else if (bold) {
      let el = doc.createElement("strong");
      renderInline(doc, bold.slice(2, -2), el);
      parent.append(el);
    } else if (em) {
      let el = doc.createElement("em");
      el.textContent = em.slice(1, -1);
      parent.append(el);
    } else if (mdLink) {
      let [, label, href] = mdLink.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      parent.append(link(doc, label, href));
    } else if (bare) {
      parent.append(link(doc, bare, bare));
    } else {
      parent.append(token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) {
    parent.append(text.slice(last));
  }
}

/**
 * Renders markdown into `container`, replacing what's there.
 */
export function renderMarkdown(container, source) {
  let doc = container.ownerDocument;
  let out = doc.createDocumentFragment();
  let lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");

  let paragraph = [];
  let list = null;

  let flushParagraph = () => {
    if (paragraph.length) {
      let p = doc.createElement("p");
      renderInline(doc, paragraph.join(" "), p);
      out.append(p);
      paragraph = [];
    }
  };
  let flushList = () => {
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code. An unclosed fence (still streaming) runs to the end.
    let fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      flushParagraph();
      flushList();
      let code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      let pre = doc.createElement("pre");
      let el = doc.createElement("code");
      el.textContent = code.join("\n");
      pre.append(el);
      out.append(pre);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    // Pipe tables: a header row followed by |---|---|
    if (
      /^\s*\|.*\|\s*$/.test(line) &&
      /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")
    ) {
      flushParagraph();
      flushList();
      let cells = row =>
        row.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      let table = doc.createElement("table");
      let head = doc.createElement("tr");
      for (let cell of cells(line)) {
        let th = doc.createElement("th");
        renderInline(doc, cell, th);
        head.append(th);
      }
      table.append(head);
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        let tr = doc.createElement("tr");
        for (let cell of cells(lines[i])) {
          let td = doc.createElement("td");
          renderInline(doc, cell, td);
          tr.append(td);
        }
        table.append(tr);
        i++;
      }
      i--;
      let wrap = doc.createElement("div");
      wrap.className = "table-wrap";
      wrap.append(table);
      out.append(wrap);
      continue;
    }

    let heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      flushParagraph();
      flushList();
      let el = doc.createElement(`h${Math.min(heading[1].length + 2, 6)}`);
      renderInline(doc, heading[2], el);
      out.append(el);
      continue;
    }

    let quote = line.match(/^>\s?(.*)/);
    if (quote) {
      flushParagraph();
      flushList();
      let el = doc.createElement("blockquote");
      renderInline(doc, quote[1], el);
      out.append(el);
      continue;
    }

    let item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)/);
    if (item) {
      flushParagraph();
      let ordered = /\d/.test(item[1]);
      let tag = ordered ? "ol" : "ul";
      if (!list || list.localName != tag) {
        list = doc.createElement(tag);
        out.append(list);
      }
      let li = doc.createElement("li");
      renderInline(doc, item[2], li);
      list.append(li);
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      flushList();
      out.append(doc.createElement("hr"));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();

  container.replaceChildren(out);
}
