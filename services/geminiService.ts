
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { AIResponse } from "../types";
import { getCachedAnswer, saveAnswerToCache } from "./dbService";

export const getAnswerFromAI = async (questionId: string, questionText: string): Promise<AIResponse> => {
  // Check cache first
  const cached = await getCachedAnswer(questionId);
  if (cached) {
    return {
      answer: cached.answer,
      sources: cached.sources
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `
    You are a world-class Angular Architect with deep architectural expertise. 
    Your tone is professional, technical, yet friendly—like a senior mentor helping a colleague prepare for a high-stakes interview.
    
    When answering:
    1. Start with a clear, high-level summary.
    2. Deep dive into the technical details (how it works under the hood).
    3. Mention architectural implications and best practices.
    4. Include real-world scenarios or modern Angular updates (e.g., Signals, Standalone Components, Ivy features) where applicable.
    5. Ensure the answer is structured well with clear headings and bullet points.
    6. Use Google Search grounding to ensure accuracy for recent Angular versions (v14-v19).
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Question: ${questionText}`,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text || "I'm sorry, I couldn't generate an answer at this moment.";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const result = {
      answer: text,
      sources: sources.filter((s: any) => s.web).map((s: any) => s)
    };

    // Save to cache (without audio initially)
    await saveAnswerToCache({
      questionId,
      ...result,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to fetch answer from AI mentor.");
  }
};

export const getAudioFromText = async (questionId: string, text: string): Promise<string> => {
  // Check cache for audio
  const cached = await getCachedAnswer(questionId);
  if (cached?.audioBase64) {
    return cached.audioBase64;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const cleanText = text
    .replace(/[#*`]/g, '')
    .replace(/\n\n/g, '. ')
    .substring(0, 1500);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Explain this as a friendly mentor in a podcast style: ${cleanText}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data received");

    // Update cache with audio
    if (cached) {
      await saveAnswerToCache({
        ...cached,
        audioBase64: base64Audio
      });
    }

    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
};
