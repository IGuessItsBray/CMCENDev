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

test('runs only the Node 24 test suite for pull requests to main', () => {
  assert.equal(workflow.on.push, undefined);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assert.deepEqual(Object.keys(workflow.jobs), ['test']);

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

  const runTests = workflow.jobs.test.steps.find(
    (step) => step.name === 'Run tests',
  );
  assert.equal(runTests.run, 'npm test');
  assert.doesNotMatch(JSON.stringify(workflow.jobs), /docker/iu);
});

test('builds and pushes the container image only for release tags', () => {
  const releaseWorkflow = YAML.parse(
    fs.readFileSync(
      path.join(path.dirname(workflowPath), 'publish-release.yml'),
      'utf8',
    ),
  );

  assert.deepEqual(releaseWorkflow.on, { push: { tags: ['v*'] } });

  const steps = releaseWorkflow.jobs['publish-release'].steps;
  const build = steps.find(
    (step) => step.name === 'Build release container image',
  );
  const push = steps.find(
    (step) => step.name === 'Push release container image',
  );

  assert.match(build.run, /docker build/u);
  assert.match(push.run, /docker push/u);
  assert.ok(steps.indexOf(build) < steps.indexOf(push));
});
