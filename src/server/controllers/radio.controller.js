import { getRadioHealth, getRadioStations, getRadioStream } from "../services/radio-worker.service.js";

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
