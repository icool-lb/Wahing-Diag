export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { brand, instruction, currentData } = req.body || {};

    if (!brand) {
      return res.status(400).json({ error: "Missing brand" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const schema = {
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
          required: ["id", "name_en", "name_ar", "logo"]
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
        models: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              model: { type: "string" },
              display_name: { type: "string" },
              category: { type: "string" },
              series: { type: "string" },
              generation: { type: "string" },
              capacity_kg: { anyOf: [{ type: "string" }, { type: "number" }] },
              sort_order: { type: "number" },
              aliases: { type: "array", items: { type: "string" } },
              service_notes: { type: "string" },
              service_identity: {
                type: "object",
                additionalProperties: false,
                properties: {
                  platform_family: { type: "string" },
                  sticker_required: { type: "boolean" },
                  notes: { type: "string" }
                },
                required: ["platform_family", "sticker_required", "notes"]
              },
              years: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: { type: "number" },
                  to: { type: "number" }
                },
                required: ["from", "to"]
              },
              faults: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    code: { type: "string" },
                    title: { type: "string" },
                    description: { type: "string" },
                    cause: { type: "string" },
                    checks: { type: "array", items: { type: "string" } },
                    repair: { type: "array", items: { type: "string" } },
                    source_ref: { type: "string" },
                    verified: { type: "boolean" },
                    confidence: { type: "string" }
                  },
                  required: ["code", "title", "description", "cause", "checks", "repair", "source_ref", "verified", "confidence"]
                }
              },
              boards: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    serial: { type: "string" },
                    notes: { type: "string" },
                    verify_by_sticker: { type: "boolean" },
                    image: { type: "string" },
                    source_ref: { type: "string" },
                    verified: { type: "boolean" }
                  },
                  required: ["name", "serial", "notes", "verify_by_sticker", "image", "source_ref", "verified"]
                }
              },
              parts: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    part_name: { type: "string" },
                    part_number: { type: "string" },
                    notes: { type: "string" },
                    verify_by_sticker: { type: "boolean" },
                    source_ref: { type: "string" },
                    verified: { type: "boolean" }
                  },
                  required: ["part_name", "part_number", "notes", "verify_by_sticker", "source_ref", "verified"]
                }
              },
              documents: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    type: { type: "string" },
                    source_ref: { type: "string" }
                  },
                  required: ["title", "url", "type", "source_ref"]
                }
              },
              wiring: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    type: { type: "string" },
                    source_ref: { type: "string" }
                  },
                  required: ["title", "url", "type", "source_ref"]
                }
              },
              images: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" },
                    type: { type: "string" },
                    source_ref: { type: "string" }
                  },
                  required: ["title", "url", "type", "source_ref"]
                }
              },
              data_confidence: {
                type: "object",
                additionalProperties: false,
                properties: {
                  faults: { type: "string" },
                  boards: { type: "string" },
                  parts: { type: "string" }
                },
                required: ["faults", "boards", "parts"]
              }
            },
            required: ["id", "model", "display_name", "category", "series", "generation", "capacity_kg", "sort_order", "aliases", "service_notes", "service_identity", "years", "faults", "boards", "parts", "documents", "wiring", "images", "data_confidence"]
          }
        }
      },
      required: ["brand", "updated_at", "coverage_notes", "source_registry", "models"]
    };

    const developerMessage = `You are building a verified washing-machine technical database.

Rules:
- Return ONLY structured JSON matching the schema.
- Preserve the same structure exactly.
- Expand and improve the selected brand deeply.
- Prefer official support pages and trusted service-manual repositories.
- Do not invent part numbers or board numbers. If uncertain, keep safe notes and verify_by_sticker=true.
- Every fault, board, part, document, wiring link, and image should use source_ref when available.
- Prefer fewer verified items over generic filler.
- Include remedy steps in fault.repair where possible.
- Avoid duplicate models.`;

    const userMessage = `Brand to update: ${brand}

Instruction:
${instruction || `Expand ${brand} with more verified models, manuals, faults, boards, parts, and remedy steps while preserving structure.`}

Current JSON:
${JSON.stringify(currentData || {}, null, 2)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "developer", content: [{ type: "input_text", text: developerMessage }] },
          { role: "user", content: [{ type: "input_text", text: userMessage }] }
        ],
        text: { format: { type: "json_schema", name: "washer_brand_doc", schema, strict: true } }
      })
    });

    const raw = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: raw?.error?.message || "OpenAI request failed", raw });
    }

    let parsed = null;
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
