import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submenuTop } from './modelMenuPosition';
test('submenu opens beside its owning row, not at a shared bottom edge', () => {
  assert.equal(submenuTop(240, 120, 0, 720), 240);
  assert.equal(submenuTop(300, 120, 0, 720), 300);
});
test('large submenu and scrolled visual viewport clamp within visible bounds', () => {
  assert.equal(submenuTop(650, 300, 0, 720), 412);
  assert.equal(submenuTop(30, 120, 100, 400), 108);
});
