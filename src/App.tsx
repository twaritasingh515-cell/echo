import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  VisualState,
  VocalCues,
  TurnDecision,
  ChatMessage,
  MemoryItem,
  CompanionSettings,
} from './types';
import { AudioEngine } from './services/audioEngine';
import { decideTurnTaking, analyzeSentenceCompleteness } from './services/turnTakingEngine';
import { memoryEngine } from './services/memoryEngine';
import { ttsService } from './services/ttsService';
import { AvatarVisualizer } from './components/AvatarVisualizer';
import { AudioTelemetryPanel } from './components/AudioTelemetryPanel';
import { TurnTakingInspector } from './components/TurnTakingInspector';
import { ConversationStream } from './components/ConversationStream';
import { MemoryDrawer } from './components/MemoryDrawer';
import { ArchitectureModal } from './components/ArchitectureModal';
import { SettingsModal } from './components/SettingsModal';
import {
  Mic,
  MicOff,
  Square,
  RotateCcw,
  Brain,
  Layers,
  Settings as SettingsIcon,
  Sparkles,
  Volume2,
  VolumeX,
  AlertCircle,
  Radio,
} from 'lucide-react';

const INITIAL_VOCAL_CUES: VocalCues = {
  speech_active: false,
  pause_duration: 0,
  speaking_rate: 'medium',
  wpm: 0,
  energy: 'low',
  rms: 0,
  pitch_hz: 0,
  pitch_variation: 'low',
  hesitation: false,
  filler_words: [],
  sentence_complete: false,
  continuation_probability: 0.5,
  is_question: false,
  is_interruption: false,
};

const INITIAL_DECISION: TurnDecision = {
  action: 'WAIT',
  confidence: 0.9,
  reason: 'Awaiting speech input...',
  probabilities: { wait: 0.85, respond: 0.05, backchannel: 0.08, stop: 0.02 },
  rule_based_decision: 'WAIT',
  ml_based_decision: 'WAIT',
};

const INITIAL_SETTINGS: CompanionSettings = {
  personality: 'british_witty',
  voice_id: 'default',
  voice_provider: 'rime',
  voice_accent: 'british',
  rime_speaker: 'albion',
  rime_model: 'coda',
  auto_speak: true,
  speaking_rate: 1.0,
  backchannel_frequency: 'moderate',
  interruption_sensitivity: 'normal',
  multilingual_hinglish: true,
  long_term_memory_enabled: true,
  turn_taking_mode: 'hybrid_ml',
  silence_timeout_sec: 0.8,
};

