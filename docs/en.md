# OpenWeather

This integration provides the weather displayed in Gladys: the dashboard
weather widget, and the answers of the chat assistant when you ask "what is the
weather like?".

Once installed and configured, it takes over from the OpenWeather service built
into Gladys, with nothing else to do. If you stop or uninstall it, Gladys falls
back to the built-in service automatically.

## 1. Get an OpenWeather API key

1. Create a free account on
   [openweathermap.org](https://home.openweathermap.org/users/sign_up).
2. Open the [**API keys**](https://home.openweathermap.org/api_keys) tab of your
   account and copy the key (a 32-character string).
3. **Be patient**: a brand-new key takes up to a couple of hours before
   OpenWeather activates it. Until then, every request answers `401`.

## 2. Configure the integration

Open the **Configuration** tab of the integration and fill in:

- **API key** — the key you just copied. It is stored as a secret: Gladys never
  sends it back to the browser.
- **OpenWeather API** — which API to call:
  - **Free** (default): works with any account. Current conditions, 24 hours of
    3-hourly forecast and 5 days.
  - **One Call 3.0**: needs the "One Call by Call" subscription on your
    OpenWeather account (1000 calls a day are free, but a credit card is
    required to subscribe). It adds real hour-by-hour forecasts, the UV index,
    the dew point and the **national weather alerts** (Météo-France vigilance,
    NWS warnings…), which the free API does not carry.
- **Cache duration** — how long an answer is reused before calling OpenWeather
  again, in seconds (10 minutes by default). It keeps the dashboard well within
  the free quota. Set it to 0 if you want every refresh to hit the API.

Save. The status at the top of the page turns green as soon as the integration
can serve the weather.

## 3. Check it works

The **Test the connection** button runs a real request to OpenWeather (Paris by
default, change the coordinates to your own if you like) and shows the
temperature, the condition and the number of forecast days it got back. It
bypasses the cache, so it always tells you the truth about the current state of
your key.

Then open your dashboard: the weather widget shows the location configured in
your Gladys house.

## Where the location comes from

The integration does not store a location: Gladys sends the coordinates of the
house that asks, along with the language and the unit system (°C or °F) of the
user who asks. Change your house address or your unit preference in Gladys and
this integration follows.

## Troubleshooting

| What you see                                                               | What it means                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "OpenWeather rejected the API key (HTTP 401)"                              | The key is wrong, or it is not active yet (wait up to a couple of hours after creating it).                                     |
| "OpenWeather does not serve /data/3.0/onecall for this account (HTTP 404)" | You selected One Call 3.0 without the matching subscription. Subscribe on the OpenWeather site, or switch back to the free API. |
| "OpenWeather quota exceeded (HTTP 429)"                                    | Too many calls. Raise the cache duration, or upgrade your OpenWeather plan.                                                     |
| The widget shows the weather but no alerts                                 | Weather alerts only exist on One Call 3.0, and only where a meteorological office has issued one.                               |

The integration logs every request it makes: open the integration logs from the
Gladys UI (or `docker logs` on the host). Set `LOG_LEVEL=debug` for the full
detail, including the URLs called (the API key is never logged).
