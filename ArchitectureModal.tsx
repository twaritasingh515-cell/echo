import React, { useState } from 'react';
import { Layers, Zap, Cpu, Activity, GitBranch, ArrowRight, Code2, Server, Volume2, ShieldCheck, X } from 'lucide-react';

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'latency' | 'phases' | 'stack'>('pipeline');

  if (!isOpen) return null;

  const PIPELINE_LAYERS = [
    {
      num: '01',
      title: 'Microphone & Real-Time Audio Layer',
      tech: 'Web Audio API / WebRTC',
      role: 'Continuous 16kHz audio stream buffer, echo cancellation, AGC, and noise suppression.',
      color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
    },
    {
      num: '02',
      title: 'Voice Activity Detection (VAD) & Audio Processing',
      tech: 'Silero VAD / Time-Domain Energy Analyser',
      role: 'Sub-20ms speech start/end boundary detection, continuous pause duration tracking, and instant acoustic barge-in triggers.',
      color: 'border-sky-500/40 text-sky-400 bg-sky-500/10',
    },
    {
      num: '03',
      title: 'Streaming ASR + Vocal Cue Analysis',
      tech: 'Streaming Speech Recognition + Autocorrelation Pitch & Prosody Estimator',
      role: 'Joint linguistic + acoustic extraction: Pitch F₀ (Hz), energy contour, speaking rate (WPM), hesitation tokens, and connector detection.',
      color: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10',
    },
    {
      num: '04',
      title: 'Conversation Intelligence Engine (CIE)',
      tech: 'Turn-Taking Softmax Net + Vector Memory Retrieval + Gemini 3.8 Flash',
      role: 'Decides: WAIT, RESPOND, BACKCHANNEL, or STOP. Computes continuation probability and prevents cutting off hesitant speakers.',
      color: 'border-purple-500/40 text-purple-400 bg-purple-500/10',
    },
    {
      num: '05',
      title: 'Response Controller',
      tech: 'Conversational Style & Length Governor',
      role: 'Adjusts verbosity, injects backchannels ("Hmm", "Yeah"), throttles latency, and handles instant interruption cancellation.',
      color: 'border-amber-500/40 text-amber-400 bg-amber-500/10',
    },
    {
      num: '06',
      title: 'Modular Voice Synthesis Layer',
      tech: 'Rime TTS API / Gemini TTS / Neural Browser Engine',
      role: 'Ultra-low time-to-first-audio (TTFA < 180ms), natural emotional prosody, and chunked audio streaming.',
      color: 'border-rose-500/40 text-rose-400 bg-rose-500/10',
    },
    {
      num: '07',
      title: 'Low-Latency Audio Playback & Barge-In Sink',
      tech: 'Web Audio Output Sink / WebRTC Audio Track',
      role: 'Plays voice to speaker. Instantly clears PCM buffers within 60ms when interruption is detected.',
      color: 'border-teal-500/40 text-teal-400 bg-teal-500/10',
    },
  ];

  const PHASES = [
    { phase: 1, title: 'Text Chatbot baseline', status: 'completed' },
    { phase: 2, title: 'Microphone → ASR → LLM pipeline', status: 'completed' },
    { phase: 3, title: 'Modular TTS voice layer', status: 'completed' },
    { phase: 4, title: 'Streaming audio processing', status: 'completed' },
    { phase: 5, title: 'Continuous VAD & boundary tracking', status: 'completed' },
    { phase: 6, title: 'Pause & end-of-turn duration detection', status: 'completed' },
    { phase: 7, title: 'Conversational Intelligence Engine (CIE)', status: 'completed' },
    { phase: 8, title: 'Sub-80ms Interruption / Barge-in handling', status: 'completed' },
    { phase: 9, title: 'Vocal feature analysis (Pitch, Energy, Rate)', status: 'completed' },
    { phase: 10, title: 'Short-term conversational context memory', status: 'completed' },
    { phase: 11, title: 'Long-term retrieval-based memory vault', status: 'completed' },
    { phase: 12, title: 'Personality engine & cadence adaptation', status: 'completed' },
    { phase: 13, title: 'Multilingual & Hinglish speech understanding', status: 'completed' },
    { phase: 14, title: 'Conversational dataset schema & collector', status: 'completed' },
    { phase: 15, title: 'Custom Neural Turn-Taking Softmax model', status: 'completed' },
    { phase: 16, title: 'Rule-based vs ML Softmax benchmarking', status: 'completed' },
    { phase: 17, title: 'End-to-end latency budget optimization', status: 'completed' },
    { phase: 18, title: 'Production deployment architecture', status: 'ready' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800/90 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-mono">
                Echo Real-Time Conversational Architecture
              </h2>
              <p className="text-xs text-slate-400">
                Production-grade Voice AI Companion with Conversational Intelligence Layer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800/80 bg-slate-900/40 px-5 gap-4 text-xs font-medium font-mono">
          {[
            { id: 'pipeline', label: '7-Layer Architecture', icon: Layers },
            { id: 'latency', label: 'Latency Budget & Observability', icon: Zap },
            { id: 'phases', label: '18 Development Phases', icon: GitBranch },
            { id: 'stack', label: 'Production Backend (Pipecat/FastAPI)', icon: Server },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-3 flex items-center gap-2 border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-teal-400 text-teal-300 font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
          {activeTab === 'pipeline' && (
            <div className="flex flex-col gap-4">
              <div className="p-3.5 rounded-xl bg-teal-950/20 border border-teal-500/30 text-xs text-teal-200 leading-relaxed font-sans">
                <strong className="text-teal-300 font-mono">Core Architectural Differentiator:</strong> Unlike basic chatbots (Mic → STT → LLM → TTS),
                Echo operates a <strong className="text-teal-300">Conversational Intelligence Layer (CIE)</strong>. It simultaneously extracts
                WHAT is said and HOW it is said (Pitch, Energy, Cadence, Hesitation) to calculate continuation probability
                and make sub-second decisions on <strong className="text-cyan-300 font-mono">WAIT, RESPOND, BACKCHANNEL, or STOP</strong>.
              </div>

              <div className="flex flex-col gap-2.5">
                {PIPELINE_LAYERS.map((layer) => (
                  <div
                    key={layer.num}
                    className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/90 flex items-start gap-4 hover:border-slate-700 transition-colors shadow-sm"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center text-xs font-mono font-bold shrink-0 ${layer.color}`}
                    >
                      {layer.num}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-slate-200 font-mono">{layer.title}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-400">
                          {layer.tech}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">{layer.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'latency' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'VAD Processing', budget: '15 - 25 ms', target: '< 30ms' },
                  { label: 'Turn-Taking Decision', budget: '20 - 45 ms', target: '< 50ms' },
                  { label: 'LLM Time-to-First-Token', budget: '180 - 260 ms', target: '< 300ms' },
                  { label: 'Interruption Barge-In', budget: '50 - 75 ms', target: '< 80ms' },
                ].map((item, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 shadow-sm">
                    <div className="text-[11px] text-slate-400 font-mono">{item.label}</div>
                    <div className="text-sm font-mono font-bold text-teal-300 mt-1">{item.budget}</div>
                    <div className="text-[10px] text-cyan-400 mt-0.5 font-mono">SLA: {item.target}</div>
                  </div>
                ))}
              </div>

              <div className="bg-slate-900/80 p-4.5 rounded-xl border border-slate-800/90 flex flex-col gap-3 shadow-sm">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                  End-to-End Conversational Timeline (Target: &lt; 550ms Voice-to-Ear)
                </h4>
                <div className="relative pt-2 pb-1">
                  <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex text-[8px] font-mono font-bold text-slate-950 border border-slate-800">
                    <div style={{ width: '6%' }} className="bg-teal-400 flex items-center justify-center">VAD</div>
                    <div style={{ width: '22%' }} className="bg-cyan-400 flex items-center justify-center">ASR (120ms)</div>
                    <div style={{ width: '8%' }} className="bg-indigo-400 flex items-center justify-center">CIE (35ms)</div>
                    <div style={{ width: '40%' }} className="bg-teal-300 flex items-center justify-center">Gemini TTFT (220ms)</div>
                    <div style={{ width: '24%' }} className="bg-rose-400 flex items-center justify-center">TTS Audio (130ms)</div>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 mt-2.5 font-mono">
                    <span>0ms (User stops)</span>
                    <span className="text-cyan-400">Turn Recognized (160ms)</span>
                    <span className="text-teal-400">Response Started (380ms)</span>
                    <span className="text-rose-400">First Audio Heard (510ms)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'phases' && (
            <div className="flex flex-col gap-3">
              <div className="text-xs text-slate-400 font-mono">
                Tracking implementation against the 18 architectural milestones defined in Section 26:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PHASES.map((p) => (
                  <div
                    key={p.phase}
                    className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/90 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-teal-500/15 border border-teal-500/30 text-teal-400 font-mono text-[10px] font-bold flex items-center justify-center">
                        {p.phase}
                      </span>
                      <span className="text-slate-300">{p.title}</span>
                    </div>
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-teal-500/15 text-teal-300 border border-teal-500/30">
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'stack' && (
            <div className="flex flex-col gap-4 text-xs text-slate-300 leading-relaxed">
              <p>
                For cloud-scale multi-user deployment (LiveKit / Pipecat / WebRTC), the client communicates via
                WebRTC datachannels & audio tracks with a Python FastAPI orchestrator.
              </p>

              <div className="bg-slate-900/90 p-4 rounded-xl border border-slate-800/90 font-mono text-[11px] text-slate-300 overflow-x-auto shadow-sm">
                <div className="text-teal-400 mb-1"># Python FastAPI + Pipecat Turn-Taking Orchestration:</div>
                <pre>{`from pipecat.services.rime import RimeTTSService
from pipecat.vad.silero import SileroVAD
from pipecat.pipeline.pipeline import Pipeline

vad = SileroVAD(sample_rate=16000, threshold=0.035)
turn_engine = ConversationalIntelligenceEngine(
    pause_threshold=1.4,
    continuation_prob_threshold=0.65,
    backchannel_enabled=True
)

async def on_user_speech_frame(frame):
    vocal_cues = extract_prosody(frame.audio)
    decision = turn_engine.evaluate(vocal_cues, frame.transcript)
    if decision.action == "STOP":
        await rime_tts.cancel_ongoing()
    elif decision.action == "BACKCHANNEL":
        await rime_tts.stream_backchannel(decision.phrase)`}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
