# Tester feedback: Windows PC, 2026-08-06

Source: testing by [@gagster](https://t.me/gagster) on a Windows PC.

This entry preserves all 37 points from the test report, turns them into trackable work, and records what is already present in the repository. Priorities are an initial product recommendation, not a delivery commitment.

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
| TGFB-004 | P1 | Backlog | Add a dedicated queue page. It must support reordering, removing one track, clearing the queue, and **Play next**. Queue edits must preserve the current track and playback position. |
| TGFB-005 | P1 | Partial | Now Playing has a three-dot button opening the shared track-action sheet with **Add/remove Liked Songs**, **Add to playlist**, and contextual **Remove from playlist**. **Share** remains blocked on the direct-link/sharing foundation in TGFB-014 and TGFB-028. |
| TGFB-006 | P2 | Backlog | Add song-row gestures: swipe right to queue and swipe left to add to Liked Songs. Provide visible actions as an accessible desktop/keyboard alternative and prevent a vertical scroll from triggering an action. |
| TGFB-007 | P1 | Implemented / verify | Global desktop shortcuts now use Space for play/pause, Left/Right for 10-second seeking, and Ctrl/Cmd+K for search. Text fields and ordinary focused controls are not hijacked. Verify inside Telegram Desktop. |
| TGFB-008 | P2 | Partial / Research | Continue playback and expose controls without reopening the Mini App where the host permits. The app already registers browser Media Session controls and can send audio to Telegram's player, but direct control of Telegram's native player is not currently part of the Mini App integration. Verify behavior per Telegram client before promising background playback. |
| TGFB-009 | P2 | Backlog | Record listening history and add a **Recently Played** section based on actual playback, separate from the existing **Recently added** list. Define when a play counts and cap or paginate retained history. |

## Library and playlists

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-010 | P1 | Implemented / verify | Every playlist now has an **Add music** button opening a searchable, multi-select library picker. Songs already in the playlist are excluded and up to 200 selected tracks are added in one transaction. |
| TGFB-011 | P1 | Implemented / verify | Playlists can now be deleted after confirmation. The UI states that songs remain in Library, the server enforces ownership, and the deleted playlist view closes safely. |
| TGFB-012 | P2 | Backlog | Allow playlists to be shared with other users through a direct Mini App link and Telegram's native sharing flow. Respect playlist visibility. |
| TGFB-013 | P2 | Backlog | Make playlist covers editable, with a generated/default-cover option and validation for uploaded images. |
| TGFB-014 | P2 | Backlog | Make individual songs shareable through a direct Mini App link and Telegram's native sharing flow. |
| TGFB-015 | P2 | Backlog | When a recipient opens a shared song link, deep-link to that song and ask whether to add it to their library. Handle an already-saved song without creating another copy. |
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
| TGFB-027 | P2 | Partial | Liking now joins navigation, playback, playlist, and send actions in using native haptics. Queue reordering is pending TGFB-004; a bot-side import cannot trigger Mini App haptics while the app is closed. |
| TGFB-028 | P2 | Backlog | Add direct Mini App links for a specific song or playlist using a versioned `startapp` payload. Validate the payload server-side and show a safe not-found/private state rather than falling back silently to Home. |
| TGFB-029 | P2 | Backlog | Add a visible **Report Bugs** action. Capture a short description plus non-sensitive app/client context, provide a success/failure state, and define where reports are delivered before shipping. |
| TGFB-030 | P2 | Partial | Use branded “UTYA” loading screens instead of blank pages while content loads. A generic skeleton already covers the initial library fetch; define the UTYA treatment and add loading/empty/error states to slower mutations and route transitions. |

## Sharing and social

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-031 | P2 | Backlog | Add public/private visibility to playlists. Existing playlists should migrate to private, and every read/share/search endpoint must enforce visibility server-side. |
| TGFB-032 | P3 | Backlog | Let users search for people through the bot and view their public playlists. Include username changes, blocks, pagination, and privacy/abuse controls in the design. |
| TGFB-033 | P3 | Backlog | Add a friends list with request/accept/remove/block behavior and clear privacy defaults. |
| TGFB-034 | P3 | Backlog | Allow in-app sharing directly to friends. The recipient should receive a bot message naming the sender and song with a deep link to the song in the Mini App. Define notification consent and blocking before enabling sends. |
| TGFB-035 | P3 | Backlog | Add optional notifications when someone follows a playlist or adds a song to a collaborative playlist. Make each category opt-in/out, rate-limit or batch noisy activity, and deep-link to the relevant object. |

## Content expansion

| ID | Priority | Status | Feedback and acceptance note |
| --- | --- | --- | --- |
| TGFB-036 | P3 | Research | Investigate a YouTube import/conversion flow with a maximum source length around 10 minutes. Before building, confirm platform terms, copyright policy, supported inputs, quotas, failure handling, and infrastructure cost. If approved, reject over-limit sources before expensive conversion work. |
| TGFB-037 | P3 | Research | Explore podcasts as a separate content type. Discovery should cover feeds/import, episode metadata, long-form playback position, downloads/streaming, queue behavior, and storage/bandwidth implications. |

## Recommended delivery order

1. **Implemented; matching-client verification pending:** TGFB-001, TGFB-002, TGFB-003, TGFB-007, TGFB-010, TGFB-011, TGFB-016, and TGFB-023 through TGFB-025.
2. **Next core collection workflows:** TGFB-004, the sharing portion of TGFB-005, and broader duplicate handling in TGFB-017.
3. **Queue and retention:** TGFB-004, TGFB-009, TGFB-018, and TGFB-006.
4. **Remaining Telegram-native details:** TGFB-026 through TGFB-030 after verifying TGFB-023 through TGFB-025.
5. **Sharing foundation:** TGFB-028, TGFB-031, TGFB-012, TGFB-014, and TGFB-015 before friends or collaboration.
6. **Social and expansion:** TGFB-032 through TGFB-037 after privacy, moderation, notification, and infrastructure decisions.

## Follow-up test pass

- Re-test TGFB-001 and TGFB-002 on the same Windows Telegram client and record the client/version plus viewport size.
- Confirm whether the tested deployment included the current skeleton, playlist statistics, haptics, and Media Session implementation before closing any **Partial** or **Shipped** item.
- Test mobile Telegram clients separately; swipe gestures, haptics, theme events, home-screen shortcuts, safe areas, and background playback are client-specific.
