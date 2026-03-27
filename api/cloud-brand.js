const TABLE = process.env.SUPABASE_TABLE || 'washer_brand_docs';

function getHeaders() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing on the server.');
  return {
    url,
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates'
    }
  };
}

module.exports = async (req, res) => {
  try {
    const { url, headers } = getHeaders();

    if (req.method === 'GET') {
      const brandId = req.query?.brandId;
      if (!brandId) return res.status(400).json({ error: 'brandId is required.' });
      const fetchRes = await fetch(`${url}/rest/v1/${TABLE}?brand_id=eq.${encodeURIComponent(brandId)}&select=brand_doc,updated_at&limit=1`, {
        method: 'GET',
        headers
      });
      const data = await fetchRes.json();
      if (!fetchRes.ok) return res.status(fetchRes.status).json({ error: data?.message || 'Supabase read failed.' });
      if (!data?.length) return res.status(404).json({ error: 'Brand not found in cloud.' });
      return res.status(200).json({ brandDoc: data[0].brand_doc, updatedAt: data[0].updated_at });
    }

    if (req.method === 'POST') {
      const { brandId, brandDoc } = req.body || {};
      if (!brandId || !brandDoc) return res.status(400).json({ error: 'brandId and brandDoc are required.' });
      const saveRes = await fetch(`${url}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ brand_id: brandId, brand_doc: brandDoc }])
      });
      const data = await saveRes.json();
      if (!saveRes.ok) return res.status(saveRes.status).json({ error: data?.message || 'Supabase save failed.' });
      return res.status(200).json({ ok: true, data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
};
