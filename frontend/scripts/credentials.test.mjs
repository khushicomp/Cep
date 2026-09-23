import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passwordError, recoveryToken } from '../src/utils/credentials.js';
test('credential form validates confirmation, passphrases and Unicode bytes',()=>{
  for(const password of ['a long calm river passphrase','ab'.repeat(36),'é'.repeat(36),'😀'.repeat(18)])assert.equal(passwordError(password,password),'');
  for(const password of ['short','é'.repeat(37),'😀'.repeat(19),' '.repeat(20)])assert.notEqual(passwordError(password,password),'');
  assert.notEqual(passwordError('a long calm river passphrase','different'),'');
});
test('recovery only accepts bounded URL-safe fragment tokens',()=>{
  assert.equal(recoveryToken('#token='+'a'.repeat(43)).length,43);
  for(const fragment of ['', '#token=short','#token='+'a'.repeat(44),'#token=../bad'])assert.equal(recoveryToken(fragment),'');
});
test('unauthenticated recovery client has no session/interceptor dependency',()=>{
  const source=readFileSync(new URL('../src/services/recoveryApi.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/localStorage|interceptors\.|from ['"].*auth|from ['"].*\/api/);
  const page=readFileSync(new URL('../src/pages/CredentialRecovery.jsx',import.meta.url),'utf8');
  assert.doesNotMatch(page,/localStorage|sessionStorage/);assert.match(page,/history.replaceState/);assert.match(page,/no-referrer/);
});
