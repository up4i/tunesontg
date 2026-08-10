# Tester feedback: Windows PC, 2026-08-06

Source: testing by [@gagster](https://t.me/gagster) on a Windows PC.

This entry preserves all 37 points from the test report, turns them into trackable work, and records what is already present in the repository. Priorities are an initial product recommendation, not a delivery commitment.

## Executive summary

Validated against `main` on 2026-08-10:

- **19 implemented or shipped:** TGFB-001 through TGFB-005, TGFB-007, TGFB-009 through TGFB-012, TGFB-014 through TGFB-016, TGFB-020, TGFB-023 through TGFB-025, TGFB-028, and TGFB-031.
- **6 partially implemented:** TGFB-006, TGFB-008, TGFB-017, TGFB-021, TGFB-027, and TGFB-030.
- **10 not implemented:** TGFB-013, TGFB-018, TGFB-019, TGFB-022, TGFB-026, TGFB-029, and TGFB-032 through TGFB-035.
- **2 research/defer items:** TGFB-036 and TGFB-037.

`Implemented / verify` means the behavior exists in the repository but still needs a matching Telegram-client test on a deployment containing the current commit. It should not be treated as confirmation that the tester saw the latest build.

## Recommended next implementation

### 1. Verify the shipped baseline

Before expanding the product, repeat the Windows Telegram Desktop pass against a deployment built from the reviewed commit. Prioritize the Now Playing viewport and animation (TGFB-001/TGFB-002), queue behavior (TGFB-004), keyboard shortcuts (TGFB-007), theme synchronization (TGFB-023/TGFB-024), deep links (TGFB-028), and public/private sharing (TGFB-031). Record the Telegram client version, viewport, deployment URL, and commit SHA.

### 2. Ship the next core collection batch

- **Editable playlist metadata and covers (TGFB-013/TGFB-021):** add a playlist edit flow for name, description, and cover, including a generated-cover fallback and upload validation.
- **Library multi-select and bulk actions (TGFB-018):** build one selection model for add, remove, like, share, and move actions. Label removal explicitly as either removal from the current playlist or deletion from the library.
- **Broader duplicate detection (TGFB-017):** keep exact `file_unique_id` protection and add a conservative metadata/fingerprint policy with an explicit user override for uncertain matches.

These improve the existing library and playlist workflows without first requiring a social graph, multi-user permissions, or new media infrastructure.

### 3. Add focused Telegram and support polish

- Add the capability-checked home-screen action (TGFB-026), a visible bug-report flow with non-sensitive diagnostics (TGFB-029), and branded loading/error states (TGFB-030).
- Finish import-completion haptics in an in-app import flow (TGFB-027).
- Treat swipe gestures (TGFB-006) as optional enhancement work after the visible queue and like actions pass mobile testing.

Telegram officially documents `addToHomeScreen`, theme events, and haptic feedback in the [Mini Apps WebApp API](https://core.telegram.org/bots/webapps), so these integrations should be feature-detected and tested per client.

### 4. Defer platform-risk and multi-user expansions

- **Native Telegram playback control (TGFB-008):** retain browser Media Session controls and the existing `sendAudio`/`sendMediaGroup` handoff. The official Mini Apps WebApp API does not currently document control of Telegram's native audio player, so do not promise native-player control without a supported Telegram API.
- **Social and collaboration (TGFB-022/TGFB-032 through TGFB-035):** design roles, blocks, privacy defaults, moderation, notification consent, rate limits, and abuse controls before implementation. Plan a Postgres migration before collaborative writes or horizontal scaling.
- **YouTube conversion (TGFB-036):** do not implement the proposed converter without platform approval and a rights/compliance design. YouTube's [API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) prohibit downloading/importing audiovisual content and separating audio without prior written approval; a 10-minute cap limits cost but does not resolve the policy issue.
- **Podcasts (TGFB-037):** revisit after defining feed ingestion, episode identity, long-form resume position, queue semantics, and bandwidth/storage policy.

## Status and priority

- **Backlog**: no complete implementation was found.
- **Implemented / verify**: implemented in the repository after this report and awaiting a matching-client test/deployment.
- **Partial**: a related foundation exists, but the reported experience is not complete.
- **Shipped**: present in the current code; verify the deployed version with the tester.
- **Research**: needs product, platform, safety, or architecture validation before implementation.
- **P0**: visible defect in an existing core flow.
- **P1**: next core usability work.
- **P2**: valuable follow-up requiring a larger feature change.
- **P3**: larger product expansion or discovery work.

## Player and desktop experience

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-001 | P0 | Implemented / verify | The Now Playing overlay now has an explicit dynamic-viewport height, contained overflow, and locks the underlying page while open. Verify on the tester's Windows Telegram Desktop viewport that it no longer scrolls into blank space and compact viewports still reach every control. |
| TGFB-002 | P1 | Implemented / verify | Now Playing remains mounted and uses a smooth bidirectional expand/minimize transition while honoring `prefers-reduced-motion`. Verify the timing on Windows Telegram Desktop. |
| TGFB-003 | P1 | Implemented / verify | Now Playing now has an expandable volume panel with a slider, mute/unmute action, percentage, and persisted volume state synchronized to the audio element. |
| TGFB-004 | P1 | Implemented / verify | Now Playing opens a dedicated queue with play, move up/down, remove, and clear controls. Track menus include **Play next**, and reordering preserves the active track and playback position. Verify touch/desktop ergonomics with the tester. |
| TGFB-005 | P1 | Implemented / verify | Now Playing has a three-dot button opening the shared track-action sheet with **Add/remove Liked Songs**, **Add to playlist**, contextual **Remove from playlist**, **Play next**, and **Share song**. |
| TGFB-006 | P2 | Partial | Track menus now provide the accessible desktop alternative for **Play next** and **Liked Songs**. The requested swipe-right/swipe-left gestures remain unimplemented and must not interfere with vertical scrolling. |
| TGFB-007 | P1 | Implemented / verify | Global desktop shortcuts now use Space for play/pause, Left/Right for 10-second seeking, and Ctrl/Cmd+K for search. Text fields and ordinary focused controls are not hijacked. Verify inside Telegram Desktop. |
| TGFB-008 | P2 | Partial / Research | Continue playback and expose controls without reopening the Mini App where the host permits. The app already registers browser Media Session controls and can send audio to Telegram's player, but direct control of Telegram's native player is not currently part of the Mini App integration. Verify behavior per Telegram client before promising background playback. |
| TGFB-009 | P2 | Implemented / verify | Playback now enters durable history after 3–15 seconds depending on track length, rather than on a simple click. Home shows **Recently Played** separately from **Recently added**, with a full history sheet capped at the latest 50 unique tracks. |

## Library and playlists

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-010 | P1 | Implemented / verify | Every playlist now has an **Add music** button opening a searchable, multi-select library picker. Songs already in the playlist are excluded and up to 200 selected tracks are added in one transaction. |
| TGFB-011 | P1 | Implemented / verify | Playlists can now be deleted after confirmation. The UI states that songs remain in Library, the server enforces ownership, and the deleted playlist view closes safely. |
| TGFB-012 | P2 | Implemented / verify | Public playlists can now be shared through Telegram's native share flow using a direct Mini App link. Private playlists cannot be resolved through an existing share link. |
| TGFB-013 | P2 | Backlog | Make playlist covers editable, with a generated/default-cover option and validation for uploaded images. |
| TGFB-014 | P2 | Implemented / verify | Individual songs now have an unguessable direct Mini App link and a **Share song** action using Telegram's native sharing flow. |
| TGFB-015 | P2 | Implemented / verify | A shared-song link opens a song-specific prompt naming the sender and asking whether to add it. Import reuses the Telegram file reference, and an already-saved song is detected without creating another copy. |
| TGFB-016 | P1 | Implemented / verify | Every user now gets exactly one protected **Liked Songs** system collection. Like/unlike is idempotent and available from track sheets and the new Now Playing menu; the collection cannot be deleted. |
| TGFB-017 | P1 | Partial | Exact Telegram duplicates are prevented by `file_unique_id`, and the bot now explicitly says that it did not add another copy. Broader detection for the same audio arriving under a different Telegram identity or future imports still needs a metadata/content-fingerprint policy. |
| TGFB-018 | P2 | Backlog | Add multi-select for songs with bulk add, remove, like, share, and move actions. Clearly define whether **remove** means from the current playlist or from the whole library. |
| TGFB-019 | P3 | Backlog | Add playlist folders for large collections, including create, rename, delete, and moving playlists between folders. Decide whether nesting is supported before designing the schema. |
| TGFB-020 | P2 | Shipped | Show song count and total duration in each playlist. Both are already calculated server-side and displayed on playlist cards and detail pages; verify the deployed build with the tester. |
| TGFB-021 | P2 | Partial | Support playlist descriptions alongside editable covers. Descriptions can be set during creation and are displayed now, but editing an existing description and editing the cover are missing. |
| TGFB-022 | P3 | Backlog | Add collaborative playlists with roles/permissions, conflict-safe edits, attribution, and an activity model. Define owner, editor, and removal behavior before implementation. |

## Appearance and Telegram integration

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-023 | P1 | Implemented / verify | The app now has dark and light tokens plus a persisted theme control in the Home header. The control cycles between the host theme and explicit light/dark overrides. Verify contrast and artwork surfaces on target clients. |
| TGFB-024 | P1 | Implemented / verify | The default theme now follows Telegram's `colorScheme`, responds to `themeChanged`, falls back to the operating-system preference outside Telegram, and keeps Telegram header/background colors synchronized. |
| TGFB-025 | P2 | Implemented / verify | The authenticated Telegram `photo_url` is now retained and shown at top right, with the existing initial-based avatar as a fallback. |
| TGFB-026 | P2 | Backlog | Add an **Add to Home Screen** action when the Telegram client supports it. Hide or explain the action on unsupported clients and react to the resulting status event. |
| TGFB-027 | P2 | Partial | Liking and queue reordering now join navigation, playback, playlist, and send actions in using native haptics. A bot-side import cannot trigger Mini App haptics while the app is closed; an in-app importer can add completion feedback later. |
| TGFB-028 | P2 | Implemented / verify | Songs and playlists now use validated `s_…` and `p_…` `startapp` payloads. Invalid, missing, and private resources return safe errors; valid links open the matching song prompt or public playlist instead of Home. |
| TGFB-029 | P2 | Backlog | Add a visible **Report Bugs** action. Capture a short description plus non-sensitive app/client context, provide a success/failure state, and define where reports are delivered before shipping. |
| TGFB-030 | P2 | Partial | Use branded “UTYA” loading screens instead of blank pages while content loads. A generic skeleton already covers the initial library fetch; define the UTYA treatment and add loading/empty/error states to slower mutations and route transitions. |

## Sharing and social

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-031 | P2 | Implemented / verify | Standard playlists now have public/private controls, existing data migrates to private, and shared-playlist reads enforce public visibility server-side. Liked Songs remains a protected private system collection. |
| TGFB-032 | P3 | Backlog | Let users search for people through the bot and view their public playlists. Include username changes, blocks, pagination, and privacy/abuse controls in the design. |
| TGFB-033 | P3 | Backlog | Add a friends list with request/accept/remove/block behavior and clear privacy defaults. |
| TGFB-034 | P3 | Backlog | Allow in-app sharing directly to friends. The recipient should receive a bot message naming the sender and song with a deep link to the song in the Mini App. Define notification consent and blocking before enabling sends. |
| TGFB-035 | P3 | Backlog | Add optional notifications when someone follows a playlist or adds a song to a collaborative playlist. Make each category opt-in/out, rate-limit or batch noisy activity, and deep-link to the relevant object. |

## Content expansion

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-036 | P3 | Research | Do not implement a YouTube converter without prior platform approval and a rights/compliance design. YouTube's API policies prohibit downloading/importing audiovisual content and separating audio without prior written approval. A maximum source length around 10 minutes would limit cost only after the feature is approved; it does not resolve the policy issue. |
| TGFB-037 | P3 | Research | Explore podcasts as a separate content type. Discovery should cover feeds/import, episode metadata, long-form playback position, downloads/streaming, queue behavior, and storage/bandwidth implications. |

## Recommended delivery order

1. **Implemented; matching-client verification pending:** TGFB-001 through TGFB-005, TGFB-007, TGFB-009 through TGFB-012, TGFB-014 through TGFB-016, TGFB-023 through TGFB-025, TGFB-028, and TGFB-031.
2. **Next core collection workflows:** editable playlist metadata in TGFB-013/TGFB-021, bulk actions in TGFB-018, and broader duplicate handling in TGFB-017.
3. **Remaining queue gesture:** TGFB-006 after verifying the visible queue actions in TGFB-004.
4. **Remaining Telegram-native details:** TGFB-026 through TGFB-030 after verifying TGFB-023 through TGFB-025.
5. **Sharing foundation implemented:** verify TGFB-028, TGFB-031, TGFB-012, TGFB-014, and TGFB-015 before building friends or collaboration.
6. **Social and expansion:** TGFB-032 through TGFB-037 after privacy, moderation, notification, and infrastructure decisions.

## Follow-up test pass

- Re-test TGFB-001 and TGFB-002 on the same Windows Telegram client and record the client/version plus viewport size.
- Confirm whether the tested deployment included the current skeleton, playlist statistics, haptics, and Media Session implementation before closing any **Partial** or **Shipped** item.
- Test mobile Telegram clients separately; swipe gestures, haptics, theme events, home-screen shortcuts, safe areas, and background playback are client-specific.
