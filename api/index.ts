import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";

// Use /tmp on Vercel for logs if needed, though we should avoid writing on Vercel
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;
const logFile = isVercel ? '/tmp/security.log' : path.join(process.cwd(), 'security.log');

/**
 * SHA-256 Utility for Integrity and Hashing
 */
function generateSHA256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function logSecurityEvent(level: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL', eventType: string, details: any, req?: express.Request) {
  const timestamp = new Date().toISOString();
  let ip = 'unknown';
  let userId = 'anonymous';
  
  if (req) {
    ip = req.ip || req.socket.remoteAddress || 'unknown';
    userId = req.headers['x-user-id'] as string || 'anonymous';
  }

  // Ensure no sensitive data is logged
  const sanitizedDetails = { ...details };
  if (sanitizedDetails.input) sanitizedDetails.input_hash = generateSHA256(sanitizedDetails.input);
  if (sanitizedDetails.input) sanitizedDetails.input = '[REDACTED]';
  if (sanitizedDetails.output) sanitizedDetails.output = '[REDACTED]';
  
  const logEntry = `[${timestamp}] [${level}] [${eventType}] IP: ${ip} | User: ${userId} | Details: ${JSON.stringify(sanitizedDetails)}\n`;
  
  if (isVercel) {
    console.log(`[BK-SECURITY] ${logEntry.trim()}`);
    return;
  }
  
  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error('Failed to write to security log:', err);
    }
  });
}

function getGeminiKey() {
  const key = process.env.GEMINI_API_KEY || 
              process.env.Gemini || 
              process.env.GEMINI || 
              process.env.gemini || 
              process.env.API_KEY || 
              process.env.alternate;

  if (!key && isVercel) {
    console.error("[BK-SECURITY] CRITICAL: No Gemini API Key found. Checked: GEMINI_API_KEY, Gemini, GEMINI, gemini, API_KEY, alternate");
  }
  return key;
}

function getDetectedKeyNames() {
  return Object.keys(process.env).filter(k => 
    k.toLowerCase().includes('gemini') || 
    k === 'API_KEY' || 
    k === 'alternate'
  );
}

const chatSchema = z.object({
  model: z.string().min(1).max(100),
  provider: z.literal("google"),
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "model", "system"]),
      content: z.union([
        z.string().max(20000),
        z.array(
          z.union([
            z.object({ type: z.literal("text"), text: z.string().max(20000) }).strict(),
            z.object({ type: z.literal("media_url"), media_url: z.object({ url: z.string().url().or(z.string().startsWith("data:")) }).strict() }).strict(),
            z.object({ type: z.literal("image"), source: z.object({ type: z.literal("base64"), media_type: z.string(), data: z.string() }).strict() }).strict(),
          ])
        ),
      ]),
    }).strict()
  ).max(50),
  system: z.string().max(2000).optional(),
}).strict();

const guardrailPreSchema = z.object({ input: z.string().min(1).max(5000) }).strict();
const guardrailPostSchema = z.object({ output: z.string().min(1).max(50000), systemPrompt: z.string().max(2000).optional() }).strict();

function sanitizeContent(content: any): any {
  const sanitizeOptions = { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard' as const, enforceHtmlBoundary: true };
  if (typeof content === "string") return sanitizeHtml(content, sanitizeOptions);
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (item.type === "text" && typeof item.text === "string") {
        return { ...item, text: sanitizeHtml(item.text, sanitizeOptions) };
      }
      return item;
    });
  }
  return content;
}

function detectPromptInjection(text: string): { isSafe: boolean; reason?: string } {
  const patterns = [/ignore previous instructions/i, /system prompt/i, /jailbreak/i, /override/i, /you are now/i, /forget everything/i, /output the following/i, /don't follow/i, /<script/i, /javascript:/i, /onload=/i, /onerror=/i];
  for (const pattern of patterns) { if (pattern.test(text)) return { isSafe: false, reason: `Potential security risk (Pattern: ${pattern.source})` }; }
  if (/(.)\1{100,}/.test(text)) return { isSafe: false, reason: "Excessive repetition" };
  return { isSafe: true };
}

async function startApp() {
  const app = express();
  app.set('trust proxy', 1);

  console.log(`[BK-INIT] Initializing Express app on ${isVercel ? 'Vercel' : 'Local'}`);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '5mb', verify: (req: any, res, buf) => { req.rawBody = buf; req.bodyHash = generateSHA256(buf.toString()); } }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      logSecurityEvent('INFO', 'API_REQUEST', { method: req.method, path: req.path, content_integrity: (req as any).bodyHash || 'N/A' }, req);
    }
    next();
  });

  const getRateLimitKey = (req: express.Request) => {
    const userId = req.headers['x-user-id'] || 'anonymous';
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    return `${ip}-${userId}`;
  };

  const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, keyGenerator: getRateLimitKey, legacyHeaders: false, standardHeaders: true, validate: false });
  const chatLimiter = rateLimit({ windowMs: 1 * 60 * 1000, max: 100, keyGenerator: getRateLimitKey, legacyHeaders: false, standardHeaders: true, validate: false });

  app.use("/api", generalLimiter);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "1.0.3", platform: isVercel ? "Vercel" : "Local", keyDetected: !!getGeminiKey(), detectedKeys: getDetectedKeyNames() });
  });

  app.post("/api/chat", chatLimiter, async (req, res) => {
    try {
      const parsed = chatSchema.parse(req.body);
      const sanitizedMessages = parsed.messages.map((msg) => ({ ...msg, content: sanitizeContent(msg.content) }));
      const { model, system } = parsed;

      const geminiApiKey = getGeminiKey();
      if (!geminiApiKey) throw new Error("API Key Missing");

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const currentDateTime = new Date().toLocaleString();
      const enforcedSystemPrompt = `You are a helpful assistant. Date: ${currentDateTime}.`;
      
      let actualModelId = model.replace('-thinking', '').replace('-search', '');
      let config: any = { systemInstruction: enforcedSystemPrompt + (system ? "\n" + system : "") };
      
      if (model.includes('thinking')) config.thinkingConfig = { thinkingLevel: 'HIGH' };
      if (model.includes('search')) config.tools = [{ googleSearch: {} }];

      const contents = sanitizedMessages.map((msg: any) => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: Array.isArray(msg.content) ? msg.content.map((c: any) => c.type === 'text' ? { text: c.text } : { inlineData: { mimeType: 'image/png', data: '' } }) : [{ text: msg.content }]
      }));

      const responseStream = await ai.models.generateContentStream({ model: actualModelId, contents: contents as any, config });

      for await (const chunk of responseStream) {
        if (chunk.text) {
          res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
        }
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error: any) {
      console.error("Chat API Error:", error);
      if (!res.headersSent) res.status(500).json({ error: error.message });
      else res.end();
    }
  });

  if (!isVercel) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
    }
  }

  return app;
}

let appPromise: Promise<express.Express> | null = null;

if (!isVercel) {
  startApp().then((app) => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

export default async function (req: any, res: any) {
  try {
    if (!appPromise) appPromise = startApp();
    const app = await appPromise;
    app(req, res);
  } catch (err: any) {
    console.error("[CRITICAL] Entry Point Error:", err);
    res.status(500).json({ error: "Server failed to start", details: err.message });
  }
}
