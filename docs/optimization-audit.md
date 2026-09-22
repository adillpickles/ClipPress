# Application optimization and hardening audit

Audit date: September 22, 2026. Windows x64. This report compares the optimization branch with the previously completed application-hardening branch, not with the much larger pre-hardening package.

## Repository isolation

- Verified starting commit: `315bb05d93d9ef5d4534eb17d641e120c3c2ae82` on `feat/clippress-app-hardening-v1`, synchronized with origin before creating `perf/clippress-optimization-v1`.
- Master remained `ba835653f16daf6301faa41b804a366e6e3189aa`. Neither branch was merged or rewritten.
- The unrelated `site/package-lock.json` modification was excluded throughout. Its SHA-256 remained `712F7C3687D255CD5BFA8D0B8D3AA995139194164C7C548E0D91ED28E4579E38`.
- Both stashes remained unchanged: `7feae523a7a74af1e9735c3459a4639b022a4054` and `95744ea3faa1805466540178216815dff870c837`.
- Disposable media, package snapshots, test harnesses, full logs, and measurement JSON are under `.git/optimization-audit/`. They are intentionally outside commits and distributed packages.

## Independent review of the prior hardening

The master-to-hardening diff covered 58 files. The baseline passed 291 tests before further changes.

| Area | Finding |
| --- | --- |
| Source-path safeguards | **Verified and extended.** Lexical Windows normalization and protection of every merge input were correct. Added filesystem identity checks for hard links, junctions and alternate names; protected additional stream inputs and secondary write paths. Removed the unchecked last-resort name. |
| Automatic and custom naming | **Fixed further.** Retained automatic size-stamped naming and source-safe notices. Fixed missing legacy-template migration and a Simple merge dialog effect that reset the saved template. Revalidated fallback names after adjustment. |
| Export finalization | **Fixed further.** Retaining a successful temporary output was correct. Removed destination deletion before rename; made overwrite-disabled publication refuse collisions atomically. Secondary naming, size-check and cleanup failures preserve successful results. |
| Windows retries | **Issue found and fixed.** The installed p-retry version passes a context object to `shouldRetry`; the old callback tested that object as an Error, preventing retries. Tests exercise the real installed library. |
| Success dialogs | **Verified and extended.** Kept compact summaries and Details. Corrected skipped-output counts, notifications, summaries and cleanup behavior; added actual size for a single lossless/merged output. |
| New media workflow | **Verified and extended.** Stale result dismissal was present. Added explicit video release, cancellation and late-result cleanup. |
| Size planner | **Strict cap verified; reported accuracy not universally reproduced.** Kept the production rates, quality settings and retry thresholds. See the real-media results below. |
| Benchmark | **Issue found and fixed.** It imported production planner functions, but overwrote one output for successive attempts while separately selecting earlier attempt metadata. It now retains the actual best under-cap file and shares the production retry decision. |
| Packaging | **Verified and reduced further.** Electron and TypeScript were absent from the baseline ASAR. Additional development packages, authored dependency sources and redundant font formats remained. |
| Identity and update channel | **Verified and extended.** ClipPress icons, `com.clippress.app`, beta version, release-list endpoint, cleaned AppStream metadata and preserved upstream copyright were correct. Stable update selection now also rejects semver prereleases when release metadata omits its prerelease flag. Windows notification identity remains the existing display name. |
| Configuration recovery | **Issue found and fixed.** A failed backup could previously continue into a resetting store, and invalid top-level JSON was not reliably reset. Backup is now exclusive and mandatory before replacing unreadable settings; initialization errors are visible. Portable config-path handling was retained. |
| Import diagnostics and cleanup | **Verified.** Filename-aware ffprobe categorization, the removal of the obsolete network helper, and corrected text were retained. No extension allowlist was added. |

## Safety and correctness changes

Source checks run both during naming and immediately before relevant writes. They cover normal and size-limited exports, smart-cut pieces, batch concat, segment concat, additional selected source tracks, preview conversion, duration repair, stream/attachment extraction and single-frame capture. Tests cover first/middle/last inputs, Windows case differences, hard links, directory junctions, collisions and permission errors. Actual packaged exports and merges use disposable copies, with source bytes checked afterward.

Size-limited attempts and pass logs now live in a uniquely created sibling directory. Chapter metadata and overlay images use exclusive creation. A failed final move retains the usable encoded file and reports its actual path. Final replacement no longer unlinks an existing destination first. With overwrite disabled, publication uses a hard link followed by temporary-link removal; filesystems without hard-link support use an exclusive copy. Failure to remove an extra temporary link does not turn successful publication into export failure.

