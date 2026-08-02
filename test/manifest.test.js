// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

test('the manifest declares a weather integration', () => {
  assert.equal(manifest.type, 'weather');
  // A weather provider is a dedicated provider API: no device, no discovery.
  // Anything device-shaped in the manifest would be a copy/paste leftover.
  assert.equal('network_discovery' in manifest, false);
  assert.equal('messaging' in manifest, false);
  assert.equal('contact_schema' in manifest, false);
});

test('the code registers the weather handler the type requires', () => {
  assert.match(indexSource, /gladys\.onWeatherGet\(/);
  // ...and none of the device handlers, which the core never sends here.
  for (const handler of ['onScanRequest', 'onSetValue', 'onPoll', 'onGetImage']) {
    assert.doesNotMatch(
      indexSource,
      new RegExp(`gladys\\.${handler}\\(`),
      `${handler} is not for a weather type`,
    );
  }
});

test('every manifest action has a registered handler', () => {
  for (const action of manifest.actions ?? []) {
    assert.match(
      indexSource,
      new RegExp(`gladys\\.onAction\\('${action.key}'`),
      `manifest action "${action.key}" has no handler`,
    );
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('every stored config field is known to the code', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config field "${field.key}" is missing from DEFAULT_CONFIG`,
    );
  }
});

test('the API key is a secret, and secrets carry no default', () => {
  const apiKey = manifest.config_schema.find((field) => field.key === 'api_key');
  assert.equal(apiKey.type, 'secret', 'the API key must never be sent back to the frontend');
  assert.equal(apiKey.required, true);
  assert.equal(apiKey.default, undefined, 'a secret default would end up published in the store');
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((field) => field.type === 'section');
  assert.ok(sections.length > 0, 'the onboarding needs at least one section block');
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('the manifest version and the docker image tag stay in lockstep', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'the version must be strict semver');
  assert.ok(
    manifest.docker_image.endsWith(`:${manifest.version}`),
    'the image tag must be the version the indexer serves',
  );
});
