// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined` or with a number that
// arrived as a string from the generated form.
// -----------------------------------------------------------------------------

// The two OpenWeather APIs this integration knows how to talk to.
//   - FREE      : /data/2.5/weather + /data/2.5/forecast, available with any
//                 account (current conditions + 3-hourly forecast over 5 days);
//   - ONE_CALL  : /data/3.0/onecall, requires the "One Call by Call"
//                 subscription, and adds hourly detail, UV index, dew point
//                 and the national weather alerts.
export const API_VERSIONS = {
  FREE: '2.5',
  ONE_CALL: '3.0',
};

// Bounds of the cache, mirrored from the `cache_duration` field of the manifest.
const MIN_CACHE_DURATION = 0;
const MAX_CACHE_DURATION = 3600;

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (a `secret` field cannot declare a default,
// so `api_key` is only defaulted here).
export const DEFAULT_CONFIG = {
  api_key: '',
  api_version: API_VERSIONS.FREE,
  cache_duration: 600, // seconds
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const cacheDuration = Number(raw.cache_duration ?? DEFAULT_CONFIG.cache_duration);

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // A key pasted from the OpenWeather dashboard often carries a trailing
    // space; it would make every request fail with a 401.
    api_key: typeof raw.api_key === 'string' ? raw.api_key.trim() : DEFAULT_CONFIG.api_key,
    // Anything but an explicit "3.0" means the free API: an unknown value must
    // never send the user to an endpoint their account cannot call.
    api_version:
      raw.api_version === API_VERSIONS.ONE_CALL ? API_VERSIONS.ONE_CALL : API_VERSIONS.FREE,
    cache_duration: Number.isFinite(cacheDuration)
      ? Math.min(MAX_CACHE_DURATION, Math.max(MIN_CACHE_DURATION, cacheDuration))
      : DEFAULT_CONFIG.cache_duration,
  };
}

/**
 * Whether the integration can talk to OpenWeather at all.
 * @param {Record<string, unknown>} config normalized configuration
 */
export function isConfigured(config) {
  return typeof config.api_key === 'string' && config.api_key.length > 0;
}
