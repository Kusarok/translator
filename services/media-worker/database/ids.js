import crypto from "node:crypto";

const prefixes = Object.freeze({
  track: "trk",
  lyrics: "lyr",
  translation: "trn",
  artwork: "art",
  media: "med",
  job: "job"
  ,playlist: "pls"
  ,playlistTrack: "plt"
  ,sync: "syn"
  ,spotifyAccount: "spa"
  ,searchJob: "srj"
  ,searchResult: "srs"
  ,artist: "ast"
  ,artistCatalogItem: "aci"
});

export const createId = (type) => {
  const prefix = prefixes[type];
  if (!prefix) throw new TypeError(`Unknown entity type: ${type}`);
  return `${prefix}_${crypto.randomUUID()}`;
};

export const idPrefixes = prefixes;
