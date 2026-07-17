import dotenv from "dotenv";

// Station sources are deployment configuration, not application source code.
// Load the regular app environment first and an optional radio-only file second.
dotenv.config({ quiet: true });
dotenv.config({ path: ".env.radio", quiet: true, override: false });

const urls = (value) => String(value || "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => /^https:\/\//i.test(entry));

const configuredStations = [
  {
    id: "rad_kurdish",
    name: "Kurdish",
    language: "Kurdish",
    languageCode: "ku",
    sourceUrls: urls(process.env.RADIO_KURDISH_URLS),
    artwork: "/assets/radio/kurdish.svg",
    accent: "#ffb45f",
    accentAlt: "#ef5b78"
  },
  {
    id: "rad_persian_nostalgia",
    name: "Persian Nostalgia",
    language: "Persian",
    languageCode: "fa",
    sourceUrls: urls(process.env.RADIO_PERSIAN_NOSTALGIA_URLS),
    artwork: "/assets/radio/persian-nostalgia.svg",
    accent: "#68ead8",
    accentAlt: "#6878ee"
  },
  {
    id: "rad_navahang",
    name: "Navahang",
    language: "Persian",
    languageCode: "fa",
    sourceUrls: urls(process.env.RADIO_NAVAHANG_URLS),
    artwork: "/assets/radio/navahang.svg",
    accent: "#ffca6b",
    accentAlt: "#f05b8d"
  },
  {
    id: "rad_radio_javan",
    name: "Radio Javan",
    language: "Persian",
    languageCode: "fa",
    sourceUrls: urls(process.env.RADIO_JAVAN_URLS),
    artwork: "/assets/radio/radio-javan.svg",
    accent: "#ff5f74",
    accentAlt: "#765cff"
  }
];

export const stations = configuredStations
  .filter((station) => station.sourceUrls.length > 0)
  .map(({ sourceUrls, ...station }) => ({
    ...station,
    sourceUrl: sourceUrls[0],
    fallbackUrls: sourceUrls.slice(1)
  }));

export const publicStation = (station, state = {}) => ({
  id: station.id,
  name: station.name,
  language: station.language,
  languageCode: station.languageCode,
  artwork: station.artwork,
  accent: station.accent,
  accentAlt: station.accentAlt,
  live: Boolean(state.ready),
  status: state.ready ? "live" : state.running ? "connecting" : "offline",
  streamUrl: `/api/radio/stations/${station.id}/live.mp3`
});
