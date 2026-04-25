# Auth Architecture Reference — OnSite Club Apps

> **What this is:** post-implementation reference for the auth stack used by the
> OnSite Timekeeper app. This is the **first** OnSite Club React Native app to
> ship its own login (email/password + Sign in with Apple + Sign in with Google,
> across iOS, Android, and web). Use this doc as the starting point for any new
> RN app that needs the same setup, or for a shared `auth` package that
> multiple apps in a monorepo consume.
>
> **Keep this updated** when you change anything about the flow — it's the only
> place that captures the gotchas we hit.
>
> Last verified: 2026-04-25 against `bjkhofdrzpczgnwxoauk` Supabase project,
> Expo SDK 52, RN 0.76, `@react-native-google-signin/google-signin@^16`,
> `expo-apple-authentication@latest`.

---

## TL;DR — what works today

| Capability | iOS | Android | Web |
|---|---|---|---|
| Email + password sign in | ✅ | ✅ | ✅ |
| Email + password signup | ✅ | ✅ | ✅ |
| Sign in with Apple | ✅ native (`expo-apple-authentication`) | ❌ no native option | ✅ OAuth redirect |
| Sign in with Google | ✅ native (`@react-native-google-signin`) | ✅ native | ✅ OAuth redirect |
| Forgot password | ⚠️ phone-OTP only — no email reset | ⚠️ phone-OTP only | ⚠️ phone-OTP only |
| Sign out / Delete account | ✅ | ✅ | ✅ (uses `confirmAsync` helper, not `Alert.alert`) |
| Identity linking (auto-merge by verified email) | ✅ enabled | ✅ enabled | ✅ enabled |
| Email notification when identity linked | ✅ enabled | ✅ enabled | ✅ enabled |

**Identity linking** is automatic: if a user signs up with Apple and later signs
in with Google using the same verified email, Supabase merges them into one
account. `auth.identities` grows with one row per provider; `auth.users` stays
single. The original password (if any) is preserved.

**Open issues** (intentionally deferred — see "Backlog" below):
1. No email-based password reset path (only phone-OTP, broken for OAuth-only users without a phone)
2. No identifier-first UX (user types wrong-password and gets a generic banner instead of "this account uses Apple — tap that button")
3. iOS Google sign-in works only because Supabase's `external_google_skip_nonce_check` is `true` — that's a security trade-off (see "Known issues §3")

---

## Architecture

### Component map

```
app/(auth)/login.tsx          → wrapper, renders <AuthScreen />
src/components/auth/
  AuthScreen.tsx              → main UI: email/password fields, error banner,
                                 step state machine (login/signup/phone-reset/
                                 phone-reset-otp/set-new-password)
  SocialButtons.tsx           → Google + Apple buttons, platform-conditional
                                 rendering (iOS native button vs web custom)
  PhoneInputStep.tsx          → phone-OTP reset flow
  OTPVerifyStep.tsx           → OTP entry
  SetNewPasswordStep.tsx      → after OTP, set new password
  SignupStep.tsx              → signup form

src/lib/
  supabase.ts                 → Supabase client. detectSessionInUrl true on
                                 web (for OAuth redirect callback), false on
                                 native
  oauth.ts                    → signInWithGoogle, signInWithApple. Each
                                 dispatches: web → signInWithOAuth(redirect),
                                 native → signInWithIdToken(token)
  confirm.ts                  → confirmAsync({title,message,...}) → Promise<bool>.
                                 Uses Alert.alert on native, window.confirm on web

src/stores/authStore.ts       → zustand store: user, session, signIn, signUp,
                                 signOut, deleteAccount, signInWithGoogle/Apple
                                 (delegates to oauth.ts), phone reset flow
```

### Data flow per platform

**Native (iOS / Android), Apple or Google:**

```
User taps button
  → SocialButtons.tsx
  → authStore.signInWithApple() | signInWithGoogle()
  → src/lib/oauth.ts native branch
  → expo-apple-authentication.signInAsync() | GoogleSignin.signIn()
  → returns { idToken, ... } from provider's native SDK
  → supabase.auth.signInWithIdToken({ provider, token: idToken, nonce? })
  → Supabase verifies token signature + audience + expiry server-side
  → session set in client, onAuthStateChange fires, app navigates to /(tabs)
```

**Web, Apple or Google:**

