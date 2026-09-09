import React, { useState } from 'react';
import { CompanionSettings, CompanionPersonality } from '../types';
import { Settings, Sliders, Volume2, Mic, Languages, Sparkles, X, Play, Check } from 'lucide-react';
import { ttsService } from '../services/ttsService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: CompanionSettings;
  onUpdateSettings: (newSettings: Partial<CompanionSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  if (!isOpen) return null;

  const handleTestVoice = async () => {
    setIsTestingVoice(true);
    try {
      const sampleText =
        settings.voice_accent === 'british'
          ? "Right then! Splendid to meet you. Echo speaking with a warm British accent. I'm listening and ready whenever you are!"
          : "Hello! Echo speaking. I'm listening and ready to chat with you in real time!";

      await ttsService.speak(
        sampleText,
        {
          speaker: settings.rime_speaker || 'albion',
          modelId: settings.rime_model || 'coda',
          accent: settings.voice_accent || 'british',
          rate: settings.speaking_rate || 1.0,
          onEnd: () => setIsTestingVoice(false),
          onInterrupted: () => setIsTestingVoice(false),
        },
        'rime'
      );
    } catch {
      setIsTestingVoice(false);
    }
  };

  const PERSONALITIES: { id: CompanionPersonality; name: string; desc: string }[] = [
    {
      id: 'british_witty',
      name: 'British Witty & Polite',
      desc: 'Charming, articulate British conversationalist with dry wit, polite phrasing, and engaging cadence.',
    },
    {
      id: 'friendly_casual',
      name: 'Friendly & Casual',
      desc: 'Warm, relaxed friend who speaks like a peer with natural humor and casual banter.',
    },
    {
      id: 'warm_curious',
      name: 'Warm & Curious',
      desc: 'Attentive listener who asks thoughtful follow-ups and supports your ideas.',
    },
    {
      id: 'witty_banter',
      name: 'Witty Banter',
      desc: 'Playful, clever, and energetic with witty conversational timing.',
    },
    {
      id: 'zen_listener',
      name: 'Zen & Calm',
      desc: 'Patient, calming presence with spacious pauses and grounding cadence.',
    },
    {
      id: 'intellectual_peer',
      name: 'Tech & Architecture Peer',
      desc: 'Engineering-minded collaborator ready to discuss algorithms, ML, and systems.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-950 border border-slate-800/90 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
              <Settings className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-slate-100 font-mono">Companion & Audio Engine Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 flex flex-col gap-5 max-h-[75vh] overflow-y-auto text-xs text-slate-300">
          {/* Section: Companion Personality */}
          <div>
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mb-2 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              <span>Companion Personality Persona</span>
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PERSONALITIES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onUpdateSettings({ personality: p.id })}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    settings.personality === p.id
                      ? 'bg-teal-950/40 border-teal-500/50 text-slate-100 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/90 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-200 font-mono">{p.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Voice Accent & Tone */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-2 font-mono">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Voice Accent & Cadence</span>
              </label>
              <span className="text-[10px] text-teal-400 font-mono px-1.5 py-0.5 rounded bg-teal-950/60 border border-teal-500/30">
                British Recommended
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'british', name: 'British (UK)', desc: 'RP / warm conversational' },
                { id: 'american', name: 'American (US)', desc: 'Standard North American' },
                { id: 'neutral', name: 'Neutral Crisp', desc: 'Global neutral tone' },
              ].map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onUpdateSettings({ voice_accent: acc.id as any })}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    (settings.voice_accent || 'british') === acc.id
                      ? 'bg-teal-950/40 border-teal-500/50 text-slate-100 shadow-sm'
                      : 'bg-slate-900/60 border-slate-800/90 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-200 font-mono">{acc.name}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{acc.desc}</div>
                </button>
              ))}
            </div>
          </div>

            {/* Section: Rime AI TTS Voice Model */}
            <div className="pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 font-mono">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Rime AI Voice Model</span>
                </label>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-mono border border-teal-500/40">
                  RIME_API_KEY Active
                </span>
              </div>

              {/* Rime Model Architecture Selection */}
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                {[
                  { id: 'coda', name: 'Rime Coda', desc: 'Ultra-low latency (<200ms TTFA) conversational engine' },
                  { id: 'mistv3', name: 'Rime Mist v3', desc: 'Ultra-fast, clear conversational synthesis' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onUpdateSettings({ rime_model: m.id as any })}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      (settings.rime_model || 'coda') === m.id
                        ? 'bg-cyan-950/50 border-cyan-500/60 text-slate-100 shadow-sm ring-1 ring-cyan-400/40'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold text-xs text-slate-200 font-mono flex items-center justify-between">
                      <span>{m.name}</span>
                      {(settings.rime_model || 'coda') === m.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      )}
                    </div>
                    <div className="text-[9px] text-cyan-300/80 mt-0.5 leading-snug">{m.desc}</div>
                  </button>
                ))}
              </div>

              {/* Rime Speaker Character Selection */}
              <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-mono text-slate-200 font-semibold">Rime Speaker Voice</div>
                  <div className="text-[10px] text-slate-400">Conversational timbre and personality</div>
                </div>
                <select
                  value={settings.rime_speaker || 'albion'}
                  onChange={(e) => onUpdateSettings({ rime_speaker: e.target.value })}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-teal-300 font-mono outline-none"
                >
                  <option value="albion">Albion (British English Male)</option>
                  <option value="victoria">Victoria (British English Female)</option>
                  <option value="astra">Astra (Conversational Female)</option>
                  <option value="celeste">Celeste (Warm & Friendly Female)</option>
                  <option value="orion">Orion (Calm & Grounded Male)</option>
                  <option value="lyra">Lyra (Expressive & Clear Female)</option>
                  <option value="masonry">Masonry (Deep & Resonant Male)</option>
                </select>
              </div>
            </div>

          {/* Test Voice Button */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              type="button"
              disabled={isTestingVoice}
              onClick={handleTestVoice}
              className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold font-mono flex items-center justify-center gap-2 transition-all shadow-sm ${
                isTestingVoice
                  ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 cursor-wait animate-pulse'
                  : 'bg-gradient-to-r from-teal-500/15 via-cyan-500/15 to-teal-500/15 hover:from-teal-500/25 hover:to-cyan-500/25 border-teal-500/40 text-teal-300'
              }`}
            >
              {isTestingVoice ? (
                <>
                  <Volume2 className="w-4 h-4 animate-bounce text-teal-400" />
                  <span>Echo is speaking British sample...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Test Voice: "Right then! Echo here..." (British Voice)</span>
                </>
              )}
            </button>
          </div>

          {/* Auto-Speak Responses Toggle */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-200 font-mono text-[11px] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Auto-Speak AI Responses</span>
              </div>
              <div className="text-[10px] text-slate-400">
                Companion speaks responses aloud automatically as they arrive
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUpdateSettings({ auto_speak: !(settings.auto_speak ?? true) })}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                (settings.auto_speak ?? true) ? 'bg-teal-500' : 'bg-slate-800'
              }`}
            >
              <span
                className={`block w-3.5 h-3.5 rounded-full bg-slate-950 transition-transform ${
                  (settings.auto_speak ?? true) ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Section: Speaking Rate */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex justify-between items-center mb-1.5 font-mono">
              <span className="font-medium text-slate-200">Speaking Rate</span>
              <span className="text-teal-300 font-semibold">{settings.speaking_rate.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.4"
              step="0.05"
              value={settings.speaking_rate}
              onChange={(e) => onUpdateSettings({ speaking_rate: parseFloat(e.target.value) })}
              className="w-full accent-teal-500"
            />
          </div>

          {/* Section: Backchannel Frequency */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-200 block mb-1.5 font-mono">
              Backchanneling Cadence ("Hmm", "Yeah", "Right")
            </label>
            <select
              value={settings.backchannel_frequency}
              onChange={(e) => onUpdateSettings({ backchannel_frequency: e.target.value as any })}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-teal-500 font-mono"
            >
              <option value="high">Frequent (Every natural pause &gt; 0.8s)</option>
              <option value="moderate">Moderate (Standard conversational pacing)</option>
              <option value="low">Subtle (Only during long hesitation)</option>
              <option value="off">Off (No backchannel vocalizations)</option>
            </select>
          </div>

          {/* Section: Interruption Sensitivity */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mb-1.5 font-mono">
              <Mic className="w-3.5 h-3.5 text-amber-400" />
              <span>Interruption / Barge-in Sensitivity</span>
            </label>
            <select
              value={settings.interruption_sensitivity}
              onChange={(e) => onUpdateSettings({ interruption_sensitivity: e.target.value as any })}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-teal-500 font-mono"
            >
              <option value="sensitive">Sensitive (Cuts off AI on quietest user syllable)</option>
              <option value="normal">Normal (Standard conversational speech volume)</option>
              <option value="relaxed">Relaxed (Requires firm deliberate speech)</option>
            </select>
          </div>

          {/* Section: Multilingual & Hinglish Mode */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Languages className="w-4 h-4 text-teal-400" />
              <div>
                <div className="font-semibold text-slate-200 font-mono text-[11px]">Hinglish & Multilingual Mode</div>
                <div className="text-[10px] text-slate-400">
                  Naturally understands and responds to blends like "Yaar backend complete nahi hua"
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.multilingual_hinglish}
              onChange={(e) => onUpdateSettings({ multilingual_hinglish: e.target.checked })}
              className="accent-teal-500 w-4 h-4 cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
