// -----------------------------------------------------------------------------
// OpenWeather condition codes -> the Gladys pivot condition enum.
//
// The internal Gladys OpenWeather service mapped `weather[0].main` (8 coarse
// groups). The pivot enum has since gained `partly-cloudy`, `pouring`, `sleet`
// and `hail`, so this port maps the NUMERIC CODE instead
// (https://openweathermap.org/weather-conditions): the same 8 groups, but with
// the intensity that `main` throws away — few clouds vs overcast, moderate rain
// vs extreme rain, snow vs sleet.
//
// Anything the core does not know is coerced to 'unknown' on its side, so the
// rule here is simple: only ever emit a value of WEATHER_CONDITIONS.
// -----------------------------------------------------------------------------

import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';

// Codes whose group default is not precise enough. Everything not listed here
// falls back to its group (2xx, 3xx, 5xx...) below.
const CONDITION_BY_CODE = {
  // 5xx Rain: the heavy variants deserve `pouring`, freezing rain is sleet.
  502: WEATHER_CONDITIONS.POURING, // heavy intensity rain
  503: WEATHER_CONDITIONS.POURING, // very heavy rain
  504: WEATHER_CONDITIONS.POURING, // extreme rain
  511: WEATHER_CONDITIONS.SLEET, // freezing rain
  522: WEATHER_CONDITIONS.POURING, // heavy intensity shower rain
  // 6xx Snow: OpenWeather's own sleet codes, and the rain-and-snow mixes.
  611: WEATHER_CONDITIONS.SLEET, // sleet
  612: WEATHER_CONDITIONS.SLEET, // light shower sleet
  613: WEATHER_CONDITIONS.SLEET, // shower sleet
  615: WEATHER_CONDITIONS.SLEET, // light rain and snow
  616: WEATHER_CONDITIONS.SLEET, // rain and snow
  // 7xx Atmosphere: mostly visibility (-> fog), except what is really wind.
  731: WEATHER_CONDITIONS.WIND, // sand/dust whirls
  771: WEATHER_CONDITIONS.WIND, // squalls
  781: WEATHER_CONDITIONS.WIND, // tornado
  // 80x Clouds: the pivot separates a few clouds from an overcast sky.
  800: WEATHER_CONDITIONS.CLEAR, // clear sky
  801: WEATHER_CONDITIONS.PARTLY_CLOUDY, // few clouds, 11-25%
  802: WEATHER_CONDITIONS.PARTLY_CLOUDY, // scattered clouds, 25-50%
  803: WEATHER_CONDITIONS.CLOUD, // broken clouds, 51-84%
  804: WEATHER_CONDITIONS.CLOUD, // overcast clouds, 85-100%
};

// Fallback per hundred, so a code OpenWeather adds later still lands on a
// sensible condition instead of 'unknown'.
const CONDITION_BY_GROUP = {
  2: WEATHER_CONDITIONS.THUNDERSTORM,
  3: WEATHER_CONDITIONS.DRIZZLE,
  5: WEATHER_CONDITIONS.RAIN,
  6: WEATHER_CONDITIONS.SNOW,
  7: WEATHER_CONDITIONS.FOG, // mist, haze, smoke, sand, dust, ash, fog
  8: WEATHER_CONDITIONS.CLOUD,
};

/**
 * Map an OpenWeather condition code to a pivot condition.
 *
 * Note: OpenWeather has no hail code, so `hail` is never emitted by this
 * provider — a hailstorm is reported as a thunderstorm (2xx), like OpenWeather
 * itself does.
 * @param {unknown} code the `weather[0].id` of an OpenWeather response
 */
export function toCondition(code) {
  const id = Number(code);
  if (!Number.isFinite(id)) {
    return WEATHER_CONDITIONS.UNKNOWN;
  }
  if (CONDITION_BY_CODE[id] !== undefined) {
    return CONDITION_BY_CODE[id];
  }
  return CONDITION_BY_GROUP[Math.floor(id / 100)] ?? WEATHER_CONDITIONS.UNKNOWN;
}

/**
 * Read the day/night signal out of an OpenWeather icon name ('10d' / '10n').
 *
 * The pivot carries the meteorology in `weather` and the day/night rendering
 * variant in `is_day` — the deprecated 'night' condition would erase the actual
 * weather (a rainy night can only be "night"). A strict boolean or nothing:
 * the core drops anything else, and an absent flag renders as day.
 * @param {unknown} icon the `weather[0].icon` of an OpenWeather response
 */
export function toIsDay(icon) {
  if (typeof icon !== 'string' || icon.length === 0) {
    return undefined;
  }
  const suffix = icon[icon.length - 1];
  if (suffix === 'd') {
    return true;
  }
  if (suffix === 'n') {
    return false;
  }
  return undefined;
}

/**
 * The condition + day/night pair of an OpenWeather entry (`weather` array).
 * @param {object} entry any OpenWeather object carrying a `weather` array
 */
export function readCondition(entry) {
  const description = Array.isArray(entry?.weather) ? entry.weather[0] : undefined;
  return {
    condition: toCondition(description?.id),
    isDay: toIsDay(description?.icon),
  };
}
