// -----------------------------------------------------------------------------
// OpenWeather national weather alerts -> the CAP-style pivot alerts.
//
// Only the One Call 3.0 API returns alerts. Each one looks like:
//   { sender_name, event, start, end, description, tags: ['Wind'] }
//
// The pivot needs a CAP `severity` (minor | moderate | severe | extreme) and an
// optional phenomenon `type` — OpenWeather provides NEITHER as such: it relays
// the national meteorological office's own wording. So:
//   - `type` comes from the OpenWeather `tags` (a short, stable vocabulary),
//     with the free-text `event` as a fallback;
//   - `severity` is read from the wording of the alert, which in practice
//     carries the national level ("Vigilance orange", "Red warning", "Severe
//     thunderstorm watch"). When nothing matches we return `moderate`: a
//     warning was issued, we simply cannot rank it.
// An alert whose `type` cannot be determined is still published — the core
// drops the invalid type and renders the alert from its `event` text alone.
// -----------------------------------------------------------------------------

import { WEATHER_ALERT_SEVERITIES, WEATHER_ALERT_TYPES } from '@gladysassistant/integration-sdk';

// Bound mirrored from the core: anything past the 10th alert is dropped
// on arrival, so there is no point sending more.
const MAX_ALERTS = 10;

// The documented OpenWeather tag vocabulary, lowercased.
const TYPE_BY_TAG = {
  wind: WEATHER_ALERT_TYPES.WIND,
  'snow/ice': WEATHER_ALERT_TYPES.SNOW,
  snow: WEATHER_ALERT_TYPES.SNOW,
  ice: WEATHER_ALERT_TYPES.SNOW,
  thunderstorm: WEATHER_ALERT_TYPES.THUNDERSTORM,
  thunderstorms: WEATHER_ALERT_TYPES.THUNDERSTORM,
  fog: WEATHER_ALERT_TYPES.FOG,
  'high temperature': WEATHER_ALERT_TYPES.HEAT,
  'extreme high temperature': WEATHER_ALERT_TYPES.HEAT,
  'low temperature': WEATHER_ALERT_TYPES.COLD,
  'extreme low temperature': WEATHER_ALERT_TYPES.COLD,
  'coastal event': WEATHER_ALERT_TYPES.COASTAL,
  avalanche: WEATHER_ALERT_TYPES.AVALANCHE,
  avalanches: WEATHER_ALERT_TYPES.AVALANCHE,
  rain: WEATHER_ALERT_TYPES.RAIN,
  flood: WEATHER_ALERT_TYPES.FLOOD,
  flooding: WEATHER_ALERT_TYPES.FLOOD,
  'rain-flood': WEATHER_ALERT_TYPES.FLOOD,
};

// Fallback on the event wording, English and French (the two languages the
// weather widget is used in most). Ordered from the most specific phenomenon
// to the most generic, because several keywords co-occur in a single event
// name ("Pluie-inondation" is a flood warning, not a rain one).
const TYPE_BY_EVENT = [
  { type: WEATHER_ALERT_TYPES.AVALANCHE, pattern: /avalanche/i },
  { type: WEATHER_ALERT_TYPES.THUNDERSTORM, pattern: /thunder|orage/i },
  { type: WEATHER_ALERT_TYPES.COASTAL, pattern: /coastal|submersion|vagues|storm surge/i },
  { type: WEATHER_ALERT_TYPES.FLOOD, pattern: /flood|inondation|crue/i },
  { type: WEATHER_ALERT_TYPES.SNOW, pattern: /snow|neige|verglas|blizzard|\bice\b/i },
  { type: WEATHER_ALERT_TYPES.HEAT, pattern: /heat|canicule|chaleur|high temperature/i },
  { type: WEATHER_ALERT_TYPES.COLD, pattern: /\bcold\b|froid|frost|low temperature/i },
  { type: WEATHER_ALERT_TYPES.FOG, pattern: /\bfog\b|brouillard/i },
  { type: WEATHER_ALERT_TYPES.WIND, pattern: /wind|vent|gale|squall|tornado|tempête|hurricane/i },
  { type: WEATHER_ALERT_TYPES.RAIN, pattern: /rain|pluie|averses|precipitation/i },
];

// The national levels, as they appear in the alert wording. Ordered from the
// most severe: "extreme heat warning" must not be downgraded by the `warning`
// keyword of the `severe` rule.
const SEVERITY_BY_WORDING = [
  { severity: WEATHER_ALERT_SEVERITIES.EXTREME, pattern: /extreme|rouge|\bred\b|emergency/i },
  { severity: WEATHER_ALERT_SEVERITIES.SEVERE, pattern: /severe|orange|major|danger|warning/i },
  {
    severity: WEATHER_ALERT_SEVERITIES.MINOR,
    pattern: /minor|yellow|jaune|advisory|watch|statement/i,
  },
];

/**
 * Guess the phenomenon type of an alert. `undefined` when nothing matches:
 * the type is optional metadata, an alert is never dropped for lacking it.
 * @param {object} alert a raw One Call alert
 */
export function toAlertType(alert) {
  const tags = Array.isArray(alert?.tags) ? alert.tags : [];
  for (const tag of tags) {
    if (typeof tag === 'string') {
      const type = TYPE_BY_TAG[tag.trim().toLowerCase()];
      if (type !== undefined) {
        return type;
      }
    }
  }
  const wording = typeof alert?.event === 'string' ? alert.event : '';
  return TYPE_BY_EVENT.find(({ pattern }) => pattern.test(wording))?.type;
}

/**
 * Rank an alert on the CAP severity scale, from its wording.
 * @param {object} alert a raw One Call alert
 */
export function toAlertSeverity(alert) {
  const wording = [alert?.event, ...(Array.isArray(alert?.tags) ? alert.tags : [])]
    .filter((part) => typeof part === 'string')
    .join(' ');
  const matched = SEVERITY_BY_WORDING.find(({ pattern }) => pattern.test(wording));
  // A warning was issued: `moderate` is the honest default when its own
  // wording does not say how bad it is.
  return matched?.severity ?? WEATHER_ALERT_SEVERITIES.MODERATE;
}

/**
 * Format the `alerts` array of a One Call 3.0 response into pivot alerts.
 * @param {unknown} rawAlerts the `alerts` field of the response
 */
export function formatAlerts(rawAlerts) {
  if (!Array.isArray(rawAlerts)) {
    return [];
  }

  return rawAlerts
    .filter((alert) => alert !== null && typeof alert === 'object')
    .map((rawAlert) => {
      const event = typeof rawAlert.event === 'string' ? rawAlert.event.trim() : '';
      if (event.length === 0) {
        return undefined;
      }

      const alert = {
        severity: toAlertSeverity(rawAlert),
        event,
      };

      const type = toAlertType(rawAlert);
      if (type !== undefined) {
        alert.type = type;
      }
      if (typeof rawAlert.description === 'string' && rawAlert.description.trim().length > 0) {
        alert.description = rawAlert.description.trim();
      }
      if (Number.isFinite(rawAlert.start)) {
        alert.start = new Date(rawAlert.start * 1000);
      }
      if (Number.isFinite(rawAlert.end)) {
        alert.end = new Date(rawAlert.end * 1000);
      }
      return alert;
    })
    .filter((alert) => alert !== undefined)
    .slice(0, MAX_ALERTS);
}
