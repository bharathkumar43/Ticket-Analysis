'use strict';
// Mocked-response test for ntaClient's pagination logic (Neutara Ticketing's page/limit style,
// as opposed to Jira's startAt/maxResults). Stubs out the `https` module's request/response
// cycle to feed ntaClient.searchAll() a fake multi-page response shape and asserts the
// pagination loop (page/totalPages) aggregates every page correctly, respects a maxResults
// cap, and countOnly() returns the right total without paging through issue bodies.

const assert = require('assert');
const Module = require('module');

// Build a fake dataset: 250 issues total, served back 200 at a time (ntaClient's page size).
const TOTAL_ISSUES = 250;
const PAGE_SIZE = 200;
function makeIssue(i) {
  return { key: `TEST-${i}`, summary: `Issue ${i}`, status: { name: 'Open', category: 'todo' } };
}
const ALL_ISSUES = Array.from({ length: TOTAL_ISSUES }, (_, i) => makeIssue(i + 1));

// Intercept require('https') before lib/ntaClient.js loads it, so no real network call is
// ever made — this keeps the test hermetic and fast.
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'https') {
    return {
      request(url, options, callback) {
        const req = {
          on(event, handler) { if (event === 'error') { /* no-op */ } return req; },
          write(chunk) { /* GET requests carry no body */ },
          end() {
            const page = parseInt(url.searchParams.get('page') || '1', 10);
            const limit = parseInt(url.searchParams.get('limit') || String(PAGE_SIZE), 10);
            const startAt = (page - 1) * limit;
            const pageIssues = ALL_ISSUES.slice(startAt, startAt + limit);
            const totalPages = Math.max(1, Math.ceil(TOTAL_ISSUES / (limit || 1)));
            const res = {
              statusCode: 200,
              on(event, handler) {
                if (event === 'data') {
                  const payload = JSON.stringify({ issues: pageIssues, total: TOTAL_ISSUES, page, totalPages });
                  handler(payload);
                } else if (event === 'end') {
                  setImmediate(handler);
                }
              },
            };
            setImmediate(() => callback(res));
          },
        };
        return req;
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

const ntaClient = require('../lib/ntaClient');

async function run() {
  // 1. searchAll should page through page/totalPages until every issue is fetched.
  const result = await ntaClient.searchAll({
    baseUrl: 'https://example.cftools.live/api', apiKey: 'fake-key', filters: { spaceKey: 'TEST' },
  });
  assert.strictEqual(result.issues.length, TOTAL_ISSUES, `Expected all ${TOTAL_ISSUES} issues to be paginated through, got ${result.issues.length}`);
  assert.strictEqual(result.total, TOTAL_ISSUES, 'Expected total to match TOTAL_ISSUES');
  assert.strictEqual(result.issues[0].key, 'TEST-1');
  assert.strictEqual(result.issues[TOTAL_ISSUES - 1].key, `TEST-${TOTAL_ISSUES}`);
  console.log('PASS: searchAll aggregates all pages (', result.issues.length, 'issues )');

  // 2. maxResults should cap the aggregated result short of the full total.
  const capped = await ntaClient.searchAll({
    baseUrl: 'https://example.cftools.live/api', apiKey: 'fake-key', filters: { spaceKey: 'TEST' }, maxResults: 120,
  });
  assert.strictEqual(capped.issues.length, 120, `Expected maxResults cap of 120, got ${capped.issues.length}`);
  console.log('PASS: searchAll respects maxResults cap (', capped.issues.length, 'issues )');

  // 3. countOnly should return the total without needing to page through issue bodies.
  const count = await ntaClient.countOnly({
    baseUrl: 'https://example.cftools.live/api', apiKey: 'fake-key', filters: { spaceKey: 'TEST' },
  });
  assert.strictEqual(count.total, TOTAL_ISSUES, `Expected countOnly total to be ${TOTAL_ISSUES}, got ${count.total}`);
  console.log('PASS: countOnly returns correct total (', count.total, ')');

  console.log('\nAll NTA pagination tests passed.');
}

run().catch((e) => {
  console.error('FAIL:', e);
  process.exitCode = 1;
});