Skipped files are excluded from newly written paths and counts. An all-skipped run says “No new files were written.” Skipping a merged output does not delete newly created segment outputs. Requested target text retains the entered MB value; internal sizing continues to use 1,048,576 bytes per entered MB, as before.

These checks do not claim protection against a hostile external process replacing filesystem objects between validation and FFmpeg opening them. Filesystems with unavailable file identities retain lexical protection. User-requested source cleanup remains an expert capability. Partial encoding failures are still failures; successful earlier results and post-processing failures are distinct cases.

## Performance and resources

The main startup improvement replaces approximately 90 individual synchronous settings reads and bridge calls with one serialized snapshot. Settings context values now remain stable while playback time changes. HTTP server initialization and update-check dependencies load on demand; the expression worker starts when first needed. Leaflet and its CSS load only when the GPS view opens. The JSON editor loads only its JavaScript highlighter instead of every supported language.

Encoder detection already had a process cache. The revised cache shares concurrent calls, detects an external FFmpeg path/file change, clears failed loads, and expires after five minutes to accommodate GPU availability changes. Independent NVENC probes run concurrently. This is an invalidation/correctness improvement as well as a reduction in serial probe work; repeated-export caching is not presented as a newly invented feature.

Waveform generation no longer polls every 100 ms. It requests only useful current/adjacent windows, avoids negative timestamps, caps cached slices, cancels superseded work and releases URLs. Both FFmpeg processes in a waveform pipeline settle together. Renderer cancellation is forwarded into a native main-process AbortSignal. Subtitle and thumbnail callbacks discard stale results; compatibility playback cancels debounce timers and pending source-open waits. API action requests and event listeners are released after completion or window closure.

| Deterministic or directly observed comparison | Baseline | Optimized |
| --- | ---: | ---: |
| Settings-context identity changes during approximately 3 s playback | 12 / 59 samples | 0 / 58 samples |
| Idle waveform polling | Every 100 ms | None |
| Font assets in renderer output | 240 WOFF/WOFF2 files | 20 variable WOFF2 files |
| Main renderer JavaScript, build-reported uncompressed size | 4,461 kB | Approximately 4,050 kB, plus optional 417 kB GPS chunk |
| Renderer CSS | 278 kB | Approximately 111 kB, plus optional 19 kB GPS CSS |

Six successive clips with thumbnails and waveform enabled kept tracked live object URLs bounded at 9–11 and released all tracked URLs after close. The baseline also released all tracked URLs on this ordinary workflow; this is validation, not evidence of a measured baseline leak. Old disposable files could be renamed after replacement. No leftover FFmpeg processes remained after closing the test app. An initial playback harness timed out; removing its awaited playback call and changing animation-frame sampling to timer sampling completed the baseline comparison. The cause was not isolated, so this is not counted as an application hang.

Ten process starts per build used separate configuration and Chromium profiles, with update checks disabled and no concurrent build/export. These are ordinary OS-cached starts, not controlled cold boots. Usability means the landing-screen prompt and controls are mounted, observed over CDP; it is a proxy for readiness, not a measured click response. Memory was sampled 1.5 seconds later, using CDP heap usage and Electron process metrics. The second five-run batch gives the more stable comparison:

| Second batch, five runs per build | Baseline median (range) | Optimized median (range) |
| --- | ---: | ---: |
| Process spawn to usable landing screen | 1.220 s (1.155–1.327) | 0.979 s (0.946–1.014) |
| Renderer navigation to DOMContentLoaded | 409 ms (345–470) | 359 ms (284–370) |
| Renderer JavaScript heap | 14.38 MiB (14.35–14.94) | 11.30 MiB (11.29–12.26) |
| Renderer working set | 139.58 MiB (129.43–140.76) | 123.80 MiB (114.80–126.00) |
| Sum of process working sets | 475.52 MiB (422.89–477.11) | 479.69 MiB (390.22–485.27) |

The first batch had a baseline median of 1.580 s and range of 1.198–18.125 s; optimized was 0.960 s, range 0.906–0.976 s. The 18-second baseline outlier is retained in the evidence, not used to claim a dramatic speedup. The repeated batch suggests approximately 20% less startup time on this machine. Renderer heap and working set fell, but total working-set measurements do not establish a consistent whole-application memory reduction; summing working sets can also count shared pages more than once. These observations are not a long-session leak proof. Raw runs and summary are in `baseline-final-startup.json`, `final-startup.json`, `baseline-repeat-startup.json`, `final-repeat-startup.json` and `measurement-summary.json` under the local audit directory.

## Package and dependency audit

The baseline Windows package was 546.71 MiB unpacked, with a 26.28 MiB ASAR and a 129.55 MiB portable executable. Its size was dominated by Electron/Chromium and the bundled media libraries, not application source.

