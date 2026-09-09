import React from 'react';
import { VocalCues } from '../types';
import { Activity, Clock, Gauge, Mic, Sparkles, Volume2, Waves } from 'lucide-react';

interface AudioTelemetryPanelProps {
  cues: VocalCues;
  isStreaming: boolean;
}

export const AudioTelemetryPanel: React.FC<AudioTelemetryPanelProps> = ({
  cues,
  isStreaming,
}) => {
  // Color mapping for energy
  const getEnergyColor = () => {
    switch (cues.energy) {
      case 'high':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'medium':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      default:
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    }
  };

  // Color mapping for speaking rate
  const getRateColor = () => {
    switch (cues.speaking_rate) {
      case 'fast':
        return 'text-orange-400';
      case 'slow':
        return 'text-indigo-400';
      default:
        return 'text-sky-400';
    }
  };

  return (
    <div
      id="vocal-telemetry-panel"
      className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800/90 p-4.5 flex flex-col gap-3.5 shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-teal-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Acoustic & Vocal Cue Telemetry
          </h3>
        </div>
        <span
          className={`text-[10px] px-2.5 py-0.5 rounded-md font-mono font-medium flex items-center gap-1.5 ${
            isStreaming
              ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
              : 'bg-slate-800/80 text-slate-400 border border-slate-700/60'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isStreaming ? 'bg-teal-400 animate-ping' : 'bg-slate-500'
            }`}
          />
          {isStreaming ? 'Live Audio Stream' : 'Standby'}
        </span>
      </div>

      {/* Grid of Key Acoustic Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        {/* Metric 1: VAD & RMS Energy */}
        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Mic className="w-3.5 h-3.5 text-slate-400" /> VAD Speech
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                cues.speech_active
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/50'
              }`}
            >
              {cues.speech_active ? 'ACTIVE' : 'SILENCE'}
            </span>
          </div>
          <div className="mt-1">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1">
              <span>RMS Energy</span>
              <span className="font-mono text-slate-200">{(cues.rms * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-teal-400 via-cyan-400 to-sky-400 transition-all duration-100 rounded-full"
                style={{ width: `${Math.min(100, cues.rms * 500)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 2: Pause Duration & Boundary Timer */}
        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" /> Pause Timer
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                cues.pause_duration > 1.4
                  ? 'text-cyan-400'
                  : cues.pause_duration > 0.7
                  ? 'text-amber-400'
                  : 'text-slate-400'
              }`}
            >
              {cues.pause_duration.toFixed(1)}s
            </span>
          </div>
          <div className="mt-1">
            <div className="flex justify-between text-[9px] text-slate-500 mb-1 font-mono">
              <span>0s</span>
              <span className="text-amber-400/90">0.8s (ack)</span>
              <span className="text-cyan-400/90">1.4s (turn)</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-150 rounded-full ${
                  cues.pause_duration > 1.4
                    ? 'bg-cyan-400'
                    : cues.pause_duration > 0.7
                    ? 'bg-amber-400'
                    : 'bg-teal-400'
                }`}
                style={{ width: `${Math.min(100, (cues.pause_duration / 2.0) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Metric 3: Pitch & Intonation */}
        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Waves className="w-3.5 h-3.5 text-cyan-400" /> Pitch (F₀)
            </span>
            <span className="font-mono text-slate-200 font-semibold">
              {cues.pitch_hz > 0 ? `${cues.pitch_hz} Hz` : '--'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-400 font-mono">Prosody</span>
            <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/60 text-slate-300 font-mono">
              {cues.pitch_variation} variation
            </span>
          </div>
        </div>

        {/* Metric 4: Speaking Cadence & Hesitation */}
        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800/90 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
            <span className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-teal-400" /> Speech Rate
            </span>
            <span className={`font-mono text-xs font-bold ${getRateColor()}`}>
              {cues.wpm > 0 ? `${cues.wpm} WPM` : '--'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/80">
            <span className="text-[10px] text-slate-400 font-mono">Hesitation</span>
            <span
              className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded ${
                cues.hesitation
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-slate-800/80 text-slate-400 border border-slate-700/50'
              }`}
            >
              {cues.hesitation ? 'DETECTED' : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Continuation Probability Gauge (Section 5 & 6) */}
      <div className="bg-slate-950/70 rounded-xl p-3.5 border border-slate-800/90 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-xs font-mono ${
              cues.continuation_probability > 0.65
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-teal-500/15 text-teal-300 border border-teal-500/40'
            }`}
          >
            {Math.round(cues.continuation_probability * 100)}%
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span className="font-mono">Continuation Probability</span>
              {cues.continuation_probability > 0.65 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 font-mono">
                  User likely to continue speaking
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-500/10 text-teal-300 border border-teal-500/30 font-mono">
                  Turn completion imminent
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Joint acoustic + lexical inference: prevents AI from cutting off speaker during hesitation.
            </p>
          </div>
        </div>

        {/* Sentence Completeness Tag */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="text-[11px] text-slate-400 font-mono">Sentence:</span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-md font-mono font-medium ${
              cues.sentence_complete
                ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                : 'bg-slate-800/90 text-slate-400 border border-slate-700/60'
            }`}
          >
            {cues.sentence_complete ? 'Complete' : 'Incomplete'}
          </span>
        </div>
      </div>
    </div>
  );
};
