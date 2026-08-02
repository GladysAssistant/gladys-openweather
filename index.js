// -----------------------------------------------------------------------------
// Entry point of the Gladys external integration.
//
// This is a WEATHER integration (manifest `type: "weather"`): it exposes no
// device, publishes no state and answers no discovery. Its whole job is one
// handler — `onWeatherGet` — which the core calls whenever the dashboard
// weather widget or the chat assistant needs the weather. Installing it takes
// precedence over the built-in OpenWeather service with zero configuration;
// stopping or uninstalling it falls back automatically.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { isConfigured, normalizeConfig } from './src/config.js';
import { clearCache, getWeather } from './src/weather.js';

const gladys = new GladysIntegration();

// Current configuration (hot-reloaded via onConfigUpdated).
let config = normalizeConfig();

// Last status published to Gladys, so a weather request every few minutes does
// not re-post the same status over and over.
let lastPublishedStatus;

// --- The weather provider API ------------------------------------------------
// `options` is `{ latitude, longitude, language, units }`; `units` is the
// requesting user's preference ('metric' or 'us') and the resolved payload MUST
// use it. The ack is awaited under 15 s (not the usual 5 s), so a fresh call to
// OpenWeather fits. Throwing acks the command as failed and the core's provider
// loop falls through to the next provider.
gladys.onWeatherGet(async (options) => {
  logger.info(`onWeatherGet <- ${options?.latitude}, ${options?.longitude} (${options?.units})`);
  try {
    const weather = await getWeather(config, options);
    await publishStatus(true);
    return weather;
  } catch (err) {
    logger.error('Weather request failed', err);
    await publishStatus(false, {
      en: `OpenWeather is unreachable: ${err.message}`,
      fr: `OpenWeather est injoignable : ${err.message}`,
    });
    throw err;
  }
});

// --- Manifest action: the "Test the connection" button ------------------------
// Declared in the `actions` field of the manifest; the resolved message is
// displayed under the button (a thrown error is displayed too). The ack is
// awaited under the action's `timeout_seconds`.
gladys.onAction('test_weather', async (fields) => {
  logger.info('Action test_weather -> live request to OpenWeather');
  // The test must exercise the real API, never a cached answer.
  clearCache();
  const weather = await getWeather(config, {
    latitude: fields?.latitude,
    longitude: fields?.longitude,
    language: 'en',
    units: 'metric',
  });
  clearCache();
  return {
    en: `OpenWeather OK: ${weather.temperature}°, ${weather.weather}, ${weather.days?.length ?? 0} days of forecast.`,
    fr: `OpenWeather OK : ${weather.temperature}°, ${weather.weather}, ${weather.days?.length ?? 0} jours de prévisions.`,
  };
});

// --- Configuration updated by the user ---------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  config = normalizeConfig(newConfig);
  // A new API key, another API or another cache duration: the answers cached
  // under the previous settings must not be served again.
  clearCache();
  await publishConfigurationStatus();
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK itself logs the WebSocket lifecycle (connections, disconnections,
// reconnection attempts) under the `gladys-sdk` name: these handlers only run
// the integration's own (re)initialization.
gladys.on('connected', async () => {
  try {
    config = normalizeConfig(await gladys.getConfig());
    clearCache();
    await publishConfigurationStatus();
  } catch (err) {
    logger.error('Post-connection initialization failed', err);
    await publishStatus(false, {
      en: 'Initialization failed, check the integration logs.',
      fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    });
  }
});

// Report the application-level status shown in the Configuration screen.
// Distinct from the container state machine: the integration can be RUNNING
// and still have no usable API key.
//
// Deliberately NOT probing OpenWeather here: a probe would spend a quota call
// on every restart and every configuration save. The status starts from what we
// know (is there a key?) and is corrected by the first real weather request.
async function publishConfigurationStatus() {
  if (isConfigured(config)) {
    await publishStatus(true);
    return;
  }
  await publishStatus(false, {
    en: 'No OpenWeather API key yet: paste yours in the configuration below.',
    fr: "Pas encore de clé d'API OpenWeather : collez la vôtre dans la configuration ci-dessous.",
  });
}

/**
 * Publish the connection status, but only when it actually changed.
 * @param {boolean} connected whether the integration can serve the weather
 * @param {object} [message] multi-language explanation, when it cannot
 */
async function publishStatus(connected, message) {
  const status = JSON.stringify({ connected, message });
  if (status === lastPublishedStatus) {
    return;
  }
  lastPublishedStatus = status;
  try {
    await gladys.setConnectionStatus(connected, message);
  } catch (err) {
    lastPublishedStatus = undefined;
    logger.error('Publishing the connection status failed', err);
  }
}

gladys.on('disconnected', () => {
  // Force a fresh status publication on the next connection.
  lastPublishedStatus = undefined;
});

// --- Graceful shutdown -------------------------------------------------------
// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  clearCache();
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the OpenWeather integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
