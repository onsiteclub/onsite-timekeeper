# Codemagic iOS Build — Diagnosis

Build ID `69e14588fd059469b5fd5bf7`, commit `913cb71`, branch `main`.
Failing workflow: `ios-build` → step **Build signed IPA** (`codemagic.yaml:55-60`).
Observed failure: `xcodebuild archive` exit code **65** after **~44 seconds**.

---

## 1. Confirmed facts (verifiable today)

### 1.1 Stack actually in this repo (from local files, not assumed)

| Item | Actual value | Source |
|---|---|---|
| Expo SDK | `~52.0.49` | [package.json:25](package.json#L25) |
| React Native | `0.76.9` | [package.json:49](package.json#L49) |
| New Arch / Fabric | **disabled** (`newArchEnabled: false`) | [app.json:11](app.json#L11) |
| Sentry RN SDK | **`~6.10.0`** (not 8.48) | [package.json:23](package.json#L23) |
| `expo-dev-client` | `~5.0.20` | [package.json:34](package.json#L34) |
| iOS min deployment target | **15.1** (RN default) | [node_modules/react-native/scripts/cocoapods/helpers.rb:70-72](node_modules/react-native/scripts/cocoapods/helpers.rb#L70-L72) |
| iOS `useFrameworks` | **not set** → dynamic (default) | [app.json:91-100](app.json#L91-L100) has no `ios` block |
| Kotlin pin | `2.0.21` (Android only) | [app.json:94](app.json#L94) |

> **Correction to the task brief:** the brief states Fabric is enabled and Sentry is 8.48. Neither is true in the current source. This changes the suspect list (see §3).

### 1.2 codemagic.yaml today

[codemagic.yaml:25-69](codemagic.yaml#L25-L69):

- `instance_type: mac_mini_m2` ✓
- `node: 18` → build machine resolves to Node **18.20.8**
- `xcode: latest` → at the time of the failure resolves to **Xcode 26.2 (17C52)**
- `cocoapods: default`
- `SENTRY_DISABLE_AUTO_UPLOAD: "true"` is set in env vars → **Sentry debug-symbol upload phase does NOT run**. Sentry is ruled out as the cause of exit 65.
- `max_build_duration: 90` → 44s failure is an **early** failure, not a timeout
- `xcode-project build-ipa --workspace ios/OnSiteTimekeeper.xcworkspace --scheme OnSiteTimekeeper --config Release` — no `--export-options-plist` passed (Codemagic's `xcode-project` helper generates it from the `ios_signing` block, so this is fine)
- No `xcpretty`/`xcbeautify` piping. Exit code propagates correctly; it's the Codemagic UI truncating log tail that hides the real Xcode error, not a formatter swallowing it.

### 1.3 `Can't merge pod_target_xcconfig` warning — source identified

The five targets named by the warning
(`expo-dev-menu`, `Main`, `ReactNativeCompatibles`, `SafeAreaView`, `Vendored`)
are the **parent spec + four subspecs** of a single pod: `expo-dev-menu`.
Evidence in [node_modules/expo-dev-menu/expo-dev-menu.podspec](node_modules/expo-dev-menu/expo-dev-menu.podspec):

- Line 66-70: parent `s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', ... }`
- Line 82-85: `SafeAreaView` subspec `pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', ... }`
- Line 98-100: `Vendored` subspec — no `pod_target_xcconfig` (inherits parent `YES`)
- **Line 109: `main.pod_target_xcconfig = {}` ← the conflict source** (explicitly empty, which, when merged with the parent's `DEFINES_MODULE = YES`, produces the "different values" warning)
- Line 126-132: `ReactNativeCompatibles` subspec — no `pod_target_xcconfig` (inherits parent `YES`)

This warning has been emitted by `expo-dev-menu` on **every** build of this app for months and has historically been **non-fatal**. That does not mean it stays non-fatal under every Xcode version.

### 1.4 What we do **not** know

- The actual Xcode error message. The log shown in the UI is truncated; the real error lives in the middle of the Step 7 output.
- What Codemagic labels "Step 7" against the 5 scripts in `codemagic.yaml`. Codemagic counts its own preflight + code-signing steps; "Step 7" is consistent with the 5th user script after 2 internal steps.
- Whether `xcresult` / `.log` artifacts are even being produced. Currently `artifacts:` only lists `build/ios/ipa/*.ipa`, which is never written on failure. **You cannot diagnose further without Phase 1 log capture landed.**

---

## 2. Ruled-out hypotheses

| Hypothesis | Why ruled out |
|---|---|
| Sentry upload failing silently | `SENTRY_DISABLE_AUTO_UPLOAD=true` is set in env ([codemagic.yaml:40](codemagic.yaml#L40)); the Sentry upload build phase is a no-op. |
| Fabric / New Architecture incompat | `newArchEnabled: false` in app.json — Fabric is off in this app. |
| iOS deployment target mismatch | All declared targets align on iOS 15.1 (RN helpers.rb, expo-dev-menu podspec). |
| `expo-dev-client` in Release | Cris explicitly wants it kept; not enough evidence it causes exit 65. |
| `xcpretty` swallowing errors | Not used in the pipeline. Raw `xcode-project build-ipa` invocation. |
| `max_build_duration: 90` too short | Failure is at 44s, not 90min. |
| Node 18 → xcodebuild failure | Node version does not influence xcodebuild directly. It may warn about Supabase/Iceberg; worth bumping to 20, but not the smoking gun. |

---

## 3. Ranked suspects

### Suspect A — Xcode 26.2 vs Expo SDK 52 toolchain drift (**HIGH, ~70%**)

**Evidence:**
- Expo SDK 52 and RN 0.76 shipped in **Nov 2024**, validated against **Xcode 16.x** (Xcode 16 was current).
- Codemagic's `xcode: latest` now resolves to **Xcode 26.2**, which postdates SDK 52 by over a year.
- Xcode 26 introduces stricter Swift module enforcement, privacy manifest aggregation (log already mentions `[Privacy Manifest Aggregation]`), and a new linker that is less tolerant of inconsistent module settings.
- 44-second failure time is characteristic of a **pre-compile / early-phase** failure (pod preflight, Swift module resolution, or linker refusing to proceed) — not a deep compile error, which would take minutes.
- Expo has no official statement that SDK 52 is compatible with Xcode 26.

**Proposed fix (smallest):** pin `xcode: 16.4` in `codemagic.yaml:33`. 16.4 is the last stable 16.x on Codemagic and matches what SDK 52 shipped against.

**Risk of fix:** Very low. You are reverting to an older, stable toolchain known to work for RN 0.76.

### Suspect B — DEFINES_MODULE conflict becomes fatal under Xcode 26's module loader (**MEDIUM, ~20%**)

**Evidence:**
- Warning is present, repeated twice, and names exactly the 5 expo-dev-menu (sub)specs that have inconsistent `DEFINES_MODULE` values.
- Xcode 26's module verifier rejects configurations it previously only warned on.
- This suspect and Suspect A are **correlated** — if A is the root cause, B disappears because Xcode 16 still treats this as a warning.

**Proposed fix (only if A alone doesn't resolve it):** add a Podfile `post_install` hook that forces `DEFINES_MODULE = YES` on every target belonging to `expo-dev-menu`. Since Codemagic's `expo prebuild --clean` regenerates `ios/`, the hook must go into `app.json` via a custom Expo config plugin, *or* into a Podfile patch applied after prebuild.

**Risk of fix:** Medium. Touching native config plugins can break the prebuild step itself. Do not attempt before Suspect A is validated/invalidated.

### Suspect C — Real error still unknown (**honest answer**)

A and B are hypotheses consistent with the symptom. They are **not** proven. The only way to prove them is to capture the actual xcodebuild error from the next build. That is Phase 1.

---

## 4. Recommended fix order

Try each in isolation. **One change per build attempt.** After each attempt, open the uploaded `verbose.log` and `.xcresult` artifacts.

1. **Build 1 (diagnostic):** land Phase 1 changes from `FIX.md` (artifact paths + optional verbose archive). This build may still fail, but the next failure will include the real error. Keep `xcode: latest` for this run to confirm the current failure mode.

2. **Build 2 (fix attempt — Suspect A):** pin `xcode: 16.4`, bump `node: 20`. Leave artifact uploads in place. If this succeeds → done. Stop. Delete the verbose archive step.

3. **Build 3 (only if Build 2 fails):** read the new `verbose.log`. If the error points at DEFINES_MODULE / module verification failures on expo-dev-menu, add the Podfile `post_install` hook (Suspect B). Otherwise, re-diagnose from the new evidence — **do not escalate to SDK/RN bumps without reading the log first**.

---

## 5. Output summary

- **Top suspect:** Xcode 26.2 toolchain drift vs Expo SDK 52 (evidence in §3.A).
- **Smallest fix:** pin `xcode: 16.4` in [codemagic.yaml:33](codemagic.yaml#L33).
- **Blocker:** the actual error is not visible in the logs Cris can see today. Phase 1 artifact capture must land before the next run for this to be provable rather than hypothetical.
- **Factual corrections vs the brief:** `newArchEnabled` is `false` (not true), Sentry SDK is `~6.10.0` (not 8.48), and `SENTRY_DISABLE_AUTO_UPLOAD` is already `true` — so Sentry is not the cause.
