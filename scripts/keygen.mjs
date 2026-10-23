// Creates the key that signs Act Browser updates. Run it once:
//
//   npm run keygen
//
// The private key goes to ~/.config/act-browser/update-key.pem and never
// into the repo. The public key is written into act.config.json, every
// build carries it and refuses updates that weren't signed with the
// private one.
//
// For the GitHub release workflow, store the private key as a secret:
//
//   gh secret set ACT_UPDATE_KEY < ~/.config/act-browser/update-key.pem

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, fail, log } from "./lib.mjs";

export const KEY_FILE = path.join(os.homedir(), ".config", "act-browser", "update-key.pem");

export function publicKeyBase64(privateKeyPem) {
  let jwk = crypto.createPublicKey(privateKeyPem).export({ format: "jwk" });
  return Buffer.from(jwk.x, "base64url").toString("base64");
}

if (fs.existsSync(KEY_FILE) && !process.argv.includes("--force")) {
  fail(
    `${KEY_FILE} already exists. Builds out there trust that key, replacing ` +
      "it means they can't update any more. Use --force if you really mean it."
  );
}

let { privateKey } = crypto.generateKeyPairSync("ed25519");
let pem = privateKey.export({ format: "pem", type: "pkcs8" });
fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true, mode: 0o700 });
fs.writeFileSync(KEY_FILE, pem, { mode: 0o600 });

let configPath = path.join(ROOT, "act.config.json");
let config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.updates = { ...config.updates, publicKey: publicKeyBase64(pem) };
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

log(`Private key: ${KEY_FILE} (keep it safe, don't commit it)`);
log(`Public key added to act.config.json: ${config.updates.publicKey}`);
log("For GitHub releases: gh secret set ACT_UPDATE_KEY < " + KEY_FILE);
