/**
 * Edge Function: r (invoice short-link redirector)
 *
 * Requests hit:
 *   https://{project-ref}.supabase.co/functions/v1/r/<slug>
 *
 * The slug maps to a row in `invoice_short_links`. We 302-redirect to the
 * hosted HTML URL stored there. Lookup uses the service role key so RLS
 * (which blocks public SELECT) doesn't get in the way.
 *
 * Known URLs the user might request:
 *   /r/<slug>            → redirect to html_url
 *   /r/<slug>/pdf        → redirect to pdf_url (optional archive link)
 *   /r/<slug>/anything-else → 404
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
    // Path looks like "/r/<slug>" or "/r/<slug>/pdf". Drop leading /r/.
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
      .select('html_url, pdf_url')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) {
      return new Response('Not found', { status: 404 });
    }

    const target = variant === 'pdf' ? (data.pdf_url ?? data.html_url) : data.html_url;
    if (!target) {
      return new Response('Not found', { status: 404 });
    }

    return new Response(null, {
      status: 302,
      headers: { Location: target, 'Cache-Control': 'public, max-age=300' },
    });
  } catch {
    return new Response('Server error', { status: 500 });
  }
});
