# Privacy information

This document describes the behavior of the open-source application. Every public operator must publish contact details, retention periods, jurisdiction-specific disclosures, and policy changes for their own deployment.

## Data the application can process

- Account email, display name, avatar URL, role, and a salted password hash for local accounts.
- Session identifiers stored in an HttpOnly cookie and as hashed server-side records.
- Google account profile fields returned during OAuth sign-in.
- Spotify account and playlist metadata when a user connects Spotify.
- Encrypted Spotify access and refresh tokens required for the connection.
- Personal playlists, favorites, recent plays, and learning progress.
- Text, images, audio, and prompts submitted for translation, chat, or transcription.
- Technical request information needed for security and rate limiting, including IP-derived limits.
- Shared track metadata, media, lyrics, artwork, translations, and processing status.

## Where data goes

Application records are stored under the configured `APP_DATA_DIR`/`data/` directory. Content submitted to an enabled AI provider is sent to that provider to fulfill the request. OAuth data is exchanged with Google or Spotify when those optional integrations are used. Media and lyric providers receive the searches or source references required to prepare a track.

Each provider has its own privacy terms. Deployment operators should list the providers they enable and link to those policies.

## API keys

Keys entered in the browser's bring-your-own-key interface are stored in that browser and transmitted with requests that use them; they are not written into the application database. Server-funded provider keys and OAuth secrets belong only in private environment configuration.

## Shared and personal music data

Prepared track assets are shared across users to avoid duplicate work. User playlists, favorites, recent plays, and progress are associated with the user's account. Operators must not publish the runtime database or content directories as part of the source repository.

## Retention and deletion

Retention depends on deployment configuration and operational backups. The media worker includes configurable retention for temporary/job artifacts, but account and library records require an operator policy. Operators should provide a private contact path for account access and deletion requests and document how backups age out.

## Cookies

Authentication uses an HttpOnly, SameSite=Lax session cookie. It is marked Secure when the request is served through HTTPS. Browser preferences and bring-your-own-key settings may use local browser storage.

## Children and regional requirements

The source code does not by itself implement every consent, age, export, or regional privacy requirement. Operators are responsible for determining whether additional controls are necessary before offering the service publicly.
