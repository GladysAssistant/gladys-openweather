// -----------------------------------------------------------------------------
// OpenWeather One Call 3.0 (/data/3.0/onecall) -> the Gladys pivot format.
//
// One Call answers everything in a single request, and it is the only
// OpenWeather API that carries the fields the free one lacks: the UV index, the
// dew point, real HOURLY forecasts (48 h, of which the pivot keeps 24) and the
// national weather alerts.
//
// It needs the "One Call by Call" subscription — which is why the free API
// stays the default (see formatFree.js).
// -----------------------------------------------------------------------------

import { formatAlerts } from './alerts.js';
import { readCondition } from './conditions.js';
import {
  isUsableEntry,
  requiredDate,
  requiredNumber,
  setDate,
  setIsDay,
  setNumber,
} from './pivot.js';
import {
  precipitationFromMillimetres,
  probabilityFromRatio,
  visibilityFromMetres,
} from './units.js';

// Bounds mirrored from the core: it keeps at most 24 hours and 8 days.
const MAX_HOURS = 24;
const MAX_DAYS = 8;

/**
 * The precipitation volume of a One Call entry, rain and snow combined.
 * `rain`/`snow` are an object (`{ '1h': 0.5 }`) on the current and hourly
 * entries, and a plain number on the daily ones.
 * @param {object} entry a `current`, `hourly` or `daily` entry
 */
function precipitationInMillimetres(entry) {
  const read = (value) =>
    Number(typeof value === 'object' && value !== null ? value['1h'] : value) || 0;
  return read(entry?.rain) + read(entry?.snow);
}

/**
 * Build the "current conditions" part of the pivot.
 * @param {object} current the `current` block of the response
 * @param {string} units the unit system requested by Gladys
 */
function formatCurrent(current, units) {
  const { condition, isDay } = readCondition(current);
  const weather = {
    temperature: requiredNumber(current?.temp),
    weather: condition,
    datetime: requiredDate(current?.dt),
  };

  setNumber(weather, 'apparent_temperature', current?.feels_like);
  setNumber(weather, 'humidity', current?.humidity, 0);
  setNumber(weather, 'pressure', current?.pressure, 0);
  setNumber(weather, 'dew_point', current?.dew_point);
  setNumber(weather, 'wind_speed', current?.wind_speed);
  setNumber(weather, 'wind_direction', current?.wind_deg, 0);
  setNumber(weather, 'wind_gust', current?.wind_gust);
  setNumber(weather, 'cloud_cover', current?.clouds, 0);
  setNumber(weather, 'visibility', visibilityFromMetres(current?.visibility, units));
  setNumber(weather, 'uv_index', current?.uvi);
  setDate(weather, 'sunrise', current?.sunrise);
  setDate(weather, 'sunset', current?.sunset);
  setIsDay(weather, isDay);

  return weather;
}

/**
 * Build the `hours` part of the pivot from the `hourly` block.
 * @param {Array<object>} hourly the `hourly` block of the response
 * @param {string} units the unit system requested by Gladys
 */
function formatHours(hourly, units) {
  return hourly
    .slice(0, MAX_HOURS)
    .map((entry) => {
      const { condition, isDay } = readCondition(entry);
      const hour = {
        temperature: requiredNumber(entry?.temp),
        weather: condition,
        datetime: requiredDate(entry?.dt),
      };

      setNumber(hour, 'apparent_temperature', entry?.feels_like);
      setNumber(hour, 'humidity', entry?.humidity, 0);
      setNumber(hour, 'pressure', entry?.pressure, 0);
      setNumber(hour, 'wind_speed', entry?.wind_speed);
      setNumber(hour, 'wind_direction', entry?.wind_deg, 0);
      setNumber(hour, 'wind_gust', entry?.wind_gust);
      setNumber(hour, 'cloud_cover', entry?.clouds, 0);
      setNumber(
        hour,
        'precipitation',
        precipitationFromMillimetres(precipitationInMillimetres(entry), units),
        2,
      );
      setNumber(hour, 'precipitation_probability', probabilityFromRatio(entry?.pop), 0);
      setNumber(hour, 'uv_index', entry?.uvi);
      setIsDay(hour, isDay);

      return hour;
    })
    .filter((hour) => isUsableEntry(hour, ['temperature']));
}

/**
 * Build the `days` part of the pivot from the `daily` block.
 * @param {Array<object>} daily the `daily` block of the response
 * @param {string} units the unit system requested by Gladys
 */
function formatDays(daily, units) {
  return daily
    .slice(0, MAX_DAYS)
    .map((entry) => {
      const day = {
        temperature_min: requiredNumber(entry?.temp?.min),
        temperature_max: requiredNumber(entry?.temp?.max),
        datetime: requiredDate(entry?.dt),
        weather: readCondition(entry).condition,
      };

      setNumber(day, 'humidity', entry?.humidity, 0);
      setNumber(day, 'wind_speed', entry?.wind_speed);
      setNumber(day, 'wind_direction', entry?.wind_deg, 0);
      setNumber(day, 'wind_gust', entry?.wind_gust);
      setNumber(
        day,
        'precipitation',
        precipitationFromMillimetres(precipitationInMillimetres(entry), units),
        2,
      );
      setNumber(day, 'precipitation_probability', probabilityFromRatio(entry?.pop), 0);
      setNumber(day, 'uv_index', entry?.uvi);
      setDate(day, 'sunrise', entry?.sunrise);
      setDate(day, 'sunset', entry?.sunset);

      return day;
    })
    .filter((day) => isUsableEntry(day, ['temperature_min', 'temperature_max']));
}

/**
 * Format a One Call 3.0 answer into the Gladys pivot weather format.
 * @param {object} response the /data/3.0/onecall payload
 * @param {string} units the unit system requested by Gladys ('metric' | 'us')
 */
export function formatOneCallWeather(response, units) {
  const weather = formatCurrent(response?.current, units);

  if (Array.isArray(response?.hourly) && response.hourly.length > 0) {
    weather.hours = formatHours(response.hourly, units);
  }
  if (Array.isArray(response?.daily) && response.daily.length > 0) {
    weather.days = formatDays(response.daily, units);
  }
  const alerts = formatAlerts(response?.alerts);
  if (alerts.length > 0) {
    weather.alerts = alerts;
  }

  return weather;
}
