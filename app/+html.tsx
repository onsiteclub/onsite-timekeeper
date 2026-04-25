/**
 * Custom HTML shell for the Expo Router web export.
 *
 * Constrains the app canvas to a phone-like width on desktop browsers
 * so the timekeeper UI doesn't stretch edge-to-edge on a 1920px monitor.
 * Mobile (≤ 640px) is unchanged: the app fills the viewport as before.
 *
 * This file runs at static-export time — Expo bundles the resulting
 * HTML shell into dist/, and Vercel serves it as the entry point.
 *
 * NOTE: Don't import @react-native or other client modules here. This
 * runs in a Node SSR context.
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const APP_MAX_WIDTH_PX = 640;

const desktopCanvasCss = `
  body {
    background: #ECE9E0;
  }
  @media (min-width: ${APP_MAX_WIDTH_PX + 1}px) {
    #root {
      max-width: ${APP_MAX_WIDTH_PX}px !important;
      margin: 0 auto !important;
      box-shadow: 0 6px 32px rgba(0, 0, 0, 0.08);
      background: #FFFFFF;
    }
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: desktopCanvasCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
