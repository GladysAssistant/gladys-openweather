import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';
import { formatFreeWeather } from '../src/openweather/formatFree.js';
import { CURRENT_WEATHER, FORECAST } from './fixtures/free.js';

const metric = () => formatFreeWeather({ current: CURRENT_WEATHER, forecast: FORECAST }, 'metric');

test('the current conditions carry the required pivot fields', () => {
  const weather = metric();
  assert.equal(weather.temperature, 21.53);
  assert.equal(weather.weather, WEATHER_CONDITIONS.RAIN);
  assert.deepEqual(weather.datetime, new Date('2026-08-01T10:00:00.000Z'));
});

test('the current conditions carry the optional fields OpenWeather provides', () => {
  const weather = metric();
  assert.equal(weather.apparent_temperature, 21.5);
  assert.equal(weather.humidity, 64);
  assert.equal(weather.pressure, 1013);
  assert.equal(weather.wind_speed, 4.5);
  assert.equal(weather.wind_direction, 240);
  assert.equal(weather.wind_gust, 8.8);
  assert.equal(weather.cloud_cover, 75);
  assert.equal(weather.visibility, 8);
  assert.deepEqual(weather.sunrise, new Date('2026-08-01T04:10:00.000Z'));
  assert.deepEqual(weather.sunset, new Date('2026-08-01T19:20:00.000Z'));
  assert.equal(weather.is_day, true);
});

test('the free API cannot provide a UV index, a dew point or alerts', () => {
  const weather = metric();
  assert.equal('uv_index' in weather, false);
  assert.equal('dew_point' in weather, false);
  assert.equal('alerts' in weather, false);
});

test('hours keep the 8 forecast entries that cover the next 24 hours', () => {
  const { hours } = metric();
  assert.equal(hours.length, 8);
  assert.deepEqual(hours[0].datetime, new Date('2026-08-01T12:00:00.000Z'));
  assert.equal(hours[0].temperature, 23.4);
  assert.equal(hours[0].weather, WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(hours[0].precipitation_probability, 20);
  assert.equal(hours[0].precipitation, 0);
  assert.equal(hours[0].is_day, true);
});

test('an hour reports its rain volume, its intensity and the night', () => {
  const { hours } = metric();
  const rainy = hours[2];
  assert.equal(rainy.weather, WEATHER_CONDITIONS.POURING);
  assert.equal(rainy.precipitation, 6.4);
  assert.equal(rainy.precipitation_probability, 86);
  assert.equal(rainy.is_day, false);
  assert.equal(rainy.humidity, 62);
  assert.equal(rainy.cloud_cover, 42);
});

test('days aggregate the 3-hourly forecast into local calendar days', () => {
  const { days } = metric();
  assert.equal(days.length, 2);

  const [today, tomorrow] = days;
  // Aug 1 in Paris: the 14:00, 17:00, 20:00 and 23:00 local entries.
  assert.deepEqual(today.datetime, new Date('2026-08-01T12:00:00.000Z'));
  assert.equal(today.temperature_min, 16.6);
  assert.equal(today.temperature_max, 24);
  // The day is summarized by the entry closest to local noon, not by its
  // 3 a.m. sky.
  assert.equal(today.weather, WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(today.precipitation, 7.6);
  assert.equal(today.precipitation_probability, 86);
  assert.equal(today.wind_direction, 200);

  assert.deepEqual(tomorrow.datetime, new Date('2026-08-02T00:00:00.000Z'));
  assert.equal(tomorrow.temperature_min, 14.3);
  assert.equal(tomorrow.temperature_max, 25.8);
  assert.equal(tomorrow.precipitation, 0);
});

test('the us unit system converts the visibility and the precipitation', () => {
  const weather = formatFreeWeather({ current: CURRENT_WEATHER, forecast: FORECAST }, 'us');
  // OpenWeather reports metres and millimetres whatever the unit system.
  assert.equal(weather.visibility, 5); // 8000 m -> 4.97 mi
  assert.equal(weather.hours[2].precipitation, 0.25); // 6.4 mm -> 0.25 in
  // Temperatures are already in °F: OpenWeather converted them.
  assert.equal(weather.temperature, 21.53);
});

test('a forecast-less answer still returns usable current conditions', () => {
  const weather = formatFreeWeather({ current: CURRENT_WEATHER, forecast: {} }, 'metric');
  assert.equal(weather.temperature, 21.53);
  assert.equal('hours' in weather, false);
  assert.equal('days' in weather, false);
});

test('a null optional field is dropped rather than published as a 0', () => {
  const current = {
    ...CURRENT_WEATHER,
    visibility: null,
    wind: { speed: 4.5, deg: 240, gust: null },
  };
  const weather = formatFreeWeather({ current, forecast: FORECAST }, 'metric');
  assert.equal('visibility' in weather, false);
  assert.equal('wind_gust' in weather, false);
  assert.equal(weather.wind_speed, 4.5);
});

test('a forecast entry without a temperature is dropped, not published as 0', () => {
  const forecast = {
    ...FORECAST,
    list: [
      { ...FORECAST.list[0], main: { ...FORECAST.list[0].main, temp: null } },
      ...FORECAST.list.slice(1),
    ],
  };
  const weather = formatFreeWeather({ current: CURRENT_WEATHER, forecast }, 'metric');
  assert.equal(weather.hours.length, 7);
  assert.deepEqual(weather.hours[0].datetime, new Date('2026-08-01T15:00:00.000Z'));
});
