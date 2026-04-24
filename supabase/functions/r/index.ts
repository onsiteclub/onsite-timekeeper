/**
 * Edge Function: r (invoice short-link viewer + pdf redirect)
 *
 *   GET /functions/v1/r/<slug>      → serves the hosted invoice HTML
 *                                     directly (200 text/html).
 *   GET /functions/v1/r/<slug>/pdf  → 302 redirect to the Storage PDF.
 *
 * Why we serve HTML from the DB instead of linking to Supabase Storage:
 * Supabase Storage forces `text/plain` + sandbox CSP on public HTML
 * files (defense against XSS on supabase.co), so the hosted invoice
 * viewer wouldn't render. Storing the HTML in `invoice_short_links`
 * and returning it from here side-steps that — the edge function's
 * own domain doesn't have the CSP-sandbox middleware.
 *
 * The function uses the service role key so it can read
 * `invoice_short_links` rows regardless of RLS (the slug is the
 * opaque auth token — same threat model as Stripe hosted invoices).
 */

// @ts-expect-error — Deno runtime provides this
import { createClient } from 'jsr:@supabase/supabase-js@2';

// @ts-expect-error — Deno global
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error — Deno global
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// @ts-expect-error — Deno global
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const rIdx = parts.indexOf('r');
    const slug = rIdx >= 0 ? parts[rIdx + 1] : undefined;
    const variant = rIdx >= 0 ? parts[rIdx + 2] : undefined;

    if (!slug || slug.length > 64) {
      return new Response('Not found', { status: 404 });
    }
    if (variant && variant !== 'pdf') {
      return new Response('Not found', { status: 404 });
    }

    const { data, error } = await supabase
      .from('invoice_short_links')
      .select('html, pdf_url')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) {
      return new Response('Not found', { status: 404 });
    }

    // /r/<slug>/pdf → hand recipient the PDF file directly
    if (variant === 'pdf') {
      if (!data.pdf_url) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(null, {
        status: 302,
        headers: { Location: data.pdf_url, 'Cache-Control': 'public, max-age=300' },
      });
    }

    // /r/<slug> → render the stored HTML with the correct content-type
    // and a permissive CSP (we own this origin, not Supabase Storage).
    if (!data.html) {
      // Legacy row without inline HTML — fall back to redirect if we
      // have an external html URL; otherwise 404.
      return new Response('Not found', { status: 404 });
    }

    return new Response(data.html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Server error', { status: 500 });
  }
});
