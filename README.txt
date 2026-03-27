Washer Catalog V2.4 Pro Plus

Default login:
Username: admin
Password: iCool2026

What is inside:
- 12 brands
- Search by model / error / board / part
- Brand > model > full details
- AI Brand Update panel
- Browser-side per-brand override system
- Export / import JSON per brand

Added brands:
Samsung, LG, Midea, Bosch, Vestel, Toshiba, Hitachi, Daewoo, Beko, Candy, Hisense, TCL

Important note about data:
This package is designed to give you a deep, organized catalog structure across brands.
Boards and parts are expanded a lot, but exact final ordering for many washer revisions still must be matched by:
- full model sticker
- serial label
- PCB revision
- connector layout

How AI Brand Update works:
1) Open AI Brand Update
2) Select a brand
3) Write what you want to add or refine
4) Click Apply AI Update
5) Review the returned JSON
6) Click Save Override

What Save Override does:
- It stores the selected brand JSON in your browser localStorage.
- The app will load that version first next time.
- This means you can keep updating a brand without re-uploading the original bundled files.

Deploying AI update on Vercel:
Add Environment Variables:
- OPENAI_API_KEY = your secret OpenAI API key
- OPENAI_MODEL = optional, default is gpt-4.1-mini

Important:
- Never put OPENAI_API_KEY in client-side JavaScript.
- The key must stay only on the server / Vercel environment variables.

Files:
- data/*.json = bundled datasets
- api/brand-update.js = server route for AI JSON expansion
- app.js = UI + search + import/export + local override logic


V2.5 Smart additions:
- Normalize & De-duplicate per brand before saving
- Update All Brands via /api/brand-update-all.js
- Optional Supabase cloud sync via /api/cloud-brand.js

Vercel environment variables:
- OPENAI_API_KEY
- OPENAI_MODEL (optional, default gpt-4.1-mini)
- SUPABASE_URL (optional, for cloud sync)
- SUPABASE_SERVICE_ROLE_KEY (optional, for cloud sync)
- SUPABASE_TABLE (optional, default washer_brand_docs)

Suggested Supabase table:
create table public.washer_brand_docs (
  brand_id text primary key,
  brand_doc jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger washer_brand_docs_set_updated_at
before update on public.washer_brand_docs
for each row execute function public.set_updated_at();
