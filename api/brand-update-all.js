async function callOpenAI(input, schemaName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing on the server.');
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      store: false,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: schemaName,
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['results'],
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  required: ['brandId', 'brandDoc'],
                  properties: {
                    brandId: { type: 'string' },
                    brandDoc: {
                      type: 'object',
                      additionalProperties: true,
                      required: ['brand', 'models'],
                      properties: {
                        brand: { type: 'object', additionalProperties: true },
                        models: { type: 'array', items: { type: 'object', additionalProperties: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'OpenAI request failed.');
  const outputText = data.output?.flatMap(item => item.content || []).find(c => c.type === 'output_text')?.text || data.output_text;
  if (!outputText) throw new Error('Empty model response.');
  return JSON.parse(outputText);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { brands, instruction } = req.body || {};
    if (!Array.isArray(brands) || !brands.length || !instruction) {
      return res.status(400).json({ error: 'brands[] and instruction are required.' });
    }

    const compactBrands = brands.map(x => ({ brandId: x.brandId, currentDoc: x.currentDoc }));
    const input = [
      {
        role: 'system',
        content: 'You update multiple washing machine brand JSON documents in one response. Preserve each schema. Expand carefully, avoid duplicates, and keep uncertainty notes instead of false precision for board and part mappings.'
      },
      {
        role: 'user',
        content: `Instruction for all brands: ${instruction}\n\nCurrent brand docs:\n${JSON.stringify(compactBrands)}`
      }
    ];

    const result = await callOpenAI(input, 'washer_multi_brand_docs');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
};
