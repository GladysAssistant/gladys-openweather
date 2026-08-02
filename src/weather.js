// -----------------------------------------------------------------------------
// The weather provider itself: what `gladys.onWeatherGet()` resolves with.
//
// Gladys asks `{ latitude, longitude, language, units }` and expects the pivot
// weather format back, with the values expressed in the REQUESTED unit system.
// Throwing is a legitimate answer: the core acks the command as failed and its
// provider loop falls through to the next weather provider.
//
// A short in-memory cache sits in front of OpenWeather. The dashboard widget
// and the chat assistant both ask for the weather, and a free OpenWeather
// account is capped (60 calls/minute, 1 000 000 calls/month; the One Call plan
// bills past 1000 calls/day) — re-reading a 2-minute-old forecast would burn
// quota for nothing. The duration is the user's `cache_duration` setting.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { API_VERSIONS, isConfigured } from './config.js';
import { fetchWeather } from './openweather/client.js';
import { formatFreeWeather } from './openweather/formatFree.js';
import { formatOneCallWeather } from './openweather/formatOneCall.js';
import { UNIT_SYSTEMS } from './openweather/units.js';

const logger = createLogger({ name: 'weather' });

// Coordinates are rounded before they enter the cache key: the dashboard and
// the chat send the same house, sometimes with a different float tail.
const COORDINATE_PRECISION = 4;

const cache = new Map();

/**
 * Normalize the options of a Gladys weather request.
 * @param {Record<string, unknown>} options the raw request from the core
 */
export function normalizeOptions(options = {}) {
  return {
    latitude: Number(options.latitude),
    longitude: Number(options.longitude),
    language:
      typeof options.language === 'string' && options.language.length > 0 ? options.language : 'en',
    units: options.units === UNIT_SYSTEMS.US ? UNIT_SYSTEMS.US : UNIT_SYSTEMS.METRIC,
  };
}

/**
 * The cache key of a request: the answer depends on the place, the language,
 * the unit system AND the API used to fetch it.
 * @param {Record<string, unknown>} config the normalized configuration
 * @param {object} options the normalized request options
 */
function cacheKey(config, options) {
  const latitude = options.latitude.toFixed(COORDINATE_PRECISION);
  const longitude = options.longitude.toFixed(COORDINATE_PRECISION);
  return [latitude, longitude, options.language, options.units, config.api_version].join('|');
}

/**
 * Drop every cached answer. Called whenever the configuration changes: a new
 * API key or a switch to One Call must not serve the previous answers.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Make sure the payload is usable before Gladys sees it. The core rejects a
 * payload without a finite `temperature` and a valid `datetime` — failing here
 * gives the user a message that says which provider is at fault, instead of a
 * generic "invalid weather".
 * @param {object} weather the formatted pivot payload
 */
function assertUsable(weather) {
  if (!Number.isFinite(weather.temperature) || Number.isNaN(weather.datetime.getTime())) {
    throw new Error('OpenWeather returned an answer without a usable temperature');
  }
}

/**
 * Answer a Gladys weather request in the pivot weather format.
 * @param {Record<string, unknown>} config the normalized configuration
 * @param {Record<string, unknown>} rawOptions the request options from the core
 * @param {number} [now] current time in milliseconds (injectable for the tests)
 */
export async function getWeather(config, rawOptions, now = Date.now()) {
  if (!isConfigured(config)) {
    // Explicit, actionable, and it makes the core fall through to the next
    // weather provider instead of showing an empty widget.
    throw new Error('OpenWeather API key is missing: fill it in the integration configuration.');
  }

  const options = normalizeOptions(rawOptions);
  if (!Number.isFinite(options.latitude) || !Number.isFinite(options.longitude)) {
    throw new Error('Gladys asked for the weather without usable coordinates.');
  }

  const key = cacheKey(config, options);
  const cached = cache.get(key);
  if (cached !== undefined && cached.expiresAt > now) {
    logger.debug(`Serving the cached weather for ${key}`);
    return cached.weather;
  }

  logger.info(`Reading OpenWeather (API ${config.api_version}) for ${key}`);
  const response = await fetchWeather(config, options);
  const weather =
    config.api_version === API_VERSIONS.ONE_CALL
      ? formatOneCallWeather(response, options.units)
      : formatFreeWeather(response, options.units);

  assertUsable(weather);

  if (config.cache_duration > 0) {
    cache.set(key, { weather, expiresAt: now + config.cache_duration * 1000 });
  }

  logger.info(
    `Weather: ${weather.temperature}deg, ${weather.weather}, ` +
      `${weather.hours?.length ?? 0} hours, ${weather.days?.length ?? 0} days, ` +
      `${weather.alerts?.length ?? 0} alerts`,
  );

  return weather;
}
