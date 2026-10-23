// Builds Act Browser into dist/: takes the official Firefox release, adds
// the Act chrome code from src/, swaps the branding and re-signs (macOS).
// Works on macOS, Linux and 64 bit Windows, each building for itself.
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
  ROOT,
  SRC,
  appLayout,
  config,
  copy,
  isLinux,
  isMac,
  isMain,
  isWindows,
  log,
  platform,
  requirePlatform,
  rm,
  run,
  unzipTo,
  zipContents,
} from "./lib.mjs";

// Files from src/ and where they go, relative to the Firefox resources
// directory (Contents/Resources on macOS, the install folder elsewhere).
const INSTALL = [
  ["act.cfg", "act.cfg"],
  ["defaults/pref/autoconfig.js", "defaults/pref/autoconfig.js"],
  // Read after Firefox's own defaults, so ours win.
  ["browser/defaults/preferences/act-prefs.js", "browser/defaults/preferences/act-prefs.js"],
  ["distribution/policies.json", "distribution/policies.json"],
  ["act", "act"],
];

// The MCP server for AI agents ships next to the browser code.
const AGENT = ["agent/act-mcp.mjs", "agent/act-mcp.mjs"];

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

// What the updater needs to know about this build.
function writeBuildInfo(resources) {
  let pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  let info = {
    version: pkg.version,
    platform,
    firefox: config.firefox.version,
    repo: config.updates?.repo || "",
    publicKey: config.updates?.publicKey || "",
  };
  fs.writeFileSync(
    path.join(resources, "act", "build.json"),
    JSON.stringify(info, null, 2) + "\n"
  );
}

function installActFiles(resources) {
  for (let [from, to] of INSTALL) {
    let target = path.join(resources, to);
    rm(target);
    copy(path.join(SRC, from), target);
  }
  let agentTarget = path.join(resources, AGENT[1]);
  rm(agentTarget);
  copy(path.join(ROOT, AGENT[0]), agentTarget);
  writeBuildInfo(resources);
}

