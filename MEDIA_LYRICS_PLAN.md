# Synchronized Lyrics and Translation Plan

## Product Goal

The goal is to turn public or user-authorized audio and video into an interactive language-learning experience. A user provides a supported media link or uploads a media file. The application obtains or generates the original lyrics/transcript, synchronizes it with playback, translates it into the user's selected language, and displays both versions together as the media plays.

The intended experience is similar to synchronized lyrics in a music player, with additional learning features:

- Highlight the current original line during playback.
- Display the translated line at the same time.
- Support line-level synchronization and word-level highlighting when timing data is available.
- Let the learner pause, repeat, seek to, or slow down a specific line.
- Preserve the meaning and context of the original instead of producing a literal word-for-word translation.
- Support songs, music videos, interviews, podcasts, conversations, and other public or user-provided learning material.

Only content that the user is authorized to access and process should be accepted. Public availability does not automatically grant permission to download, store, process, or redistribute a work. Media retention should be temporary by default, and source-specific terms and applicable copyright rules must be respected.

## Recommended Strategy

The system should use a provider-and-fallback pipeline:

1. Search LRCLIB for existing synchronized lyrics.
2. Use LibreLyrics to provide a consistent provider interface and optionally query additional approved sources.
3. If no reliable lyrics are found, generate a transcript locally with vocal separation and speech recognition.
4. Normalize all results into one internal timed-lyrics format.
5. Translate complete lines with surrounding context while retaining the original timestamps.
6. Cache the normalized result to avoid repeating expensive lookup, transcription, and translation work.

This design keeps the player independent from any individual lyrics provider and allows providers to be added, removed, or replaced without redesigning the user interface.

## Option 1: LRCLIB

### Purpose

LRCLIB should be the primary source for existing synchronized song lyrics. It provides a public API that can return plain lyrics and line-synchronized lyrics in LRC format without requiring an API key.

### Why It Fits

- No API key or account is currently required.
- The API provides both plain and synchronized lyrics.
- Tracks can be matched using title, artist, album, and duration.
- The project and its official LRCGET client are open source.
- Database dumps make future self-hosting or local indexing possible.
- LRC timestamps map naturally to a Spotify-like line-highlighting interface.

### Integration Flow

1. Extract reliable track metadata from the submitted source:
   - Track title
   - Artist name
   - Album name, when available
   - Duration in seconds
   - ISRC or source-specific identifier, when available
2. Query LRCLIB using the exact track signature.
3. Validate the returned result against normalized title, artist, and duration.
4. Prefer `syncedLyrics`; use `plainLyrics` only when synchronized lyrics are unavailable.
5. Parse the LRC response into the application's internal timed-line structure.
6. Cache the selected result together with its source and confidence score.

### Matching Requirements

Duration is important because different releases, edits, live recordings, remixes, and music videos may use the same title but have different timing. A result should not be accepted solely because its title is similar.

A match score should consider:

- Normalized title similarity
- Artist similarity
- Album similarity
- Duration difference
- ISRC match, if available
- Indicators such as live, remix, acoustic, remastered, or explicit version

Low-confidence matches should be shown to the user for confirmation instead of being applied automatically.

### Limitations

- Catalog coverage and accuracy are not guaranteed.
- Most synchronized results are line-level LRC rather than word-level karaoke timing.
- Community-provided records may contain incorrect lyrics or timestamps.
- The public service may change availability or API behavior.
- An open-source client or server license does not automatically grant redistribution rights for every lyric stored in the database.

The application should therefore keep LRCLIB behind a provider interface, apply caching and reasonable request pacing, and retain a fallback path.

## Option 2: LibreLyrics

### Purpose

LibreLyrics should act as an optional provider abstraction in the media-processing worker. It offers a Python library and command-line interface for retrieving plain, synchronized, and, when available, enhanced word-level lyrics through a plugin architecture.

LibreLyrics is not itself a guarantee of lyric ownership or licensing. Its main value is providing a consistent technical interface across multiple providers.

### Why It Fits

- Open-source Python library and CLI.
- Supports standard LRC and Enhanced LRC output.
- Can retrieve individual tracks and process albums or playlists.
- Supports provider plugins, allowing approved sources to be added without changing the main pipeline.
- Fits naturally into a Python worker that also runs Demucs and WhisperX.

### Integration Flow

1. The Node.js application creates a media-processing job.
2. A separate Python worker receives normalized track metadata or a supported track URL.
3. LibreLyrics queries only explicitly enabled providers.
4. Results are ranked using metadata and duration rather than accepting the first response.
5. LRC or Enhanced LRC output is converted into the same internal structure used for LRCLIB results.
6. Provider name, retrieval time, timing granularity, and confidence are recorded.

### Provider Policy

Providers must be allowlisted. A plugin should not be enabled merely because it is technically available. Before enabling a provider for a public deployment, the project should evaluate:

- Whether the provider offers an official API
- Whether automated access is permitted
- Whether lyrics may be displayed, cached, or translated
- Whether authentication or attribution is required
- Whether the integration depends on scraping or private endpoints
- Expected stability and request limits

Unofficial scraping integrations should not be relied upon for the core product because they can break without notice and may violate provider terms.

### Limitations

- LibreLyrics aggregates providers; it does not solve licensing by itself.
- Plugin quality, coverage, and stability can vary.
- Word-level Enhanced LRC is less common than line-level LRC.
- Some providers may require credentials or commercial permission.
- The worker adds a Python runtime alongside the existing Node.js application.

For the first release, LibreLyrics should use LRCLIB as the preferred provider and treat any additional provider as an independently reviewed fallback.

## Option 4: Local Generation with Demucs and WhisperX

