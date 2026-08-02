import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WEATHER_ALERT_SEVERITIES,
  WEATHER_ALERT_TYPES,
  WEATHER_CONDITIONS,
} from '@gladysassistant/integration-sdk';
import { formatOneCallWeather } from '../src/openweather/formatOneCall.js';
import { ONE_CALL } from './fixtures/oneCall.js';

const metric = () => formatOneCallWeather(ONE_CALL, 'metric');

test('the current conditions carry the required pivot fields', () => {
  const weather = metric();
  assert.equal(weather.temperature, 21.53);
  assert.equal(weather.weather, WEATHER_CONDITIONS.RAIN);
  assert.deepEqual(weather.datetime, new Date('2026-08-01T10:00:00.000Z'));
});

test('One Call adds the fields the free API cannot provide', () => {
  const weather = metric();
  assert.equal(weather.dew_point, 14.6);
  assert.equal(weather.uv_index, 5.3);
  assert.equal(weather.visibility, 8);
  assert.equal(weather.is_day, true);
  assert.deepEqual(weather.sunrise, new Date('2026-08-01T04:10:00.000Z'));
});

test('hours come from the real hourly forecast', () => {
  const { hours } = metric();
  assert.equal(hours.length, 2);
  assert.deepEqual(hours[0].datetime, new Date('2026-08-01T11:00:00.000Z'));
  assert.equal(hours[0].weather, WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(hours[0].precipitation_probability, 24);
  assert.equal(hours[0].uv_index, 5.9);
  assert.equal(hours[0].is_day, true);

  assert.equal(hours[1].weather, WEATHER_CONDITIONS.POURING);
  assert.equal(hours[1].precipitation, 3.6);
  assert.equal(hours[1].is_day, false);
});

test('days come from the daily forecast, min/max included', () => {
  const { days } = metric();
  assert.equal(days.length, 2);
  assert.equal(days[0].temperature_min, 15.1);
  assert.equal(days[0].temperature_max, 25.2);
  assert.equal(days[0].weather, WEATHER_CONDITIONS.RAIN);
  assert.equal(days[0].precipitation, 8.4);
  assert.equal(days[0].precipitation_probability, 92);
  assert.equal(days[0].uv_index, 6.1);
  assert.deepEqual(days[0].sunset, new Date('2026-08-01T19:20:00.000Z'));

  assert.equal(days[1].weather, WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(days[1].precipitation, 0);
});

test('the national alerts become CAP-style pivot alerts', () => {
  const { alerts } = metric();
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts[0], {
    severity: WEATHER_ALERT_SEVERITIES.SEVERE,
    event: 'Vigilance orange Orages',
    type: WEATHER_ALERT_TYPES.THUNDERSTORM,
    description: 'Orages violents attendus en fin de journée.',
    start: new Date('2026-08-01T15:00:00.000Z'),
    end: new Date('2026-08-01T22:00:00.000Z'),
  });
  assert.equal(alerts[1].severity, WEATHER_ALERT_SEVERITIES.MINOR);
  assert.equal(alerts[1].type, WEATHER_ALERT_TYPES.FLOOD);
});

test('the us unit system converts the visibility and the precipitation', () => {
  const weather = formatOneCallWeather(ONE_CALL, 'us');
  assert.equal(weather.visibility, 5); // 8000 m -> 4.97 mi
  assert.equal(weather.hours[1].precipitation, 0.14); // 3.6 mm -> 0.14 in
  assert.equal(weather.days[0].precipitation, 0.33); // 8.4 mm -> 0.33 in
});

test('an answer without hourly, daily or alerts stays valid', () => {
  const weather = formatOneCallWeather({ current: ONE_CALL.current }, 'metric');
  assert.equal(weather.temperature, 21.53);
  assert.equal('hours' in weather, false);
  assert.equal('days' in weather, false);
  assert.equal('alerts' in weather, false);
});

test('an incomplete daily entry is dropped rather than published half-empty', () => {
  const response = {
    ...ONE_CALL,
    daily: [{ ...ONE_CALL.daily[0], temp: { min: null, max: 25.2 } }, ONE_CALL.daily[1]],
  };
  const { days } = formatOneCallWeather(response, 'metric');
  assert.equal(days.length, 1);
  assert.equal(days[0].temperature_max, 27.8);
});
