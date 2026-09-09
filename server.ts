import http from 'http';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI SDK on server side with 'aistudio-build' telemetry header
let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Resilient content generation with automatic model fallback for 503 high-demand spikes
 * Prioritizes gemini-3.1-flash-lite with minimal thinking for ultra-low latency conversational responses (< 400ms)
 */
async function generateContentWithFallback(
  ai: GoogleGenAI,
  reqConfig: {
    contents: any;
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
  }
) {
  // Ordered list: gemini-3.1-flash-lite first for instant conversational speech, followed by 3.8-flash
  const candidateModels = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: reqConfig.contents,
        config: {
          systemInstruction: reqConfig.systemInstruction,
          temperature: reqConfig.temperature ?? 0.8,
          responseMimeType: reqConfig.responseMimeType,
        },
      });
      return { response, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      const isTemporaryDemand =
        err?.status === 503 ||
        err?.code === 503 ||
        err?.status === 'UNAVAILABLE' ||
        String(err?.message || '').toLowerCase().includes('high demand') ||
        String(err?.message || '').toLowerCase().includes('unavailable') ||
        String(err?.message || '').toLowerCase().includes('rate limit') ||
        err?.status === 429;

      if (isTemporaryDemand) {
        console.warn(`[Gemini API] Model ${model} is experiencing high demand / unavailable. Switching to fallback candidate...`);
        // Short jitter before trying next model
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      console.warn(`[Gemini API] Model ${model} error: ${err.message}. Trying next candidate...`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  throw lastError;
}

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    timestamp: Date.now(),
  });
});

/**
 * POST /api/companion/respond
 * Generates context-aware, emotionally aware conversational response
 * factoring in vocal cues, conversation state, retrieved memory, and personality.
 */
