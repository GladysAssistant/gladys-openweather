// Trimmed-down but faithful samples of the two free OpenWeather endpoints,
// for Paris (timezone UTC+2), requested with `units=metric`.
//
// Timestamps: the current reading is 2026-08-01T10:00:00Z, the forecast starts
// at 2026-08-01T12:00:00Z and steps every 3 hours, so it spans two local days
// (Aug 1 up to 23:00 local, then Aug 2).

export const CURRENT_WEATHER = {
  coord: { lon: 2.3522, lat: 48.8566 },
  weather: [{ id: 500, main: 'Rain', description: 'light rain', icon: '10d' }],
  main: {
    temp: 21.53,
    feels_like: 21.47,
    temp_min: 20.1,
    temp_max: 22.8,
    pressure: 1013,
    humidity: 64,
  },
  visibility: 8000,
  wind: { speed: 4.470000000000001, deg: 240, gust: 8.75 },
  clouds: { all: 75 },
  rain: { '1h': 0.51 },
  dt: 1785578400,
  sys: { sunrise: 1785557400, sunset: 1785612000 },
  timezone: 7200,
  name: 'Paris',
};

const HOUR_IN_SECONDS = 3600;
const FIRST_FORECAST = 1785585600; // 2026-08-01T12:00:00Z, i.e. 14:00 in Paris

// [temperature, condition id, icon, pod, pop, rain over 3h]
const FORECAST_STEPS = [
  [23.4, 802, '03d', 'd', 0.2, 0],
  [22.1, 500, '10d', 'd', 0.44, 1.2],
  [19.8, 502, '10n', 'n', 0.86, 6.4],
  [17.2, 803, '04n', 'n', 0.1, 0],
  [15.6, 800, '01n', 'n', 0, 0],
  [14.9, 800, '01n', 'n', 0, 0],
  [17.4, 801, '02d', 'd', 0, 0],
  [21.9, 801, '02d', 'd', 0.05, 0],
  [25.2, 800, '01d', 'd', 0, 0], // 9th entry: dropped from `hours` (cap of 8)
];

export const FORECAST = {
  cod: '200',
  cnt: FORECAST_STEPS.length,
  list: FORECAST_STEPS.map(([temp, id, icon, pod, pop, rain], index) => ({
    dt: FIRST_FORECAST + index * 3 * HOUR_IN_SECONDS,
    main: {
      temp,
      feels_like: temp - 0.4,
      temp_min: temp - 0.6,
      temp_max: temp + 0.6,
      pressure: 1012,
      humidity: 60 + index,
    },
    weather: [{ id, main: 'Sample', description: 'sample', icon }],
    clouds: { all: 40 + index },
    wind: { speed: 3 + index * 0.5, deg: 200 + index, gust: 6 + index * 0.5 },
    visibility: 10000,
    pop,
    ...(rain > 0 ? { rain: { '3h': rain } } : {}),
    sys: { pod },
    dt_txt: new Date((FIRST_FORECAST + index * 3 * HOUR_IN_SECONDS) * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19),
  })),
  city: { name: 'Paris', timezone: 7200 },
};
