# OAuth Implementation Plan — Google & Apple Sign-In

> **App:** OnSite Timekeeper (Expo SDK 52 + React Native 0.76 + Supabase)
> **Target:** Add native "Sign in with Google" and "Sign in with Apple" to `AuthScreen`
> **Approach:** Native SDKs → `supabase.auth.signInWithIdToken()` (not OAuth web flow)
> **Date:** 2026-04-16

---

## 1. Executive Summary

We will add **two native OAuth providers** to the login/signup flow:

| Provider | Package | iOS | Android | Expo Go? |
|----------|---------|-----|---------|----------|
| Google   | `@react-native-google-signin/google-signin` | ✅ Native | ✅ Native (Credential Manager) | ❌ Needs dev build |
| Apple    | `expo-apple-authentication` | ✅ Native | ⚠️ OAuth web flow only | ❌ Needs dev build (iOS) |

**Why native (not `signInWithOAuth`)?**
- No browser redirect → faster, more trustworthy UX
- Apple requires native on iOS (App Store policy)
- Google native flow returns a direct `idToken` we pass to Supabase
- Avoids deep-link / redirect URI complexity
- Supabase supports it via `signInWithIdToken({ provider, token })`

**Scope of this plan:**
- ✅ Google on iOS + Android (native)
- ✅ Apple on iOS (native)
- ⚠️ Apple on Android → hide button on Android (Phase 2 if needed)

---

## 2. Current State (baseline)

**Auth store:** [src/stores/authStore.ts](src/stores/authStore.ts)
- Supports email/password + phone OTP verification
- Uses `supabase.auth.signInWithPassword`, `signUp`, `verifyOtp`
- `onAuthStateChange` already wired for `SIGNED_IN`/`SIGNED_OUT`/`TOKEN_REFRESHED`

**Auth UI:** [src/components/auth/AuthScreen.tsx](src/components/auth/AuthScreen.tsx) + steps (`EmailStep`, `SignupStep`, `OTPVerifyStep`, etc.)

**Post-login flow:** `checkProfile()` → if `full_name` missing → redirect to `app/(auth)/complete-profile.tsx`