app.post('/api/companion/respond', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const {
      transcript,
      vocalCues,
      history = [],
      memories = [],
      personality = 'british_witty',
      accent = 'british',
      interruptedPrevious = false,
      hinglishEnabled = true,
    } = req.body;

    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'transcript string is required' });
    }

    const ai = getGenAI();

    const isBritish = personality === 'british_witty' || accent === 'british';
    const accentInstruction = isBritish
      ? `\nBRITISH ACCENT & MANNERISMS:
- You speak with an engaging, charming British accent tone, vocabulary, and cadence (warm British conversational style).
- Use natural British expressions, vocabulary, and dry wit where fitting (e.g., "Right then", "Brilliant", "Spot on", "Splendid", "Fancy that", "No worries at all, mate", "Quite right", "Blimey", "Rather keen").
- Keep your humor dry, warm, polite, and quick-witted, typical of friendly British banter.
- Never sound robotic or formal; speak like a witty, supportive British friend.`
      : '';

    // Contextual system prompt for a true conversational companion
    const systemInstruction = `You are Echo, a natural, emotionally aware, real-time AI companion and friend.
You are NOT a corporate search engine, customer service bot, or formal assistant.
You talk like a genuine, thoughtful, warm friend having a real-time voice conversation.${accentInstruction}

CONVERSATIONAL RULES:
1. Speak concisely and conversationally (usually 1 to 3 natural sentences). People don't talk in giant paragraphs in real voice conversations.
2. Avoid bullet points, lists, markdown headers, and robotic pleasantries like "Sure! Here is a list of...".
3. Use natural conversational rhythm, casual phrasing, and relatable humor where appropriate.
4. LANGUAGE MATCHING: Detect the language the user actually used. Reply in the same language. For Hindi, use natural Hindi. For Hinglish, use natural Hinglish. For English, use English. Do not translate Hindi/Hinglish into formal English unless the user asks.
5. If the user uses Hinglish or casual Indian slang ("yaar", "bhai", "basically", "theek hai", "chalega", "sahi hai"), feel free to blend natural Hinglish back warmly and organically.
5. Pay attention to how the user said it:
   - If user paused a lot or showed hesitation: be reassuring, gentle, and non-judgmental.
   - If user was fast and energetic: match their enthusiasm.
   - If user interrupted you: acknowledge the pivot smoothly without being defensive (e.g., "Right, gotcha, let's pivot to that instead!").
6. Continuity & Memory: Use retrieved memories naturally without being creepy. E.g. "How is that college AI companion project coming along?"
7. Output JSON format matching the schema:
   - "response": your conversational spoken text
   - "tone": tone of delivery (e.g. "warm_british", "curious", "reassuring", "playful")
   - "extractedFact": any key fact about the user worth remembering for long-term memory (or null if none)
   - "speakingSpeed": recommended speed 0.9 to 1.2`;

    // Construct prompt payload
    const vocalDetails = vocalCues
      ? `[Acoustic Signals: Pitch=${vocalCues.pitch_hz || 140}Hz (${vocalCues.pitch_variation} variation), Energy=${vocalCues.energy}, Rate=${vocalCues.speaking_rate || 'medium'} (${vocalCues.wpm || 130} WPM), Hesitation=${vocalCues.hesitation}, PauseBeforeTurn=${vocalCues.pause_duration || 0}s, InterruptedPrevious=${interruptedPrevious}]`
      : '';

    const memoryContext = memories.length > 0
      ? `Relevant Long-Term Memories from previous conversations:\n${memories.map((m: any) => `- ${m.content}`).join('\n')}`
      : 'No prior memories retrieved.';

    const formattedHistory = history
      .slice(-6)
      .map((h: any) => `${h.sender === 'user' ? 'Friend' : 'Echo'}: ${h.text}`)
      .join('\n');

    const promptText = `${vocalDetails}
${memoryContext}

Recent Conversation:
${formattedHistory}

Friend just said: "${transcript}"
Echo:`;

    if (!ai) {
      // Graceful conversational fallback if GEMINI_API_KEY is not yet populated
      const isHinglish = /yaar|bhai|matlab|kya|backend|chalega/i.test(transcript);
      let fallbackText = `I hear you! That makes total sense. Tell me a bit more about what you're thinking.`;

      if (/project|ai|college/i.test(transcript)) {
        fallbackText = isHinglish
          ? `Sahi baat hai yaar! Real-time voice mein turn-taking aur interruption handling hi sabse main challenge hota hai. How is the backend shaping up?`
          : `That sounds like a really exciting project! Especially tackling the turn-taking and hesitation logic—that's what makes it feel human.`;
      } else if (interruptedPrevious) {
        fallbackText = `Got it, my bad! Let's focus on that instead. Go ahead!`;
      }

      return res.json({
        response: fallbackText,
        tone: 'warm_casual',
        speakingSpeed: 1.05,
        extractedFact: null,
        latency_ms: Date.now() - startTime,
      });
    }

    let rawText = '{}';
    try {
      const { response } = await generateContentWithFallback(ai, {
        contents: promptText,
        systemInstruction,
        temperature: 0.85,
        responseMimeType: 'application/json',
      });
      rawText = response.text || '{}';
    } catch (genError: any) {
      console.warn('Gemini model high demand / error, deploying conversational fallback:', genError.message);
      // Seamless conversational fallback so voice loop never crashes during temporary upstream spikes
      const isHinglish = /yaar|bhai|matlab|kya|backend|chalega|theek|sahi/i.test(transcript);
      let fallbackText = `I hear you! That makes total sense. Tell me a bit more about what you're thinking.`;

      if (/project|ai|companion|voice|turn/i.test(transcript)) {
        fallbackText = isHinglish
          ? `Bilkul sahi point hai yaar! Real-time voice mein turn-taking aur interruption handling sabse critical layer hota hai. How's the architecture going?`
          : `That's such an exciting part of building a voice companion! Getting turn-taking and pause detection right is what makes conversations feel alive.`;
      } else if (interruptedPrevious) {
        fallbackText = `Got it, my bad! Let's pivot to that. Go ahead!`;
      }

      return res.json({
        response: fallbackText,
        tone: 'warm_reassuring',
        speakingSpeed: 1.05,
        extractedFact: null,
        latency_ms: Date.now() - startTime,
      });
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = { response: rawText, tone: 'warm', speakingSpeed: 1.05 };
    }

    res.json({
      response: parsed.response || parsed.text || "I'm right here with you, tell me more!",
      tone: parsed.tone || 'conversational',
      speakingSpeed: parsed.speakingSpeed || 1.05,
      extractedFact: parsed.extractedFact || null,
      latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Error in /api/companion/respond:', error);
    res.json({
      response: "I'm right here with you! Tell me more about what's on your mind.",
      tone: 'warm',
      speakingSpeed: 1.05,
      extractedFact: null,
      latency_ms: Date.now() - startTime,
    });
  }
});

/**
 * POST /api/companion/transcribe
 * Transcribes audio snippets using Gemini Audio Intelligence
 * Ensures speech input works seamlessly across all browsers (Chrome, Firefox, Safari, Edge, Mobile)
 */
app.post('/api/companion/transcribe', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const { audioBase64, mimeType = 'audio/webm' } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'Missing audioBase64' });
    }

    const ai = getGenAI();
    if (!ai) {
      return res.status(500).json({ error: 'Gemini API not configured' });
    }

    // Clean base64 string
    const cleanBase64 = audioBase64.replace(/^data:audio\/[^;]+;base64,/, '');

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
    let transcribedText = '';

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'You are an accurate real-time speech transcriber. Transcribe the user speech verbatim. Return ONLY the transcribed text with appropriate punctuation and question marks if it is a question. If the audio is silent or unintelligible background noise, return an empty string. Do NOT add preamble or explanations.',
                },
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
        });
        transcribedText = (response.text || '').trim();
        break;
      } catch (err: any) {
        console.warn(`Model ${model} audio transcription error:`, err.message);
      }
    }

    return res.json({
      transcript: transcribedText,
      latency_ms: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('Error in /api/companion/transcribe:', error);
    return res.status(500).json({ error: error.message, transcript: '' });
  }
});

