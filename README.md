# OpenWeather — Gladys external integration

[OpenWeather](https://openweathermap.org) as an **external integration** for
[Gladys Assistant](https://gladysassistant.com): a weather provider that feeds
the dashboard weather widget and the chat assistant, built on the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

It is the port of the OpenWeather service that lives inside the Gladys core
(`server/services/openweather`), rewritten as a **weather-type external
integration** (manifest `type: "weather"`, spec B.18). Installing it takes
precedence over the built-in service with zero configuration; stopping or
uninstalling it falls back to the built-in one automatically.

## What a weather integration is

A weather integration is **not** a device integration: it exposes no device,
publishes no state and answers no discovery. Its whole surface is a single SDK
handler:

```js
gladys.onWeatherGet(async ({ latitude, longitude, language, units }) => {
  // ...call the provider, return the pivot weather format
});
```

Gladys calls it whenever the weather widget or the chat assistant needs the
weather, awaits the answer under 15 s, then normalizes and bounds the payload
before using it. Throwing is a legitimate answer: the core acks the command as
failed and its provider loop falls through to the next weather provider.

The generic integration page therefore only shows **Configuration**,
**Supervision** and **Logs** — no Devices, no Discovery screens.

## Which OpenWeather API

Two APIs are supported, chosen in the Configuration screen:

| Setting            | Endpoints                                  | Needs                                                                      | What you get                                                                               |
| ------------------ | ------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Free** (default) | `/data/2.5/weather` + `/data/2.5/forecast` | any free account                                                           | current conditions, 24 h of 3-hourly forecast, 5 days                                      |
| **One Call 3.0**   | `/data/3.0/onecall`                        | the "One Call by Call" subscription (1000 free calls a day, card required) | the above **plus** real hourly detail, UV index, dew point and **national weather alerts** |

The free API is the default because it is the one the internal Gladys service
uses: an existing OpenWeather key keeps working as-is. Everything the pivot
format supports and the chosen API cannot provide is simply omitted — a
provider never sends a field it does not have.

### Mapping notes

- **Conditions.** The internal service mapped `weather[0].main` (8 coarse
  groups); this port maps the numeric [condition
  code](https://openweathermap.org/weather-conditions), which keeps the
  intensity the group name throws away: `502` → `pouring` rather than `rain`,
  `801` → `partly-cloudy` rather than `cloud`, `511`/`616` → `sleet`.
  OpenWeather has no hail code, so `hail` is never emitted.
- **Day and night.** The pivot's `weather` keeps the meteorology and the strict
  boolean `is_day` drives the day/night rendering variant (read from the `d`/`n`
  suffix of the OpenWeather icon). A rainy night stays `rain`, never the
  deprecated `night` condition.
- **Units.** Gladys sends the requesting user's preference (`metric` or `us`)
  and the answer uses it. OpenWeather reports the visibility in metres and the
  precipitation in millimetres whatever the unit system, so those two are
  converted here (km/mi and mm/in), and `pop` becomes a 0-100 percentage.
- **Alerts.** OpenWeather relays the national meteorological office's wording
  and provides neither a CAP severity nor a phenomenon type. The `type` comes
  from the OpenWeather `tags`, with the `event` wording as a fallback; the
  `severity` is read from the national level in the wording ("Vigilance
  orange" → `severe`, "Red warning" → `extreme`, "Advisory" → `minor`) and
  defaults to `moderate` when the wording does not say.
- **Cache.** A short in-memory cache (10 minutes by default, configurable, 0 to
  disable) sits in front of OpenWeather: the widget and the chat both ask for
  the weather, and re-reading a two-minute-old forecast would burn quota for
  nothing.

## Project structure

```
.
├─ index.js                          # SDK bootstrap: onWeatherGet, actions, status
├─ src/
│  ├─ config.js                      # config defaults + normalization
│  ├─ weather.js                     # the provider: cache + request orchestration
│  └─ openweather/
│     ├─ client.js                   # the only place that talks HTTP to OpenWeather
│     ├─ conditions.js               # condition codes -> the pivot enum, day/night
│     ├─ alerts.js                   # national alerts -> CAP severity + type
│     ├─ units.js                    # unit systems and conversions
│     ├─ pivot.js                    # helpers to assemble a pivot entry
│     ├─ formatFree.js               # /data/2.5 -> pivot format
│     └─ formatOneCall.js            # /data/3.0/onecall -> pivot format
├─ docs/
│  ├─ en.md                          # user documentation (re-hosted by Gladys,
│  └─ fr.md                          #   linked from the Configuration screen)
├─ gladys-assistant-integration.json # manifest (name, config schema, image…)
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ .github/workflows/release.yml     # UI-driven release: bump + tag + build
├─ .github/workflows/build.yml       # multi-arch build (git tag or called by release)
└─ cover.png                         # catalog cover, 800×534 px, ≤150 KB
```

## Requirements

- **Node.js ≥ 20** (uses the built-in global `fetch`; no HTTP dependency).
- **`@gladysassistant/integration-sdk` with the weather API** — `onWeatherGet`,
  `WEATHER_CONDITIONS`, `WEATHER_ALERT_SEVERITIES`, `WEATHER_ALERT_TYPES`.
- A **Gladys** with weather-integration support (spec B.18); the manifest
  declares the range in `gladys_version`.

> **⚠️ Temporary: the SDK is pinned to an unreleased commit.**
> The SDK weather API ([integration-sdk-js#19](https://github.com/GladysAssistant/integration-sdk-js/pull/19))
> and the Gladys core support ([Gladys#2738](https://github.com/GladysAssistant/Gladys/pull/2738))
> are both still open pull requests, so no published npm version carries
> `onWeatherGet` yet. To keep this repository installable and its CI green,
> `package.json` points at the source archive of the **exact commit** of the SDK
> pull request:
>
> ```
> https://github.com/GladysAssistant/integration-sdk-js/archive/af9d20b0e92415c242265c5ee0647f5c618332ec.tar.gz
> ```
>
> An https tarball rather than a `git+…` dependency on purpose: npm rewrites
> GitHub git dependencies to `git+ssh://` in the lockfile, which then fails on
> any CI runner without an SSH key. The tarball resolves over plain https, is
> pinned to an immutable commit, carries an integrity hash and needs no `git`
> in the Docker image.
>
> **When the SDK ships the weather API, do these three things:**
>
> 1. set the dependency back to a plain version (`"^0.10.0"`) and run
>    `npm install` to refresh `package-lock.json`;
> 2. set `gladys_version` in the manifest to the Gladys release that carries
>    B.18 (it currently guesses `>=4.85.0`);
> 3. re-run `npx github:GladysAssistant/integration-store .` — the store schema
>    only accepts `type: "weather"` once Gladys#2738 has landed.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="openweather" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container. The SDK reads them
automatically.

## Quality checks

```bash
npm run format:check   # Prettier: is everything formatted?
npm run format         # Prettier: format everything in place
npm run lint           # ESLint: catch real mistakes
npm test               # Unit tests, via the built-in `node --test` runner
```

Tests live in [`test/`](test/) and use Node's native test runner. They cover the
condition mapping, the unit conversions, both formatters (against trimmed real
OpenWeather payloads), the alert classification, the cache and the
manifest/code consistency — no network access, `fetch` is stubbed.

## Validate before publishing

```bash
npx github:GladysAssistant/integration-store .
```

Runs the exact same checks as the store indexer — manifest JSON & schema,
Docker image availability, cover image, code rules — and reports every problem
at once.

## Publish

1. **Add the GitHub topic** `gladys-assistant-integration` to the repository.
2. **Release from the GitHub UI**: **Actions → Release → Run workflow**, pick
   `patch`, `minor` or `major`. The workflow bumps the version everywhere
   (`package.json` + manifest `version`/`docker_image`), pushes the `vX.Y.Z`
   tag and builds the `linux/amd64` + `linux/arm64` image to `ghcr.io`.
3. The decentralized indexer picks up the new manifest `version` and Gladys
   offers a one-click install / update.

## License

Apache-2.0
