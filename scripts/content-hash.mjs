import { createHash } from 'node:crypto';

const textFile = /\.(?:json|md|svg|css|html|js|ts|txt|ya?ml)$/i;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Preserve historical revisions while accepting only Git's LF/CRLF checkout conversion. */
export function matchesContentHash(bytes, expected, filename) {
  if (sha256(bytes) === expected) return true;
  if (!textFile.test(filename)) return false;
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) return false;
  const lf = text.replaceAll('\r\n', '\n');
  return sha256(lf) === expected || sha256(lf.replaceAll('\n', '\r\n')) === expected;
}
