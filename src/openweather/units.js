// -----------------------------------------------------------------------------
// Unit handling between OpenWeather and the Gladys pivot weather format.
//
// Gladys sends the REQUESTING USER's preference in `options.units`:
//   - 'metric' -> °C, m/s, hPa, mm, km
//   - 'us'     -> °F, mph, hPa, in, mi
// OpenWeather calls the second one `imperial`, and — whatever the requested
// unit system — always reports:
//   - the visibility in METRES (capped at 10 km);
//   - the precipitation volumes in MILLIMETRES;
//   - the probability of precipitation as a 0-1 ratio.
// So three conversions are ours to do, and doing them here (once) keeps the
// two formatters free of unit arithmetic.
// -----------------------------------------------------------------------------

export const UNIT_SYSTEMS = {
  METRIC: 'metric',
  US: 'us',
};

const METRES_PER_KILOMETRE = 1000;
const METRES_PER_MILE = 1609.344;
const MILLIMETRES_PER_INCH = 25.4;

/**
 * The value of the OpenWeather `units` query parameter.
 * @param {string} units the unit system requested by Gladys ('metric' | 'us')
 */
export function toOpenWeatherUnits(units) {
  return units === UNIT_SYSTEMS.US ? 'imperial' : 'metric';
}

/**
 * Coerce a value to a finite number, `undefined` otherwise.
 *
 * Deliberately stricter than `Number()`: `Number(null)`, `Number('')` and
 * `Number([])` are all 0, and a missing OpenWeather field must be DROPPED from
 * the pivot, never published as a very believable "0 km/h of wind gust".
 * @param {unknown} value the raw value read from an OpenWeather payload
 */
export function toFiniteNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Round a number to a given number of decimals, `undefined` when not a number.
 * Keeps the payload readable: OpenWeather happily returns 4.470000000000001.
 * @param {unknown} value the raw value
 * @param {number} decimals how many decimals to keep
 */
export function round(value, decimals = 1) {
  const number = toFiniteNumber(value);
  if (number === undefined) {
    return undefined;
  }
  const factor = 10 ** decimals;
  return Math.round(number * factor) / factor;
}

/**
 * Convert an OpenWeather visibility (always metres) to the pivot unit.
 * @param {unknown} metres visibility reported by OpenWeather
 * @param {string} units the unit system requested by Gladys
 */
export function visibilityFromMetres(metres, units) {
  const number = toFiniteNumber(metres);
  if (number === undefined) {
    return undefined;
  }
  const divider = units === UNIT_SYSTEMS.US ? METRES_PER_MILE : METRES_PER_KILOMETRE;
  return round(number / divider, 1);
}

/**
 * Convert an OpenWeather precipitation volume (always mm) to the pivot unit.
 * @param {unknown} millimetres rain/snow volume reported by OpenWeather
 * @param {string} units the unit system requested by Gladys
 */
export function precipitationFromMillimetres(millimetres, units) {
  const number = toFiniteNumber(millimetres);
  if (number === undefined) {
    return undefined;
  }
  return units === UNIT_SYSTEMS.US ? round(number / MILLIMETRES_PER_INCH, 2) : round(number, 2);
}

/**
 * Convert an OpenWeather `pop` (0-1 ratio) to the pivot percentage (0-100).
 * @param {unknown} ratio probability of precipitation reported by OpenWeather
 */
export function probabilityFromRatio(ratio) {
  const number = toFiniteNumber(ratio);
  if (number === undefined) {
    return undefined;
  }
  return Math.min(100, Math.max(0, Math.round(number * 100)));
}
