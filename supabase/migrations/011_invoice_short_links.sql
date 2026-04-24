-- ============================================
-- Migration 011: Invoice Short Links
-- ============================================
-- Backs a URL shortener so the "Share invoice" link sent over
-- WhatsApp/SMS/email is readable. The edge function `r` reads this
-- table by slug and 302-redirects to the full Supabase Storage URL.
--
-- Threat model: same as the invoices bucket — the slug is an opaque
-- token, not guessable. No public listing; edge function uses service
-- role to look up by exact slug.

create table if not exists public.invoice_short_links (
  invoice_id uuid primary key,
  slug text unique not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Inline HTML of the hosted invoice viewer. Served by the `r` edge
  -- function with Content-Type: text/html. Kept in the DB (not Storage)
  -- because Supabase public-bucket HTML is forced to text/plain + CSP
  -- sandbox, which breaks rendering.
  html text,
  -- Legacy column kept for rows created before html was introduced.
  -- New rows leave it null and rely on html + pdf_url instead.
  html_url text,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invoice_short_links_slug
  on public.invoice_short_links(slug);

alter table public.invoice_short_links enable row level security;

-- Authenticated user can insert/update/delete rows for their own invoices.
drop policy if exists "Users manage own short links" on public.invoice_short_links;
create policy "Users manage own short links"
  on public.invoice_short_links for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Intentionally NO public SELECT. The edge function uses the service
-- role key so it bypasses RLS; direct public reads aren't allowed.
