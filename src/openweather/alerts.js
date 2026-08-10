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
//     carries the national level ("Vigilance orange", "Yellow Wind warning",
//     "Severe thunderstorm watch"). When nothing matches we return `moderate`:
//     a warning was issued, we simply cannot rank it.
// An alert whose `type` cannot be determined is still published — the core
// drops the invalid type and renders the alert from its `event` text alone.
// Getting the `type` right is what makes the alert READABLE in the user's
// language: the widget shows a translated label for a typed alert, and falls
// back to the raw English `event` for an untyped one (OpenWeather serves the
// alert wording in English whatever the `lang` parameter says).
//
// Two habits of the relayed bulletins are handled here rather than left to the
// widget:
//   - the SAME bulletin text is repeated on every alert of an area (Météo
//     France sends the whole department bulletin as each alert's description),
//     so a description already published is dropped from the next alerts;
//   - OpenWeather keeps serving a bulletin well past its `end` date, so an
//     expired alert is dropped instead of taking one of the 10 slots.
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
  { type: WEATHER_ALERT_TYPES.FLOOD, pattern: /flood|inondation|crue|ruissellement/i },
  {
    type: WEATHER_ALERT_TYPES.SNOW,
    pattern: /snow|neige|verglas|blizzard|freezing|\bice\b|\bicy\b|glace/i,
  },
  { type: WEATHER_ALERT_TYPES.HEAT, pattern: /heat|canicule|chaleur|high temperature/i },
  {
    type: WEATHER_ALERT_TYPES.COLD,
    pattern: /\bcold\b|froid|frost|\bgel\b|gelée|givre|low temperature/i,
  },
  { type: WEATHER_ALERT_TYPES.FOG, pattern: /\bfog\b|brouillard|\bbrume/i },
  {
    type: WEATHER_ALERT_TYPES.WIND,
    pattern: /wind|vent|gale|squall|tornad|tempête|hurricane|cyclone|typhoon|tropical storm/i,
  },
  { type: WEATHER_ALERT_TYPES.RAIN, pattern: /rain|pluie|averses|precipitation/i },
];

// The national vigilance COLOUR, when the wording carries one. It is read
// before anything else because it is the level the issuing office actually
// published: "Yellow Wind warning" is a minor alert, and the generic `warning`
// keyword must not promote it to severe.
const SEVERITY_BY_COLOUR = [
  {
    severity: WEATHER_ALERT_SEVERITIES.EXTREME,
    pattern: /\bred\b|\brouge\b|\bviolet\b|\bpurple\b/i,
  },
  { severity: WEATHER_ALERT_SEVERITIES.SEVERE, pattern: /\borange\b/i },
  {
    severity: WEATHER_ALERT_SEVERITIES.MINOR,
    pattern: /\byellow\b|\bjaune\b|\bgreen\b|\bvert\b/i,
  },
];

// No colour: rank on the severity words of the wording. Ordered from the most
// severe, because several of them co-occur ("Extreme Heat Warning" must not be
// downgraded by the `warning` keyword of the `severe` rule).
const SEVERITY_BY_WORDING = [
  { severity: WEATHER_ALERT_SEVERITIES.EXTREME, pattern: /extreme|emergency|catastroph/i },
  { severity: WEATHER_ALERT_SEVERITIES.SEVERE, pattern: /severe|major|danger|warning/i },
  {
    severity: WEATHER_ALERT_SEVERITIES.MINOR,
    pattern: /minor|advisory|watch|statement/i,
  },
];

// The phenomenon labels are stripped from the wording before it is ranked:
// "Extreme high temperature" is the OpenWeather name of the PHENOMENON, not a
// severity, and an "Orange Extreme high temperature warning" is an orange
// vigilance — a severe alert, not an extreme one.
const PHENOMENON_LABELS = Object.keys(TYPE_BY_TAG).sort((a, b) => b.length - a.length);

