export const stations = [
  {
    id: "rad_kurdish",
    name: "Kurdish",
    language: "Kurdish",
    languageCode: "ku",
    sourceUrl: "https://4kuhls.persiana.live/hls/stream.m3u8",
    artwork: "/assets/radio/kurdish.svg",
    accent: "#ffb45f",
    accentAlt: "#ef5b78"
  },
  {
    id: "rad_persian_nostalgia",
    name: "Persian Nostalgia",
    language: "Persian",
    languageCode: "fa",
    sourceUrl: "https://noshls.persiana.live/hls/stream.m3u8",
    artwork: "/assets/radio/persian-nostalgia.svg",
    accent: "#68ead8",
    accentAlt: "#6878ee"
  },
  {
    id: "rad_navahang",
    name: "Navahang",
    language: "Persian",
    languageCode: "fa",
    sourceUrl: "https://simahls.wns.live/hls/stream.m3u8",
    fallbackUrls: ["https://hls.navahang.live/hls/stream.m3u8"],
    artwork: "/assets/radio/navahang.svg",
    accent: "#ffca6b",
    accentAlt: "#f05b8d"
  },
  {
    id: "rad_radio_javan",
    name: "Radio Javan",
    language: "Persian",
    languageCode: "fa",
    sourceUrl: "https://rjtvhls.wns.live/hls/stream.m3u8",
    artwork: "/assets/radio/radio-javan.svg",
    accent: "#ff5f74",
    accentAlt: "#765cff"
  }
];

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
