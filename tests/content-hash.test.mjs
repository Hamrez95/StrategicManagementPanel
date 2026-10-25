import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { matchesContentHash } from '../scripts/content-hash.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

test('LF and CRLF checkouts retain historical content revisions in either direction', () => {
  const lf = Buffer.from('{\n  "title": "نیاز مشتری",\n  "id": "L01"\n}\n');
  const crlf = Buffer.from(lf.toString().replaceAll('\n', '\r\n'));
  assert.equal(matchesContentHash(lf, digest(crlf), 'course.v1.json'), true);
  assert.equal(matchesContentHash(crlf, digest(lf), 'course.v1.json'), true);
  assert.equal(matchesContentHash(lf, digest(lf), 'course.v1.json'), true);
  assert.equal(
    matchesContentHash(
      Buffer.from(lf.toString().replace('L01', 'L02')),
      digest(crlf),
      'course.v1.json',
    ),
    false,
  );
});

test('binary media remain byte-exact and invalid UTF-8 cannot be repaired into a valid digest', () => {
  const original = Buffer.from([0, 13, 10, 255]);
  assert.equal(matchesContentHash(original, digest(original), 'visual.png'), true);
  assert.equal(
    matchesContentHash(Buffer.from([0, 10, 255]), digest(original), 'visual.png'),
    false,
  );
  const invalid = Buffer.from([0xff, 10]);
  const repaired = Buffer.from(invalid.toString('utf8').replaceAll('\n', '\r\n'));
  assert.equal(matchesContentHash(invalid, digest(repaired), 'course.json'), false);
});
