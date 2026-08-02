import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  precipitationFromMillimetres,
  probabilityFromRatio,
  round,
  toFiniteNumber,
  toOpenWeatherUnits,
  visibilityFromMetres,
} from '../src/openweather/units.js';

test('toOpenWeatherUnits translates the pivot unit systems', () => {
  assert.equal(toOpenWeatherUnits('metric'), 'metric');
  assert.equal(toOpenWeatherUnits('us'), 'imperial');
  assert.equal(toOpenWeatherUnits(undefined), 'metric');
});

test('round keeps the wanted precision and drops what is not a number', () => {
  assert.equal(round(4.470000000000001), 4.5);
  assert.equal(round(4.44, 1), 4.4);
  assert.equal(round(87.6, 0), 88);
  assert.equal(round(null), undefined);
  assert.equal(round(undefined), undefined);
  assert.equal(round(Number.NaN), undefined);
});

test('visibility converts the OpenWeather metres to km or miles', () => {
  assert.equal(visibilityFromMetres(10000, 'metric'), 10);
  assert.equal(visibilityFromMetres(10000, 'us'), 6.2);
  assert.equal(visibilityFromMetres(undefined, 'metric'), undefined);
});

test('precipitation stays in mm for metric and becomes inches for us', () => {
  assert.equal(precipitationFromMillimetres(2.54, 'metric'), 2.54);
  assert.equal(precipitationFromMillimetres(25.4, 'us'), 1);
  assert.equal(precipitationFromMillimetres(undefined, 'us'), undefined);
});

test('the probability of precipitation becomes a 0-100 percentage', () => {
  assert.equal(probabilityFromRatio(0), 0);
  assert.equal(probabilityFromRatio(0.64), 64);
  assert.equal(probabilityFromRatio(1), 100);
  // The pivot percentages are clamped by the core; never send it out of range.
  assert.equal(probabilityFromRatio(1.4), 100);
  assert.equal(probabilityFromRatio(-1), 0);
  assert.equal(probabilityFromRatio(undefined), undefined);
});

test('a null or empty field is dropped, never turned into a believable 0', () => {
  // Number(null), Number('') and Number([]) are all 0: publishing that would
  // mean "no wind gust at all" instead of "OpenWeather did not say".
  for (const value of [null, '', [], {}, true]) {
    assert.equal(round(value), undefined);
    assert.equal(toFiniteNumber(value), undefined);
    assert.equal(visibilityFromMetres(value, 'metric'), undefined);
    assert.equal(precipitationFromMillimetres(value, 'metric'), undefined);
    assert.equal(probabilityFromRatio(value), undefined);
  }
});
