export default async function handler(req, res) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const TABLE = process.env.SUPABASE_TABLE || "washer_brand_docs";

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: "Missing Supabase env vars" });
    }

    if (req.method === "POST") {
      const { brand, data } = req.body || {};
      if (!brand) return res.status(400).json({ error: "Missing brand" });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=brand`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify({ brand, data })
      });

      const result = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: result?.message || "Supabase save failed", raw: result });
      return res.status(200).json(result);
    }

    if (req.method === "GET") {
      const { brand } = req.query;
      if (!brand) return res.status(400).json({ error: "Missing brand" });
      const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?brand=eq.${encodeURIComponent(brand)}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data?.message || "Supabase load failed", raw: data });
      return res.status(200).json(data[0] || null);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
