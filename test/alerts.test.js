import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_ALERT_SEVERITIES, WEATHER_ALERT_TYPES } from '@gladysassistant/integration-sdk';
import { formatAlerts, toAlertSeverity, toAlertType } from '../src/openweather/alerts.js';

test('the OpenWeather tags drive the phenomenon type', () => {
  assert.equal(toAlertType({ tags: ['Wind'] }), WEATHER_ALERT_TYPES.WIND);
  assert.equal(toAlertType({ tags: ['Snow/Ice'] }), WEATHER_ALERT_TYPES.SNOW);
  assert.equal(toAlertType({ tags: ['Coastal event'] }), WEATHER_ALERT_TYPES.COASTAL);
  assert.equal(toAlertType({ tags: ['Rain-flood'] }), WEATHER_ALERT_TYPES.FLOOD);
  assert.equal(toAlertType({ tags: ['Extreme high temperature'] }), WEATHER_ALERT_TYPES.HEAT);
});

test('the event wording is the fallback when the tags say nothing usable', () => {
  assert.equal(toAlertType({ tags: [], event: 'Vent violent' }), WEATHER_ALERT_TYPES.WIND);
  assert.equal(
    toAlertType({ event: 'Severe Thunderstorm Warning' }),
    WEATHER_ALERT_TYPES.THUNDERSTORM,
  );
  assert.equal(toAlertType({ event: 'Risque d avalanches' }), WEATHER_ALERT_TYPES.AVALANCHE);
  // "Pluie-inondation" is a flood warning, not a rain one.
  assert.equal(toAlertType({ event: 'Pluie-inondation' }), WEATHER_ALERT_TYPES.FLOOD);
  assert.equal(toAlertType({ event: 'Fortes pluies' }), WEATHER_ALERT_TYPES.RAIN);
});

test('an unclassifiable alert has no type at all', () => {
  // The type is optional metadata: the core keeps the alert and renders it
  // from its `event` text alone.
  assert.equal(toAlertType({ tags: ['Other dangers'], event: 'Alerte' }), undefined);
});

test('the severity is read from the national level in the wording', () => {
  assert.equal(
    toAlertSeverity({ event: 'Vigilance rouge Canicule' }),
    WEATHER_ALERT_SEVERITIES.EXTREME,
  );
  assert.equal(
    toAlertSeverity({ event: 'Extreme Heat Warning' }),
    WEATHER_ALERT_SEVERITIES.EXTREME,
  );
  assert.equal(
    toAlertSeverity({ event: 'Vigilance orange Orages' }),
    WEATHER_ALERT_SEVERITIES.SEVERE,
  );
  assert.equal(
    toAlertSeverity({ event: 'Severe Weather Warning' }),
    WEATHER_ALERT_SEVERITIES.SEVERE,
  );
  assert.equal(toAlertSeverity({ event: 'Vigilance jaune Vent' }), WEATHER_ALERT_SEVERITIES.MINOR);
  assert.equal(toAlertSeverity({ event: 'Frost Advisory' }), WEATHER_ALERT_SEVERITIES.MINOR);
});

test('an unranked alert defaults to moderate rather than being dropped', () => {
  assert.equal(toAlertSeverity({ event: 'Bulletin' }), WEATHER_ALERT_SEVERITIES.MODERATE);
  assert.equal(toAlertSeverity({}), WEATHER_ALERT_SEVERITIES.MODERATE);
});

test('formatAlerts drops what the pivot cannot carry', () => {
  const alerts = formatAlerts([
    null,
    'not an object',
    { event: '   ' }, // no usable event name
    { event: '  Vent violent  ', tags: ['Wind'] },
  ]);
  assert.deepEqual(alerts, [
    {
      severity: WEATHER_ALERT_SEVERITIES.MODERATE,
      event: 'Vent violent',
      type: WEATHER_ALERT_TYPES.WIND,
    },
  ]);
});

test('formatAlerts caps the list at the 10 alerts the core keeps', () => {
  const many = Array.from({ length: 14 }, (_unused, index) => ({ event: `Alerte ${index}` }));
  assert.equal(formatAlerts(many).length, 10);
});

test('formatAlerts returns an empty list when there is no alert block', () => {
  assert.deepEqual(formatAlerts(undefined), []);
  assert.deepEqual(formatAlerts([]), []);
});
