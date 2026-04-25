/**
 * Custom HTML shell for the Expo Router web export.
 *
 * Three-tier responsive web canvas:
 *
 *   Mobile  (≤ 640 px):       fills the viewport — phone view, default RN
 *                             flex layout
 *   Tablet  (641 – 1280 px):  fills the viewport — uses iPad real estate
 *                             (iPad portrait 820 px and most iPads in
 *                             landscape up to 1180 px both land here)
 *   Desktop (> 1280 px):      caps the canvas at 640 px, centers, soft
 *                             shadow on a gray page background — keeps
 *                             the phone-app feel on a 1920 px monitor
 *
 * The 1281 px desktop breakpoint covers all common iPads (iPad Pro 12.9"
 * landscape at 1366 still falls into desktop, which is fine — it's
 * basically a small laptop). Bump higher if a future device should be
 * treated as tablet.
 *
 * This file runs at static-export time — Expo bundles the resulting
 * HTML shell into dist/, and Vercel serves it as the entry point.
 *
 * NOTE: Don't import @react-native or other client modules here. This
 * runs in a Node SSR context.
 */

import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const DESKTOP_BREAKPOINT_PX = 1280;
const DESKTOP_CANVAS_WIDTH_PX = 640;

const responsiveCanvasCss = `
  /* Page background — only visible on desktop where #root is capped.
     Mobile + tablet fill the viewport so this gets covered. */
  body {
    background: #ECE9E0;
  }

  /* Desktop only: cap canvas at phone-app width, center, soft shadow. */
  @media (min-width: ${DESKTOP_BREAKPOINT_PX + 1}px) {
    #root {
      max-width: ${DESKTOP_CANVAS_WIDTH_PX}px !important;
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
        <style dangerouslySetInnerHTML={{ __html: responsiveCanvasCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
