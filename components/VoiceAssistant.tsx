
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export const VoiceAssistant: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

  const stopSession = () => {
    // 1. Close the API session
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    
    // 2. Stop all currently playing audio sources from this assistant
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // 3. Clear UI state
    setIsActive(false);
  };

  const startSession = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session) => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
              const sourceNode = outputCtx.createBufferSource();
              sourceNode.buffer = buffer;
              sourceNode.connect(outputCtx.destination);
              sourceNode.addEventListener('ended', () => sourcesRef.current.delete(sourceNode));
              sourceNode.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(sourceNode);
            }

            if (msg.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                try { s.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onclose: () => setIsActive(false),
          onerror: (e) => console.error("Live Error:", e),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: 'You are a senior Angular mentor. Answer the user\'s interview questions with architect-level depth. Keep responses spoken, conversational, but highly technical.',
        }
      });

      sessionRef.current = await sessionPromise;
      setIsActive(true);
    } catch (err) {
      console.error("Failed to start voice assistant:", err);
    }
  };

  return (
    <div className="relative">
      {/* Popover panel - Responsively sized for mobile */}
      <div className={`absolute bottom-24 right-0 w-[calc(100vw-3rem)] sm:w-80 max-w-[320px] mb-2 p-6 sm:p-8 rounded-[2rem] sm:rounded-[2.5rem] bg-slate-900 border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 origin-bottom-right ${isActive ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 pointer-events-none'}`}>
        <div className="flex items-center gap-3 sm:gap-4 mb-4">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 sm:w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-600/40">
              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-slate-900 rounded-full animate-pulse"></div>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-white text-sm sm:text-base tracking-tight uppercase truncate">Live Architect</h3>
            <p className="text-[9px] sm:text-[10px] text-indigo-400 font-black uppercase tracking-widest">Voice Session Active</p>
          </div>
        </div>

        <div className="text-center py-4">
          <div className="flex justify-center items-end gap-1.5 h-8 mb-4">
             <div className="w-1.5 bg-indigo-500 rounded-full animate-[bounce_1s_infinite] h-full"></div>
             <div className="w-1.5 bg-indigo-400 rounded-full animate-[bounce_1.2s_infinite] h-3/4"></div>
             <div className="w-1.5 bg-indigo-600 rounded-full animate-[bounce_0.8s_infinite] h-1/2"></div>
             <div className="w-1.5 bg-indigo-400 rounded-full animate-[bounce_1.1s_infinite] h-2/3"></div>
             <div className="w-1.5 bg-indigo-500 rounded-full animate-[bounce_0.9s_infinite] h-4/5"></div>
          </div>
          <p className="text-slate-400 text-xs sm:text-sm font-medium">
            Speaking with your Angular Mentor...
          </p>
        </div>
      </div>
      
      {/* Floating Toggle Button */}
      <button
        onClick={isActive ? stopSession : startSession}
        className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-[1.75rem] flex items-center justify-center shadow-2xl transition-all duration-500 active:scale-90 border-2 ${
          isActive 
          ? 'bg-red-500 border-red-400 text-white animate-pulse' 
          : 'bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 shadow-indigo-600/30'
        }`}
      >
        {isActive ? (
          <svg className="w-8 h-8 sm:w-9 sm:h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="relative group/mic">
             <svg className="w-8 h-8 sm:w-10 sm:h-10 transition-transform group-hover/mic:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-white rounded-full border-2 border-indigo-600"></div>
          </div>
        )}
      </button>
    </div>
  );
};
