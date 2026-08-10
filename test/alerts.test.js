import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEATHER_ALERT_SEVERITIES, WEATHER_ALERT_TYPES } from '@gladysassistant/integration-sdk';
import { formatAlerts, toAlertSeverity, toAlertType } from '../src/openweather/alerts.js';

// The moment the tests are run "at": the alert formatting drops the bulletins
// that have expired, so it needs a fixed reference.
const NOW = Date.parse('2026-08-01T10:00:00.000Z');

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

test('the event wording covers the phenomena the tags do not name', () => {
  assert.equal(toAlertType({ event: 'Neige-verglas' }), WEATHER_ALERT_TYPES.SNOW);
  assert.equal(toAlertType({ event: 'Freezing rain' }), WEATHER_ALERT_TYPES.SNOW);
  assert.equal(toAlertType({ event: 'Grand froid' }), WEATHER_ALERT_TYPES.COLD);
  assert.equal(toAlertType({ event: 'Risque de gel' }), WEATHER_ALERT_TYPES.COLD);
  assert.equal(toAlertType({ event: 'Brouillard dense' }), WEATHER_ALERT_TYPES.FOG);
  assert.equal(toAlertType({ event: 'Tropical Storm Warning' }), WEATHER_ALERT_TYPES.WIND);
  assert.equal(toAlertType({ event: 'Tornado Watch' }), WEATHER_ALERT_TYPES.WIND);
  assert.equal(toAlertType({ event: 'Vagues-submersion' }), WEATHER_ALERT_TYPES.COASTAL);
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

test('the vigilance colour outranks the generic severity words', () => {
  // OpenWeather relays the MeteoAlarm wording, in which EVERY alert is a
  // "warning": the colour is the level the office actually published.
  assert.equal(toAlertSeverity({ event: 'Yellow Wind warning' }), WEATHER_ALERT_SEVERITIES.MINOR);
  assert.equal(
    toAlertSeverity({ event: 'Orange Rain-Flood warning' }),
    WEATHER_ALERT_SEVERITIES.SEVERE,
  );
  assert.equal(toAlertSeverity({ event: 'Red Wind warning' }), WEATHER_ALERT_SEVERITIES.EXTREME);
});

test('a phenomenon named "extreme" is not an extreme alert', () => {
  // "Extreme high temperature" is the OpenWeather name of the phenomenon; the
  // level is the colour next to it.
  assert.equal(
    toAlertSeverity({
      event: 'Yellow Extreme high temperature warning',
      tags: ['Extreme high temperature'],
    }),
    WEATHER_ALERT_SEVERITIES.MINOR,
  );
  assert.equal(
    toAlertSeverity({
      event: 'Orange Extreme high temperature warning',
      tags: ['Extreme high temperature'],
    }),
    WEATHER_ALERT_SEVERITIES.SEVERE,
  );
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

test('a bulletin repeated on every alert of the area is published once', () => {
  // Météo France sends the whole department bulletin as the description of
  // each phenomenon: without this, the widget prints it once per alert.
  const bulletin = 'Vent violent et fortes pluies attendus sur le département.';
  const alerts = formatAlerts(
    [
      { event: 'Orange Wind warning', tags: ['Wind'], description: bulletin },
      { event: 'Orange Rain-Flood warning', tags: ['Rain-flood'], description: `  ${bulletin}  ` },
    ],
    NOW,
  );

  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].description, bulletin);
  assert.equal('description' in alerts[1], false);
});

test('a bulletin that repeats itself is collapsed', () => {
  const [alert] = formatAlerts(
    [{ event: 'Orange Wind warning', description: 'Rafales à 100 km/h.\n\nRafales à 100 km/h.' }],
    NOW,
  );
  assert.equal(alert.description, 'Rafales à 100 km/h.');
});

test('an identical alert sent twice is published once', () => {
  const alert = { event: 'Orange Wind warning', tags: ['Wind'], start: 1000, end: 2000 };
  assert.equal(formatAlerts([alert, { ...alert }], 1_000_000).length, 1);
});

test('an expired bulletin is dropped instead of taking one of the 10 slots', () => {
  // OpenWeather keeps serving a bulletin well past its end date.
  const alerts = formatAlerts(
    [
      { event: 'Orange Wind warning', end: NOW / 1000 - 3600 },
      { event: 'Yellow Rain-Flood warning', end: NOW / 1000 + 3600 },
      { event: 'Bulletin sans fin' },
    ],
    NOW,
  );
  assert.deepEqual(
    alerts.map((alert) => alert.event),
    ['Yellow Rain-Flood warning', 'Bulletin sans fin'],
  );
});

test('formatAlerts returns an empty list when there is no alert block', () => {
  assert.deepEqual(formatAlerts(undefined), []);
  assert.deepEqual(formatAlerts([]), []);
});