/**
 * Escape a string so it can be embedded in a regular expression.
 * @param {string} value the raw string
 */
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The wording a severity is read from: the event name, minus the phenomenon
 * labels — the alert's own `tags` included, since an office may name a
 * phenomenon OpenWeather does not tag.
 * @param {object} alert a raw One Call alert
 */
function severityWording(alert) {
  const tags = Array.isArray(alert?.tags)
    ? alert.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const labels = [...tags, ...PHENOMENON_LABELS].sort((a, b) => b.length - a.length);
  const wording = typeof alert?.event === 'string' ? alert.event : '';
  return labels.reduce(
    (text, label) => text.replace(new RegExp(escapeForRegExp(label), 'gi'), ' '),
    wording,
  );
}

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
  const wording = severityWording(alert);
  const matched =
    SEVERITY_BY_COLOUR.find(({ pattern }) => pattern.test(wording)) ??
    SEVERITY_BY_WORDING.find(({ pattern }) => pattern.test(wording));
  // A warning was issued: `moderate` is the honest default when its own
  // wording does not say how bad it is.
  return matched?.severity ?? WEATHER_ALERT_SEVERITIES.MODERATE;
}

/**
 * Clean up a bulletin text: trim it, and drop the paragraphs it repeats.
 * A bulletin relayed for several phenomena often concatenates the same block
 * once per phenomenon; the widget would print all of them.
 * @param {unknown} rawDescription the `description` of a raw One Call alert
 */
function toDescription(rawDescription) {
  if (typeof rawDescription !== 'string') {
    return undefined;
  }
  const paragraphs = rawDescription
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const distinct = [...new Set(paragraphs)];
  return distinct.length > 0 ? distinct.join('\n\n') : undefined;
}

/**
 * The comparison key of a bulletin text: the same paragraph re-wrapped by the
 * relay must count as the same text.
 * @param {string} description a cleaned-up bulletin text
 */
function descriptionKey(description) {
  return description.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Whether an alert is still running. OpenWeather keeps serving a bulletin long
 * after its end date; publishing it would show an expired vigilance, and would
 * take one of the 10 slots the core keeps.
 * @param {object} alert a raw One Call alert
 * @param {number} now current time in milliseconds
 */
function isOngoing(alert, now) {
  return !Number.isFinite(alert?.end) || alert.end * 1000 >= now;
}

/**
 * Format the `alerts` array of a One Call 3.0 response into pivot alerts.
 * @param {unknown} rawAlerts the `alerts` field of the response
 * @param {number} [now] current time in milliseconds (injectable for the tests)
 */
export function formatAlerts(rawAlerts, now = Date.now()) {
  if (!Array.isArray(rawAlerts)) {
    return [];
  }

  // Two bulletins of a same area repeat each other: the identical alerts are
  // dropped outright, and a text already published is not published twice.
  const seenAlerts = new Set();
  const seenDescriptions = new Set();

  return rawAlerts
    .filter((alert) => alert !== null && typeof alert === 'object')
    .filter((alert) => isOngoing(alert, now))
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
      if (Number.isFinite(rawAlert.start)) {
        alert.start = new Date(rawAlert.start * 1000);
      }
      if (Number.isFinite(rawAlert.end)) {
        alert.end = new Date(rawAlert.end * 1000);
      }

      const identity = [alert.severity, alert.type ?? '', event, rawAlert.start, rawAlert.end].join(
        '|',
      );
      if (seenAlerts.has(identity)) {
        return undefined;
      }
      seenAlerts.add(identity);

      const description = toDescription(rawAlert.description);
      if (description !== undefined) {
        const key = descriptionKey(description);
        if (!seenDescriptions.has(key)) {
          seenDescriptions.add(key);
          alert.description = description;
        }
      }

      return alert;
    })
    .filter((alert) => alert !== undefined)
    .slice(0, MAX_ALERTS);
}
