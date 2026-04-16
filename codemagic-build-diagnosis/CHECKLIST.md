# Codemagic iOS Build — Pre-push Checklist

Walk through this before triggering the next build.

---

## Before pushing any change

- [ ] Read `DIAGNOSIS.md` end to end. Agree with the ranked suspects.
- [ ] Read `FIX.md` end to end. Decide which step to apply first.
- [ ] Decide: **Step 1 only** (diagnostic) OR **Step 1 + Step 2** (diagnostic + suspected fix).
  - Recommended: Step 1 + Step 2 in the **same** commit. If Step 2 works, Step 1 still pays for itself on the next unrelated failure.
  - Safer: Step 1 alone first, confirm the artifact paths actually produce files, then Step 2.
- [ ] Confirm `codemagic.yaml` diff matches what `FIX.md` says (no accidental re-indent, no stray whitespace).
- [ ] Do NOT apply Step 3 yet.

## Codemagic dashboard sanity check (do this in the UI, not the code)

- [ ] `supa var` variable group still exists and contains `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (referenced at `codemagic.yaml:35-36`).
- [ ] `app_store_connect: OnSite Calculator` integration still active (referenced at `codemagic.yaml:30`).
- [ ] iOS signing cert + provisioning profile for bundle `com.onsiteclub.timekeeper` still present under **Teams → Code signing identities** — exit 65 can also mean signing failed, not just build failed.
- [ ] `SENTRY_AUTH_TOKEN` is **not required** for this build because `SENTRY_DISABLE_AUTO_UPLOAD=true` is set. If you ever flip that to `false`, you will need to add `SENTRY_AUTH_TOKEN` as a Codemagic env var first.

## Repo state sanity check

- [ ] `.gitignore` still excludes `ios/` and `android/` (confirmed today — CNG regenerates each build).
- [ ] `node_modules/` not committed.
- [ ] `app.json:5` version is `1.8.0` and `app.json:15` buildNumber is `41` — if you bump one without the other, App Store Connect will reject upload.
- [ ] No uncommitted edits in `plugins/withSSLPinning.js` that would break prebuild.

## After the next build completes (pass or fail)

- [ ] Open the build in Codemagic UI → **Artifacts** tab.
- [ ] Confirm `.log` files from `$HOME/Library/Logs/gym/*.log` and/or `.xcresult` from DerivedData are attached.
  - If NO `.log` / `.xcresult` attached → the glob path is wrong for this Codemagic image; adjust (try `$CM_BUILD_DIR/ios/build/Logs/**/*.log` as an alternative).
- [ ] If build FAILED: download the log, grep for `error:` and lines near `exit code 65`. Paste the real error into a new diagnosis round. Do **not** guess fixes without reading it.
- [ ] If build SUCCEEDED: remove the verbose-archive artifact paths **only after** two more successful builds in a row, so the artifacts stay available if a regression appears.

## What would falsify the top suspect

- [ ] If Xcode 16.4 still fails with the same 44-second exit 65 error → Suspect A (`DIAGNOSIS.md` §3) is wrong. Suspect B (DEFINES_MODULE) becomes primary. Proceed to `FIX.md` Step 3 only after reading the new log.
- [ ] If the new log shows `code signing`, `provisioning profile`, or `No matching profile` errors → the cause is signing, not toolchain. Neither `FIX.md` Step 2 nor Step 3 will help; check the Codemagic signing dashboard instead.

## What NOT to do

- Do not `expo upgrade`.
- Do not flip `newArchEnabled` to `true`.
- Do not remove `expo-dev-client`.
- Do not `pod repo update` in the pipeline (`pod install` already does it; adds minutes, no upside).
- Do not bump `@sentry/react-native` from `~6.10.0` in this window. Sentry is not the cause.
- Do not switch `useFrameworks: 'static'` just because the DEFINES_MODULE warning mentions modules. That would trigger a different, larger class of issues.
