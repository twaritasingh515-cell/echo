import React, { useState } from 'react';
import { ChatMessage, VocalCues } from '../types';
import { Bot, User, Volume2, Sparkles, AlertCircle, Clock, Zap, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ConversationStreamProps {
  messages: ChatMessage[];
  interimTranscript: string;
  isStreaming: boolean;
  vocalCues: VocalCues;
  onReplayAudio: (text: string) => void;
  onSendMessage?: (text: string) => void;
}

export const ConversationStream: React.FC<ConversationStreamProps> = ({
  messages,
  interimTranscript,
  isStreaming,
  vocalCues,
  onReplayAudio,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage?.(inputText.trim());
    setInputText('');
  };

  const STARTER_PROMPTS = [
    "Right then, how does your turn-taking logic work?",
    "Fancy a quick chat about real-time speech AI?",
    "Tell me a witty British joke!",
    "How do you know when I'm hesitating vs finished?",
  ];

  return (
    <div
      id="conversation-stream"
      className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800/90 p-4.5 flex flex-col h-full overflow-hidden shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center gap-2">
          <span>Conversational Dialogue & Vocal Metadata</span>
        </h3>
        <span className="text-[11px] text-teal-400 font-mono bg-teal-950/50 border border-teal-500/30 px-2.5 py-0.5 rounded-md">
          British Voice Active
        </span>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3.5 scroll-smooth">
        {messages.length === 0 && !interimTranscript && (
          <div className="text-center py-10 flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200 font-mono">Speak into your mic or pick an icebreaker</p>
              <p className="text-[11px] text-slate-400 max-w-sm mt-1 leading-relaxed">
                Echo speaks itself in real time with an articulate British accent tone, responding to acoustic cues, pauses, and turn yields.
              </p>
            </div>

            {/* Conversational Starter Chips */}
            <div className="flex flex-col gap-2 w-full max-w-md mt-2">
              {STARTER_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage?.(prompt)}
                  className="px-3.5 py-2 rounded-xl bg-slate-950/70 hover:bg-teal-950/40 border border-slate-800/90 hover:border-teal-500/40 text-left text-xs text-slate-300 hover:text-teal-300 font-mono transition-all flex items-center justify-between group shadow-sm"
                >
                  <span>"{prompt}"</span>
                  <Sparkles className="w-3 h-3 text-slate-600 group-hover:text-teal-400 transition-colors shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isAi = msg.sender === 'ai';
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 text-xs ${isAi ? 'justify-start' : 'justify-end'}`}
              >
                {/* AI Avatar icon on left */}
                {isAi && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center text-slate-950 shrink-0 mt-1 shadow-sm">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`flex flex-col gap-1.5 max-w-[85%] ${
                    isAi
                      ? 'bg-slate-950/80 border border-slate-800/90 text-slate-200 rounded-xl rounded-tl-sm p-3.5'
                      : 'bg-teal-950/40 border border-teal-500/30 text-slate-100 rounded-xl rounded-tr-sm p-3.5'
                  }`}
                >
                  {/* Sender Header & Metadata Tags */}
                  <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1 text-[10px] text-slate-400 font-mono">
                    <span className="font-semibold text-slate-300">
                      {isAi ? 'Echo (AI Companion)' : 'You (Friend)'}
                    </span>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Interrupted Tag */}
                      {msg.interrupted && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-semibold">
                          <AlertCircle className="w-2.5 h-2.5" /> Interrupted by user
                        </span>
                      )}

                      {/* Backchannel Tag */}
                      {msg.backchannel && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Backchannel acknowledgement
                        </span>
                      )}

                      {/* Memory Recall Badge */}
                      {msg.extracted_memory && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> Fact Noted
                        </span>
                      )}

                      {/* Timestamp */}
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Message Body */}
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                  {/* Acoustic Telemetry Pill for User Speech */}
                  {!isAi && msg.vocal_cues && (
                    <div className="mt-1 pt-1.5 border-t border-teal-500/20 flex flex-wrap items-center gap-1.5 text-[10px] text-teal-300/80 font-mono">
                      {msg.vocal_cues.pause_duration !== undefined && (
                        <span className="bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
                          Pause: {msg.vocal_cues.pause_duration.toFixed(1)}s
                        </span>
                      )}
                      {msg.vocal_cues.speaking_rate && (
                        <span className="bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
                          Rate: {msg.vocal_cues.speaking_rate} ({msg.vocal_cues.wpm || 130} WPM)
                        </span>
                      )}
                      {msg.vocal_cues.pitch_hz && (
                        <span className="bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-800">
                          F₀: {msg.vocal_cues.pitch_hz}Hz
                        </span>
                      )}
                      {msg.vocal_cues.hesitation && (
                        <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                          Hesitation Detected
                        </span>
                      )}
                    </div>
                  )}

                  {/* AI Response Latency & Replay */}
                  {isAi && (
                    <div className="mt-1 pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      {msg.latency_ms?.total ? (
                        <span className="flex items-center gap-1 text-teal-400">
                          <Zap className="w-2.5 h-2.5" /> Total Latency: {msg.latency_ms.total}ms
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">{msg.tone || 'warm'}</span>
                      )}
                      <button
                        onClick={() => onReplayAudio(msg.text)}
                        className="text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                        title="Replay Voice"
                      >
                        <Volume2 className="w-3 h-3" />
                        <span>Replay</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* User avatar on right */}
                {!isAi && (
                  <div className="w-7 h-7 rounded-lg bg-slate-800/90 flex items-center justify-center text-slate-300 shrink-0 mt-1 border border-slate-700/80">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Live Interim Streaming Bubble */}
        {interimTranscript && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-end gap-3 text-xs"
          >
            <div className="bg-teal-950/30 border border-teal-500/40 text-teal-200 rounded-xl rounded-tr-sm p-3 max-w-[85%] animate-pulse">
              <div className="text-[10px] text-teal-400 font-mono font-semibold mb-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping" />
                <span>Live Streaming Audio Recognition:</span>
              </div>
              <p className="italic font-sans">{interimTranscript}...</p>
            </div>
            <div className="w-7 h-7 rounded-lg bg-teal-600/20 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0 mt-1">
              <User className="w-4 h-4" />
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick Prompt Input Bar */}
      <form onSubmit={handleSend} className="pt-3 border-t border-slate-800/80 mt-2 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Speak into mic or type message here..."
          className="flex-1 bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 font-sans outline-none focus:border-teal-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 disabled:opacity-40 disabled:hover:bg-teal-500/20 transition-all cursor-pointer disabled:cursor-not-allowed"
          title="Send message (Echo will speak response)"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
