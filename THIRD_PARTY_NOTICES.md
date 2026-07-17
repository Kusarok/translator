# Third-party notices

Translator is licensed under Apache-2.0. It uses separately licensed software and optional external services. This notice is informational and does not replace the license text shipped by each dependency.

## Direct Node.js dependencies

| Package | License |
| --- | --- |
| dotenv | BSD-2-Clause |
| express | MIT |
| express-rate-limit | MIT |
| google-auth-library | Apache-2.0 |
| helmet | MIT |
| ws | MIT |

Exact versions and transitive dependencies are recorded in `package-lock.json`. Their license files are included in installed packages.

## Optional Python media tools

| Project | License | Source |
| --- | --- | --- |
| yt-dlp | Unlicense | <https://github.com/yt-dlp/yt-dlp> |
| spotDL | MIT | <https://github.com/spotDL/spotify-downloader> |

These tools are installed into the ignored local virtual environment by `npm run media:install`; their source is not vendored in this repository.

## External services and content

The application can integrate with AI providers, Google OAuth, Spotify, LRCLIB, MusicBrainz, media platforms, and operator-configured radio sources. Their names and links identify interoperability only and do not imply sponsorship.

Software licenses do not grant rights to third-party music, recordings, lyrics, artwork, metadata, broadcasts, trademarks, or user data. Each deployment operator must review the applicable terms and obtain any permissions required for its use.

## Creative Commons content

When open-catalog content is imported, the deployment must preserve the creator, source, license name and URL, and any modification/translation notice required by that work's license. Different parts of a song package can have different rights; audio, composition, lyrics, artwork, and translations must each be verified.