export default function App() {
  // Conversational & Audio State
  const [visualState, setVisualState] = useState<VisualState>('IDLE');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [vocalCues, setVocalCues] = useState<VocalCues>(INITIAL_VOCAL_CUES);
  const [turnDecision, setTurnDecision] = useState<TurnDecision>(INITIAL_DECISION);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [currentAccumulatedTranscript, setCurrentAccumulatedTranscript] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>(() => memoryEngine.getAll());
  const [settings, setSettings] = useState<CompanionSettings>(INITIAL_SETTINGS);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);

  // Modals & Drawers
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isArchitectureOpen, setIsArchitectureOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // References for non-stale event loop access
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const visualStateRef = useRef<VisualState>(visualState);
  visualStateRef.current = visualState;
  const isStreamingRef = useRef<boolean>(isStreaming);
  isStreamingRef.current = isStreaming;
  const settingsRef = useRef<CompanionSettings>(settings);
  settingsRef.current = settings;
  const currentTranscriptRef = useRef<string>(currentAccumulatedTranscript);
  currentTranscriptRef.current = currentAccumulatedTranscript;
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const lastBackchannelTimeRef = useRef<number>(0);
  const isProcessingResponseRef = useRef<boolean>(false);
  const previousTurnInterruptedRef = useRef<boolean>(false);
  const lastUiUpdateRef = useRef<number>(0);
  const lastDecisionActionRef = useRef<string>('WAIT');

  /**
   * Emergency Barge-in / Interruption Handler
   * Triggered immediately when user speaks over AI audio
   */
  const handleInterruption = useCallback(() => {
    if (visualStateRef.current === 'SPEAKING' || ttsService.getIsSpeaking()) {
      console.log('[TurnTaking] Interruption detected! Halting AI output.');
      ttsService.cancel();
      setVisualState('INTERRUPTED');
      previousTurnInterruptedRef.current = true;

      // Mark the last AI message as interrupted in transcript
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.sender === 'ai' && !last.interrupted) {
          return [
            ...prev.slice(0, -1),
            { ...last, interrupted: true, text: last.text + ' — [interrupted]' },
          ];
        }
        return prev;
      });

      // Rapidly switch back to listening
      setTimeout(() => {
        if (isStreamingRef.current) {
          setVisualState('LISTENING');
        }
      }, 300);
    }
  }, []);

  /**
   * Dispatches conversational response generation to Express / Gemini backend
   */
  const generateCompanionResponse = useCallback(
    async (userTranscript: string, finalCues: VocalCues) => {
      if (!userTranscript.trim() || isProcessingResponseRef.current) return;
      isProcessingResponseRef.current = true;

      // Auto-clearing response watchdog: ensure isProcessingResponseRef cannot stay stuck permanently
      const watchdogTimer = setTimeout(() => {
        if (isProcessingResponseRef.current) {
          console.warn('[App] Response watchdog reset isProcessingResponseRef');
          isProcessingResponseRef.current = false;
          setVisualState(isStreamingRef.current ? 'LISTENING' : 'IDLE');
        }
      }, 30000);

      // 1. Add user message to dialogue
      const userMsg: ChatMessage = {
        id: `msg_user_${Date.now()}`,
        sender: 'user',
        text: userTranscript.trim(),
        timestamp: Date.now(),
        vocal_cues: { ...finalCues },
      };

      setMessages((prev) => [...prev, userMsg]);
      console.log('[VOICE] User said:', userTranscript.trim());
      setVisualState('THINKING');
      setInterimTranscript('');
      setCurrentAccumulatedTranscript('');

      // 2. Retrieve relevant long-term memories
      const relevantMemories = settingsRef.current.long_term_memory_enabled
        ? memoryEngine.retrieveRelevant(userTranscript, 3)
        : [];

      // 3. Call backend API
      const requestStart = Date.now();
      try {
        const res = await fetch('/api/companion/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: userTranscript,
            vocalCues: finalCues,
            history: messagesRef.current.slice(-6),
            memories: relevantMemories,
            personality: settingsRef.current.personality,
            accent: settingsRef.current.voice_accent || 'british',
            interruptedPrevious: previousTurnInterruptedRef.current,
            hinglishEnabled: settingsRef.current.multilingual_hinglish,
          }),
        });

        console.log('[AI] Gemini request completed with HTTP', res.status);
        const data = await res.json();
        const latencyTotal = Date.now() - requestStart;
        previousTurnInterruptedRef.current = false;

        if (!res.ok) {
          throw new Error(data?.error || `Companion API returned HTTP ${res.status}`);
        }

        const aiText = String(data.response || '').trim();
        if (!aiText) {
          throw new Error('Gemini returned an empty response.');
        }

        // 4. Save any extracted memory facts
        if (data.extractedFact && settingsRef.current.long_term_memory_enabled) {
          memoryEngine.add(data.extractedFact, 'project', 'auto_extracted');
          setMemories(memoryEngine.getAll());
        } else {
          // Check client-side regex extraction fallback
          const clientFact = memoryEngine.extractFactsFromSpeech(userTranscript);
          if (clientFact && settingsRef.current.long_term_memory_enabled) {
            memoryEngine.add(clientFact, 'personal', 'auto_extracted');
            setMemories(memoryEngine.getAll());
          }
        }

        console.log('[AI] Gemini response:', aiText);
        const aiMsg: ChatMessage = {
          id: `msg_ai_${Date.now()}`,
          sender: 'ai',
          text: aiText,
          timestamp: Date.now(),
          tone: data.tone || 'warm_british',
          extracted_memory: data.extractedFact || undefined,
          latency_ms: {
            total: latencyTotal,
          },
        };

        setMessages((prev) => [...prev, aiMsg]);
        setVisualState('SPEAKING');

        // 5. Echo speaks itself via Rime TTS with British accent prosody
        if ((settingsRef.current.auto_speak ?? true) && !isMuted) {
          const hindiLike = /[\u0900-\u097F]/.test(aiText) || /\b(bhai|yaar|kya|kaise|kaisa|kyun|kyu|mujhe|mera|meri|tum|aap|haan|nahi|nahin|hai|hoon|hun|karna|karo|kuch|abhi|kal|acha|achha|theek|sahi|batao|bata|chahiye|kyon|matlab)\b/i.test(aiText);
          const ttsProvider = settingsRef.current.voice_provider;
          const ttsAccent = hindiLike ? 'neutral' : (settingsRef.current.voice_accent || 'british');
          console.log('[TTS] Speaking response with provider:', ttsProvider, 'language:', hindiLike ? 'Hindi/Hinglish' : 'English');
          await ttsService.speak(
            aiText,
            {
              speaker: settingsRef.current.rime_speaker || 'albion',
              modelId: settingsRef.current.rime_model || 'coda',
              accent: ttsAccent,
              rate: settingsRef.current.speaking_rate,
              tone: data.tone,
              onStart: () => {
                if (audioEngineRef.current) audioEngineRef.current.setAiSpeaking(true);
              },
              onEnd: () => {
                clearTimeout(watchdogTimer);
                if (audioEngineRef.current) audioEngineRef.current.setAiSpeaking(false);
                if (isStreamingRef.current) {
                  setVisualState('LISTENING');
                } else {
                  setVisualState('IDLE');
                }
                isProcessingResponseRef.current = false;
              },
              onInterrupted: () => {
                clearTimeout(watchdogTimer);
                if (audioEngineRef.current) audioEngineRef.current.setAiSpeaking(false);
                isProcessingResponseRef.current = false;
              },
            },
            settingsRef.current.voice_provider
          );
        } else {
          clearTimeout(watchdogTimer);
          if (audioEngineRef.current) audioEngineRef.current.setAiSpeaking(false);
          setVisualState(isStreamingRef.current ? 'LISTENING' : 'IDLE');
          isProcessingResponseRef.current = false;
        }
      } catch (err: any) {
        clearTimeout(watchdogTimer);
        console.error('Failed to generate companion response:', err);
        const fallbackText = "Pardon me, I had a brief spot of trouble reaching my reasoning engine. Fancy giving that another go?";
        const errAiMsg: ChatMessage = {
          id: `msg_ai_${Date.now()}`,
          sender: 'ai',
          text: fallbackText,
          timestamp: Date.now(),
          tone: 'warm_british',
        };
        setMessages((prev) => [...prev, errAiMsg]);
        setVisualState('SPEAKING');

        ttsService.speak(
          fallbackText,
          {
            speaker: settingsRef.current.rime_speaker || 'albion',
            modelId: settingsRef.current.rime_model || 'coda',
            accent: settingsRef.current.voice_accent || 'british',
            rate: settingsRef.current.speaking_rate,
            onEnd: () => {
              setVisualState(isStreamingRef.current ? 'LISTENING' : 'IDLE');
              isProcessingResponseRef.current = false;
            },
            onInterrupted: () => {
              isProcessingResponseRef.current = false;
            },
          },
          settingsRef.current.voice_provider
        );
      }
    },
    []
  );

  /**
   * Initializes AudioEngine and registers callbacks
   */
  useEffect(() => {
    const engine = new AudioEngine({
      onVocalCuesUpdate: (cues, liveTranscript) => {
        // Synchronously utilize live speech recognition transcript from audio engine
        const transcript = (liveTranscript || currentTranscriptRef.current || '').trim();
        if (transcript) {
          currentTranscriptRef.current = transcript;
        }

        // Augment with lexical completeness analysis
        const analysis = analyzeSentenceCompleteness(transcript, cues);

        const mergedCues: VocalCues = {
          ...cues,
          hesitation: analysis.hesitation || cues.hesitation,
          filler_words: analysis.filler_words,
          sentence_complete: analysis.sentence_complete,
          continuation_probability: analysis.continuation_probability,
          is_question: analysis.is_question,
        };

        // Run Turn-Taking Engine
        const isAiSpeaking = visualStateRef.current === 'SPEAKING' || ttsService.getIsSpeaking();
        const decision = decideTurnTaking(
          mergedCues,
          transcript,
          isAiSpeaking,
          settingsRef.current.turn_taking_mode
        );

        // Throttle React UI telemetry re-renders to ~14fps (every 70ms) to prevent CPU thread starvation
        const now = Date.now();
        const actionChanged = decision.action !== lastDecisionActionRef.current;
        if (actionChanged || now - lastUiUpdateRef.current > 70) {
          lastUiUpdateRef.current = now;
          lastDecisionActionRef.current = decision.action;
          setVocalCues(mergedCues);
          setTurnDecision(decision);
        }

        // Handle Backchanneling (Natural conversational "Hmm", "Yeah")
        if (
          decision.action === 'BACKCHANNEL' &&
          !isAiSpeaking &&
          settingsRef.current.backchannel_frequency !== 'off'
        ) {
          // Rate limit backchanneling to at most once every 6 seconds
          if (now - lastBackchannelTimeRef.current > 6000) {
            lastBackchannelTimeRef.current = now;
            console.log('[TurnTaking] Triggering gentle backchannel:', decision.backchannel_phrase);
            ttsService.playBackchannel(decision.backchannel_phrase || 'Hmm');
          }
        }

        // Turn-taking is used for telemetry/backchannels, but final-response dispatch is
        // intentionally owned by onFinalTranscript. This prevents the model from replying
        // to an interim/truncated transcript and eliminates duplicate Gemini requests.
      },
      onInterimTranscript: (text) => {
        currentTranscriptRef.current = text;
        setInterimTranscript(text);
        if (visualStateRef.current !== 'SPEAKING' && visualStateRef.current !== 'THINKING') {
          setVisualState('LISTENING');
        }
      },
      onFinalTranscript: (text) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return;
        currentTranscriptRef.current = trimmed;
        setCurrentAccumulatedTranscript(trimmed);
        setInterimTranscript('');

        // If turn-taking hasn't already fired and we are not currently processing/speaking:
        const isAiSpeaking = visualStateRef.current === 'SPEAKING' || ttsService.getIsSpeaking();
        if (!isAiSpeaking && !isProcessingResponseRef.current && isStreamingRef.current) {
          console.log('[App] onFinalTranscript received speech text, triggering response:', trimmed);
          if (audioEngineRef.current) audioEngineRef.current.resetTranscript();
          currentTranscriptRef.current = '';
          setCurrentAccumulatedTranscript('');
          generateCompanionResponse(trimmed, vocalCues);
        }
      },
      onSpeechStart: () => {
        if (visualStateRef.current !== 'SPEAKING' && visualStateRef.current !== 'THINKING') {
          setVisualState('LISTENING');
        }
      },
      onSpeechEnd: () => {
        // Paused
      },
      onInterruptionDetected: () => {
        handleInterruption();
      },
      onError: (err) => {
        console.warn('AudioEngine error callback:', err);
        setErrorBanner(typeof err === 'string' ? err : 'Microphone or audio capture encountered an issue.');
      },
    });

    audioEngineRef.current = engine;

    return () => {
      engine.stop();
      ttsService.cancel();
    };
  }, [handleInterruption, generateCompanionResponse]);

  /**
   * Toggle Live Continuous Audio Listening
   */
  const toggleStreaming = async (): Promise<boolean> => {
    if (!audioEngineRef.current) return false;

    if (isStreaming) {
      audioEngineRef.current.stop();
      ttsService.cancel();
      setIsStreaming(false);
      setVisualState('IDLE');
      setInterimTranscript('');
      return false;
    } else {
      setErrorBanner(null);
      const started = await audioEngineRef.current.start();
      if (started) {
        setIsStreaming(true);
        setVisualState('LISTENING');
        return true;
      }
      return false;
    }
  };

  /**
   * Push-to-Talk handlers: immediate audio recording & instant transcription
   */
  const handlePushToTalkStart = async () => {
    if (!isStreaming) {
      const ok = await toggleStreaming();
      if (!ok) return;
    }
    setIsPushToTalkActive(true);
  };

  const handlePushToTalkEnd = async () => {
    setIsPushToTalkActive(false);
    if (audioEngineRef.current) {
      await audioEngineRef.current.triggerPushToTalkTranscription();
    }
  };

  /**
   * Emergency Stop AI button
   */
  const stopAiSpeech = () => {
    ttsService.cancel();
    if (audioEngineRef.current) audioEngineRef.current.setAiSpeaking(false);
    setVisualState(isStreaming ? 'LISTENING' : 'IDLE');
  };

  /**
   * Reset session
   */
  const handleNewConversation = () => {
    ttsService.cancel();
    setMessages([]);
    setInterimTranscript('');
    setCurrentAccumulatedTranscript('');
    if (audioEngineRef.current) audioEngineRef.current.resetTranscript();
    setVisualState(isStreaming ? 'LISTENING' : 'IDLE');
  };

  /**
   * Keyboard shortcut: Spacebar toggles mic or interrupts
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (visualState === 'SPEAKING') {
          stopAiSpeech();
        } else {
          toggleStreaming();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visualState, isStreaming]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col font-sans bg-geometric-grid selection:bg-teal-500/30 selection:text-teal-200">
      {/* Top Header Bar */}
      <header className="border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-md px-5 lg:px-8 py-3 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 via-cyan-500 to-indigo-600 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-teal-500/20 border border-teal-400/40">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100 tracking-tight">Echo</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-teal-500/10 border border-teal-500/30 text-teal-300 tracking-wide">
                Conversational Intelligence Layer
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block font-normal">
              Real-time speech companion aware of WHAT, HOW, and WHEN you say it
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2">
          {/* Active Voice Provider / Accent Pill */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-teal-950/40 hover:bg-teal-950/60 border border-teal-500/30 text-[11px] text-teal-300 font-mono transition-all shadow-sm"
            title="Configure Rime TTS & British Accent Settings"
          >
            <Volume2 className="w-3.5 h-3.5 text-teal-400 animate-pulse" />
            <span>Rime TTS: British Tone</span>
          </button>

          {/* Architecture Blueprint Button */}
          <button
            onClick={() => setIsArchitectureOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
            title="System Architecture & Roadmaps"
          >
            <Layers className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden md:inline">Architecture</span>
          </button>

          {/* Long-Term Memory Vault */}
          <button
            onClick={() => setIsMemoryOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm relative"
            title="Long-Term Memories"
          >
            <Brain className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Memory Vault</span>
            {memories.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-cyan-600 text-slate-950 text-[9px] font-bold flex items-center justify-center font-mono">
                {memories.length}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all shadow-sm"
            title="Companion Settings"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>

          {/* New Conversation */}
          <button
            onClick={handleNewConversation}
            className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 transition-all shadow-sm"
            title="Start New Conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Multi-Pane Application Workspace */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 max-w-7xl mx-auto w-full">
        {errorBanner && (
          <div className="lg:col-span-12 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between font-mono animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorBanner}</span>
            </div>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-slate-400 hover:text-slate-200 text-xs px-2 py-0.5 rounded hover:bg-slate-800 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Left / Center Column: Stage & Intelligence Telemetry (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* Stage: Reactive AI Avatar & Mic Controls */}
          <div className="bg-slate-900/80 rounded-2xl border border-slate-800/90 p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-xl backdrop-blur-md">
            {/* Geometric alignment corner crosshairs */}
            <div className="absolute top-2.5 left-3 text-slate-700 font-mono text-[11px] select-none pointer-events-none">+</div>
            <div className="absolute top-2.5 right-3 text-slate-700 font-mono text-[11px] select-none pointer-events-none">+</div>
            <div className="absolute bottom-2.5 left-3 text-slate-700 font-mono text-[11px] select-none pointer-events-none">+</div>
            <div className="absolute bottom-2.5 right-3 text-slate-700 font-mono text-[11px] select-none pointer-events-none">+</div>

            {/* Background subtle mesh grid */}
            <div className="absolute inset-0 bg-geometric-dots opacity-40 pointer-events-none" />

            {/* AI Avatar Visualizer */}
            <AvatarVisualizer
              state={visualState}
              rms={vocalCues.rms}
              pitchHz={vocalCues.pitch_hz}
              interrupted={visualState === 'INTERRUPTED'}
            />

            {/* Live Microphone Status & Voice Activity Bar */}
            <div className="w-full max-w-md mt-4 px-4 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col gap-1.5 shadow-inner">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isStreaming
                        ? vocalCues.speech_active
                          ? 'bg-emerald-400 animate-ping'
                          : 'bg-teal-400 animate-pulse'
                        : 'bg-slate-600'
                    }`}
                  />
                  <span className={isStreaming ? 'text-teal-300 font-semibold' : 'text-slate-400'}>
                    {isStreaming
                      ? vocalCues.speech_active
                        ? 'Speech detected! (Speaking)'
                        : 'Microphone Active (Listening)'
                      : 'Microphone Inactive'}
                  </span>
                </div>
                <span className="text-slate-400 text-[10px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {isStreaming
                    ? audioEngineRef.current?.getStatus().hasNativeSpeech
                      ? '⚡ Web Speech Engine'
                      : '✨ Gemini Audio Fallback'
                    : 'Click Start Below'}
                </span>
              </div>

              {/* Dynamic RMS Volume Bar */}
              {isStreaming ? (
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden flex items-center border border-slate-800/80 p-0.5">
                  <div
                    className={`h-full transition-all duration-75 rounded-full ${
                      vocalCues.rms > 0.03
                        ? 'bg-gradient-to-r from-teal-400 to-emerald-400 shadow-sm shadow-emerald-400/50'
                        : 'bg-teal-500/70'
                    }`}
                    style={{ width: `${Math.max(4, Math.min(100, Math.round(vocalCues.rms * 600)))}%` }}
                  />
                </div>
              ) : (
                <p className="text-[10.5px] text-slate-400 leading-tight">
                  Microphone input is inactive. Click <strong className="text-teal-300">Start Voice Companion</strong> to speak hands-free, or hold the button below.
                </p>
              )}
            </div>

            {/* Primary Audio Control Deck */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 z-10">
              {/* Emergency Stop / Barge-in Button */}
              {visualState === 'SPEAKING' && (
                <button
                  onClick={stopAiSpeech}
                  className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-2 shadow-lg transition-all animate-pulse"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Interrupt AI</span>
                </button>
              )}

              {/* Main Microphone Toggle Button */}
              <button
                id="main-mic-button"
                onClick={toggleStreaming}
                className={`px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2.5 shadow-lg transition-all ${
                  isStreaming
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 ring-2 ring-rose-500/30'
                    : 'bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold border border-teal-300/40 shadow-teal-950/30'
                }`}
              >
                {isStreaming ? (
                  <>
                    <MicOff className="w-4 h-4" />
                    <span>Stop Listening</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Start Voice Companion</span>
                  </>
                )}
              </button>

              {/* Push to Talk Hold-to-Speak Button */}
              <button
                id="push-to-talk-button"
                onMouseDown={handlePushToTalkStart}
                onMouseUp={handlePushToTalkEnd}
                onTouchStart={handlePushToTalkStart}
                onTouchEnd={handlePushToTalkEnd}
                className={`px-3.5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 border transition-all select-none ${
                  isPushToTalkActive
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/40 ring-2 ring-amber-400/40'
                    : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
                title="Hold down to record audio, release to instantly send"
              >
                <Radio className={`w-3.5 h-3.5 ${isPushToTalkActive ? 'animate-pulse text-slate-950' : 'text-amber-400'}`} />
                <span>{isPushToTalkActive ? 'Recording Speech...' : 'Push to Talk'}</span>
              </button>

              {/* Mute output toggle */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2.5 rounded-xl border transition-all ${
                  isMuted
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
                title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            <div className="mt-3 text-[11px] text-slate-500 text-center font-mono">
              Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">Space</kbd> to toggle microphone or interrupt speech
            </div>
          </div>

          {/* Section 6: Real-Time Vocal Cue Analysis & Telemetry */}
          <AudioTelemetryPanel cues={vocalCues} isStreaming={isStreaming} />

          {/* Section 7 & 18: Turn-Taking Engine & Benchmark Lab */}
          <TurnTakingInspector
            currentDecision={turnDecision}
            mode={settings.turn_taking_mode}
            onModeChange={(newMode) => setSettings((s) => ({ ...s, turn_taking_mode: newMode }))}
          />
        </div>

        {/* Right Column: Conversational Dialogue Stream (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col h-[750px] lg:h-auto">
          <ConversationStream
            messages={messages}
            interimTranscript={interimTranscript}
            isStreaming={isStreaming}
            vocalCues={vocalCues}
            onReplayAudio={(text) =>
              ttsService.speak(
                text,
                {
                  speaker: settings.rime_speaker || 'albion',
                  modelId: settings.rime_model || 'coda',
                  accent: settings.voice_accent || 'british',
                  rate: settings.speaking_rate,
                },
                settings.voice_provider
              )
            }
            onSendMessage={(text) => generateCompanionResponse(text, vocalCues)}
          />
        </div>
      </main>

      {/* Long-Term Memory Drawer (Section 10 & 20) */}
      <MemoryDrawer
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        memories={memories}
        onAddMemory={(content, category) => {
          memoryEngine.add(content, category);
          setMemories(memoryEngine.getAll());
        }}
        onDeleteMemory={(id) => {
          memoryEngine.remove(id);
          setMemories(memoryEngine.getAll());
        }}
        onClearAll={() => {
          memoryEngine.clearAll();
          setMemories([]);
        }}
        longTermMemoryEnabled={settings.long_term_memory_enabled}
        onToggleMemoryEnabled={(enabled) =>
          setSettings((s) => ({ ...s, long_term_memory_enabled: enabled }))
        }
      />

      {/* Architecture & Engineering Blueprint Modal */}
      <ArchitectureModal
        isOpen={isArchitectureOpen}
        onClose={() => setIsArchitectureOpen(false)}
      />

      {/* Personality & Audio Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) =>
          setSettings((prev) => ({ ...prev, ...newSettings }))
        }
      />
    </div>
  );
}
