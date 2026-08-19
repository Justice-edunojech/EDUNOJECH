export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: { message: "Method not allowed" } }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: { message: "Server is missing GEMINI_API_KEY. Add it in Netlify > Site configuration > Environment variables." } }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: { message: "Invalid request body." } }) };
  }

  const userText = body.messages?.[0]?.content || "";

  let data;
try {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: body.system }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  data = await geminiResponse.json();

  if (data.error) {
    return { statusCode: geminiResponse.status, body: JSON.stringify({ error: { message: data.error.message } }) };
  }
} catch (err) {
  return { statusCode: 502, body: JSON.stringify({ error: { message: `Upstream fetch failed: ${err.message}` } }) };
}

  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join("") || "";

  if (!text) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown";
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: { message: `Gemini returned no text (reason: ${reason}). Raw: ${JSON.stringify(data).slice(0, 400)}` },
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ content: [{ type: "text", text }] }),
  };
}
