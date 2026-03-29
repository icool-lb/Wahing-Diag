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
          required: ["id", "name_en", "name_ar", "logo", "color"]
        },
        source_registry: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              ref_id: { type: "string" },
              type: { type: "string" },
              title: { type: "string" },
              url: { type: "string" },
              verified: { type: "boolean" },
              notes: { type: "string" }
            },
            required: ["ref_id", "type", "title", "url", "verified", "notes"]
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
              capacity_kg: { type: "string" },
              generation: { type: "string" },
              sort_order: { type: "number" },
              aliases: {
                type: "array",
                items: { type: "string" }
              },
              service_notes: { type: "string" },
              years: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: { type: "number" },
                  to: { type: "number" }
                },
                required: ["from", "to"]
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
                    },
                    remedy: {
                      type: "array",
                      items: { type: "string" }
                    },
                    source_ref: { type: "string" }
                  },
                  required: [
                    "code",
                    "title",
                    "description",
                    "cause",
                    "checks",
                    "remedy",
                    "source_ref"
                  ]
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
                    source_ref: { type: "string" }
                  },
                  required: [
                    "name",
                    "serial",
                    "notes",
                    "verify_by_sticker",
                    "image",
                    "source_ref"
                  ]
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
                    source_ref: { type: "string" }
                  },
                  required: [
                    "part_name",
                    "part_number",
                    "notes",
                    "verify_by_sticker",
                    "source_ref"
                  ]
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
                    notes: { type: "string" },
                    source_ref: { type: "string" }
                  },
                  required: ["title", "url", "notes", "source_ref"]
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
                  parts: { type: "string" },
                  manuals: { type: "string" }
                },
                required: ["faults", "boards", "parts", "manuals"]
              }
            },
            required: [
              "id",
              "model",
              "display_name",
              "category",
              "series",
              "capacity_kg",
              "generation",
              "sort_order",
              "aliases",
              "service_notes",
              "years",
              "service_identity",
              "faults",
              "boards",
              "parts",
              "documents",
              "wiring",
              "images",
              "data_confidence"
            ]
          }
        }
      },
      required: ["brand", "source_registry", "models"]
    };

    const developerMessage = `
You are building a VERIFIED washing machine technical database.

Strict rules:
- Return ONLY valid structured JSON matching the schema.
- Do NOT output markdown.
- Do NOT invent data.
- Prefer official manuals, official support pages, and trusted manual repositories.
- Every fault, board, part, wiring entry, document, and image must be tied to a source_ref.
- source_registry must contain every referenced source_ref exactly once.
- If exact board or part number is uncertain, keep serial or part_number as "unknown" and set verify_by_sticker=true where applicable.
- Prefer fewer verified entries over generic or guessed entries.
- Keep the existing structure stable.
- Preserve useful existing verified data.
- Avoid duplicates.
- Keep arrays present even when empty.
- Keep model ids lowercase-with-dashes.
- brand.color must always be supplied as a valid hex string like "#1f4fa3".
- years.from and years.to must be numbers.
- remedy must contain practical technician actions, not generic advice.
`;

    const userMessage = `
Brand to update: ${brand}

Instruction:
${
  instruction ||
  "Expand this brand with more verified models, full error codes, remedy steps, parts, boards, source refs, and manual links."
}

Current JSON:
${JSON.stringify(currentData || {}, null, 2)}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
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
        ?.flatMap((item) => item.content || [])
        ?.find((c) => c.type === "output_text");

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