```
User taps button
  → SocialButtons.tsx
  → authStore.signInWithApple() | signInWithGoogle()
  → src/lib/oauth.ts web branch (Platform.OS === 'web')
  → supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
  → browser navigates to https://appleid.apple.com or accounts.google.com
  → user authenticates with provider
  → provider redirects to https://{ref}.supabase.co/auth/v1/callback
  → Supabase processes the code, redirects back to our origin with tokens
    in the URL hash
  → supabase-js detects session in URL (detectSessionInUrl: true on web),
    sets session, fires onAuthStateChange
  → app navigates to /(tabs)
```

**Email + password (any platform):**

```
User submits form
  → AuthScreen.handleSignInSubmit
  → authStore.signIn(email, password)
  → supabase.auth.signInWithPassword({ email, password })
  → on success: session set, navigates
  → on failure: errorBanner state set, classifyError() picks friendly message
```

---

## Setup checklist for a new app

Each item is a one-time chore. If you copy this doc into a new repo, work
through the boxes top-to-bottom; nothing here can be skipped without losing
something.

### 1. Apple Developer Console (one-time per app)

- [ ] **App ID** for the iOS bundle (`com.yourorg.yourapp`) with "Sign in with
      Apple" capability enabled
- [ ] **Service ID** for the web flow (`com.yourorg.yourapp.web`) — separate
      from the App ID. In the Service ID's "Web Authentication Configuration":
  - Primary App ID: the iOS App ID above
  - Domains and Subdomains: your web app domain (e.g. `app.yourorg.com`)
  - Return URLs: `https://{supabase-ref}.supabase.co/auth/v1/callback`
- [ ] **Sign in with Apple Key** (.p8 file) generated under "Keys". Download
      the `.p8` immediately — Apple lets you download it ONLY once
- [ ] Note these for the JWT-generation step:
  - **Team ID** (top right of Apple Developer Console, e.g. `L3528THKT5`)
  - **Key ID** (10 chars, e.g. `HF6LMX4TL8`)
  - **Service ID** (e.g. `com.yourorg.yourapp.web`)

### 2. Generate Apple client_secret JWT

Supabase's "Secret Key (for OAuth)" field expects a **pre-signed JWT**, not the
raw `.p8`. Use this Node script (no npm deps, runs on Node 16+):

```js
// generate-apple-jwt.js
const crypto = require('crypto');

const TEAM_ID = 'XXXXXXXXXX';
const KEY_ID = 'YYYYYYYYYY';
const SERVICE_ID = 'com.yourorg.yourapp.web';
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
... contents of AuthKey_<KEY_ID>.p8 ...
-----END PRIVATE KEY-----`;

const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // ~6 months — Apple's hard cap

const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: SERVICE_ID,
};

const b64url = (s) => Buffer.from(s).toString('base64url');
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const sig = crypto.sign('SHA256', Buffer.from(signingInput), {
  key: PRIVATE_KEY,
  dsaEncoding: 'ieee-p1363', // raw r||s, not DER
});
console.log(`${signingInput}.${sig.toString('base64url')}`);
```

Run: `node generate-apple-jwt.js` → copy the output JWT.

⚠️ **The JWT expires every 6 months** (Apple cap). Set a calendar reminder for
~5 weeks before expiry. If it expires, web Apple Sign In silently breaks.
Future improvement: an Edge Function that auto-rotates the JWT (deferred).

### 3. Google Cloud Console (one-time per app)

You need three OAuth Client IDs under one project:

- [ ] **iOS** Client ID, with iOS bundle ID `com.yourorg.yourapp`
- [ ] **Android** Client ID, with the Android package name + SHA-1 fingerprint
      from your release keystore
- [ ] **Web** Client ID, with Authorized Redirect URIs:
  - `https://{supabase-ref}.supabase.co/auth/v1/callback`

Note: keep all three Client IDs. They go into Supabase + the app's
`app.json`.

### 4. Supabase project config

- [ ] **Authentication → URL Configuration → Site URL** set to your primary web
      origin (e.g. `https://app.yourorg.com`)
- [ ] **Redirect URLs** allowlist must include the web app domain with `/**`
      pattern: `https://app.yourorg.com/**`. OAuth `redirectTo` won't work
      otherwise — Supabase silently falls back to Site URL
- [ ] **Authentication → Providers → Apple**:
  - Enable
  - Client IDs (comma-separated): `com.yourorg.yourapp.web,com.yourorg.yourapp`
    — ⚠️ **Service ID first**. Supabase uses the first ID as the OAuth
    `client_id` for web flow; if you put the iOS App ID first, Apple rejects
    with `invalid_request: Invalid client id or web redirect url` (we hit
    this — debugging it cost an hour)
  - Secret Key: paste the JWT from step 2
