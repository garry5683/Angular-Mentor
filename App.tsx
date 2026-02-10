
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CATEGORIES, QUESTIONS as DEFAULT_QUESTIONS } from './constants';
import { Question, AIResponse } from './types';
import { getAnswerFromAI, getAudioFromText } from './services/geminiService';
import { getAllCachedIds, getCustomQuestions, saveCustomQuestion } from './services/dbService';
import { VoiceAssistant } from './components/VoiceAssistant';
import { LoginPage } from './components/LoginPage';
import { auth, logout } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

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

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());
  const [customQuestions, setCustomQuestions] = useState<Question[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeAudioQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.emailVerified) {
        setUser(currentUser);
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Fetch cloud data whenever user state changes
  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const refreshData = async () => {
    const ids = await getAllCachedIds();
    setSyncedIds(new Set(ids));
    const custom = await getCustomQuestions();
    setCustomQuestions(custom);
  };

  const allQuestions = useMemo(() => {
    return [...customQuestions, ...DEFAULT_QUESTIONS];
  }, [customQuestions]);

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      return selectedCategory === 'All' || q.category === selectedCategory;
    });
  }, [selectedCategory, allQuestions]);

  const stopAudio = () => {
    activeAudioQuestionIdRef.current = null;
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch (e) {}
      audioSourceRef.current = null;
    }
    setIsPlaying(false);
  };

  const playAudio = async (questionId: string, text: string) => {
    stopAudio();
    activeAudioQuestionIdRef.current = questionId;
    setIsAudioLoading(true);

    try {
      const base64Audio = await getAudioFromText(questionId, text);
      if (activeAudioQuestionIdRef.current !== questionId) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      
      if (activeAudioQuestionIdRef.current !== questionId) return;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (activeAudioQuestionIdRef.current === questionId) setIsPlaying(false);
      };
      
      audioSourceRef.current = source;
      source.start(0);
      setIsPlaying(true);
    } catch (err) {
      console.error("Failed to play audio:", err);
    } finally {
      if (activeAudioQuestionIdRef.current === questionId) setIsAudioLoading(false);
    }
  };

  const handleQuestionClick = async (question: Question) => {
    stopAudio();
    setSelectedQuestion(question);
    setAiResponse(null);
    setIsLoading(true);
    setError(null);
    
    try {
      // getAnswerFromAI now uses Firestore via its internal getCachedAnswer call
      const result = await getAnswerFromAI(question.id, question.text);
      setAiResponse(result);
      setSyncedIds(prev => new Set(prev).add(question.id));
      playAudio(question.id, result.answer);
    } catch (err: any) {
      setError(err.message || "Failed to fetch answer.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskNewQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim() || !user) return;

    const newQ: Question = {
      id: `custom-${Date.now()}`,
      text: newQuestionText.trim(),
      category: 'Advanced & Coding',
      isCustom: true
    };

    // Optimistic UI update
    setCustomQuestions(prev => [newQ, ...prev]);
    // Save to Firestore
    await saveCustomQuestion(newQ);
    setNewQuestionText('');
    handleQuestionClick(newQ);
  };

  const handleCloseModal = () => {
    setSelectedQuestion(null);
    stopAudio();
  };

  const handleLogout = async () => {
    stopAudio();
    await logout();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLoginSuccess={refreshData} />;
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col selection:bg-indigo-500/30">
      <header className="border-b border-slate-800/50 bg-[#020617]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-black tracking-tighter bg-gradient-to-br from-white via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                ANGULAR MENTOR
              </h1>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{syncedIds.size} Cloud Sync</span>
              </div>
            </div>
            
            <div className="md:hidden">
              <button onClick={handleLogout} className="p-1 rounded-full border border-slate-800 overflow-hidden bg-slate-900">
                {user.photoURL ? (
                  <img src={user.photoURL} className="w-8 h-8 rounded-full" alt="Profile" />
                ) : (
                  <div className="w-8 h-8 flex items-center justify-center text-[10px] font-black">{user.email?.charAt(0).toUpperCase()}</div>
                )}
              </button>
            </div>
          </div>
          
          <form onSubmit={handleAskNewQuestion} className="flex-1 max-w-xl relative w-full">
            <input
              type="text"
              placeholder="Ask a technical question..."
              className="w-full pl-6 pr-14 py-3 rounded-2xl bg-slate-900/50 border border-slate-800 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all placeholder-slate-600 text-slate-200"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
            />
            <button type="submit" className="absolute right-2 top-1.5 p-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </button>
          </form>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 px-3 py-1.5 rounded-2xl">
              {user.photoURL ? (
                <img src={user.photoURL} className="w-7 h-7 rounded-full ring-2 ring-indigo-500/20" alt="Profile" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-black">{user.email?.charAt(0).toUpperCase()}</div>
              )}
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-slate-500 leading-none mb-1">Architect</span>
                <span className="text-xs font-bold text-slate-300 leading-none truncate max-w-[100px]">
                  {user.displayName?.split(' ')[0] || user.email?.split('@')[0]}
                </span>
              </div>
              <button onClick={handleLogout} className="ml-2 p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-[#020617] border-b border-slate-800/30 sticky top-[132px] md:top-[85px] z-30 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 border ${selectedCategory === cat ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 border-slate-800/50 text-slate-500 hover:text-slate-300 hover:border-slate-700'}`}>
                {cat}
                {selectedCategory === cat && <div className="w-1 h-1 bg-white rounded-full animate-pulse"></div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-[1400px] mx-auto px-4 md:px-6 mt-8 w-full pb-32 flex-grow">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredQuestions.map(q => {
            const isSynced = syncedIds.has(q.id);
            return (
              <div key={q.id} onClick={() => handleQuestionClick(q)} className={`group relative flex flex-col justify-between p-6 rounded-[2rem] border transition-all duration-300 cursor-pointer ${isSynced ? 'bg-indigo-600/5 border-indigo-500/20 hover:border-indigo-400/40' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}>
                {isSynced && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-green-500/20">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    Synced
                  </div>
                )}
                <div className="space-y-4">
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-[0.15em] border ${q.isCustom ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-500'}`}>{q.category}</span>
                  <h3 className="text-[14px] font-bold text-slate-300 leading-snug group-hover:text-white transition-colors">{q.text}</h3>
                </div>
                <div className="mt-8 flex justify-end">
                  <div className="p-2 rounded-xl bg-slate-800/50 group-hover:bg-indigo-600 text-slate-500 group-hover:text-white transition-all transform group-hover:translate-x-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-50">
        <VoiceAssistant />
      </div>

      {selectedQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-12">
          <div className="absolute inset-0 bg-[#020617]/95 backdrop-blur-xl" onClick={handleCloseModal}></div>
          <div className="relative bg-slate-900 w-full max-w-5xl h-full sm:h-[90dvh] rounded-none sm:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden border-0 sm:border border-slate-800/50 animate-in zoom-in-95 duration-500">
            <div className="px-6 py-8 sm:px-10 sm:py-10 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-900/50 gap-6">
              <div className="flex items-center gap-4 sm:gap-6 w-full">
                <div className={`flex-shrink-0 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-black transition-all duration-700 ${isPlaying ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/50 scale-110' : 'bg-slate-800 text-slate-500'}`}>
                  {isPlaying ? (
                    <div className="flex gap-1.5 items-end h-5 sm:h-7">
                      <div className="w-1.5 sm:w-2 bg-white animate-[bounce_1s_infinite] h-full rounded-full"></div>
                      <div className="w-1.5 sm:w-2 bg-white animate-[bounce_1.2s_infinite] h-3/4 rounded-full"></div>
                      <div className="w-1.5 sm:w-2 bg-white animate-[bounce_0.8s_infinite] h-1/2 rounded-full"></div>
                    </div>
                  ) : <span className="text-xl sm:text-2xl italic tracking-tighter">AM</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-2xl md:text-3xl font-black text-white tracking-tight leading-tight line-clamp-2">{selectedQuestion.text}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[8px] sm:text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Expert Mentor</span>
                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                    <span className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">{selectedQuestion.category}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                {aiResponse && (
                  <button onClick={() => isPlaying ? stopAudio() : playAudio(selectedQuestion.id, aiResponse.answer)} disabled={isAudioLoading} className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-3 sm:py-4 rounded-[1.25rem] transition-all font-black uppercase text-[10px] sm:text-xs tracking-widest ${isPlaying ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-indigo-600 text-white shadow-2xl shadow-indigo-600/30'}`}>
                    {isAudioLoading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : isPlaying ? 'Pause Podcast' : 'Play Podcast'}
                  </button>
                )}
                <button onClick={handleCloseModal} className="p-3 sm:p-4 bg-slate-800/50 hover:bg-slate-800 rounded-2xl text-slate-400 hover:text-white transition-all border border-slate-700/50">
                  <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 sm:px-16 py-8 sm:py-16 scroll-smooth custom-scrollbar">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-8">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 border-[6px] border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                  <p className="text-xl sm:text-2xl font-black text-white">Synthesizing Briefing...</p>
                </div>
              ) : error ? (
                <div className="bg-red-500/5 border border-red-500/10 p-12 rounded-[3rem] text-center max-w-xl mx-auto">
                  <h3 className="text-2xl font-black text-white mb-3">Error</h3>
                  <p className="text-slate-400">{error}</p>
                </div>
              ) : aiResponse ? (
                <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10">
                  <div className="p-6 sm:p-8 bg-indigo-500/[0.03] rounded-[2rem] border border-indigo-500/10 text-indigo-200/80 text-base sm:text-xl font-medium italic leading-relaxed">
                    "This is a key interview question. Focus on why this pattern is essential for enterprise-grade Angular apps..."
                  </div>
                  <div className="space-y-6 sm:space-y-10">
                    {aiResponse.answer.split('\n').map((line, i) => {
                      if (line.startsWith('###')) return <h3 key={i} className="text-xl sm:text-2xl font-black text-white mt-12 sm:mt-16 pt-8 border-t border-slate-800/50">{line.replace('###', '')}</h3>;
                      if (line.startsWith('##')) return <h2 key={i} className="text-2xl sm:text-4xl font-black text-white mt-16 sm:mt-20 mb-6 sm:mb-10 pb-6 border-b-2 border-slate-800">{line.replace('##', '')}</h2>;
                      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                        return <div key={i} className="flex gap-4 pl-4"><span className="text-indigo-500 font-black">•</span><span className="text-slate-300 text-sm sm:text-lg">{line.replace(/^[-*]\s*/, '')}</span></div>;
                      }
                      return line.trim() === '' ? <div key={i} className="h-4" /> : <p key={i} className="text-slate-400 text-sm sm:text-lg leading-relaxed">{line}</p>;
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="px-10 py-8 border-t border-slate-800 bg-slate-900/50 flex justify-center sm:justify-end shrink-0">
              <button onClick={handleCloseModal} className="w-full sm:w-auto px-12 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all border border-slate-700">Back to Library</button>
            </div>
          </div>
        </div>
      )}

      <footer className="mt-auto py-12 border-t border-slate-900 text-center opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.5em] px-4">Architect Mode Active • Cloud Sync Enabled</p>
      </footer>
    </div>
  );
};

export default App;
