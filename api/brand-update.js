async function callOpenAI(input, schemaName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing on the server.');

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const schema = {
    type: 'object',
    additionalProperties: true,
    required: ['brand', 'models'],
    properties: {
      brand: { type: 'object', additionalProperties: true },
      models: { type: 'array', items: { type: 'object', additionalProperties: true } }
    }
  };

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
          schema
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
    const { brandId, instruction, currentDoc } = req.body || {};
    if (!brandId || !instruction || !currentDoc) {
      return res.status(400).json({ error: 'brandId, instruction, and currentDoc are required.' });
    }

    const input = [
      {
        role: 'system',
        content: 'You update one washing machine brand JSON document. Keep the same schema. Preserve existing data unless instruction requests changes. Expand models, boards, parts, faults, documents, and service_identity cautiously. Do not invent certainty; when exact part mapping is unknown, keep notes that verification by full sticker and board revision is required. Avoid duplicate models and merge repeated entries.'
      },
      {
        role: 'user',
        content: `Brand: ${brandId}\nInstruction: ${instruction}\n\nCurrent JSON:\n${currentDoc}`
      }
    ];

    const brandDoc = await callOpenAI(input, 'washer_brand_doc');
    return res.status(200).json({ brandDoc });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Unknown server error.' });
  }
};
