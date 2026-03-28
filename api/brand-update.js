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
            logo: { type: "string" }
          },
          required: ["id", "name_en", "name_ar", "logo"]
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
              sort_order: { type: "number" },
              aliases: {
                type: "array",
                items: { type: "string" }
              },
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
                    checks: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["code", "title", "description", "cause", "checks"]
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
                    image: { type: "string" }
                  },
                  required: ["name", "serial", "notes", "verify_by_sticker", "image"]
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
                    verify_by_sticker: { type: "boolean" }
                  },
                  required: ["part_name", "part_number", "notes", "verify_by_sticker"]
                }
              },
              documents: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" }
                  },
                  required: ["title", "url"]
                }
              },
              images: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string" },
                    url: { type: "string" }
                  },
                  required: ["title", "url"]
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
            required: [
              "id",
              "model",
              "display_name",
              "category",
              "sort_order",
              "aliases",
              "service_identity",
              "faults",
              "boards",
              "parts",
              "documents",
              "images",
              "data_confidence"
            ]
          }
        }
      },
      required: ["brand", "models"]
    };

    const developerMessage = `
You are building a washing machine technical database.

Rules:
- Return ONLY structured JSON matching the schema.
- Preserve the same JSON structure exactly.
- Expand and improve the selected brand deeply.
- Avoid duplicate models.
- Keep arrays present even if empty.
- For uncertain board or part numbers, keep a safe note and set verify_by_sticker=true.
- Prefer practical service wording for faults and checks.
- Include older and newer models when relevant.
- Keep model IDs lowercase-with-dashes.
- Make display_name suitable for UI display.
- Do not output markdown.
`;

    const userMessage = `
Brand to update: ${brand}

Instruction:
${instruction || `Expand ${brand} with older and newer models, fuller fault families, cleaner aliases, better board mapping notes, and more complete parts while preserving the same JSON structure and avoiding duplicates.`}

Current JSON:
${JSON.stringify(currentData || {}, null, 2)}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [{ type: "input_text", text: developerMessage }]
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userMessage }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "washer_brand_doc",
            schema,
            strict: true
          }
        }
      })
    });

    const raw = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: raw?.error?.message || "OpenAI request failed",
        raw
      });
    }

    let parsed = null;

    if (raw.output_text) {
      parsed = JSON.parse(raw.output_text);
    } else {
      const textBlock = raw.output
        ?.flatMap(item => item.content || [])
        ?.find(c => c.type === "output_text");

      if (!textBlock?.text) {
        return res.status(500).json({
          error: "No structured JSON returned from model",
          raw
        });
      }

      parsed = JSON.parse(textBlock.text);
    }

    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Unexpected server error"
    });
  }
}
