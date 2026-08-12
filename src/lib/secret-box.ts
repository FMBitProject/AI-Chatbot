import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Symmetric encryption for secrets we have to be able to read back.
 *
 * This is deliberately NOT the same tool as @/lib/api-key. The keys we issue to
 * customers are only ever *compared*, so those are hashed — a one-way digest we
 * could never reverse even if we wanted to. A BYOK provider key is the opposite
 * problem: we have to hand the original string to Groq/Google on every question,
 * so it must survive the round trip. Hashing is not an option here; encryption
 * with a key held outside the database is.
 *
 * Threat model, stated plainly so the limits are not mistaken for guarantees.
 * What this defends against is a *database* disclosure — a leaked Neon branch, a
 * stolen backup, an over-broad read grant, a `SELECT *` that ends up somewhere it
 * should not. In all of those the ciphertext is useless without BYOK_SECRET_KEY,
 * which lives in the environment and never in a row. What it does NOT defend
 * against is code execution on our own servers: anything that can run inside the
 * app can read the env var and decrypt at will. That is the accepted ceiling, and
 * it is the same one every server-side secret in this repo sits under.
 */

// AES-256-GCM, not AES-CBC and not "encrypt then hope". GCM is authenticated:
// decryption verifies a tag over the ciphertext and fails loudly if a single bit
// was altered. Without that, an attacker with write access to the database could
// flip bits in a stored key and we would happily send the corrupted result to the
// provider — or worse, in other schemes, be steered into decrypting attacker-
// chosen plaintext. "It decrypted" and "it is what we wrote" are different
// claims, and only an AEAD mode makes the second one.
const ALGORITHM = "aes-256-gcm";

// 96 bits is the IV size GCM is specified and optimised for: anything else makes
// the implementation derive one by hashing, which is both slower and outside the
// analysis the mode's security proof covers. It is random per encryption, never
// a counter — see the uniqueness note in `encryptSecret`.
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

// Every stored value carries the scheme that produced it. Today there is exactly
// one, which makes the prefix look like ceremony — it is not. It is what lets a
// future key rotation write "v2:" rows while "v1:" rows are still being read, so
// rotation becomes a background backfill instead of a flag day where every
// customer's chat breaks at once. Adding this later, once the column is full of
// unlabelled ciphertext, means guessing at what produced each row.
const SCHEME = "v1";

/**
 * The master key, resolved on use rather than at import.
 *
 * Deliberately lazy. `next build` imports every module to trace routes, and it
 * runs in environments that legitimately have no secrets — CI, a Docker build
 * layer, a contributor's checkout. A module-level `throw` would turn a missing
 * env var into a failed build with a stack trace pointing at an import, which is
 * a confusing way to learn you forgot a variable. Resolving here means the error
 * arrives at the moment someone actually tries to encrypt, with a message that
 * says what to do about it.
 */
function masterKey(): Buffer {
  const raw = process.env.BYOK_SECRET_KEY;
  if (!raw) {
    throw new Error(
      "BYOK_SECRET_KEY is not set. Generate one with `openssl rand -base64 32` " +
        "and add it to the environment before storing provider API keys.",
    );
  }
  // base64 rather than hex: same 32 bytes in 44 characters instead of 64, and it
  // is what `openssl rand -base64 32` prints, so the documented command and the
  // expected format agree without the operator having to convert anything.
  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    // Buffer.from silently ignores characters it cannot decode, so a truncated
    // or mistyped value does not throw — it yields a short key, and a short key
    // would be rejected by createCipheriv with a message about "invalid key
    // length" that says nothing about which variable is wrong. Checking the
    // length here is what turns that into an actionable error. This is not
    // hypothetical: a Search Console token was once pasted in truncated (34 of
    // 43 characters) and the failure was silent for days.
    throw new Error(
      `BYOK_SECRET_KEY must decode to exactly ${KEY_BYTES} bytes, got ${key.length}. ` +
        "It should be the output of `openssl rand -base64 32`.",
    );
  }
  return key;
}

/** True when `value` is something this module wrote, rather than a legacy plaintext key. */
export function isEncrypted(value: string): boolean {
  const parts = value.split(":");
  return parts.length === 4 && parts[0] === SCHEME;
}

/**
 * Encrypt `plaintext`, binding the result to `context`.
 *
 * `context` is additional authenticated data: it is not stored and not secret,
 * but the tag is computed over it, so a ciphertext only decrypts when the same
 * context is supplied again. We pass `<companyId>:<column>`, which makes two
 * substitutions impossible that the ciphertext alone would allow — moving a row's
 * encrypted key into another company's row, and moving the Gemini key into the
 * Groq column. Neither is a headline attack (both need database write access
 * already) but both are free to prevent, and the second is just as likely to
 * happen by accident during a migration as on purpose.
 */
export function encryptSecret(plaintext: string, context: string): string {
  // Random per call, never reused. GCM's one hard requirement is that an
  // (key, IV) pair encrypts at most one message: repeat it and the keystream
  // repeats too, which leaks the XOR of the two plaintexts and — far worse for
  // GCM specifically — can expose the authentication subkey, letting an attacker
  // forge tags. 96 random bits give a negligible collision chance at the number
  // of keys this table will ever hold.
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SCHEME, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/**
 * Decrypt a value produced by `encryptSecret`.
 *
 * A value that is not in our format is returned unchanged, and that is load-
 * bearing rather than sloppy: the column holds plaintext keys written before this
 * module existed, and the migration that encrypts them runs separately from the
 * deploy that ships this code. Tolerating both shapes is what lets those two
 * happen in either order without a window where every BYOK customer's chat is
 * broken. Once the backfill has run the branch is dead weight — but leaving it in
 * costs nothing, and removing it early costs an outage.
 */
export function decryptSecret(stored: string, context: string): string {
  if (!isEncrypted(stored)) return stored;

  const [, ivB64, tagB64, ciphertextB64] = stored.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  // Checked before handing them to Node: setAuthTag on a wrong-sized tag throws a
  // generic error, and a short IV is accepted outright and silently decrypts to
  // garbage that then fails the tag check anyway. Failing here names the real
  // problem — the stored value is malformed, not the key.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Stored secret is malformed: unexpected IV or tag length.");
  }

  const decipher = createDecipheriv(ALGORITHM, masterKey(), iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  // `final()` is where the tag is verified, so it must not be skipped — the
  // output of `update()` alone is unauthenticated plaintext. It throws
  // "Unsupported state or unable to authenticate data" for a wrong key, a wrong
  // context, or a tampered row alike; the caller cannot tell those apart, and
  // deliberately so.
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
