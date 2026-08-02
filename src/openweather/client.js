// -----------------------------------------------------------------------------
// The only place that talks to OpenWeather over HTTP.
//
// Node 20+ provides `fetch` natively: no HTTP dependency needed (the internal
// Gladys service used axios; the external one does not have to).
//
// Errors are propagated with a message the user can act on: it is displayed
// under the "Test the connection" button, and it is what the SDK acks back to
// Gladys when a weather request fails — the core then falls through to the next
// weather provider.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { API_VERSIONS } from '../config.js';
import { toOpenWeatherUnits } from './units.js';

const logger = createLogger({ name: 'openweather-api' });

const BASE_URL = 'https://api.openweathermap.org';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Build a request URL, keeping the API key out of the query string we log.
 * @param {string} path the OpenWeather path, e.g. '/data/2.5/weather'
 * @param {Record<string, string|number>} params the query parameters
 * @param {string} apiKey the OpenWeather API key
 */
function buildUrl(path, params, apiKey) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const loggableUrl = url.toString();
  url.searchParams.set('appid', apiKey);
  return { url: url.toString(), loggableUrl };
}

/**
 * Turn an OpenWeather HTTP failure into a message the user can act on.
 * @param {number} status the HTTP status code
 * @param {string} path the OpenWeather path that was called
 */
function describeHttpError(status, path) {
  if (status === 401) {
    return 'OpenWeather rejected the API key (HTTP 401). Check it, and remember a new key takes up to a couple of hours to become active.';
  }
  if (status === 404) {
    return `OpenWeather does not serve ${path} for this account (HTTP 404).`;
  }
  if (status === 429) {
    return 'OpenWeather quota exceeded (HTTP 429). Raise the cache duration, or upgrade your plan.';
  }
  return `OpenWeather HTTP ${status} on ${path}`;
}

/**
 * Perform one GET request and parse the JSON body.
 * @param {string} path the OpenWeather path
 * @param {Record<string, string|number>} params the query parameters
 * @param {string} apiKey the OpenWeather API key
 */
async function getJson(path, params, apiKey) {
  const { url, loggableUrl } = buildUrl(path, params, apiKey);
  logger.debug(`OpenWeather request -> ${loggableUrl}`);

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(describeHttpError(response.status, path));
  }
  return response.json();
}

/**
 * Read the free API: current conditions + the 3-hourly forecast over 5 days.
 * Two calls, exactly like the internal Gladys service does.
 * @param {{apiKey: string, latitude: number, longitude: number, language: string, units: string}} request
 */
export async function fetchFreeWeather({ apiKey, latitude, longitude, language, units }) {
  const params = {
    lat: latitude,
    lon: longitude,
    lang: language,
    units: toOpenWeatherUnits(units),
  };
  const [current, forecast] = await Promise.all([
    getJson('/data/2.5/weather', params, apiKey),
    getJson('/data/2.5/forecast', params, apiKey),
  ]);
  return { current, forecast };
}

/**
 * Read the One Call 3.0 API: everything in a single call, alerts included.
 * `minutely` is excluded — the pivot format has no minute-by-minute field, so
 * it would only be bandwidth.
 * @param {{apiKey: string, latitude: number, longitude: number, language: string, units: string}} request
 */
export async function fetchOneCallWeather({ apiKey, latitude, longitude, language, units }) {
  return getJson(
    '/data/3.0/onecall',
    {
      lat: latitude,
      lon: longitude,
      lang: language,
      units: toOpenWeatherUnits(units),
      exclude: 'minutely',
    },
    apiKey,
  );
}

/**
 * Read OpenWeather with the API the user configured.
 * @param {Record<string, unknown>} config the normalized configuration
 * @param {{latitude: number, longitude: number, language: string, units: string}} options the Gladys weather request
 */
export async function fetchWeather(config, options) {
  const request = { apiKey: config.api_key, ...options };
  return config.api_version === API_VERSIONS.ONE_CALL
    ? fetchOneCallWeather(request)
    : fetchFreeWeather(request);
}
