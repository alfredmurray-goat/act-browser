// Quick sanity check for CI and before committing: every JS file in src/
// and scripts/ has to at least parse. Firefox-only imports aren't resolved.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "./lib.mjs";

function* walk(dir) {
  for (let entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(m?js|cfg)$/.test(entry.name)) {
      yield full;
    }
  }
}

let failed = 0;
for (let dir of ["src", "scripts"]) {
  for (let file of walk(path.join(ROOT, dir))) {
    let source = fs.readFileSync(file, "utf8");
    let isModule = file.endsWith(".mjs");
    let result = spawnSync(
      process.execPath,
      ["--check", isModule ? "--input-type=module" : "--input-type=commonjs"],
      { input: source, encoding: "utf8" }
    );
    if (result.status != 0) {
      failed++;
      console.error(`✗ ${path.relative(ROOT, file)}\n${result.stderr}`);
    }
  }
}

if (failed) {
  console.error(`${failed} file(s) failed to parse`);
  process.exit(1);
}
console.log("All files parse.");
