const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const YAML = require('yaml');

const workflowPath = path.resolve(
  __dirname,
  '..',
  '..',
  '.forgejo',
  'workflows',
  'tests.yml',
);
const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));

test('uses the runner-provided Node 24 runtime without setup-node or npm caching', () => {
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);

  const setupNode = workflow.jobs.test.steps.find(
    (step) => step.uses === 'actions/setup-node@v4',
  );
  const runtimeCheck = workflow.jobs.test.steps.find(
    (step) => step.name === 'Verify Node.js 24 runtime',
  );

  assert.equal(workflow.jobs.test.name, 'Node.js 24 test suite');
  assert.equal(setupNode, undefined);
  assert.match(runtimeCheck.run, /process\.versions\.node/u);
  assert.match(runtimeCheck.run, /!== '24'/u);
});
