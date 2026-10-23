// Runs Act Browser for development.
//
// Builds into .cache/dev the first time, then links the installed act/
// folder and prefs back to src/, so a browser restart is enough to pick up
// your changes. Uses its own profile in .cache/dev-profile.
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
import { CACHE, SRC, appLayout, log, rm } from "./lib.mjs";

const DEV_DIR = path.join(CACHE, "dev");
const PROFILE = path.join(CACHE, "dev-profile");

// Same list as build.mjs installs, minus the policies (copied is fine).
const LINKS = [
  ["act", "act"],
  ["act.cfg", "act.cfg"],
  ["browser/defaults/preferences/act-prefs.js", "browser/defaults/preferences/act-prefs.js"],
];

function linkSources(resources) {
  for (let [from, to] of LINKS) {
    let target = path.join(resources, to);
    rm(target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(path.join(SRC, from), target);
  }
}

let args = process.argv.slice(2);
let rebuild = args.includes("--rebuild");
let fresh = args.includes("--fresh");
let passthrough = args.filter(a => a != "--rebuild" && a != "--fresh");

let layout = appLayout(DEV_DIR);
if (rebuild || !fs.existsSync(layout.binary)) {
  // Symlinks go in after signing, codesign doesn't like links that point
  // outside the bundle. Running the binary directly doesn't check the seal.
  layout = await build({ outDir: DEV_DIR });
}
linkSources(layout.resources);

if (fresh) {
  rm(PROFILE);
}
fs.mkdirSync(PROFILE, { recursive: true });

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
