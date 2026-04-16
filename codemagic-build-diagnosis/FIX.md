# Codemagic iOS Build — Proposed Fix

> Apply **one step at a time**, push, let the build run, inspect, then decide whether the next step is still needed.
> Do not apply all three steps at once — that defeats the point of isolating the cause.

---

## Step 1 — Make the next build diagnosable (LAND FIRST)

### Why this

The Codemagic UI truncates build logs to the last ~50 lines per step, which is why Cris can see "exit code 65" but not the actual Xcode error. `xcodebuild archive` exit 65 just means "something went wrong during archive" — the real error is somewhere in the middle of the step's ~5000-line output. Without it, every suspect in `DIAGNOSIS.md` is a guess. This step uploads the full log and the Xcode `.xcresult` bundle as build artifacts so the next failure is diagnosable from your Windows machine. It is **additive only** — it does not change how the build runs. Risk: zero.

### Diff — `codemagic.yaml`

```diff
     artifacts:
       - build/ios/ipa/*.ipa
+      - /tmp/xcodebuild_logs/*.log
+      - $HOME/Library/Developer/Xcode/DerivedData/**/Build/**/*.xcresult
+      - $HOME/Library/Logs/gym/*.log
     publishing:
```

> Note: `$HOME/Library/Logs/gym/*.log` catches the log that Codemagic's `xcode-project build-ipa` wrapper (which wraps `xcodebuild` via fastlane gym) writes. It's the most likely location of a readable error message today — even without the verbose step below.

### Expected outcome
Same failure, but the next build will surface a downloadable `.log` and `.xcresult` in the Codemagic UI under **Artifacts**. Open the `.xcresult` in Xcode on a Mac, or `cat` the `.log` — the real error will be in there.

### Rollback
Remove the three added lines.

---

## Step 2 — The actual suspected fix (apply AFTER Step 1 lands)

### Why this

Expo SDK 52 and React Native 0.76 shipped in November 2024 and were validated against Xcode 16.x. Codemagic's `xcode: latest` currently resolves to **Xcode 26.2**, which postdates SDK 52 by over a year. Xcode 26 enforces stricter module/linker rules and has already surfaced `[Privacy Manifest Aggregation]` phases in the build output. The 44-second failure time is characteristic of an early pre-compile phase refusing to proceed — not a deep compile bug — which is exactly how toolchain mismatches manifest. Pinning to `16.4` (the last 16.x image Codemagic offers) reverts to the toolchain SDK 52 was designed for. Bumping Node to 20 is unrelated but aligned hygiene — `@supabase/supabase-js` warns on 18, and many transitive deps assume ≥20; it costs nothing here.

This is a **pin, not a permanent solution**. When the project upgrades past Expo SDK 54 (which officially supports Xcode 26), remove the pin.

### Diff — `codemagic.yaml`

```diff
   ios-build:
     name: iOS Build → TestFlight
     max_build_duration: 90
     instance_type: mac_mini_m2
     integrations:
       app_store_connect: OnSite Calculator
     environment:
-      node: 18
-      xcode: latest
+      node: 20
+      xcode: 16.4
       cocoapods: default
```

### Expected outcome
If Suspect A in `DIAGNOSIS.md` is correct, this build **succeeds** — ends with an uploaded `.ipa` and a TestFlight submission. If it still fails, read the `.log` and `.xcresult` that Step 1 now uploads before doing anything else.

### Rollback
Restore `node: 18` and `xcode: latest`.

### Commit (for Cris, manually — I am not pushing)
```
git add codemagic.yaml
git commit -m "ci(ios): pin Xcode 16.4 and Node 20 on Codemagic

Expo SDK 52 / RN 0.76 was stabilized against Xcode 16.x;
xcode: latest on Codemagic now resolves to Xcode 26.2, which
postdates SDK 52 by over a year. Pin to 16.4 until the project
upgrades past Expo SDK 54 (which officially supports Xcode 26).
Bump Node to 20 to match @supabase/supabase-js minimum."
```

---

## Step 3 — Only if Step 2 does NOT resolve the failure

### Why this (conditional)

The "Can't merge pod_target_xcconfig" warning emitted twice by the build points at `expo-dev-menu` parent + 4 subspecs (evidence in `DIAGNOSIS.md` §1.3). Historically non-fatal, but under Xcode 26's stricter module verifier it can turn fatal. If Step 2's downgrade to Xcode 16.4 does not fix the build, and the new `.log` from Step 1 implicates module definition errors on `expo-dev-menu`, we patch the DEFINES_MODULE inconsistency in a Podfile `post_install` hook.

Because `expo prebuild --clean` regenerates `ios/` on every Codemagic build, the patch must be applied via an Expo config plugin (mod) that injects into the generated Podfile — not by editing `ios/Podfile` directly (which would be wiped).

### Sketch (do not apply yet)

New file `plugins/withExpoDevMenuDefinesModule.js`:
```js
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withExpoDevMenuDefinesModule(config) {
  return withDangerousMod(config, ['ios', async (cfg) => {
    const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    let pod = fs.readFileSync(podfilePath, 'utf8');
    const hook = `
  post_install do |installer|
    installer.pods_project.targets.each do |t|
      if t.name.start_with?('expo-dev-menu')
        t.build_configurations.each do |c|
          c.build_settings['DEFINES_MODULE'] = 'YES'
        end
      end
    end
  end
`;
    if (!pod.includes("expo-dev-menu")) pod += hook;
    fs.writeFileSync(podfilePath, pod);
    return cfg;
  }]);
};
```

Then in `app.json` plugins array, after `./plugins/withSSLPinning`:
```
"./plugins/withExpoDevMenuDefinesModule",
```

**Do not apply Step 3 without evidence from the log that module errors are the cause.** It is listed here so we have a known next move, not as a pre-emptive change.

---

## What I did NOT change (and why)

- **`expo-dev-client`:** kept — Cris uses it intentionally in the TestFlight flow.
- **Distribution method:** kept `app_store` / TestFlight — per the brief, non-negotiable.
- **Expo SDK / RN versions:** not touched — nuclear change, no evidence yet that it's required.
- **`newArchEnabled`:** already `false`; not relevant.
- **Sentry:** `SENTRY_DISABLE_AUTO_UPLOAD=true` already set; the Sentry phase is already a no-op.
- **The `expo prebuild --clean` step:** left alone — `.gitignore` excludes `ios/` and `android/`, so Codemagic must regenerate them on every run.
- **Verbose archive debug step:** intentionally **omitted** from Step 1. `xcode-project build-ipa` already writes a gym log and produces an `.xcresult`; Step 1's artifact globs capture both. Adding a duplicate `xcodebuild archive` invocation before the real step would waste 30+ minutes per build and is unnecessary if gym's log is legible. If Step 1's artifacts turn out to be empty, reconsider.
