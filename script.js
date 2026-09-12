// ---------------------------------------------------------
// Atlas Weather Dashboard
// Fetches live data from the free Open-Meteo API (no key required):
//   1. Geocoding API  — turns a city name into coordinates
//   2. Forecast API   — turns coordinates into current + daily weather
// ---------------------------------------------------------

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes -> human-readable condition.
const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm, slight hail",
  99: "Thunderstorm, heavy hail",
};

function describeWeatherCode(code) {
  return WEATHER_CODES[code] || "Conditions unavailable";
}

// ---- DOM references -------------------------------------------------

const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const retryBtn = document.getElementById("retry-btn");

const states = {
  empty: document.getElementById("state-empty"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  data: document.getElementById("state-data"),
};

let lastQuery = "";

function showState(name) {
  Object.values(states).forEach((el) => el.classList.add("hidden"));
  states[name].classList.remove("hidden");
}

// ---- Fetch helpers ----------------------------------------------------

// Wraps fetch with response-status checking, since fetch() only rejects
// on network failure — a 404/500 still "succeeds" and must be checked manually.
async function fetchJSON(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    throw new Error("Could not reach the weather service. Check your connection.");
  }

  if (!response.ok) {
    throw new Error(`Weather service returned an error (status ${response.status}).`);
  }

  try {
    return await response.json();
  } catch (parseError) {
    throw new Error("Received an unreadable response from the weather service.");
  }
}

async function geocodeCity(cityName) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
  const data = await fetchJSON(url);

  if (!data.results || data.results.length === 0) {
    throw new Error(`No city found matching "${cityName}". Try a different spelling.`);
  }

  const { latitude, longitude, name, country, admin1 } = data.results[0];
  return { latitude, longitude, name, country, admin1 };
}

async function getForecast(latitude, longitude) {
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weathercode,wind_speed_10m,wind_gusts_10m,surface_pressure,cloud_cover",
    daily: "weathercode,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "6",
  });

  const data = await fetchJSON(`${FORECAST_URL}?${params.toString()}`);

  if (!data.current || !data.daily) {
    throw new Error("The forecast response was missing expected data.");
  }

  return data;
}

// ---- Rendering ----------------------------------------------------------

function renderLocation(place) {
  const region = [place.admin1, place.country].filter(Boolean).join(", ");
  document.getElementById("loc-name").textContent = place.name;
  document.getElementById("loc-meta").textContent = region || "—";
}

function renderCurrent(current) {
  const round = (n) => Math.round(n);

  document.getElementById("temp-value").textContent = round(current.temperature_2m);
  document.getElementById("condition-text").textContent = describeWeatherCode(current.weathercode);
  document.getElementById("feels-like").textContent = round(current.apparent_temperature);
  document.getElementById("humidity").textContent = round(current.relative_humidity_2m);
  document.getElementById("wind-speed").textContent = round(current.wind_speed_10m);
  document.getElementById("wind-gusts").textContent = round(current.wind_gusts_10m);
  document.getElementById("pressure").textContent = round(current.surface_pressure);
  document.getElementById("cloud-cover").textContent = round(current.cloud_cover);
}

function renderForecast(daily) {
  const strip = document.getElementById("forecast-strip");
  strip.innerHTML = ""; // clear any previous render

  // Skip index 0 (today, already shown above) — show the next 5 days.
  const days = daily.time.slice(1, 6);

  days.forEach((isoDate, i) => {
    const idx = i + 1;
    const date = new Date(isoDate);
    const label = date.toLocaleDateString(undefined, { weekday: "short" });
    const hi = Math.round(daily.temperature_2m_max[idx]);
    const lo = Math.round(daily.temperature_2m_min[idx]);

    const dayEl = document.createElement("div");
    dayEl.className = "forecast-day";
    dayEl.innerHTML = `
      <div class="forecast-day-label">${label}</div>
      <div class="forecast-day-temps">${hi}° <span class="lo">${lo}°</span></div>
    `;
    strip.appendChild(dayEl);
  });
}

function renderTimestamp() {
  const now = new Date();
  document.getElementById("last-updated").textContent =
    "Updated " + now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ---- Main flow ----------------------------------------------------------

async function loadWeatherFor(cityName) {
  showState("loading");
  try {
    const place = await geocodeCity(cityName);
    const forecast = await getForecast(place.latitude, place.longitude);

    renderLocation(place);
    renderCurrent(forecast.current);
    renderForecast(forecast.daily);
    renderTimestamp();

    showState("data");
  } catch (err) {
    document.getElementById("error-message").textContent = err.message;
    showState("error");
  }
}

// ---- Event wiring ----------------------------------------------------

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) return;
  lastQuery = query;
  loadWeatherFor(query);
});

retryBtn.addEventListener("click", () => {
  if (lastQuery) loadWeatherFor(lastQuery);
});

// Start on the empty state until the user searches.
showState("empty");
