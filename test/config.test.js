import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_VERSIONS, DEFAULT_CONFIG, isConfigured, normalizeConfig } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig keeps the user values over the defaults', () => {
  const config = normalizeConfig({ api_key: 'abc123', api_version: '3.0', cache_duration: 120 });
  assert.equal(config.api_key, 'abc123');
  assert.equal(config.api_version, API_VERSIONS.ONE_CALL);
  assert.equal(config.cache_duration, 120);
});

test('normalizeConfig trims the API key pasted from the OpenWeather dashboard', () => {
  assert.equal(normalizeConfig({ api_key: '  abc123\n' }).api_key, 'abc123');
});

test('normalizeConfig falls back to the free API for any unknown version', () => {
  assert.equal(normalizeConfig({ api_version: '4.2' }).api_version, API_VERSIONS.FREE);
  assert.equal(normalizeConfig({ api_version: undefined }).api_version, API_VERSIONS.FREE);
  assert.equal(normalizeConfig({ api_version: 3 }).api_version, API_VERSIONS.FREE);
});

test('normalizeConfig coerces and clamps the cache duration coming from the form', () => {
  assert.equal(normalizeConfig({ cache_duration: '900' }).cache_duration, 900);
  assert.equal(normalizeConfig({ cache_duration: -10 }).cache_duration, 0);
  assert.equal(normalizeConfig({ cache_duration: 99999 }).cache_duration, 3600);
  assert.equal(
    normalizeConfig({ cache_duration: 'nope' }).cache_duration,
    DEFAULT_CONFIG.cache_duration,
  );
});

test('isConfigured only accepts a non-empty API key', () => {
  assert.equal(isConfigured(normalizeConfig()), false);
  assert.equal(isConfigured(normalizeConfig({ api_key: '   ' })), false);
  assert.equal(isConfigured(normalizeConfig({ api_key: 'abc123' })), true);
});
