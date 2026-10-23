/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The browser side of "upload from clipboard": reads the image off the
// clipboard, shows the menu (act-upload.js in the window) and, when the
// user wants a file after all, runs the normal file picker.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * The clipboard image as { bytes, type, name }, or null.
 */
function readClipboardImage() {
  let trans = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  trans.init(null);
  for (let type of IMAGE_TYPES) {
    trans.addDataFlavor(type);
  }
  Services.clipboard.getData(trans, Ci.nsIClipboard.kGlobalClipboard);

  let flavor = {};
  let data = {};
  try {
    trans.getAnyTransferData(flavor, data);
  } catch {
    return null;
  }

  let stream;
  let type = flavor.value;
  if (data.value instanceof Ci.imgIContainer) {
    // Copied from inside the browser, we get the decoded image back.
    let tools = Cc["@mozilla.org/image/tools;1"].getService(Ci.imgITools);
    stream = tools.encodeImage(data.value, "image/png");
    type = "image/png";
  } else if (data.value instanceof Ci.nsIInputStream) {
    stream = data.value;
  } else {
    return null;
  }

  let buffer = lazy.NetUtil.readInputStream(stream, stream.available());
  let stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return {
    bytes: new Uint8Array(buffer),
    type,
    name: `clipboard-${stamp}.${EXTENSIONS[type] || "png"}`,
  };
}

function pickFiles(win, { multiple, accept }) {
  let picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(
    win.browsingContext,
    null,
    multiple ? Ci.nsIFilePicker.modeOpenMultiple : Ci.nsIFilePicker.modeOpen
  );
  if (/image/.test(accept)) {
    picker.appendFilters(Ci.nsIFilePicker.filterImages);
  }
  picker.appendFilters(Ci.nsIFilePicker.filterAll);

  return new Promise(resolve => {
    picker.open(async result => {
      if (result != Ci.nsIFilePicker.returnOK) {
        resolve([]);
        return;
      }
      let files = multiple ? [...picker.files] : [picker.file];
      resolve(await Promise.all(files.map(f => File.createFromNsIFile(f))));
    });
  });
}

export class ActUploadParent extends JSWindowActorParent {
  async receiveMessage(message) {
    if (message.name != "ActUpload:Ask") {
      return null;
    }
    let win = this.browsingContext.topChromeWindow;
    if (!win?.ActUploadMenu) {
      return null;
    }

    let image = null;
    try {
      image = readClipboardImage();
    } catch (e) {
      console.warn("Act: couldn't read the clipboard", e);
    }

    let choice = await win.ActUploadMenu.show({
      screenX: message.data.screenX,
      screenY: message.data.screenY,
      image,
    });

    if (choice == "clipboard" && image) {
      return { files: [image] };
    }
    if (choice == "pick") {
      return { files: await pickFiles(win, message.data) };
    }
    return null;
  }
}
