iCOOL Washer Smart Suite

What is included:
- Clean technician app: index.html
- Separate admin / AI page: admin.html
- 12-brand registry with local brand-adding support
- Base data folder with expanded Samsung / LG / Bosch / Vestel, verified-mode Midea, and starter indexed files for Toshiba / Hitachi / Daewoo / Beko / Candy / Hisense / TCL
- Supabase cloud save/load for each brand and for the brand registry
- OpenAI AI-update routes for single brand and all brands

Project structure:
- index.html
- admin.html
- app.js
- admin.js
- styles.css
- /api/brand-update.js
- /api/brand-update-all.js
- /api/cloud-brand.js
- /data/brands.json
- /data/brands/*.json
- /assets/logo/icool.svg
- /assets/brands/*.svg

Vercel environment variables:
- OPENAI_API_KEY
- OPENAI_MODEL (optional, default gpt-4.1-mini)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_TABLE (optional, default washer_brand_docs)

Supabase table:
create table washer_brand_docs (
  id uuid primary key default gen_random_uuid(),
  brand text unique,
  data jsonb,
  updated_at timestamp default now()
);

How adding brands works:
- Open admin.html
- Fill Add Brand form
- Click Add Brand Locally
- This saves a starter brand registry item plus an empty brand JSON as a local override
- Click Save Brand Registry to Cloud to push the updated brand list to Supabase under brand = __brand_registry__
- Then use Cloud Save on the new brand doc if you want it shared across devices

Notes:
- Samsung / LG / Bosch / Vestel came from the earlier expanded seed package available in this workspace.
- Midea was replaced with the deeper verified-mode package available in this workspace.
- The seven added brands are starter indexed brand files ready for in-app expansion. They are not claimed as fully verified service-manual databases yet.
- Board and part ordering should still use appliance sticker and board label verification where exact part numbers are not confirmed.
