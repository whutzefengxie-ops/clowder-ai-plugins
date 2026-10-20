import assert from 'node:assert/strict';
import test from 'node:test';
import { retryableGitError } from '../src/process.mjs';

test('read-only git helpers retry transient 128 failures but not ordinary nonzero exits', () => {
  assert.equal(retryableGitError({ code: 'COMMAND_FAILED', details: { exitCode: 128 } }), true);
  assert.equal(retryableGitError({ code: 'NETWORK_FAILED' }), true);
  assert.equal(retryableGitError({ code: 'COMMAND_TIMEOUT' }), true);
  assert.equal(retryableGitError({ code: 'COMMAND_FAILED', details: { exitCode: 1 } }), false);
  assert.equal(retryableGitError({ code: 'HTTPS_AUTH_FAILED' }), false);
});
