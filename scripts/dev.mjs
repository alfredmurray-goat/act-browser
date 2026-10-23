// Runs Act Browser for development.
//
// Builds into .cache/dev the first time, then copies src/ into it on every
// start, so restarting is enough to pick up your changes. Uses its own
// profile in .cache/dev-profile.
//
//   npm run dev                 start
//   npm run dev -- --rebuild    rebuild the app first (after branding changes,
//                               a Firefox version bump...)
//   npm run dev -- --fresh      start with a new, empty profile
//
// Anything else is passed on to Firefox, e.g. `npm run dev -- --jsconsole`.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { build } from "./build.mjs";
import { CACHE, ROOT, SRC, appLayout, copy, log, rm } from "./lib.mjs";

const DEV_DIR = path.join(CACHE, "dev");
const PROFILE = path.join(CACHE, "dev-profile");

// Same list as build.mjs installs, minus the policies.
const SOURCES = [
  [path.join(SRC, "act"), "act"],
  [path.join(SRC, "act.cfg"), "act.cfg"],
  [
    path.join(SRC, "browser/defaults/preferences/act-prefs.js"),
    "browser/defaults/preferences/act-prefs.js",
  ],
  [path.join(ROOT, "agent"), "agent"],
];

// Copied fresh on every start rather than linked: pages like the new tab run
// in sandboxed content processes, which may only read files inside the app.
function syncSources(resources) {
  for (let [from, to] of SOURCES) {
    let target = path.join(resources, to);
    rm(target);
    copy(from, target);
  }
}

let args = process.argv.slice(2);
let rebuild = args.includes("--rebuild");
let fresh = args.includes("--fresh");
let passthrough = args.filter(a => a != "--rebuild" && a != "--fresh");

let layout = appLayout(DEV_DIR);
if (rebuild || !fs.existsSync(layout.binary)) {
  // Sources are copied in after signing. Running the binary directly
  // doesn't check the bundle seal.
  layout = await build({ outDir: DEV_DIR });
}
syncSources(layout.resources);

if (fresh) {
  rm(PROFILE);
}
fs.mkdirSync(PROFILE, { recursive: true });

// A dev profile doesn't need a disk cache.
fs.writeFileSync(
  path.join(PROFILE, "user.js"),
  'user_pref("browser.cache.disk.enable", false);\n'
);

log("Starting Act Browser (dev profile)…");
let child = spawn(
  layout.binary,
  ["-profile", PROFILE, "-no-remote", "-purgecaches", ...passthrough],
  {
    stdio: "inherit",
    env: { ...process.env, MOZ_CRASHREPORTER_DISABLE: "1" },
  }
);
child.on("exit", code => process.exit(code ?? 0));