**Supabase:** URL + anon key already configured in [app.json](app.json#L133-L134). Project ref: `bjkhofdrzpczgnwxoauk`.

**Bundle IDs:**
- iOS: `com.onsiteclub.timekeeper`
- Android: `com.onsiteclub.timekeeper`

---

## 3. External Prerequisites (do these BEFORE coding)

### 3.1 Google Cloud Console — 3 OAuth Client IDs

Navigate to [console.cloud.google.com](https://console.cloud.google.com) → `APIs & Services` → `Credentials` → `Create Credentials` → `OAuth client ID`.

Create **three** OAuth clients in the **same project**:

#### (a) Web Client ID
- Type: **Web application**
- Name: `OnSite Timekeeper — Web`
- Leave redirect URIs blank (Supabase will fill if needed)
- **Save the Client ID** → this is the `webClientId` used by the RN library and registered in Supabase.

#### (b) iOS Client ID
- Type: **iOS**
- Name: `OnSite Timekeeper — iOS`
- Bundle ID: `com.onsiteclub.timekeeper`
- After save, copy:
  - The **iOS Client ID** (e.g. `1234-abc.apps.googleusercontent.com`)
  - The **iOS URL scheme** (aka reversed client ID, format: `com.googleusercontent.apps.1234-abc`)

#### (c) Android Client ID
- Type: **Android**
- Name: `OnSite Timekeeper — Android`
- Package name: `com.onsiteclub.timekeeper`
- SHA-1 fingerprints: collect **all** of the following:
  ```bash
  # 1. Expo dev / local debug SHA-1
  npx @react-native-google-signin/config-doctor
  # 2. EAS internal & preview SHA-1 (per profile)
  eas credentials
  # 3. Google Play App Signing SHA-1 (once published)
  #    → Play Console → App signing → copy "App signing key certificate" SHA-1
  ```
  Add **every** SHA-1 (dev + EAS profiles + Play) to the same Android OAuth client (you can have multiple).

**OAuth consent screen:** Ensure it is configured (branding, scopes `email` + `profile`, support email). If in "Testing" mode, add test accounts.

### 3.2 Apple Developer Console — Sign in with Apple capability

1. Log in to [developer.apple.com](https://developer.apple.com) → `Certificates, Identifiers & Profiles` → `Identifiers`.
2. Find `com.onsiteclub.timekeeper` (the App ID).
3. Click **Edit** → enable **Sign In with Apple** capability → `Save`.
4. **No Services ID / Secret Key needed** — we are using native iOS sign-in only (not OAuth web flow).

> ⚠️ If later we need Apple sign-in on Android, we'd also need to create a **Services ID**, **Sign-In with Apple Key (.p8)**, and generate a **client secret JWT** that rotates every 6 months. Out of scope for Phase 1.

### 3.3 Supabase Dashboard — enable providers

Dashboard URL: `https://supabase.com/dashboard/project/bjkhofdrzpczgnwxoauk/auth/providers`

#### Google Provider
- Toggle **Enabled**
- **Skip nonce check:** ❌ leave disabled
- **Authorized Client IDs** (comma-separated): add **all three**
  ```
  <WEB_CLIENT_ID>,<IOS_CLIENT_ID>,<ANDROID_CLIENT_ID>
  ```
  (Supabase will verify the ID token's `aud` claim against this list.)
- Client ID / Secret fields: use the **Web** client ID + secret (needed for fallback OAuth flow, harmless to fill).

#### Apple Provider
- Toggle **Enabled**
- **Client IDs** (comma-separated): every iOS bundle ID variant we ship:
  ```
  com.onsiteclub.timekeeper
  ```
  (Add `.dev`, `.preview`, `.staging` if we later introduce build variants. Also add `host.exp.Exponent` ONLY if we want Expo Go testing — we don't, so skip.)
- Secret Key / Services ID: leave blank (native iOS path doesn't need them).

---

## 4. Package Installation

```bash
# Native Google Sign-In (iOS + Android)
npx expo install @react-native-google-signin/google-signin

# Native Apple Sign-In (iOS only)
npx expo install expo-apple-authentication

# Crypto for SHA-256 nonce hashing (Apple requires this for replay protection)
npx expo install expo-crypto
```

**Versions pinned by Expo SDK 52 resolver** — let `npx expo install` choose; do not pin manually. Expected:
- `@react-native-google-signin/google-signin` ≥ 13.x
- `expo-apple-authentication` ~ 7.1.x
- `expo-crypto` ~ 14.0.x

---

## 5. App Config Changes ([app.json](app.json))

Add to the `ios` block:
```json
"ios": {
  "bundleIdentifier": "com.onsiteclub.timekeeper",
  "usesAppleSignIn": true,
  ...
}
```

Add to the `plugins` array:
```json
"plugins": [
  ...,
  "expo-apple-authentication",
  [
    "@react-native-google-signin/google-signin",
    {
      "iosUrlScheme": "com.googleusercontent.apps.<REVERSED_IOS_CLIENT_ID>"
    }
  ]
]
```

Add to `extra` (public values — safe to commit):
```json
"extra": {
  ...,
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<WEB_CLIENT_ID>.apps.googleusercontent.com",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "<IOS_CLIENT_ID>.apps.googleusercontent.com"
}
```

> **Rebuild required:** After editing `app.json`, we MUST rebuild with `eas build` (or `expo run:ios` / `run:android` locally). The new native modules will not appear in existing dev client builds.

---

## 6. Code Changes

### 6.1 New file: `src/lib/oauth.ts`

Centralised OAuth helpers — keeps provider complexity out of the store.

```typescript
/**
 * OAuth Helpers — Native Google + Apple Sign-In
 *
 * Both providers use supabase.auth.signInWithIdToken() which verifies
 * the ID token's signature + audience + nonce server-side.
 */

import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';
import { logger } from './logger';
import { captureMessage } from './sentry';

// ─────────────────────────────────────────────────────────────
// GOOGLE
// ─────────────────────────────────────────────────────────────

let googleConfigured = false;

function configureGoogle() {
  if (googleConfigured) return;
  const webClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

  if (!webClientId) {
    logger.error('auth', 'Google webClientId missing in expo config');
    throw new Error('Google Sign-In not configured');
  }

  GoogleSignin.configure({
    webClientId,           // REQUIRED — matches Supabase aud claim
    iosClientId,           // iOS-only; optional on Android
    scopes: ['profile', 'email'],
    offlineAccess: false,  // we don't need refresh tokens from Google
  });
  googleConfigured = true;
}

export async function signInWithGoogle(): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  try {
    configureGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    // v13+ returns { type: 'success' | 'cancelled', data: {...} }
    if (response.type === 'cancelled') {
      return { success: false, cancelled: true };
    }

    const idToken = response.data?.idToken;
    if (!idToken) {
      logger.error('auth', 'Google sign-in: no idToken returned');
      return { success: false, error: 'No ID token received from Google' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) {
      logger.error('auth', 'Supabase signInWithIdToken (google) failed', { error: error.message });
      captureMessage('Auth: Google sign-in failed', {
        level: 'warning',
        tags: { security: 'auth', provider: 'google' },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    logger.info('auth', '✅ Google sign-in success');
    return { success: true };
  } catch (e: any) {
    if (e?.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, cancelled: true };
    }
    if (e?.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in already in progress' };
    }
    if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Google Play Services not available' };
    }
    logger.error('auth', 'Google sign-in exception', { error: String(e) });
    return { success: false, error: 'Google sign-in failed' };
  }
}

export async function signOutFromGoogle() {
  try {
    if (googleConfigured) await GoogleSignin.signOut();
  } catch {
    // non-fatal
  }
}

// ─────────────────────────────────────────────────────────────
// APPLE (iOS only)
// ─────────────────────────────────────────────────────────────

export function isAppleAuthAvailable(): boolean {
  return Platform.OS === 'ios';
}

/**
 * Nonce: random raw string → SHA-256 hashed version sent to Apple →
 * Apple embeds hashed nonce in ID token → we send raw nonce to Supabase →
 * GoTrue hashes raw nonce and compares. Protects against replay attacks.
 */
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return { raw, hashed };
}

export async function signInWithApple(): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
  if (!isAppleAuthAvailable()) {
    return { success: false, error: 'Apple Sign-In is only available on iOS' };
  }

  try {
    const { raw, hashed } = await generateNonce();

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashed, // send HASHED nonce to Apple
    });

    if (!credential.identityToken) {
      logger.error('auth', 'Apple sign-in: no identityToken');
      return { success: false, error: 'No identity token from Apple' };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: raw, // send RAW nonce to Supabase
    });

    if (error) {
      logger.error('auth', 'Supabase signInWithIdToken (apple) failed', { error: error.message });
      captureMessage('Auth: Apple sign-in failed', {
        level: 'warning',
        tags: { security: 'auth', provider: 'apple' },
        extra: { reason: error.message },
      });
      return { success: false, error: error.message };
    }

    // Apple only returns fullName on FIRST sign-in — persist it immediately
    if (credential.fullName && data.user) {
      const parts = [credential.fullName.givenName, credential.fullName.middleName, credential.fullName.familyName]
        .filter(Boolean);
      if (parts.length > 0) {
        const fullName = parts.join(' ');
        try {
          await supabase.auth.updateUser({
            data: {
              full_name: fullName,
              first_name: credential.fullName.givenName || null,
              last_name: credential.fullName.familyName || null,
            },
          });
          // Also upsert profiles row (trigger only creates id/email)
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: data.user.email,
            full_name: fullName,
          }, { onConflict: 'id' });
        } catch (e) {
          logger.warn('auth', 'Failed to persist Apple full name', { error: String(e) });
        }
      }
    }

    logger.info('auth', '✅ Apple sign-in success');
    return { success: true };
  } catch (e: any) {
    if (e?.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, cancelled: true };
    }
    logger.error('auth', 'Apple sign-in exception', { error: String(e) });
    return { success: false, error: 'Apple sign-in failed' };
  }
}
```

### 6.2 Extend `authStore` with OAuth actions

Add to [src/stores/authStore.ts](src/stores/authStore.ts):

```typescript
// In AuthState interface:
signInWithGoogle: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
signInWithApple: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;

// In the store body:
signInWithGoogle: async () => {
  set({ isLoading: true, error: null });
  const { signInWithGoogle } = await import('../lib/oauth');
  const result = await signInWithGoogle();
  if (result.success) {
    // onAuthStateChange will set session; still call checkProfile
    await get().checkProfile();
  }
  set({ isLoading: false, error: result.error ?? null });
  return result;
},

signInWithApple: async () => {
  set({ isLoading: true, error: null });
  const { signInWithApple } = await import('../lib/oauth');
  const result = await signInWithApple();
  if (result.success) {
    await get().checkProfile();
  }
  set({ isLoading: false, error: result.error ?? null });
  return result;
},
```

Update `signOut` to also sign out from Google:
```typescript
signOut: async () => {
  set({ isLoading: true });
  try {
    const { signOutFromGoogle } = await import('../lib/oauth');
    await signOutFromGoogle();
    if (isSupabaseConfigured()) await supabase.auth.signOut();
    // ... existing cleanup
  }
  // ...
}
```

### 6.3 UI: Add provider buttons to `AuthScreen`

Add a new component `src/components/auth/SocialButtons.tsx`:

```typescript
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

export function SocialButtons({ onSuccess, onError }: Props) {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const { signInWithGoogle, signInWithApple } = useAuthStore();

  const handleGoogle = async () => {
    setLoading('google');
    const res = await signInWithGoogle();
    setLoading(null);
    if (res.success) onSuccess?.();
    else if (!res.cancelled && res.error) onError?.(res.error);
  };

  const handleApple = async () => {
    setLoading('apple');
    const res = await signInWithApple();
    setLoading(null);
    if (res.success) onSuccess?.();
    else if (!res.cancelled && res.error) onError?.(res.error);
  };

  return (
    <View style={styles.container}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or continue with</Text>
        <View style={styles.line} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.button, styles.googleBtn, pressed && { opacity: 0.7 }]}
        onPress={handleGoogle}
        disabled={loading !== null}
      >
        {loading === 'google' ? (
          <ActivityIndicator color="#000" />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color="#000" />
            <Text style={styles.googleText}>Continue with Google</Text>
          </>
        )}
      </Pressable>

      {Platform.OS === 'ios' && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          style={styles.appleBtn}
          onPress={handleApple}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12, marginTop: 20 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  line: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  dividerText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  button: {
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBtn: { backgroundColor: '#FFFFFF' },
  googleText: { color: '#000', fontSize: 15, fontWeight: '600' },
  appleBtn: { height: 50, width: '100%' },
});
```

**Integrate into [AuthScreen.tsx](src/components/auth/AuthScreen.tsx)** — render `<SocialButtons />` in `EmailStep` (and optionally `SignupStep`), above or below the email field.

### 6.4 Profile flow considerations

Existing `checkProfile()` already handles the case where `full_name` is missing by redirecting to `complete-profile.tsx`. OAuth users who grant name scope will have `full_name` set (Google always returns it; Apple only on first sign-in — we save it in `oauth.ts`).

**No change required** to the nav guard, as long as:
- Apple `fullName` is persisted to `user_metadata` on first sign-in ✅ (handled in 6.1)
- Google's `idToken` payload includes `name` claim → Supabase already maps it to `user_metadata.full_name`

If an OAuth user signs in without granting name (e.g. "Hide my email" on Apple subsequent logins), they'll land on `complete-profile` — existing behavior, acceptable.

**Phone OTP:** OAuth signups should **bypass** the phone OTP step entirely. Current `signUp()` in the store requires email+password+phone; `signInWithGoogle/Apple` do not touch `pendingPhoneVerification`, so this works automatically.

---

## 7. Build & Test Matrix

### 7.1 Local dev build
```bash
# iOS
npx expo prebuild --platform ios --clean
npx expo run:ios

# Android
npx expo prebuild --platform android --clean
npx expo run:android
```
> ⚠️ `prebuild --clean` wipes native dirs — all gradle fixes must live in `app.json` plugins (already the case per CLAUDE.md).

### 7.2 EAS build
```bash
eas build --profile development --platform all
```
Ensure EAS build SHA-1 is registered in the Google Android OAuth client (see §3.1).

### 7.3 Test checklist
- [ ] **iOS — Google:** first-time sign-in → profile populated → lands on home
- [ ] **iOS — Apple (first):** name captured → `profiles.full_name` set → home
- [ ] **iOS — Apple (second):** signs in with existing user → no duplicate row → home
- [ ] **Android — Google:** first-time + returning user both work
- [ ] **Android — Apple button hidden** (Platform.OS !== 'ios')
- [ ] **Cancel flow:** user cancels → no error toast, stays on EmailStep
- [ ] **Offline:** network error returns graceful error message
- [ ] **Duplicate email:** signing in with Google when email already exists via password → links identity (Supabase default behavior if email matches) OR shows clear error
- [ ] **Sign out:** `signOut()` clears both Supabase session AND Google cached credential
- [ ] **Account deletion:** existing `deleteAccount` RPC still works (no change needed)

---

## 8. Security Considerations

- ✅ **ID tokens verified server-side** by Supabase (signature, audience, nonce, expiry) — we never trust the client.
- ✅ **Nonce for Apple** prevents replay attacks (implemented in `oauth.ts`).
- ✅ **Client IDs in `extra`** are public by design (OAuth client IDs are not secrets; the iOS client ID's URL scheme is embedded in the binary anyway).
- ✅ **No client secrets in app** — the Web client secret stays in Supabase dashboard only.
- ⚠️ **Email enumeration:** OAuth sign-in exposes whether an email exists via the identity-linking flow. This is inherent to OAuth and accepted industry-wide.
- ✅ **PII logging:** Existing `logger.ts` auto-masks emails — new OAuth logs follow same pattern.
- ✅ **Sentry tagging:** Failures tagged with `provider: 'google' | 'apple'` for triage.

---

## 9. Rollout Order (recommended)

1. **Branch:** `feat/oauth-google-apple`
2. Create Google Cloud + Apple Developer configs (§3) — **safe, no code impact**
3. Install packages + update `app.json` (§4, §5) — requires native rebuild
4. Write `oauth.ts` + extend `authStore` (§6.1, §6.2)
5. Build `SocialButtons` + integrate into `AuthScreen` (§6.3)
6. EAS preview build → run full test matrix (§7)
7. Enable providers in Supabase dashboard (§3.3) — **gate:** do last so no user sees broken buttons mid-rollout
8. Merge → production build

---

## 10. Phase 2 (future, not in this plan)

- Apple Sign-In on **Android** (OAuth web flow + Services ID + 6-month secret rotation)
- **Account linking UI** — let users connect Google/Apple to an existing email account post-hoc (`supabase.auth.linkIdentity`)
- **Remove password auth entirely** once OAuth adoption > 80% (simpler surface area)

---

## Sources

- [Supabase — Login with Apple (official docs)](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase — Login with Google (official docs)](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase — signInWithIdToken API reference](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken)
- [Supabase blog — Native Mobile Auth Support for Google and Apple Sign In](https://supabase.com/blog/native-mobile-auth)
- [@react-native-google-signin — Expo setup guide](https://react-native-google-signin.github.io/docs/setting-up/expo)
- [@react-native-google-signin — Collecting configuration (Google Cloud Console)](https://react-native-google-signin.github.io/docs/setting-up/get-config-file)
- [@react-native-google-signin — iOS setup](https://react-native-google-signin.github.io/docs/setting-up/ios)
- [@react-native-google-signin — Security (nonce, token verification)](https://react-native-google-signin.github.io/docs/security)
- [Expo — expo-apple-authentication API docs](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Expo — Using Google authentication](https://docs.expo.dev/guides/google-authentication/)
- [Expo — Using Supabase](https://docs.expo.dev/guides/using-supabase/)

---

*Plan authored: 2026-04-16 — ready for review.*
