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

test('runs the current Node version without the incompatible Forgejo npm cache', () => {
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);

  const setupNode = workflow.jobs.test.steps.find(
    (step) => step.uses === 'actions/setup-node@v4',
  );
  assert.equal(workflow.jobs.test.name, 'Node.js 24 test suite');
  assert.equal(setupNode.with['node-version-file'], '.nvmrc');
  assert.equal(Object.hasOwn(setupNode.with, 'cache'), false);
  assert.equal(Object.hasOwn(setupNode.with, 'cache-dependency-path'), false);
});
