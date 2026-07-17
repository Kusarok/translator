import { getRadioHealth, getRadioStations, getRadioStream } from "../services/radio-worker.service.js";
import { createUserRadioStation, deleteUserRadioStation, listUserRadioStations, updateUserRadioStation } from "../services/account.store.js";
import { readSession } from "../services/auth.service.js";
import { normalizeUserStation } from "../services/user-radio.service.js";

const relay = (result, res) => res.status(result.status).json(result.data);

export const health = async (_req, res) => relay(await getRadioHealth(), res);
export const stations = async (_req, res) => relay(await getRadioStations(), res);

export const stream = async (req, res) => {
  const upstream = await getRadioStream(req.params.id, req.params.file);
  res.status(upstream.statusCode || 200);
  for (const header of ["content-type", "cache-control", "accept-ranges", "x-accel-buffering", "icy-name", "icy-genre", "icy-br"]) {
    if (upstream.headers[header]) res.set(header, upstream.headers[header]);
  }
  res.flushHeaders();
  upstream.on("error", () => res.destroy());
  upstream.pipe(res);
};

export const personalStations = (req, res) => res.json({ stations: listUserRadioStations(readSession(req).id) });
export const createPersonalStation = (req, res) => res.status(201).json(
  createUserRadioStation(readSession(req).id, normalizeUserStation(req.body))
);
export const updatePersonalStation = (req, res) => {
  const station = updateUserRadioStation(readSession(req).id, req.params.id, normalizeUserStation(req.body));
  return station ? res.json(station) : res.status(404).json({ error: "Station not found." });
};
export const deletePersonalStation = (req, res) => deleteUserRadioStation(readSession(req).id, req.params.id)
  ? res.json({ ok: true }) : res.status(404).json({ error: "Station not found." });
