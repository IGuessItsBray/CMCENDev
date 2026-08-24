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

test('runs only for pull requests to main with Node 24 and cached Docker builds', () => {
  assert.equal(workflow.on.push, undefined);
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

  const buildxSetup = workflow.jobs['docker-build'].steps.find(
    (step) => step.uses === 'docker/setup-buildx-action@v3',
  );
  const dockerCache = workflow.jobs['docker-build'].steps.find(
    (step) => step.name === 'Restore Docker build cache',
  );
  const dockerBuild = workflow.jobs['docker-build'].steps.find(
    (step) => step.name === 'Build production image',
  );

  assert.ok(buildxSetup);
  assert.equal(dockerCache.uses, 'actions/cache@v4');
  assert.equal(dockerCache.with.path, '/tmp/.buildx-cache');
  assert.match(dockerCache.with.key, /server\/package-lock\.json/u);
  assert.match(dockerBuild.run, /docker buildx build/u);
  assert.match(dockerBuild.run, /--cache-from type=local/u);
  assert.match(dockerBuild.run, /--cache-to type=local/u);

  const cacheRefresh = workflow.jobs['docker-build'].steps.find(
    (step) => step.name === 'Refresh Docker build cache',
  );

  assert.equal(cacheRefresh.if, 'success()');
  assert.match(cacheRefresh.run, /\.buildx-cache-new/u);
});