| Artifact | Before, bytes (MiB) | After, bytes (MiB) | Reduction |
| --- | ---: | ---: | ---: |
| app.asar | 27,552,306 (26.28) | 18,955,070 (18.08) | 31.20% |
| win-unpacked | 573,268,635 (546.71) | 564,671,031 (538.51) | 1.50% |
| Portable executable | 135,846,536 (129.55) | 132,923,937 (126.77) | 2.15% |

The final ASAR audit finds 302 packaged dependencies, versus 324 in the baseline. The final portable executable was rebuilt from the validated output and launched directly; measurements do not refer to an older executable left by an interrupted build.

| Baseline component | Bytes | Treatment |
| --- | ---: | --- |
| Electron and other runtime resources | 291,327,446 | Retained |
| FFmpeg, ffprobe and codec libraries | 206,144,512 | Retained |
| Chromium locales | 45,795,804 | Retained; no supported-language reduction |
| Application translations | 2,448,567 | Retained; English extraction updated for changed text |
| ASAR | 27,552,306 | Reduced through proven exclusions and renderer assets |

Runtime root dependencies were traced through their imports and dependency graph:

| Classification | Dependencies / reason |
| --- | --- |
| Required desktop runtime | `@electron/remote`, `electron-store`, `electron-unhandled`, `execa`, `winston`, `yargs-parser`, `zod`: bridges, configuration, diagnostics, subprocesses, logging, CLI and validation. |
| Required media/project runtime | `cue-parser`, `file-type`, `mime-types`, `json5`: supported import/project features and media handling. |
| Required shared runtime | `i18next`, `i18next-fs-backend`, `lodash.debounce`, `mitt`, `semver`: translations, scheduling, events and versions. |
| Optional features, still runtime dependencies | `express`, `express-async-handler`, `morgan`: opt-in local HTTP API. `@octokit/core`: release checking. Loaded on demand, not removed. |
| Development or renderer-bundled only | `electron-devtools-installer` moved to development dependencies with guarded dynamic loading. `@dnd-kit/utilities` moved to development dependencies because its renderer code is bundled. Electron and TypeScript remain build dependencies, outside ASAR. |
| Replaced | `string-to-stream`: Node stdin already accepts the concat text. `@fontsource/open-sans`: replaced by variable Open Sans with the same weights, italic and language subsets. |
| Packaging-only exclusions | `@electron/get`, `extract-zip`, `node-gyp`, `npmlog`, devtools installer and Zod's authored TypeScript `src` tree. Compiled Zod entry points and licenses remain. |

`node-gyp` and `npmlog` belong to native build-tool chains, including implicit native-addon build requirements. They were not indiscriminately deleted from the lockfile. electron-builder's dependency collector reports Yarn build dependencies as extraneous and can include them; explicit exclusions plus package-audit assertions prevent the largest proven leaks. Some small build-graph remnants remain; no unsupported blanket exclusion of transitive packages was applied.

Compatible HTTP fixes resolved `morgan` to 1.12.1, `body-parser` to 2.3.0, `path-to-regexp` to 8.4.2 and `qs` to 6.16.0. The lockfile was deduplicated. Existing peer warnings about the lint configuration and Leaflet integration were recorded; they are not new install failures.

Every package command now generates and includes dependency license notices alongside the root GPL license and existing Chromium/FFmpeg notices. Source maps remain excluded. The package audit checks entry points, required binaries/libraries, licenses and disallowed development packages.

### Remaining security debt

The recursive production dependency audit is **not clean**: Electron 38.8.6 has 19 reported advisories. The audit also traverses its installation dependencies and reports two `extract-zip` advisories and the deprecated `boolean` package. `extract-zip` is excluded from the shipped application; its build-time use remains. Compatible HTTP advisories were addressed.

