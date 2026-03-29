export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { brands, instruction } = req.body || {};
    if (!Array.isArray(brands) || !brands.length) return res.status(400).json({ error: "Missing brands array" });
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        brands: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              brand: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name_en: { type: "string" },
                  name_ar: { type: "string" },
                  logo: { type: "string" },
                  color: { type: "string" }
                },
                required: ["id", "name_en", "name_ar", "logo", "color"]
              },
              updated_at: { type: "string" },
              coverage_notes: { type: "string" },
              source_registry: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    type: { type: "string" },
                    url: { type: "string" },
                    verified: { type: "boolean" },
                    notes: { type: "string" }
                  },
                  required: ["id", "title", "type", "url", "verified", "notes"]
                }
              },
              models: { type: "array", items: { type: "object", additionalProperties: true } }
            },
            required: ["brand", "updated_at", "coverage_notes", "source_registry", "models"]
          }
        }
      },
      required: ["brands"]
    };

    const developerMessage = `Expand multiple washing-machine brands. Preserve each brand structure. Prefer verified items, manuals, sources, and no duplicates. CRITICAL MERGE RULES: Do not return smaller replacement datasets. Do not remove existing models. Do not omit existing faults, boards, parts, documents, wiring, or images. Focus on additive verified updates suitable for merge.`;
    const userMessage = `Update these brands:\n\n${JSON.stringify(brands, null, 2)}\n\nInstruction:\n${instruction || "Add more verified models to each brand while preserving structure, avoiding duplicates, and returning additive updates only."}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        input: [
          { role: "developer", content: [{ type: "input_text", text: developerMessage }] },
          { role: "user", content: [{ type: "input_text", text: userMessage }] }
        ],
        text: { format: { type: "json_schema", name: "washer_all_brands_doc", schema, strict: true } }
      })
    });
    const raw = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: raw?.error?.message || "OpenAI request failed", raw });
    let parsed;
    if (raw.output_text) parsed = JSON.parse(raw.output_text);
    else {
      const textBlock = raw.output?.flatMap(item => item.content || [])?.find(c => c.type === "output_text");
      if (!textBlock?.text) return res.status(500).json({ error: "No structured JSON returned", raw });
      parsed = JSON.parse(textBlock.text);
    }
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected server error" });
  }
}
