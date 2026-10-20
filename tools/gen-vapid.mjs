// Erzeugt ein VAPID-Schlüsselpaar für Web Push (P-256, als JWK) und gibt es base64-kodiert aus.
// Verwendet vom Deployment, wenn auf Supabase noch kein Secret VAPID_KEYS existiert.

import { webcrypto } from "node:crypto";

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const exported = {
  publicKey: await subtle.exportKey("jwk", pair.publicKey),
  privateKey: await subtle.exportKey("jwk", pair.privateKey),
};
process.stdout.write(Buffer.from(JSON.stringify(exported)).toString("base64"));
