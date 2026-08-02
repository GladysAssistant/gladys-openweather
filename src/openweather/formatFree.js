// -----------------------------------------------------------------------------
// Free OpenWeather API (/data/2.5) -> the Gladys pivot weather format.
//
// This is the port of the internal Gladys service (`services/openweather/lib/
// formatResults.js`): same two endpoints, same daily min/max derived from the
// 3-hourly forecast — enriched with everything the pivot format has gained
// since (feels-like, wind gust, cloud cover, visibility, precipitation and its
// probability, sunrise/sunset, day/night flag).
//
// What this API cannot give: the UV index, the dew point and the weather
// alerts. They are One Call 3.0 only (see formatOneCall.js), and the pivot
// simply omits them here.
// -----------------------------------------------------------------------------

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
  toFiniteNumber,
  visibilityFromMetres,
} from './units.js';

// The forecast comes in 3-hour steps: 8 entries cover the next 24 hours, which
// is exactly what the internal service published (and what the widget draws).
const FORECAST_ENTRIES = 8;

// Bound mirrored from the core, which keeps at most 8 days.
const MAX_DAYS = 8;

// Local noon: the hour whose condition best represents "the weather that day".
const MIDDAY_IN_SECONDS = 12 * 3600;

/**
 * The precipitation volume of a forecast entry, rain and snow combined.
 * OpenWeather reports them separately, over the entry's 3-hour window.
 * @param {object} entry one entry of the `list` of a /forecast response
 */
function precipitationInMillimetres(entry) {
  const rain = Number(entry?.rain?.['3h']) || 0;
  const snow = Number(entry?.snow?.['3h']) || 0;
  return rain + snow;
}

/**
 * The day/night flag of a forecast entry. The forecast carries its own marker
 * (`sys.pod`); the icon suffix says the same thing and covers the entries that
 * lack it.
 * @param {object} entry one entry of the `list` of a /forecast response
 * @param {boolean|undefined} fallback the flag read from the entry's icon
 */
function forecastIsDay(entry, fallback) {
  if (entry?.sys?.pod === 'd') {
    return true;
  }
  if (entry?.sys?.pod === 'n') {
    return false;
  }
  return fallback;
}

/**
 * The local calendar day of a timestamp, as a YYYY-MM-DD key.
 * Grouping on the CITY's timezone (and not on UTC) is what makes "tomorrow"
 * tomorrow for the user: a Paris forecast at 23:00 UTC belongs to the next day.
 * @param {number} timestampInSeconds the `dt` of a forecast entry
 * @param {number} timezoneOffsetInSeconds the `city.timezone` of the response
 */
function localDayKey(timestampInSeconds, timezoneOffsetInSeconds) {
  return new Date((timestampInSeconds + timezoneOffsetInSeconds) * 1000).toISOString().slice(0, 10);
}

/**
 * How far a forecast entry falls from local noon, in seconds.
 * @param {number} timestampInSeconds the `dt` of a forecast entry
 * @param {number} timezoneOffsetInSeconds the `city.timezone` of the response
 */
function distanceToMidday(timestampInSeconds, timezoneOffsetInSeconds) {
  const secondsInDay = (timestampInSeconds + timezoneOffsetInSeconds) % 86400;
  return Math.abs(secondsInDay - MIDDAY_IN_SECONDS);
}

/**
 * Build the "current conditions" part of the pivot, from /data/2.5/weather.
 * @param {object} current the /weather response
 * @param {string} units the unit system requested by Gladys
 */
function formatCurrent(current, units) {
  const { condition, isDay } = readCondition(current);
  const weather = {
    temperature: requiredNumber(current?.main?.temp),
    weather: condition,
    datetime: requiredDate(current?.dt),
  };

  setNumber(weather, 'apparent_temperature', current?.main?.feels_like);
  setNumber(weather, 'humidity', current?.main?.humidity, 0);
  setNumber(weather, 'pressure', current?.main?.pressure, 0);
  setNumber(weather, 'wind_speed', current?.wind?.speed);
  setNumber(weather, 'wind_direction', current?.wind?.deg, 0);
  setNumber(weather, 'wind_gust', current?.wind?.gust);
  setNumber(weather, 'cloud_cover', current?.clouds?.all, 0);
  setNumber(weather, 'visibility', visibilityFromMetres(current?.visibility, units));
  setDate(weather, 'sunrise', current?.sys?.sunrise);
  setDate(weather, 'sunset', current?.sys?.sunset);
  setIsDay(weather, isDay);

  return weather;
}

/**
 * Build the `hours` part of the pivot, from the 3-hourly forecast.
 * @param {Array<object>} list the `list` of the /forecast response
 * @param {string} units the unit system requested by Gladys
 */
