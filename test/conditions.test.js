import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_CONDITIONS } from '@gladysassistant/integration-sdk';
import { readCondition, toCondition, toIsDay } from '../src/openweather/conditions.js';

test('toCondition maps the OpenWeather groups to the pivot enum', () => {
  assert.equal(toCondition(212), WEATHER_CONDITIONS.THUNDERSTORM);
  assert.equal(toCondition(301), WEATHER_CONDITIONS.DRIZZLE);
  assert.equal(toCondition(500), WEATHER_CONDITIONS.RAIN);
  assert.equal(toCondition(601), WEATHER_CONDITIONS.SNOW);
  assert.equal(toCondition(701), WEATHER_CONDITIONS.FOG);
  assert.equal(toCondition(741), WEATHER_CONDITIONS.FOG);
  assert.equal(toCondition(800), WEATHER_CONDITIONS.CLEAR);
});

test('toCondition keeps the intensity that weather[0].main throws away', () => {
  // The internal Gladys service mapped all of 5xx to 'rain' and all of 80x
  // to 'cloud': these are the values the finer pivot enum unlocked.
  assert.equal(toCondition(503), WEATHER_CONDITIONS.POURING);
  assert.equal(toCondition(522), WEATHER_CONDITIONS.POURING);
  assert.equal(toCondition(511), WEATHER_CONDITIONS.SLEET);
  assert.equal(toCondition(616), WEATHER_CONDITIONS.SLEET);
  assert.equal(toCondition(801), WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(toCondition(802), WEATHER_CONDITIONS.PARTLY_CLOUDY);
  assert.equal(toCondition(803), WEATHER_CONDITIONS.CLOUD);
  assert.equal(toCondition(804), WEATHER_CONDITIONS.CLOUD);
});

test('toCondition maps the atmospheric codes that are really wind', () => {
  assert.equal(toCondition(771), WEATHER_CONDITIONS.WIND);
  assert.equal(toCondition(781), WEATHER_CONDITIONS.WIND);
});

test('toCondition falls back to the group of an unknown code', () => {
  assert.equal(toCondition(599), WEATHER_CONDITIONS.RAIN);
  assert.equal(toCondition(699), WEATHER_CONDITIONS.SNOW);
});

test('toCondition never invents a value outside the pivot enum', () => {
  const allowed = Object.values(WEATHER_CONDITIONS);
  for (const code of [null, undefined, 'rain', 0, 100, 999, Number.NaN]) {
    assert.ok(allowed.includes(toCondition(code)), `unexpected condition for ${code}`);
  }
  assert.equal(toCondition('nope'), WEATHER_CONDITIONS.UNKNOWN);
  assert.equal(toCondition(999), WEATHER_CONDITIONS.UNKNOWN);
});

test('toIsDay reads the day/night suffix of the icon name', () => {
  assert.equal(toIsDay('10d'), true);
  assert.equal(toIsDay('01n'), false);
  assert.equal(toIsDay(''), undefined);
  assert.equal(toIsDay('10'), undefined);
  assert.equal(toIsDay(undefined), undefined);
});

test('readCondition reads the condition and the day/night flag together', () => {
  assert.deepEqual(readCondition({ weather: [{ id: 500, icon: '10n' }] }), {
    condition: WEATHER_CONDITIONS.RAIN,
    isDay: false,
  });
  // A rainy night stays 'rain': the deprecated 'night' condition would erase
  // the meteorology.
  assert.notEqual(
    readCondition({ weather: [{ id: 500, icon: '10n' }] }).condition,
    WEATHER_CONDITIONS.NIGHT,
  );
  assert.deepEqual(readCondition({}), {
    condition: WEATHER_CONDITIONS.UNKNOWN,
    isDay: undefined,
  });
});
