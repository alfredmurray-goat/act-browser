// Builds Act Browser into dist/: takes the official Firefox release, adds
// the Act chrome code from src/, swaps the branding and re-signs (macOS).
//
//   npm run build            normal build
//   npm run build -- --dev   for development, see scripts/dev.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchFirefox } from "./fetch.mjs";
import {
  BRANDING,
  CACHE,
  DIST,
  SRC,
  appLayout,
  config,
  copy,
  isMain,
  log,
  platform,
  requirePlatform,
  rm,
  run,
} from "./lib.mjs";

// Files from src/ and where they go, relative to the Firefox resources
// directory (Contents/Resources on macOS, the install directory on Linux).
const INSTALL = [
  ["act.cfg", "act.cfg"],
  ["defaults/pref/autoconfig.js", "defaults/pref/autoconfig.js"],
  // Read after Firefox's own defaults, so ours win.
  ["browser/defaults/preferences/act-prefs.js", "browser/defaults/preferences/act-prefs.js"],
  ["distribution/policies.json", "distribution/policies.json"],
  ["act", "act"],
];

const BRAND_FILES = {
  "localization/en-US/branding/brand.ftl": "brand.ftl",
  "chrome/en-US/locale/branding/brand.properties": "brand.properties",
  "chrome/browser/content/branding/about-logo.svg": "logo.svg",
  "chrome/browser/content/branding/about-wordmark.svg": "wordmark.svg",
  "chrome/browser/content/branding/firefox-wordmark.svg": "wordmark.svg",
  "chrome/browser/content/branding/about-logo.png": "icons/about-logo.png",
  "chrome/browser/content/branding/about-logo@2x.png": "icons/about-logo@2x.png",
  "chrome/browser/content/branding/about-logo-private.png": "icons/about-logo.png",
  "chrome/browser/content/branding/about-logo-private@2x.png": "icons/about-logo@2x.png",
  "chrome/browser/content/branding/about.png": "icons/about-logo.png",
  "chrome/browser/content/branding/icon16.png": "icons/icon16.png",
  "chrome/browser/content/branding/icon32.png": "icons/icon32.png",
  "chrome/browser/content/branding/icon48.png": "icons/icon48.png",
  "chrome/browser/content/branding/icon64.png": "icons/icon64.png",
  "chrome/browser/content/branding/icon128.png": "icons/icon128.png",
};

// Extensions we ship with, from addons.mozilla.org (so they're signed by
// Mozilla). Firefox installs whatever is in distribution/extensions into
// new profiles. Unlike a policy install, the user can still remove them.
async function bundleExtensions(resources) {
  let dir = path.join(resources, "distribution", "extensions");
  fs.mkdirSync(dir, { recursive: true });
  for (let ext of config.extensions || []) {
    let cached = path.join(CACHE, "extensions", `${ext.id}.xpi`);
    if (!fs.existsSync(cached)) {
      log(`Downloading ${ext.name}…`);
      let url = `https://addons.mozilla.org/firefox/downloads/latest/${ext.amo}/latest.xpi`;
      let response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Couldn't download ${ext.name}: ${response.status}`);
      }
      fs.mkdirSync(path.dirname(cached), { recursive: true });
      fs.writeFileSync(cached, Buffer.from(await response.arrayBuffer()));
    }
    fs.copyFileSync(cached, path.join(dir, `${ext.id}.xpi`));
  }
}

function installActFiles(resources) {
  for (let [from, to] of INSTALL) {
    let target = path.join(resources, to);
    rm(target);
    copy(path.join(SRC, from), target);
  }
}

// The brand name and logos live inside browser/omni.ja, which is a zip.
function rebrandOmni(resources) {
  let omni = path.join(resources, "browser", "omni.ja");
  let tmp = fs.mkdtempSync(path.join(os.tmpdir(), "act-omni-"));
  try {
    // omni.ja has a slightly unusual header, unzip warns about it (exit 1/2)
    run("unzip", ["-q", "-o", omni, "-d", tmp], { okCodes: [0, 1, 2], quiet: true });
    for (let [inside, ours] of Object.entries(BRAND_FILES)) {
      let target = path.join(tmp, inside);
      if (fs.existsSync(path.dirname(target))) {
        fs.copyFileSync(path.join(BRANDING, ours), target);
      }
    }
    rm(omni);
    run("zip", ["-q", "-r", "-9", "-X", "-D", omni, "."], { cwd: tmp });
  } finally {
    rm(tmp);
  }
}

function rebrandMac(layout) {
  let contents = path.dirname(layout.resources);
  let plist = path.join(contents, "Info.plist");
  let set = (key, value) =>
    run("plutil", ["-replace", key, "-string", value, plist]);

  set("CFBundleName", config.name);
  set("CFBundleDisplayName", config.name);
  set("CFBundleIdentifier", config.id);
  set("CFBundleIconFile", "act.icns");
  run("plutil", ["-remove", "SMPrivilegedExecutables", plist], { okCodes: [0, 1], quiet: true });

  // "Firefox needs access to your Downloads folder..." and friends.
  let xml = run("plutil", ["-convert", "xml1", "-o", "-", plist], { quiet: true });
  for (let [, key, value] of xml.matchAll(
    /<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g
  )) {
    set(key, value.replaceAll("Firefox", config.name));
  }

  fs.writeFileSync(
    path.join(layout.resources, "en.lproj", "InfoPlist.strings"),
    `CFBundleName = "${config.name}";\nCFBundleDisplayName = "${config.name}";\n`
  );
  fs.copyFileSync(path.join(BRANDING, "icons", "act.icns"), path.join(layout.resources, "act.icns"));
}

function rebrandLinux(layout) {
  let icons = path.join(layout.resources, "browser", "chrome", "icons", "default");
  for (let size of [16, 32, 48, 64, 128]) {
    let target = path.join(icons, `default${size}.png`);
    if (fs.existsSync(target)) {
      fs.copyFileSync(path.join(BRANDING, "icons", `icon${size}.png`), target);
    }
  }
  let launcher = path.join(layout.app, "act-browser");
  fs.writeFileSync(launcher, '#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/firefox" "$@"\n');
  fs.chmodSync(launcher, 0o755);
  fs.writeFileSync(
    path.join(layout.app, "act-browser.desktop"),
    [
      "[Desktop Entry]",
      `Name=${config.name}`,
      "Comment=Browse the web",
      "Exec=act-browser %u",
      "Icon=act-browser",
      "Terminal=false",
      "Type=Application",
      "Categories=Network;WebBrowser;",
      "MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;",
      "StartupWMClass=firefox",
      "",
    ].join("\n")
  );
}

export async function build({ outDir = DIST } = {}) {
  requirePlatform();
  let source = await fetchFirefox();
  outDir = path.resolve(outDir);
  let layout = appLayout(outDir);

  log(`Building ${config.name} on Firefox ${config.firefox.version}…`);
  rm(layout.app);
  fs.mkdirSync(outDir, { recursive: true });
  if (platform == "mac") {
    run("ditto", [source, layout.app]);
  } else {
    copy(source, layout.app);
  }

  installActFiles(layout.resources);
  await bundleExtensions(layout.resources);
  rebrandOmni(layout.resources);

  if (platform == "mac") {
    rebrandMac(layout);
    log("Signing (ad hoc)…");
    run("xattr", ["-cr", layout.app]);
    run("codesign", ["--force", "--deep", "--sign", "-", layout.app], { quiet: true });
  } else {
    rebrandLinux(layout);
  }

  log(`Done: ${path.relative(process.cwd(), layout.app)}`);
  return layout;
}

if (isMain(import.meta.url)) {
  build().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
