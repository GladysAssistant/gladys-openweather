// -----------------------------------------------------------------------------
// Small helpers to assemble a pivot weather entry.
//
// Every optional field of the pivot format is "present or absent", never null
// and never NaN: a provider that lacks a field simply does not send it (the
// core drops non-finite numbers and unparseable dates anyway, but sending them
// would only make the payload harder to read in the logs).
// -----------------------------------------------------------------------------

import { round, toFiniteNumber } from './units.js';

/**
 * Read a REQUIRED numeric field of the pivot. `NaN` when OpenWeather did not
 * send it, so the caller (and ultimately `assertUsable`) can refuse the answer
 * instead of publishing a plausible-looking 0.
 * @param {unknown} value the value read from OpenWeather
 */
export function requiredNumber(value) {
  return toFiniteNumber(value) ?? Number.NaN;
}

/**
 * Read a REQUIRED date field of the pivot, from a UNIX timestamp in seconds.
 * An invalid Date when OpenWeather did not send it — never the epoch.
 * @param {unknown} timestampInSeconds the value read from OpenWeather
 */
export function requiredDate(timestampInSeconds) {
  const timestamp = toFiniteNumber(timestampInSeconds);
  return new Date(timestamp === undefined ? Number.NaN : timestamp * 1000);
}

/**
 * Whether an entry carries the required fields of the pivot. The core drops
 * the incomplete `hours`/`days` entries anyway; dropping them here keeps the
 * payload — and the logs — honest about what OpenWeather actually sent.
 * @param {object} entry a pivot entry being built
 * @param {Array<string>} numericFields the required numeric fields
 */
export function isUsableEntry(entry, numericFields) {
  return (
    !Number.isNaN(entry.datetime.getTime()) &&
    numericFields.every((field) => Number.isFinite(entry[field]))
  );
}

/**
 * Set an optional numeric field, rounded, only when it is a real number.
 * @param {object} target the pivot entry being built
 * @param {string} key the pivot field name
 * @param {unknown} value the value read from OpenWeather
 * @param {number} decimals how many decimals to keep
 */
export function setNumber(target, key, value, decimals = 1) {
  const rounded = round(value, decimals);
  if (rounded !== undefined) {
    target[key] = rounded;
  }
}

/**
 * Set an optional date field from a UNIX timestamp in seconds.
 * @param {object} target the pivot entry being built
 * @param {string} key the pivot field name
 * @param {unknown} timestampInSeconds the value read from OpenWeather
 */
export function setDate(target, key, timestampInSeconds) {
  const timestamp = toFiniteNumber(timestampInSeconds);
  if (timestamp !== undefined) {
    target[key] = new Date(timestamp * 1000);
  }
}

/**
 * Set the optional day/night flag. Strict boolean or nothing: the core never
 * coerces this field, and an absent flag renders as day.
 * @param {object} target the pivot entry being built
 * @param {unknown} isDay the flag read from the OpenWeather icon
 */
export function setIsDay(target, isDay) {
  if (typeof isDay === 'boolean') {
    target.is_day = isDay;
  }
}
