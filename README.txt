iCOOL Washer Pro - complete package

Default login:
- Username: admin
- Password: 1234

Files:
- index.html -> technician browsing app
- admin.html -> AI / update / cloud / JSON page
- api/brand-update.js -> single-brand AI update
- api/brand-update-all.js -> all-brands AI update
- api/cloud-brand.js -> Supabase save/load
- data/brands.json + data/brands/*.json -> all brands

Vercel environment variables:
- OPENAI_API_KEY
- OPENAI_MODEL (optional, default gpt-4.1-mini)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_TABLE (optional, default washer_brand_docs)

Supabase table SQL:
create table washer_brand_docs (
  id uuid primary key default gen_random_uuid(),
  brand text unique,
  data jsonb,
  updated_at timestamp default now()
);

Notes:
- Add more brands from admin page, then Save Brand List.
- Save Override stores current brand JSON locally in the browser.
- Cloud Save stores the selected brand JSON in Supabase.
- AI update works brand by brand and is better than updating all at once.