- [ ] **Authentication → Providers → Google**:
  - Enable
  - Client IDs (comma-separated): `<web>,<ios>,<android>` — **web first** (same
    rule as Apple — first ID is used for OAuth init on the web flow)
  - Secret: the Google web client secret from Cloud Console
  - **`external_google_skip_nonce_check: true`** ← critical, see "Known
    issues §3"
- [ ] **Authentication → Email Templates / Notifications**:
  - `mailer_notifications_identity_linked_enabled: true`
  - `mailer_notifications_identity_unlinked_enabled: true`
  - Templates already exist; flag just turns delivery on. Users get an email
    when a new identity is linked to their account — defends against silent
    account takeover via OAuth linking

These can be set via the Supabase Dashboard UI OR via the Management API
(`PATCH https://api.supabase.com/v1/projects/{ref}/config/auth`).

### 5. App config (`app.json` / `app.config.ts`)

```jsonc
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.yourorg.yourapp",
      "usesAppleSignIn": true
    },
    "plugins": [
      "expo-apple-authentication",
      [
        "@react-native-google-signin/google-signin",
        {
          // Reverse of the iOS Client ID, prefixed with "com.googleusercontent.apps."
          // Example: 272025...rk3rrqo... → com.googleusercontent.apps.272025...rk3rrqo...
          "iosUrlScheme": "com.googleusercontent.apps.<IOS_CLIENT_ID_PREFIX>"
        }
      ]
    ],
    "extra": {
      "EXPO_PUBLIC_SUPABASE_URL": "https://{ref}.supabase.co",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY": "...",
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<web client id>.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "<ios client id>.apps.googleusercontent.com"
    }
  }
}
```

### 6. Web hosting

- [ ] Vercel (or equivalent) deployed from the same repo, pointing at the
      same Supabase project
- [ ] Custom domain (`app.yourorg.com`) with SSL — Apple's Service ID requires
      a real verified domain, not a `vercel.app` subdomain
- [ ] `vercel.json` at repo root:
  ```json
  {
    "buildCommand": "npx expo export -p web",
    "outputDirectory": "dist",
    "cleanUrls": true,
    "framework": null,
    "rewrites": [{ "source": "/:path*", "destination": "/" }]
  }
  ```

### 7. Domain verification

- Apple **does not** require domain verification (it used to, but they
  dropped it ~2024)
- Google **may** require domain verification under certain quota tiers — if
  you hit it, follow the Google Cloud Console verification flow (DNS TXT
  record)

---

## Code patterns (copy/paste ready)

### `src/lib/supabase.ts` — client setup

```ts
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  || Constants.expoConfig?.extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web: needs to be true so post-OAuth-redirect URL hash gets parsed
    // and the session is set. Mobile: native flows hand us the ID token
    // directly, no URL fragment to parse.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
```

### `src/lib/oauth.ts` — provider dispatch

The key pattern: each provider has a top-level `signInWithX()` that
**dispatches** to either a web variant or a native variant by `Platform.OS`.

```ts
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

// SHARED HELPER — used by Apple native flow
async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX }
  );
  return { raw, hashed };
}

// ───── GOOGLE ─────

async function signInWithGoogleWeb() {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  return { success: !error, error: error?.message };
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') return signInWithGoogleWeb();
  const response: any = await GoogleSignin.signIn();
  if (response?.type === 'cancelled') return { success: false, cancelled: true };
  const idToken = response?.data?.idToken ?? response?.idToken;
  // No nonce passed — Supabase's external_google_skip_nonce_check handles iOS
  // (see Known issues §3)
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  return { success: !error, error: error?.message };
}

// ───── APPLE ─────

async function signInWithAppleWeb() {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });
  return { success: !error, error: error?.message };
}

export async function signInWithApple() {
  if (Platform.OS === 'web') return signInWithAppleWeb();
  if (Platform.OS !== 'ios') return { success: false, error: 'Apple sign-in is iOS-only on native' };
  const { raw, hashed } = await generateNonce();
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashed,
  });
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken!,
    nonce: raw,
  });
  return { success: !error, error: error?.message };
}
```

### `src/components/auth/SocialButtons.tsx` — platform-conditional buttons

