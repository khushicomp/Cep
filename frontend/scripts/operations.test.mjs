import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayStatus, filterBranches, reportingProgress, reasonError, reportStates } from '../src/utils/operations.js';
import { formatBusinessAmount } from '../src/utils/businessAmount.js';

test('friendly lifecycle labels preserve draft/submitted/final and pending distinctions', () => {
  for (const state of Object.keys(reportStates)) assert.equal(displayStatus(state), state);
  assert.equal(displayStatus(' submitted ', true), 'CORRECTION_PENDING');
  assert.equal(displayStatus('SUBMITTED', '1'), 'CORRECTION_PENDING');
  assert.equal(displayStatus('FINAL_LOCKED', true), 'FINAL_LOCKED');
  assert.equal(displayStatus('DRAFT', true), 'DRAFT');
});
test('unrecognized and absent states are explicit, never mislabeled as drafts', () => {
  for (const value of [null, '', 'unexpected', 'toString', '__proto__']) assert.equal(displayStatus(value), 'UNKNOWN');
});
const rows = [
  { branch_id: 1, branch_name: 'North Branch', branch_code: 'AK01', display_status: 'SUBMITTED', total_amount: '100.00' },
  { branch_id: 2, branch_name: 'South Branch', branch_code: 'AK02', display_status: 'CORRECTION_PENDING', total_amount: '200.00' },
  { branch_id: 3, branch_name: 'North Office', branch_code: 'AK03', display_status: 'NOT_STARTED', total_amount: '0.00' },
  { branch_id: 4, branch_name: 'Central', branch_code: 'AK04', display_status: 'UNKNOWN', total_amount: '0.00' },
];
test('branch search is case insensitive, trimmed, and searches names and codes', () => {
  assert.deepEqual(filterBranches(rows, ' NORTH ').map(row => row.branch_id), [1, 3]);
  assert.deepEqual(filterBranches(rows, 'ak02').map(row => row.branch_id), [2]);
  assert.equal(filterBranches(rows, 'no match').length, 0);
});
test('status filters intersect search; unknown remains discoverable', () => {
  assert.deepEqual(filterBranches(rows, 'north', 'SUBMITTED').map(row => row.branch_id), [1]);
  assert.deepEqual(filterBranches(rows, '', 'UNKNOWN').map(row => row.branch_id), [4]);
  assert.deepEqual(filterBranches(rows, '', 'NOT_STARTED').map(row => row.branch_id), [3]);
  assert.equal(filterBranches(rows, '', 'FINAL_LOCKED').length, 0);
});
test('filtering never mutates source order, amounts or report states', () => {
  const before = JSON.stringify(rows);
  filterBranches(rows, 'AK', 'CORRECTION_PENDING');
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(filterBranches(rows), rows);
});
test('progress uses reports entered, including drafts; zero branches is safe', () => {
  assert.deepEqual(reportingProgress({ totalBranches: 38, reportedBranches: 19, finalLocked: 2 }), { total: 38, reported: 19, percent: 50 });
  assert.deepEqual(reportingProgress({ totalBranches: 0, reportedBranches: 0 }), { total: 0, reported: 0, percent: 0 });
  assert.equal(reportingProgress({ totalBranches: 38, reportedBranches: 99 }).percent, 100);
});
test('dialog reasons enforce trimmed 1–1000 Unicode code points', () => {
  assert.ok(reasonError(' \n '));
  assert.equal(reasonError(' valid reason '), '');
  assert.equal(reasonError('😀'.repeat(1000)), '');
  assert.ok(reasonError('a'.repeat(1001)));
});
test('financial presentation retains exact API cents and Indian grouping', () => {
  assert.equal(formatBusinessAmount('1234567890123456.78'), '1,23,45,67,89,01,23,456.78');
  assert.equal(formatBusinessAmount('0'), '0.00');
});
