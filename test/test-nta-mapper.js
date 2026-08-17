'use strict';
// Unit test for lib/ntaMapper.js's department->team classification — a pure function, no
// network needed. Confirms the mapping decided during the Jira->NTA migration: Dev->eng,
// Infra->infra, QA->qa, Migration->ent/smb (split via the email roster), everything else
// (Migration-Customer/Pre-Sales/null/unknown) -> 'other'.

const assert = require('assert');
const C = require('../shared/constants');
const ntaMapper = require('../lib/ntaMapper');

function makeRaw(department, email) {
  return {
    key: 'L1BOAR-1', summary: 'test', type: 'bug', priority: 'medium',
    status: { name: 'Open', category: 'todo' },
    spaceKey: 'TESTIN', spaceName: 'CloudFuze Board',
    assignee: email ? { email, displayName: 'Test User' } : null,
    reporter: null, current_department: department,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-02T00:00:00.000Z', resolvedAt: null,
    dueDate: null, description: '', rootCause: '', fixDescription: '',
    attachments: [], comments: [], sla_breached: false,
  };
}

function run() {
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Dev', null)).teamKey, 'eng', 'Dev -> eng');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Infra', null)).teamKey, 'infra', 'Infra -> infra');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('QA', null)).teamKey, 'qa', 'QA -> qa');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Migration-Customer', null)).teamKey, 'other', 'Migration-Customer -> other');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Pre-Sales', null)).teamKey, 'other', 'Pre-Sales -> other');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw(null, null)).teamKey, 'other', 'null department -> other');

  const entEmail = C.TEAMS.ent[0];
  const smbEmail = C.TEAMS.smb[0];
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Migration', entEmail)).teamKey, 'ent', 'Migration + ENT roster email -> ent');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Migration', smbEmail)).teamKey, 'smb', 'Migration + SMB roster email -> smb');
  assert.strictEqual(ntaMapper.mapIssue(makeRaw('Migration', 'nobody@cloudfuze.com')).teamKey, 'other', 'Migration + unrostered email -> other');

  const mapped = ntaMapper.mapIssue(makeRaw('QA', 'nobody@cloudfuze.com'));
  assert.strictEqual(mapped.key, 'L1BOAR-1');
  assert.strictEqual(mapped.fields.status.category, 'todo');
  assert.strictEqual(mapped.rb, false);
  assert.strictEqual(mapped.frb, null);

  console.log('PASS: all ntaMapper department->team classifications correct');
}

run();