function formatHours(list, units) {
  return list
    .slice(0, FORECAST_ENTRIES)
    .map((entry) => {
      const { condition, isDay } = readCondition(entry);
      const hour = {
        temperature: requiredNumber(entry?.main?.temp),
        weather: condition,
        datetime: requiredDate(entry?.dt),
      };

      setNumber(hour, 'apparent_temperature', entry?.main?.feels_like);
      setNumber(hour, 'humidity', entry?.main?.humidity, 0);
      setNumber(hour, 'pressure', entry?.main?.pressure, 0);
      setNumber(hour, 'wind_speed', entry?.wind?.speed);
      setNumber(hour, 'wind_direction', entry?.wind?.deg, 0);
      setNumber(hour, 'wind_gust', entry?.wind?.gust);
      setNumber(hour, 'cloud_cover', entry?.clouds?.all, 0);
      setNumber(
        hour,
        'precipitation',
        precipitationFromMillimetres(precipitationInMillimetres(entry), units),
        2,
      );
      setNumber(hour, 'precipitation_probability', probabilityFromRatio(entry?.pop), 0);
      setIsDay(hour, forecastIsDay(entry, isDay));

      return hour;
    })
    .filter((hour) => isUsableEntry(hour, ['temperature']));
}

/**
 * Build the `days` part of the pivot by aggregating the 3-hourly forecast into
 * calendar days — the same derivation the internal Gladys service does, with
 * the aggregates the pivot has room for.
 * @param {Array<object>} list the `list` of the /forecast response
 * @param {number} timezoneOffsetInSeconds the `city.timezone` of the response
 * @param {string} units the unit system requested by Gladys
 */
function formatDays(list, timezoneOffsetInSeconds, units) {
  const byDay = new Map();

  for (const entry of list) {
    const timestamp = toFiniteNumber(entry?.dt);
    const temperature = toFiniteNumber(entry?.main?.temp);
    if (timestamp === undefined || temperature === undefined) {
      continue;
    }
    const key = localDayKey(timestamp, timezoneOffsetInSeconds);
    const day = byDay.get(key) ?? {
      timestamp,
      min: Infinity,
      max: -Infinity,
      humiditySum: 0,
      humidityCount: 0,
      windSpeed: -Infinity,
      windGust: -Infinity,
      precipitation: 0,
      probability: -Infinity,
      representative: undefined,
      representativeDistance: Infinity,
    };

    const minTemperature = toFiniteNumber(entry?.main?.temp_min);
    const maxTemperature = toFiniteNumber(entry?.main?.temp_max);
    day.min = Math.min(day.min, minTemperature ?? temperature);
    day.max = Math.max(day.max, maxTemperature ?? temperature);

    const humidity = toFiniteNumber(entry?.main?.humidity);
    if (humidity !== undefined) {
      day.humiditySum += humidity;
      day.humidityCount += 1;
    }
    const windSpeed = toFiniteNumber(entry?.wind?.speed);
    if (windSpeed !== undefined) {
      day.windSpeed = Math.max(day.windSpeed, windSpeed);
    }
    const windGust = toFiniteNumber(entry?.wind?.gust);
    if (windGust !== undefined) {
      day.windGust = Math.max(day.windGust, windGust);
    }
    day.precipitation += precipitationInMillimetres(entry);
    const probability = probabilityFromRatio(entry?.pop);
    if (probability !== undefined) {
      day.probability = Math.max(day.probability, probability);
    }

    // The condition (and the wind direction) of the entry closest to local
    // noon: a day summarized by its 3 a.m. sky would be misleading.
    const distance = distanceToMidday(timestamp, timezoneOffsetInSeconds);
    if (distance < day.representativeDistance) {
      day.representativeDistance = distance;
      day.representative = entry;
    }

    byDay.set(key, day);
  }

  return [...byDay.values()].slice(0, MAX_DAYS).map((aggregate) => {
    const day = {
      temperature_min: Math.round(aggregate.min * 10) / 10,
      temperature_max: Math.round(aggregate.max * 10) / 10,
      datetime: new Date(aggregate.timestamp * 1000),
      weather: readCondition(aggregate.representative).condition,
    };

    if (aggregate.humidityCount > 0) {
      setNumber(day, 'humidity', aggregate.humiditySum / aggregate.humidityCount, 0);
    }
    if (aggregate.windSpeed > -Infinity) {
      setNumber(day, 'wind_speed', aggregate.windSpeed);
    }
    if (aggregate.windGust > -Infinity) {
      setNumber(day, 'wind_gust', aggregate.windGust);
    }
    setNumber(day, 'wind_direction', aggregate.representative?.wind?.deg, 0);
    setNumber(
      day,
      'precipitation',
      precipitationFromMillimetres(aggregate.precipitation, units),
      2,
    );
    if (aggregate.probability > -Infinity) {
      setNumber(day, 'precipitation_probability', aggregate.probability, 0);
    }

    return day;
  });
}

/**
 * Format a free-API answer into the Gladys pivot weather format.
 * @param {{current: object, forecast: object}} response the two OpenWeather payloads
 * @param {string} units the unit system requested by Gladys ('metric' | 'us')
 */
export function formatFreeWeather({ current, forecast }, units) {
  const weather = formatCurrent(current, units);
  const list = Array.isArray(forecast?.list) ? forecast.list : [];

  if (list.length > 0) {
    const timezoneOffset = toFiniteNumber(forecast?.city?.timezone) ?? 0;
    weather.hours = formatHours(list, units);
    weather.days = formatDays(list, timezoneOffset, units);
  }

  return weather;
}