### Purpose

The local generation pipeline is the fallback for media that has no suitable synchronized lyrics. It is also the primary path for interviews, podcasts, conversations, and user-uploaded recordings.

For songs, the pipeline separates the lead vocal from the instrumental audio before transcription. WhisperX then produces a transcript and aligns recognized words to the audio timeline.

### Processing Flow

1. Validate the media source and enforce size and duration limits.
2. Extract a normalized audio track with FFmpeg.
3. Detect whether the content is primarily speech or music.
4. For music, use Demucs to create a vocal stem.
5. Transcribe the speech or vocal stem with WhisperX.
6. Run forced alignment to obtain word-level start and end timestamps.
7. Group words into readable lines using pauses, punctuation, and maximum line length.
8. Run quality checks for empty sections, hallucinations, repeated phrases, and timing conflicts.
9. Allow the user to correct the text and timing when confidence is low.
10. Save the normalized transcript and remove temporary media according to the retention policy.

### Why Demucs Is Useful

Music, backing vocals, and effects reduce speech-recognition accuracy. Demucs can separate a mixed song into stems, including a vocal stem, so the transcription model receives a cleaner signal.

Vocal separation is not perfect. Reverb, overlapping singers, dense arrangements, and heavily processed vocals may still produce artifacts or missing words.

### Why WhisperX Is Useful

WhisperX combines transcription with forced alignment and can produce word-level timestamps. This is appropriate for:

- Word highlighting
- Clicking a word or line to seek playback
- Repeating a sentence
- Creating timed subtitles
- Separating speakers in conversations when diarization is enabled

Language-specific alignment model availability must be checked. If no reliable alignment model exists for a detected language, the system should fall back to segment-level timestamps.

### Accuracy Strategy

Automatic transcription should be treated as a draft, especially for songs. Accuracy can be improved by:

- Using the largest practical transcription model
- Separating vocals before transcription
- Supplying a known language instead of relying only on detection
- Comparing the generated transcript with plain lyrics found from an approved source
- Using known lyrics as the text input for forced alignment
- Providing a timeline editor for manual correction

When trustworthy plain lyrics are available but synchronized lyrics are not, forced alignment should align the known text to the audio. This is generally preferable to asking the model to rediscover every lyric from the mixed recording.

### Infrastructure Requirements

The local pipeline should run in a separate worker rather than inside the web request process. The worker needs:

- Python runtime
- FFmpeg
- Demucs
- WhisperX and its alignment dependencies
- Temporary storage with automatic cleanup
- A job queue and job status reporting
- CPU support for development and optional GPU acceleration for production
- Strict limits on file size, media duration, execution time, and concurrency

GPU acceleration reduces processing time but introduces infrastructure cost. Jobs should be cached by a stable media fingerprint so identical media is not processed repeatedly.

### Limitations

- Singing is substantially harder to transcribe than ordinary speech.
- Generated lyrics may contain incorrect words or missing repeated sections.
- Vocal separation and alignment consume significant CPU, GPU, memory, and storage.
- Word timestamps can still require manual adjustment.
- Processing downloaded platform content may be restricted even when the model runs locally.

## Normalized Data Model

All three paths should produce the same internal representation:

```json
{
  "mediaId": "stable-media-id",
  "source": "lrclib",
  "sourceReference": "provider-record-id",
  "language": "en",
  "timingGranularity": "line",
  "confidence": 0.96,
  "lines": [
    {
      "id": "line-1",
      "startMs": 17120,
      "endMs": 21480,
      "original": "I found a love for me",
      "translation": "",
      "words": [
        {
          "text": "I",
          "startMs": 17120,
          "endMs": 17320
        }
      ]
    }
  ]
}
```

The player should work with line-level timing even when the `words` array is empty. Word highlighting becomes an enhancement rather than a requirement for playback.

## Translation Strategy

Translation should be generated after the original transcript is finalized. Translating each line independently can lose pronouns, idioms, and meaning, so the translation service should receive the complete section or surrounding lines as context.

The output must preserve a one-to-one mapping between original line IDs and translated line IDs. Each translated line inherits the timing of its original line. The translation should not attempt to copy word timestamps because word order differs between languages.

Recommended behavior:

- Highlight words only in the original language when word timing exists.
- Highlight the corresponding translated line using the original line's time range.
- Store the target language and translation model/version.
- Allow users to edit and regenerate an individual translation.
- Cache translations separately for each target language.

## Suggested Delivery Order

### Phase 1

- Add a media-learning page and timed-lyrics player.
- Add the normalized lyrics data model.
- Integrate LRCLIB directly.
- Parse standard LRC and display synchronized original lines.
- Translate each line with full-song or section context.
- Add caching and manual result selection.

### Phase 2

- Add the Python worker and LibreLyrics provider interface.
- Add provider allowlisting and result ranking.
- Support Enhanced LRC and word-level highlighting.
- Add a lyrics and timestamp correction interface.

### Phase 3

- Add FFmpeg, Demucs, and WhisperX processing.
- Support user-uploaded audio and approved media sources.
- Add speaker diarization for conversations.
- Add background jobs, progress reporting, quotas, and automatic cleanup.

## Success Criteria

The first useful release should allow a learner to provide an authorized song or media item and receive:

- Correctly matched original text when an existing source is available
- Line-synchronized playback
- A natural translation displayed with the original line
- Seeking and repetition by selecting a line
- A clear fallback when synchronized lyrics are unavailable
- Source attribution and confidence information
- A correction path for inaccurate text or timing

The system should remain useful with only line-level LRC data while progressively improving to word-level synchronization when Enhanced LRC or successful WhisperX alignment is available.