```tsx
{/* iOS uses Apple's official native button (App Store policy prefers it) */}
{Platform.OS === 'ios' && (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={12}
    style={{ height: 50 }}
    onPress={handleApple}
  />
)}

{/* Web uses a custom-styled button matching Apple HIG (black/white) */}
{Platform.OS === 'web' && (
  <TouchableOpacity onPress={handleApple} style={styles.appleButtonWeb}>
    <AppleLogo size={20} />
    <Text style={styles.appleButtonWebText}>Continue with Apple</Text>
  </TouchableOpacity>
)}
```

### `src/lib/confirm.ts` — cross-platform confirm dialog

`Alert.alert` with multiple buttons is a no-op on web (react-native-web only
polyfills single-button alerts). Use this helper anywhere you'd otherwise
write `Alert.alert('Title', 'msg', [{Cancel}, {OK}])`:

```ts
import { Alert, Platform } from 'react-native';

export async function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmText = 'OK', cancelText = 'Cancel', destructive } = opts;
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' &&
      window.confirm(message ? `${title}\n\n${message}` : title);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
```

### `app/+html.tsx` — desktop canvas cap (web responsiveness)

Without this, every screen stretches edge-to-edge on a 1920px monitor:

```tsx
import { ScrollViewStyleReset } from 'expo-router/html';

const APP_MAX_WIDTH_PX = 640;

export default function Root({ children }) {
  const css = `
    body { background: #ECE9E0; }
    @media (min-width: ${APP_MAX_WIDTH_PX + 1}px) {
      #root {
        max-width: ${APP_MAX_WIDTH_PX}px !important;
        margin: 0 auto !important;
        box-shadow: 0 6px 32px rgba(0,0,0,0.08);
        background: #FFFFFF;
      }
    }
  `;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## Known issues + workarounds

These are the bugs we hit during the Timekeeper buildout. **Read these before
you debug the same things again.**

### §1 — Supabase Storage public buckets force `text/plain` on HTML

Symptom: you upload an `.html` file to a public bucket, set
`contentType: 'text/html'`, but the browser shows raw HTML source instead of
rendering. Response headers include
`Content-Type: text/plain; X-Content-Type-Options: nosniff;
Content-Security-Policy: default-src 'none'; sandbox`.

Cause: Supabase's edge intentionally forces this on user-uploaded HTML for
XSS defense on `supabase.co` subdomains.

**Don't** try to host responsive web pages out of Supabase Storage. Either:
- Render the HTML through an Edge Function (sets its own Content-Type), or
- Host on a normal web target (Vercel, Cloudflare Pages, etc.)

We hit this trying to host a per-invoice "share link" responsive viewer.
We removed the feature in build 50 because the workaround (custom domain +
edge function proxy) added too much infra for the payoff.

### §2 — Apple Service ID's order in Supabase Client IDs matters

Supabase `external_apple_client_id` is a comma-separated list. Two roles:
- **OAuth init (web flow):** Supabase uses the **FIRST** ID as `client_id`
  when redirecting the browser to `appleid.apple.com`
- **ID token validation (native flow):** Supabase checks the token's `aud`
  claim against **any** ID in the list

Put the **Service ID** first, the iOS App ID second:

```
com.yourorg.yourapp.web,com.yourorg.yourapp
```

If you reverse it, web Apple Sign In fails with
`invalid_request: Invalid client id or web redirect url` because the iOS
App ID isn't configured for web auth in Apple Developer.

iOS native flow keeps working either way — both IDs are in the validation
allowlist, order doesn't affect that.

### §3 — Google iOS auto-injects a nonce that we can't access

`@react-native-google-signin v16+` on iOS uses GIDSignIn iOS SDK 8.x, which
auto-injects a nonce into every idToken for replay protection. The lib
**doesn't expose** that nonce to JS. So `signInWithIdToken` would always
fail with:

> Passed nonce and nonce in id_token should either both exist or not.

Three options to fix; we picked #3:
1. Migrate to `GoogleOneTapSignIn` (deeper API, exposes nonce) — ~3-4h refactor
2. Patch the lib's iOS native code to surface the nonce — fragile, breaks on update
3. Set `external_google_skip_nonce_check: true` in Supabase config — 5 sec

Trade-off of #3: an attacker who steals an idToken could replay it briefly
until expiry (~1h). Token's signature, audience, expiry are still verified.
Fine for consumer/B2B apps; not for high-security (banking).

Android doesn't have this issue — its native module doesn't add a nonce.

### §4 — Forgot password is phone-OTP-based (and limited)

The current `resetPasswordWithPhone(phone)` calls
`supabase.auth.signInWithOtp({ phone })`. Two problems:

- **OAuth-only users with no phone** can't use it at all
- **Wrong phone** silently creates a NEW phone-only account instead of
  resetting the existing email account

We need a proper email-based password reset (`supabase.auth.resetPasswordForEmail`)
in the next iteration. See "Backlog" below.

### §5 — `Alert.alert` with multiple buttons is a no-op on web

`react-native-web` polyfills single-button `Alert.alert` (falls back to
`window.alert`) but silently drops the buttons array. If your handler relies
on the destructive callback, it never fires and the user sees only the hover
state on the trigger button — looks like the button is broken.

Fix: use the `confirmAsync` helper above. We hit this on the Sign Out and
Delete Account buttons in Settings.

### §6 — Supabase OAuth `redirectTo` requires allowlist match

If `redirectTo` doesn't match an entry in the project's "Redirect URLs"
allowlist, Supabase silently falls back to Site URL (or worse, a default
that points elsewhere). User completes the OAuth flow but lands on the
wrong domain.

Make sure the web app's domain is in the allowlist with `/**` pattern:
`https://app.yourorg.com/**`

### §7 — Apple's web JWT expires every 6 months

Apple caps the `exp` claim on the client_secret JWT at ~6 months. If you
forget to regenerate, **web Apple Sign In silently breaks** (mobile keeps
working — it uses native flow with no JWT).

Set a calendar reminder for ~5 weeks before expiry to regenerate. Future
improvement: an Edge Function that auto-rotates the JWT on a cron schedule.

### §8 — Identity linking is automatic if email is verified

Default Supabase config has `security_manual_linking_enabled: false`. When
an OAuth provider returns a verified email matching an existing account,
Supabase auto-links them — adds a row to `auth.identities`, doesn't create a
new user, doesn't touch the existing password.

Apple and Google **always** return verified emails, so linking always
triggers for those.

This is what you want for your apps (the user expects "I logged in with my
Google → it's the same account as my password account"). But you should
**enable the linking notification email** so the user is told when a new
identity links — that's the only defense if their OAuth provider is
compromised. We have it enabled (see §4 of setup checklist).

---

## Backlog — fix in next app

These are the things we deliberately deferred in Timekeeper. When you start
the next app or extract this into a shared library, do these properly:

1. **Email-based password reset** — replace the phone-OTP-only flow with
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/set-password' })`.
   Works for OAuth-only users (because email is already verified). Phone OTP
   can stay as a secondary option.

2. **Identifier-first UX** — refactor AuthScreen into a 2-step flow: user
   types email → app calls a `get_auth_methods(email)` RPC → step 2 shows
   only the methods that actually work for that email (password field if
   they have one, OAuth buttons highlighted for what they signed up with,
   "create account" if email is new). Reduces "I can't sign in" support
   tickets significantly.

3. **Custom Apple JWT rotation** — Edge Function that runs monthly, regenerates
   the Apple client_secret JWT from a stored `.p8` (pulled from Supabase Vault
   or a Secret Manager), and PATCHes the project's `external_apple_secret`
   via the Management API. Set + forget.

4. **Multi-app shared auth** — see "Monorepo / shared auth" below.

5. **Better banner copy** — extend `classifyError` mapping. Currently
   "wrong-credentials" hints at OAuth + signup but it's still generic. With
   the identifier-first refactor (#2), this becomes mostly unnecessary.

---

## Monorepo / shared auth (next-app considerations)

In the OnSite Club ecosystem there's an `auth` app inside the monorepo that
should consume the same patterns. Layout we recommend:

```
packages/
  shared-auth/                ← extract here
    src/
      oauth.ts                ← provider dispatch (the file from this app)
      supabase.ts             ← supabase client factory (takes URL+key as args)
      confirm.ts              ← cross-platform confirm
      types.ts                ← OAuthResult, ConfirmOptions, etc.
    package.json
    tsconfig.json

apps/
  timekeeper/
    src/components/auth/      ← UI (AuthScreen) — keeps app-specific styling
    app/(auth)/login.tsx      ← thin wrapper
  calculator/
    ...                       ← imports from packages/shared-auth, has its own UI
  shop/
    ...                       ← same
```

### What goes shared vs per-app

**Shared (in `packages/shared-auth`):**
- All of `oauth.ts` — provider dispatch is identical across apps
- `confirm.ts`
- `supabase.ts` factory
- Type definitions

**Per-app (NOT shared):**
- `AuthScreen.tsx` UI — each app has its own branding, copy, layout
- `app/(auth)/*` route wrappers
- `app/+html.tsx` — each app may want different desktop max-width, colors
- `app.json` config — each app has its own bundle ID, OAuth client IDs,
  URL schemes
- Forgot password flow — may differ per app

### Apple / Google config sharing

The OnSite Club Supabase project already has multiple Apple Service IDs
and Google Client IDs in a single comma-separated allowlist (one per app).
**Each new app needs:**
- Its own Apple Service ID (e.g. `com.onsiteclub.calculator.web`) — added
  to the existing Supabase `external_apple_client_id` list (web variant
  first, iOS App ID second, **per app**)
- Its own Google web/iOS/Android client IDs in the project's
  `external_google_client_id` list

The Apple JWT secret is **shared** across apps — the JWT's `sub` claim only
locks it to ONE Service ID. To support multiple Service IDs in one Supabase
project, you need ONE JWT per Service ID, comma-separated in the secret
field. Or: use Supabase's `additional_client_ids` field if available in
your project version.

### Per-app Supabase setup checklist (after the first app)

For each new app added to the monorepo:

- [ ] Create new Apple App ID + Service ID in Apple Developer (steps 1-2 above)
- [ ] Generate new Apple JWT (use the same `.p8` if it covers the app's
      Primary App ID via grouping)
- [ ] Create new Google Client IDs in Google Cloud Console (web + iOS + Android)
- [ ] Append all client IDs to the Supabase project's existing comma-separated
      `external_apple_client_id` and `external_google_client_id` fields
- [ ] Add the new app's web domain to the Supabase Redirect URLs allowlist
      with `/**` pattern
- [ ] Verify the iOS/Android bundle IDs in app.json match what's registered

---

## Operational notes

### Monitoring

Auth failures are logged via:
- `logger.error('auth', ...)` — local in-memory log buffer (visible at `/logs`
  route once authenticated)
- `captureMessage('Auth: ...', { level: 'warning', tags: { security: 'auth',
  provider } })` — sent to Sentry (`@sentry/react-native/expo`)

Watch the Sentry dashboard for spikes in OAuth failures. The `provider` tag
lets you filter by provider.

### Rotation reminders

| Item | Cadence | What happens if you forget |
|---|---|---|
| Apple client_secret JWT | every ~5 months | Web Apple Sign In silently breaks |
| Google web client secret | only if compromised | n/a — long-lived by default |
| Supabase service-role key | only if compromised | n/a |
| .p8 backup | once at creation | Can't regenerate JWT, must create new key in Apple Developer |

### Database queries useful for debugging

Find a user's identities (which providers they used to sign up):

```sql
select u.email, i.provider, i.created_at, i.last_sign_in_at
from auth.users u
left join auth.identities i on i.user_id = u.id
where u.email = 'user@example.com'
order by i.created_at;
```

Find users who signed in but never finished onboarding (no
`onboarding_completed_at`):

```sql
select email, last_sign_in_at, raw_app_meta_data->>'provider' as provider
from auth.users u
join core_profiles c on c.id = u.id
where c.onboarding_completed_at is null
order by last_sign_in_at desc;
```

Provider distribution across the whole project:

```sql
select raw_app_meta_data->>'provider' as provider, count(*)
from auth.users
group by 1 order by 2 desc;
```

---

## Quick reference: what file does what

| File | Purpose |
|---|---|
| `app.json` | OAuth client IDs, Apple URL scheme, plugin config |
| `app/+html.tsx` | Desktop max-width cap for web |
| `app/(auth)/login.tsx` | Route wrapper, renders `<AuthScreen />` |
| `src/components/auth/AuthScreen.tsx` | Main auth UI, error banner, step state machine |
| `src/components/auth/SocialButtons.tsx` | Apple + Google buttons, platform-conditional |
| `src/lib/supabase.ts` | Supabase client (detectSessionInUrl true on web) |
| `src/lib/oauth.ts` | Provider dispatch (web vs native), nonce helper |
| `src/lib/confirm.ts` | Cross-platform confirm helper |
| `src/stores/authStore.ts` | Zustand store: user, session, signIn/signOut, OAuth wrappers |
| `docs/AUTH_REFERENCE.md` | This document |

---

## Changelog

- **2026-04-25** — Initial reference. Captured: Apple+Google native flows
  (iOS+Android), Apple+Google web flows, identity linking notifications,
  cross-platform confirm helper, web max-width canvas. Documented all
  workarounds (Supabase HTML serving, iOS Google nonce, Apple Service ID
  ordering). Listed deferred work (email reset, identifier-first UX,
  shared monorepo auth library).
