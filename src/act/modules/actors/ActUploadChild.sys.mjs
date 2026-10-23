/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Upload from the clipboard, like Opera does. When a page opens a file
// picker and there's an image on the clipboard, we show a small menu first:
// use the clipboard image, or pick a file as usual.
//
// This half runs in the web page's process. It catches the click on the
// <input type="file">, asks the parent what to do and fills in the input.

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function acceptsImages(input) {
  let accept = (input.getAttribute("accept") || "").trim().toLowerCase();
  if (!accept) {
    return true;
  }
  return accept.split(",").some(part => {
    part = part.trim();
    return (
      part == "image/*" ||
      IMAGE_TYPES.includes(part) ||
      /^\.(png|jpe?g|gif|webp)$/.test(part)
    );
  });
}

function clipboardHasImage() {
  try {
    return Services.clipboard.hasDataMatchingFlavors(
      IMAGE_TYPES,
      Ci.nsIClipboard.kGlobalClipboard
    );
  } catch {
    return false;
  }
}

export class ActUploadChild extends JSWindowActorChild {
  handleEvent(event) {
    if (event.type != "click" || event.defaultPrevented) {
      return;
    }
    let input = event.composedTarget || event.target;
    if (
      !HTMLInputElement.isInstance(input) ||
      input.type != "file" ||
      input.disabled ||
      input.webkitdirectory
    ) {
      return;
    }
    // Pages open pickers from script too (a nice button calling
    // input.click()), so check for a user click instead of isTrusted.
    if (!event.isTrusted && !this.document.hasValidTransientUserActivation) {
      return;
    }
    if (!acceptsImages(input) || !clipboardHasImage()) {
      return;
    }

    event.preventDefault();
    this.#ask(input);
  }

  async #ask(input) {
    let rect = input.getBoundingClientRect();
    let win = this.contentWindow;
    // A hidden input (the usual "nice button" pattern) has no box, point at
    // the middle of the window then.
    let visible = rect.width > 0 && rect.height > 0;
    let x = visible ? rect.left : win.innerWidth / 2 - 140;
    let y = visible ? rect.bottom : win.innerHeight / 3;

    let reply;
    try {
      reply = await this.sendQuery("ActUpload:Ask", {
        screenX: win.mozInnerScreenX + x,
        screenY: win.mozInnerScreenY + y,
        multiple: input.multiple,
        accept: input.getAttribute("accept") || "",
      });
    } catch (e) {
      console.error("Act: upload menu failed", e);
      return;
    }
    if (!reply?.files?.length || !input.isConnected) {
      return;
    }

    let transfer = new win.DataTransfer();
    for (let file of reply.files) {
      // Files picked from disk arrive as File objects, the clipboard image
      // as raw bytes.
      if (file.bytes) {
        file = new win.File([file.bytes], file.name, { type: file.type });
      }
      transfer.items.add(file);
      if (!input.multiple) {
        break;
      }
    }
    input.files = transfer.files;
    input.dispatchEvent(new win.Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new win.Event("change", { bubbles: true }));
  }
}
