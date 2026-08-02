import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { clearCache, getWeather, normalizeOptions } from '../src/weather.js';
import { CURRENT_WEATHER, FORECAST } from './fixtures/free.js';
import { ONE_CALL } from './fixtures/oneCall.js';

const realFetch = globalThis.fetch;

// Every URL the code under test requested, in order.
let requestedUrls = [];

/**
 * Stub `fetch` with a router keyed by the OpenWeather path.
 * @param {Record<string, object>} responsesByPath the payload of each path
 */
function stubFetch(responsesByPath) {
  globalThis.fetch = async (url) => {
    requestedUrls.push(url);
    const { pathname } = new URL(url);
    const body = responsesByPath[pathname];
    if (body === undefined) {
      return { ok: false, status: 404 };
    }
    return { ok: true, json: async () => body };
  };
}

const FREE_RESPONSES = {
  '/data/2.5/weather': CURRENT_WEATHER,
  '/data/2.5/forecast': FORECAST,
};

const OPTIONS = { latitude: 48.8566, longitude: 2.3522, language: 'fr', units: 'metric' };

beforeEach(() => {
  requestedUrls = [];
  clearCache();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearCache();
});

test('normalizeOptions fills the defaults of a weather request', () => {
  assert.deepEqual(normalizeOptions({ latitude: 1, longitude: 2 }), {
    latitude: 1,
    longitude: 2,
    language: 'en',
    units: 'metric',
  });
  assert.equal(normalizeOptions({ units: 'us' }).units, 'us');
  assert.equal(normalizeOptions({ units: 'imperial' }).units, 'metric');
  assert.equal(normalizeOptions().language, 'en');
});

test('getWeather calls the free API and returns the pivot format', async () => {
  stubFetch(FREE_RESPONSES);
  const weather = await getWeather(normalizeConfig({ api_key: 'abc123' }), OPTIONS);

  assert.equal(weather.temperature, 21.53);
  assert.equal(weather.weather, WEATHER_CONDITIONS.RAIN);
  assert.equal(weather.hours.length, 8);
  assert.equal(weather.days.length, 2);
  assert.equal(requestedUrls.length, 2);
});

test('getWeather passes the coordinates, the language, the units and the key', async () => {
  stubFetch(FREE_RESPONSES);
  await getWeather(normalizeConfig({ api_key: 'abc123' }), { ...OPTIONS, units: 'us' });

  const url = new URL(requestedUrls[0]);
  assert.equal(url.searchParams.get('lat'), '48.8566');
  assert.equal(url.searchParams.get('lon'), '2.3522');
  assert.equal(url.searchParams.get('lang'), 'fr');
  // OpenWeather calls the pivot's `us` system `imperial`.
  assert.equal(url.searchParams.get('units'), 'imperial');
  assert.equal(url.searchParams.get('appid'), 'abc123');
});

test('getWeather calls One Call when the user subscribed to it', async () => {
  stubFetch({ '/data/3.0/onecall': ONE_CALL });
  const config = normalizeConfig({ api_key: 'abc123', api_version: '3.0' });
  const weather = await getWeather(config, OPTIONS);

  assert.equal(requestedUrls.length, 1);
  assert.match(requestedUrls[0], /\/data\/3\.0\/onecall/);
  assert.equal(weather.alerts.length, 2);
  assert.equal(weather.uv_index, 5.3);
});

test('a second request for the same place is served from the cache', async () => {
  stubFetch(FREE_RESPONSES);
  const config = normalizeConfig({ api_key: 'abc123', cache_duration: 600 });

  const first = await getWeather(config, OPTIONS, 1000);
  const second = await getWeather(config, OPTIONS, 1000 + 599_000);
  assert.equal(second, first);
  assert.equal(requestedUrls.length, 2, 'OpenWeather must have been called only once');

  await getWeather(config, OPTIONS, 1000 + 601_000);
  assert.equal(requestedUrls.length, 4, 'the expired entry must be refreshed');
});

test('the cache separates the unit systems and the languages', async () => {
  stubFetch(FREE_RESPONSES);
  const config = normalizeConfig({ api_key: 'abc123' });

  await getWeather(config, OPTIONS, 1000);
  await getWeather(config, { ...OPTIONS, units: 'us' }, 1000);
  await getWeather(config, { ...OPTIONS, language: 'en' }, 1000);
  assert.equal(requestedUrls.length, 6, 'each variant is its own cache entry');
});

test('a zero cache duration always calls OpenWeather', async () => {
  stubFetch(FREE_RESPONSES);
  const config = normalizeConfig({ api_key: 'abc123', cache_duration: 0 });

  await getWeather(config, OPTIONS, 1000);
  await getWeather(config, OPTIONS, 1000);
  assert.equal(requestedUrls.length, 4);
});

test('getWeather fails with an actionable message when the key is missing', async () => {
  stubFetch(FREE_RESPONSES);
  await assert.rejects(() => getWeather(normalizeConfig(), OPTIONS), /API key is missing/);
  assert.equal(requestedUrls.length, 0, 'no point calling OpenWeather without a key');
});

test('getWeather fails when Gladys asks without usable coordinates', async () => {
  stubFetch(FREE_RESPONSES);
  const config = normalizeConfig({ api_key: 'abc123' });
  await assert.rejects(() => getWeather(config, { latitude: 'nope' }), /coordinates/);
});

test('a rejected API key surfaces as an explicit error', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  const config = normalizeConfig({ api_key: 'wrong' });
  await assert.rejects(() => getWeather(config, OPTIONS), /HTTP 401/);
});

test('an exceeded quota surfaces as an explicit error', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  const config = normalizeConfig({ api_key: 'abc123' });
  await assert.rejects(() => getWeather(config, OPTIONS), /quota exceeded/);
});

test('an answer without a usable temperature is refused, never cached', async () => {
  stubFetch({ '/data/2.5/weather': { weather: [], main: {} }, '/data/2.5/forecast': FORECAST });
  const config = normalizeConfig({ api_key: 'abc123' });
  await assert.rejects(() => getWeather(config, OPTIONS), /usable temperature/);

  stubFetch(FREE_RESPONSES);
  const weather = await getWeather(config, OPTIONS);
  assert.equal(weather.temperature, 21.53);
});