Electron needs a separately validated upgrade to a supported major version. This pass does not silently treat an old runtime as safe because some advisory preconditions are absent. ClipPress does not use offscreen child windows or custom fetch-enabled protocols, but that does not discharge every runtime advisory. The existing privileged renderer/remote bridge also remains an architectural hardening opportunity. See [Electron's support policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) and the [Electron advisory list](https://github.com/electron/electron/security/advisories).

## Real-media size benchmark

Input: the public [Sintel trailer](https://media.w3.org/2010/05/sintel/trailer.mp4), 52.208333 seconds, 854×480 at 24 fps, H.264/AAC, 4,372,373 bytes. SHA-256: `b670602fa00934ca27c4351bb0efe7ea7a07fae57284e44226025eeed7c51254`.

Twelve production-planner cases exercised CPU and available NVIDIA H.264/AV1 encoders, six modes each at 2 MB and 3 MB. All final files were under their caps. Results used 76.2–93.8% of the requested byte budget, with SSIM 0.9765–0.9931. Maximum-quality cases used two attempts; the other cases used one. Individual encode totals ranged from 1.44 to 33.40 seconds on this machine.

This already-compressed animated sample does **not** substantiate a universal 98–99% target-fill claim. It also does not justify retuning the planner for synthetic or single-sample scores. The strict cap, encoder settings, budget factors, retry limits and quality behavior were retained. The benchmark now measures the actual retained result after retry selection; no padding is used.

## User QA concerns

| Concern | Disposition |
| --- | --- |
| 1. Original safety | Fixed further; lexical, alias and packaged export/merge checks passed on disposable sources. |
| 2. Naming | Prior fixes retained; legacy custom templates and Simple merge template persistence corrected. Existing compact auto names still communicate preset/size. |
| 3. Target accuracy | Strict cap verified; 98–99% not reproduced across the benchmark sample. Major retuning deferred. |
| 4. False failure | Corrected secondary finalization/rename/cleanup/size-check handling; real locked-destination test retained usable output. |
| 5. Success information | Compact dialogs retained; actual size added and skipped/new output accounting corrected. |
| 6. Exact target text | Entered target remains the displayed target; internal byte convention unchanged. |
| 7. Windows locks | Fixed the nonfunctional retry predicate; a real lock released after five seconds recovered successfully, and a persistent lock retained the usable temporary output with a warning. |
| 8. New clip | Stale dialog dismissal verified; media release and pending-work cancellation strengthened. |
| 9. Progress | Existing pass labels retained, retry attempt count added. Percentages remain stage-local rather than fictitiously monotonic. |
| 10. Console noise | `time=N/A` was already ignored; arbitrary fractional seconds now parse correctly. Production-only preview diagnostics removed, real errors retained. |
| 11. Settings | Invalid table structure corrected; keyframe/FFmpeg details placed behind Advanced settings. Broad settings reorganization deferred to manual QA. |
| 12. Advanced export | Fixed filename overflow, table column sizing, duplicate explanation and initial whole-file duration total. No broad visual redesign. |
| 13. Confirmation | Export control now belongs to the sheet header, beside Close. Two-stage configuration flow remains explicit. |
| 14. Unsupported input | Existing ffprobe diagnostics verified; no arbitrary extension changes or speculative conversion promises. |
| 15. Lightweight behavior | Measured asset/package reductions and stable playback settings context; lazy startup work and bounded media resources. |

## Dead code and validation scope

An import-graph scan covered 204 source modules from the main, preload and renderer entry points, followed by checks for worker, dynamic, build and IPC references. Removed the unreferenced export-confirm toggle component, speculative unused renderer ffprobe profile/level parser, unused fixed-hour waveform extractor, disabled filesystem-failure injection branch and detached export-button CSS. No expert workflow, translation catalog, attribution notice or codec was removed based solely on grep.

Validation passed: **333 tests in 34 files**, TypeScript project builds, ESLint (including repository formatting rules), whitespace checks, production renderer/main build, portable packaging, package audit, license audit, English extraction, dependency deduplication and generated-type documentation checks. The baseline had 291 passing tests. Generated documentation and measurement artifacts are not added as unrelated source changes. The security-advisory audit remains nonzero for the explicitly documented Electron/build-chain debt; it is not included in the green checks.

Packaged checks cover lossless and Simple size-limited export, automatic source-safe naming, overwrite-disabled all-skipped runs, batch merge naming against first/middle/last sources, a case-different source, hard-link rejection, transient-lock recovery, retained output under a persistently locked final filename, media replacement/handle release, context stability and a rendered Settings/export-sheet check. The final export sheet had a 924-pixel client width and the same scroll width, with no horizontal overflow. Legacy custom-template migration was exercised in the packaged app. The rebuilt portable executable retained a requested target of 10 MB and the custom template after relaunch, opened media through bundled ffprobe, and exposed `libx264`, `libsvtav1`, `h264_nvenc` and `av1_nvenc` through bundled FFmpeg. Its actual startup update check completed against GitHub and reported no newer applicable release for `0.1.0-beta.3`. Windows is the validated platform; macOS and Linux builds are not claimed tested here.

One initial portable test tried to load the ESM update-check chunk with CommonJS `require`, which failed in the test harness. The replacement test exercised the application's real dynamic-import startup path successfully; no application change was needed for that harness error.

Deferred: broad visual/manual QA, a supported Electron upgrade and privileged-renderer redesign, long-duration memory soak tests, broader real-media size-quality coverage, real speed control, major planner retuning and upstream synchronization. No merge is part of this work.