// The brand name and logos live inside browser/omni.ja, which is a zip.
function rebrandOmni(resources) {
  let omni = path.join(resources, "browser", "omni.ja");
  let tmp = fs.mkdtempSync(path.join(os.tmpdir(), "act-omni-"));
  try {
    unzipTo(omni, tmp);
    for (let [inside, ours] of Object.entries(BRAND_FILES)) {
      let target = path.join(tmp, inside);
      if (fs.existsSync(path.dirname(target))) {
        fs.copyFileSync(path.join(BRANDING, ours), target);
      }
    }
    zipContents(tmp, omni);
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
  // CFBundleIconName points at Firefox's icon in Assets.car, and macOS
  // prefers that over CFBundleIconFile. Without it, our act.icns is used.
  run("plutil", ["-remove", "CFBundleIconName", plist], { okCodes: [0, 1], quiet: true });
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
  let icns = path.join(BRANDING, "icons", "act.icns");
  fs.copyFileSync(icns, path.join(layout.resources, "act.icns"));
  // Anything still asking for Firefox's icon by name gets ours too.
  fs.copyFileSync(icns, path.join(layout.resources, "firefox.icns"));
}

// macOS caches app icons. Re-register the app so the Dock and Finder pick
// up the new one.
function refreshIconCache(app) {
  let lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/" +
    "LaunchServices.framework/Support/lsregister";
  run("touch", [app]);
  run(lsregister, ["-f", app], { okCodes: [0, 1], quiet: true });
}

// Window and taskbar icons on Linux and Windows.
function rebrandIcons(layout) {
  let icons = path.join(layout.resources, "browser", "chrome", "icons", "default");
  for (let size of [16, 32, 48, 64, 128]) {
    let target = path.join(icons, `default${size}.png`);
    if (fs.existsSync(target)) {
      fs.copyFileSync(path.join(BRANDING, "icons", `icon${size}.png`), target);
    }
  }
}

function rebrandLinux(layout) {
  let launcher = path.join(layout.app, "act-browser");
  fs.writeFileSync(launcher, '#!/bin/sh\nexec "$(dirname "$(readlink -f "$0")")/firefox" "$@"\n');
  fs.chmodSync(launcher, 0o755);
  fs.copyFileSync(path.join(BRANDING, "icons", "icon256.png"), path.join(layout.app, "act-browser.png"));
  fs.writeFileSync(path.join(layout.app, "act-browser.desktop"), desktopEntry("act-browser"));
}

export function desktopEntry(exec) {
  return [
    "[Desktop Entry]",
    `Name=${config.name}`,
    "GenericName=Web Browser",
    "Comment=Browse the web",
    `Exec=${exec} %u`,
    "Icon=act-browser",
    "Terminal=false",
    "Type=Application",
    "Categories=Network;WebBrowser;",
    "MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;",
    "StartupWMClass=firefox",
    "",
  ].join("\n");
}

// A Windows .ico made of our PNGs (Windows Vista and later read PNG
// entries directly).
export function writeIco(file) {
  let images = [16, 32, 48, 64, 128, 256].map(size => ({
    size,
    data: fs.readFileSync(path.join(BRANDING, "icons", `icon${size}.png`)),
  }));
  let header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  let entries = images.map(({ size, data }) => {
    let entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  fs.writeFileSync(file, Buffer.concat([header, ...entries, ...images.map(i => i.data)]));
}

// rcedit (from the Electron project) swaps an .exe's icon and name.
const RCEDIT_URL = "https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe";

async function rcedit() {
  let exe = path.join(CACHE, "rcedit-x64.exe");
  if (!fs.existsSync(exe)) {
    log("Downloading rcedit…");
    let response = await fetch(RCEDIT_URL);
    if (!response.ok) {
      throw new Error(`Couldn't download rcedit: ${response.status}`);
    }
    fs.writeFileSync(exe, Buffer.from(await response.arrayBuffer()));
  }
  return exe;
}

async function rebrandWindows(layout) {
  let ico = path.join(layout.app, "act.ico");
  writeIco(ico);
  let tool = await rcedit();
  for (let name of ["firefox.exe", "private_browsing.exe"]) {
    let exe = path.join(layout.app, name);
    if (!fs.existsSync(exe)) {
      continue;
    }
    run(tool, [
      exe,
      "--set-icon",
      ico,
      "--set-version-string",
      "ProductName",
      config.name,
      "--set-version-string",
      "FileDescription",
      config.name,
      "--set-version-string",
      "CompanyName",
      config.name,
    ]);
  }
  // Start menu tiles.
  let tiles = path.join(layout.app, "browser", "VisualElements");
  for (let [file, size] of [
    ["VisualElements_150.png", 256],
    ["VisualElements_70.png", 128],
    ["PrivateBrowsing_150.png", 256],
    ["PrivateBrowsing_70.png", 128],
  ]) {
    let target = path.join(tiles, file);
    if (fs.existsSync(target)) {
      fs.copyFileSync(path.join(BRANDING, "icons", `icon${size}.png`), target);
    }
  }
}

export async function build({ outDir = DIST } = {}) {
  requirePlatform();
  let source = await fetchFirefox();
  outDir = path.resolve(outDir);
  let layout = appLayout(outDir);

  log(`Building ${config.name} on Firefox ${config.firefox.version}…`);
  rm(layout.app);
  fs.mkdirSync(outDir, { recursive: true });
  if (isMac) {
    // APFS clones: the copy shares disk space with the cached Firefox until
    // a file changes, so a build costs a lot less than a full copy.
    run("cp", ["-cR", source, layout.app]);
  } else {
    copy(source, layout.app);
  }

  installActFiles(layout.resources);
  await bundleExtensions(layout.resources);
  rebrandOmni(layout.resources);

  if (isMac) {
    rebrandMac(layout);
    log("Signing (ad hoc)…");
    run("xattr", ["-cr", layout.app]);
    run("codesign", ["--force", "--deep", "--sign", "-", layout.app], { quiet: true });
    refreshIconCache(layout.app);
  } else if (isWindows) {
    rebrandIcons(layout);
    await rebrandWindows(layout);
  } else if (isLinux) {
    rebrandIcons(layout);
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
