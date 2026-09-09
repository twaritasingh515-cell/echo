import React, { useState } from 'react';
import { TurnAction, TurnDecision, VocalCues } from '../types';
import { Bot, BrainCircuit, CheckCircle2, ChevronRight, HelpCircle, Play, Sliders, Volume2, Zap } from 'lucide-react';
import { analyzeSentenceCompleteness, decideTurnTaking } from '../services/turnTakingEngine';

interface TurnTakingInspectorProps {
  currentDecision: TurnDecision;
  mode: 'hybrid_ml' | 'rule_based' | 'neural_network';
  onModeChange: (mode: 'hybrid_ml' | 'rule_based' | 'neural_network') => void;
  onSimulateScenario?: (transcript: string, pause: number, hesitant: boolean) => void;
}

export const TurnTakingInspector: React.FC<TurnTakingInspectorProps> = ({
  currentDecision,
  mode,
  onModeChange,
  onSimulateScenario,
}) => {
  const [activeTab, setActiveTab] = useState<'live' | 'simulator'>('live');

  // Simulation state
  const [simText, setSimText] = useState('I was actually thinking that maybe...');
  const [simPause, setSimPause] = useState(1.4);
  const [simHesitation, setSimHesitation] = useState(true);
  const [simRate, setSimRate] = useState<'slow' | 'medium' | 'fast'>('slow');
  const [simAiSpeaking, setSimAiSpeaking] = useState(false);

  // Compute simulation decision
  const simCompleteness = analyzeSentenceCompleteness(simText, {
    hesitation: simHesitation,
    speaking_rate: simRate,
  });

  const simCues: VocalCues = {
    speech_active: false,
    pause_duration: simPause,
    speaking_rate: simRate,
    wpm: simRate === 'slow' ? 95 : simRate === 'fast' ? 175 : 130,
    energy: 'medium',
    rms: 0.02,
    pitch_hz: 140,
    pitch_variation: 'low',
    hesitation: simCompleteness.hesitation,
    filler_words: simCompleteness.filler_words,
    sentence_complete: simCompleteness.sentence_complete,
    continuation_probability: simCompleteness.continuation_probability,
    is_question: simCompleteness.is_question,
    is_interruption: simAiSpeaking,
  };

  const simDecision = decideTurnTaking(simCues, simText, simAiSpeaking, mode);

  // Color mapper for TurnAction
  const getActionStyle = (action: TurnAction) => {
    switch (action) {
      case 'RESPOND':
        return {
          bg: 'bg-teal-500/15 text-teal-300 border-teal-500/40',
          dot: 'bg-teal-400',
          desc: 'Turn handed off: AI generates & delivers spoken response.',
        };
      case 'WAIT':
        return {
          bg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
          dot: 'bg-cyan-400',
          desc: 'Hesitation/continuation detected: AI waits patiently without interrupting.',
        };
      case 'BACKCHANNEL':
        return {
          bg: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400',
          desc: 'Thought pause detected: gentle vocal acknowledgement ("Hmm", "Yeah") without seizing the turn.',
        };
      case 'STOP':
        return {
          bg: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-400',
          desc: 'Barge-in / Interruption: immediately cancel TTS audio & yield to speaker.',
        };
    }
  };

  const decisionToRender = activeTab === 'live' ? currentDecision : simDecision;
  const actionStyle = getActionStyle(decisionToRender.action);

  // Preset scenarios to test Turn-Taking capabilities
  const PRESET_SCENARIOS = [
    {
      title: 'Hesitation Pause',
      text: 'I was actually thinking that maybe...',
      pause: 1.4,
      hesitant: true,
      rate: 'slow' as const,
      expected: 'WAIT',
      note: 'Speaker ended on connector with hesitation. Standard bot would cut off; Echo WAITS.',
    },
    {
      title: 'Definite Question',
      text: 'Do you think I should change my project?',
      pause: 0.9,
      hesitant: false,
      rate: 'medium' as const,
      expected: 'RESPOND',
      note: 'Grammatically complete question. System triggers instant response.',
    },
    {
      title: 'Mid-Story Storytelling',
      text: 'So last night I was debugging the audio pipeline and then...',
      pause: 1.1,
      hesitant: true,
      rate: 'medium' as const,
      expected: 'BACKCHANNEL',
      note: 'User pausing mid-thought. Echo backchannels ("Hmm", "Yeah") without stealing turn.',
    },
    {
      title: 'User Barge-in (Interruption)',
      text: 'Wait, no, hold on a second!',
      pause: 0.0,
      hesitant: false,
      rate: 'fast' as const,
      aiSpeaking: true,
      expected: 'STOP',
      note: 'User speaks over AI audio. Echo immediately cuts voice playback.',
    },
    {
      title: 'Casual Hinglish Statement',
      text: 'Yaar basically project ka backend complete nahi hua toh...',
      pause: 1.2,
      hesitant: true,
      rate: 'medium' as const,
      expected: 'WAIT',
      note: 'Hinglish trailing connector ("toh..."). Engine understands conversational cadence.',
    },
  ];

  return (
    <div
      id="turn-taking-inspector"
      className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800/90 p-4.5 flex flex-col gap-4 shadow-lg"
    >
      {/* Header with Mode Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Conversational Turn-Taking Engine
          </h3>
        </div>

        {/* Tab & Mode Switcher */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex rounded-lg bg-slate-950/80 p-0.5 border border-slate-800">
            <button
              onClick={() => setActiveTab('live')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                activeTab === 'live'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live Monitor
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'simulator'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-3 h-3" />
              Scenario Lab
            </button>
          </div>
        </div>
      </div>

      {/* Main Decision Highlight Card */}
      <div className="bg-slate-950/70 rounded-xl p-4 border border-slate-800/90 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">Current Turn Decision:</div>
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
            Engine Mode:
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as any)}
              className="bg-slate-900/90 text-slate-200 border border-slate-700/80 rounded-md px-2 py-0.5 text-[11px] font-mono outline-none focus:border-teal-500"
            >
              <option value="hybrid_ml">Hybrid (ML + Heuristic Consensus)</option>
              <option value="neural_network">Custom Neural TurnNet (Softmax)</option>
              <option value="rule_based">Acoustic & Lexical Rules</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border font-mono flex items-center gap-2 ${actionStyle.bg}`}
            >
              <span className={`w-2 h-2 rounded-full ${actionStyle.dot} animate-pulse`} />
              {decisionToRender.action}
            </span>
            <div className="text-xs text-slate-300 font-mono">
              Confidence: {Math.round(decisionToRender.confidence * 100)}%
            </div>
          </div>

          {decisionToRender.backchannel_phrase && (
            <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono">
              <Volume2 className="w-3.5 h-3.5" />
              <span>Backchannel: "{decisionToRender.backchannel_phrase}"</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-300 italic bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 font-mono">
          {decisionToRender.reason}
        </p>

        {/* Softmax Probability Distribution (P(WAIT), P(RESPOND), P(BACKCHANNEL), P(STOP)) */}
        <div className="mt-1">
          <div className="flex justify-between text-[11px] text-slate-400 mb-1.5 font-mono">
            <span>Neural Classification Logits (Softmax):</span>
            <span className="text-slate-300">Section 18 Architecture</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              {
                label: 'WAIT',
                prob: decisionToRender.probabilities.wait,
                barColor: 'bg-cyan-400',
              },
              {
                label: 'RESPOND',
                prob: decisionToRender.probabilities.respond,
                barColor: 'bg-teal-400',
              },
              {
                label: 'BACKCHANNEL',
                prob: decisionToRender.probabilities.backchannel,
                barColor: 'bg-amber-400',
              },
              {
                label: 'STOP',
                prob: decisionToRender.probabilities.stop,
                barColor: 'bg-rose-400',
              },
            ].map((item) => (
              <div key={item.label} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800/90">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                  <span className="font-medium">{item.label}</span>
                  <span className="font-bold text-slate-200">
                    {(item.prob * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.barColor} transition-all duration-200 rounded-full`}
                    style={{ width: `${Math.min(100, item.prob * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Heuristic vs ML comparison */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/80 font-mono">
          <div className="flex items-center gap-2">
            <span>Rule Engine: <strong className="text-slate-200">{decisionToRender.rule_based_decision}</strong></span>
            <span>•</span>
            <span>ML Softmax: <strong className="text-slate-200">{decisionToRender.ml_based_decision}</strong></span>
          </div>
          {decisionToRender.model_divergence ? (
            <span className="text-amber-400 font-medium">Nuance disagreement resolved via consensus</span>
          ) : (
            <span className="text-teal-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Full Model Consensus
            </span>
          )}
        </div>
      </div>

      {/* Interactive Scenario Lab Tab */}
      {activeTab === 'simulator' && (
        <div className="bg-slate-950/70 rounded-xl p-3.5 border border-slate-800/90 flex flex-col gap-3">
          <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 font-mono">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Interactive Turn-Taking Benchmark Lab</span>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {PRESET_SCENARIOS.map((scen, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setSimText(scen.text);
                  setSimPause(scen.pause);
                  setSimHesitation(scen.hesitant);
                  setSimRate(scen.rate);
                  setSimAiSpeaking(Boolean(scen.aiSpeaking));
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition-all flex items-center gap-1 font-mono"
              >
                <Play className="w-2.5 h-2.5 text-teal-400" />
                <span>{scen.title}</span>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2.5 text-xs text-slate-300 font-mono">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Simulated User Speech Transcript:</label>
              <input
                type="text"
                value={simText}
                onChange={(e) => setSimText(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-teal-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Pause Duration: <span className="text-teal-300">{simPause.toFixed(1)}s</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.1"
                  value={simPause}
                  onChange={(e) => setSimPause(parseFloat(e.target.value))}
                  className="w-full accent-teal-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Speech Cadence / Rate:</label>
                <select
                  value={simRate}
                  onChange={(e) => setSimRate(e.target.value as any)}
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 outline-none focus:border-teal-500"
                >
                  <option value="slow">Slow & Hesitant (95 WPM)</option>
                  <option value="medium">Normal Conversational (130 WPM)</option>
                  <option value="fast">Fast & Energetic (175 WPM)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simHesitation}
                    onChange={(e) => setSimHesitation(e.target.checked)}
                    className="accent-teal-500"
                  />
                  <span className="text-[11px] text-slate-300">Hesitation Marker</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simAiSpeaking}
                    onChange={(e) => setSimAiSpeaking(e.target.checked)}
                    className="accent-rose-500"
                  />
                  <span className="text-[11px] text-rose-300">AI Is Speaking</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
