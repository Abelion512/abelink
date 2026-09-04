// Connector plugin: cuaca via Open-Meteo (tanpa API key).
// Geocoding + forecast; fetch eksplisit dengan timeout agar tidak menggantung.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) MarkAgentCapabilities/1.0'
const FETCH_TIMEOUT_MS = 15000

async function fetchJson(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} dari Open-Meteo`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function geocode(city) {
  const data = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`
  )
  const hit = data?.results?.[0]
  if (!hit) throw new Error(`Kota '${city}' tidak ditemukan di geocoding Open-Meteo.`)
  return {
    latitude: hit.latitude,
    longitude: hit.longitude,
    label: [hit.name, hit.admin1, hit.country].filter(Boolean).join(', ')
  }
}

export async function runWeather(actionId, args) {
  if (actionId !== 'current') throw new Error(`Aksi weather tidak dikenal: ${actionId}`)
  let { latitude, longitude, city } = args || {}
  if (city != null && city !== '') {
    const g = await geocode(String(city))
    latitude = g.latitude
    longitude = g.longitude
  }
  latitude = Number(latitude)
  longitude = Number(longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('Butuh latitude+longitude angka, atau city.')
  }
  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`
  )
  const c = data?.current
  if (!c) throw new Error('Respon cuaca tidak sesuai harapan.')
  return {
    location: city ? String(city) : `${latitude},${longitude}`,
    temperature_c: c.temperature_2m,
    apparent_c: c.apparent_temperature,
    humidity_pct: c.relative_humidity_2m,
    wind_kmh: c.wind_speed_10m,
    weather_code: c.weather_code,
    time: c.time,
    timezone: data.timezone
  }
}
