-- ============================================
-- Migration 010: Invoices Storage Bucket
-- ============================================
-- Hosts the responsive HTML preview + PDF archive for each invoice so the
-- Timekeeper app can share a public link (works uniformly on WhatsApp,
-- SMS, email, etc. and renders well on small screens).
--
-- Path scheme: {user_id}/{invoice_id}.{html|pdf}
--
-- Access model:
--   - authenticated users upload/replace/delete their own prefix only
--   - public read is allowed because the UUID path acts as an opaque token
--     (same pattern Stripe uses for hosted invoice pages)

-- 1. Create the public bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = excluded.public;

-- 2. Authenticated users may upload/update/delete only under their own
--    {auth.uid}/ prefix.
drop policy if exists "Users manage own invoice files" on storage.objects;
create policy "Users manage own invoice files"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'invoices'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'invoices'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Anyone with the link may read files in this bucket. The path is a
--    non-guessable UUID, so exposure is limited to whoever the sender
--    forwarded the link to (same threat model as Stripe hosted invoices).
drop policy if exists "Public can read invoice files" on storage.objects;
create policy "Public can read invoice files"
  on storage.objects for select
  to public
  using (bucket_id = 'invoices');