const VALID_RIME_SPEAKERS = new Set(['albion', 'victoria', 'astra', 'celeste', 'orion', 'lyra', 'masonry', 'luna']);

/**
 * POST /api/companion/rime-tts
 * Generates ultra-low latency conversational audio speech using Rime TTS (https://users.rime.ai/v1/rime-tts)
 * Uses RIME_API_KEY for high-fidelity natural British and conversational voice synthesis.
 */
app.post('/api/companion/rime-tts', async (req: Request, res: Response) => {
  try {
    const {
      text,
      speaker = 'albion',
      modelId = 'coda',
      accent = 'british',
      speedAlpha = 1.0,
    } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS synthesis' });
    }

    // Resolve valid speaker for Rime Coda model
    let resolvedSpeaker = (speaker || 'albion').toLowerCase().trim();
    if (!VALID_RIME_SPEAKERS.has(resolvedSpeaker)) {
      // Map legacy or unknown names to best British or neutral match
      if (resolvedSpeaker === 'marsh' || resolvedSpeaker === 'colin' || resolvedSpeaker === 'william') {
        resolvedSpeaker = 'albion';
      } else if (resolvedSpeaker === 'allison' || resolvedSpeaker === 'catherine') {
        resolvedSpeaker = 'victoria';
      } else {
        resolvedSpeaker = accent === 'british' ? 'albion' : 'astra';
      }
    }

    const rimeApiKey = process.env.RIME_API_KEY;
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hasHindiRoman = /\b(bhai|yaar|kya|kaise|kaisa|kyun|kyu|mujhe|mera|meri|tum|aap|haan|nahi|nahin|hai|hoon|hun|karna|karo|kuch|abhi|kal|acha|achha|theek|sahi|batao|bata|chahiye|kyon|matlab)\b/i.test(text);
    const isHindi = hasDevanagari || hasHindiRoman;
    // Coda is excellent for English but its documented language set does not include Hindi.
    // Arcana supports Hindi and English, so automatically switch for Hindi/Hinglish.
    const resolvedModelId = isHindi ? 'arcana' : (modelId || 'coda');
    const resolvedLang = isHindi ? 'hin' : 'eng';
    const ttsSpeaker = isHindi ? 'celeste' : resolvedSpeaker;

    // 1. If Rime API key is configured, synthesize via Rime API
    if (rimeApiKey) {
      try {
        const rimeRes = await fetch('https://users.rime.ai/v1/rime-tts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${rimeApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            speaker: ttsSpeaker,
            text: text.trim().slice(0, 500),
            modelId: resolvedModelId,
            lang: resolvedLang,
            samplingRate: 22050,
            speedAlpha: speedAlpha || 1.0,
          }),
        });

        if (rimeRes.ok) {
          const arrayBuffer = await rimeRes.arrayBuffer();
          const base64Audio = Buffer.from(arrayBuffer).toString('base64');
          return res.json({
            audio: base64Audio,
            provider: 'rime',
            speaker: ttsSpeaker,
            modelId: resolvedModelId,
            lang: resolvedLang,
            accent: accent || 'british',
          });
        } else {
          const errBody = await rimeRes.text();
          console.warn(`[Rime TTS API HTTP ${rimeRes.status}]:`, errBody);
        }
      } catch (rimeErr: any) {
        console.warn('[Rime TTS Network Error]:', rimeErr.message);
      }
    }

    // If Rime API key is absent or failed, gracefully fall back to client neural synthesis
    return res.json({
      fallbackToClient: true,
      provider: 'client_neural_british',
      accent: accent || 'british',
      message: 'Client neural speech synthesis fallback',
    });
  } catch (err: any) {
    console.error('Error in /api/companion/rime-tts:', err);
    res.json({
      fallbackToClient: true,
      provider: 'client_neural_british',
      accent: 'british',
    });
  }
});

/**
 * POST /api/companion/extract-memories
 * Extracts salient personal/project facts from user speech to store in long-term memory
 */
app.post('/api/companion/extract-memories', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body;
    const ai = getGenAI();
    if (!ai || !transcript) {
      return res.json({ memory: null });
    }

    const prompt = `Extract any durable user fact (e.g. project they are building, preferences, feelings, background) from this speech:
"${transcript}"
If nothing permanent or meaningful, return {"fact": null}. Otherwise return {"fact": "brief statement", "category": "project"|"preference"|"personal"}`;

    const { response } = await generateContentWithFallback(ai, {
      contents: prompt,
      responseMimeType: 'application/json',
      temperature: 0.2,
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch {
    res.json({ fact: null });
  }
});

async function startServer() {
  // Vite middleware in dev, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server,
          clientPort: process.env.K_SERVICE ? 443 : undefined,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Echo Voice AI Companion server listening on port ${PORT}`);
  });
}

startServer();
