import React from 'react';
import { motion } from 'motion/react';
import { VisualState } from '../types';
import { Mic, Volume2, Sparkles, AlertCircle, Loader2, PauseCircle } from 'lucide-react';

interface AvatarVisualizerProps {
  state: VisualState;
  rms: number;
  pitchHz: number;
  interrupted: boolean;
}

export const AvatarVisualizer: React.FC<AvatarVisualizerProps> = ({
  state,
  rms,
  pitchHz,
  interrupted,
}) => {
  // Compute dynamic scale based on acoustic RMS
  const micPulseScale = Math.min(1.4, 1.0 + rms * 3.5);
  const glowOpacity = Math.min(0.9, 0.2 + rms * 2.5);

  const getStatusBadge = () => {
    switch (state) {
      case 'LISTENING':
        return {
          icon: <Mic className="w-3.5 h-3.5 text-teal-400 animate-pulse" />,
          label: 'Listening to your voice...',
          color: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
        };
      case 'THINKING':
        return {
          icon: <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />,
          label: 'Analyzing vocal context & turn-taking...',
          color: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
        };
      case 'SPEAKING':
        return {
          icon: <Volume2 className="w-3.5 h-3.5 text-sky-400 animate-pulse" />,
          label: 'Echo speaking (Interruptible anytime)',
          color: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
        };
      case 'INTERRUPTED':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />,
          label: 'Barge-in: AI stopped immediately',
          color: 'bg-amber-500/15 border-amber-500/35 text-amber-300',
        };
      case 'PROCESSING':
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />,
          label: 'Evaluating conversational timing',
          color: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
        };
      case 'IDLE':
      default:
        return {
          icon: <PauseCircle className="w-3.5 h-3.5 text-slate-400" />,
          label: 'Ready — Click mic or spacebar to speak',
          color: 'bg-slate-900/90 border-slate-800 text-slate-300',
        };
    }
  };

  const status = getStatusBadge();

  return (
    <div id="avatar-visualizer-container" className="flex flex-col items-center justify-center p-6 select-none">
      {/* Central Visualizer Stage */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* Outermost ambient field */}
        <motion.div
          className="absolute inset-0 rounded-full blur-3xl pointer-events-none"
          style={{
            background:
              state === 'SPEAKING'
                ? 'radial-gradient(circle, rgba(14, 165, 233, 0.35) 0%, rgba(6, 182, 212, 0.05) 70%)'
                : state === 'LISTENING'
                ? 'radial-gradient(circle, rgba(20, 184, 166, 0.35) 0%, rgba(13, 148, 136, 0.05) 70%)'
                : state === 'INTERRUPTED'
                ? 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, rgba(217, 119, 6, 0.05) 70%)'
                : state === 'THINKING'
                ? 'radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(99, 102, 241, 0.05) 70%)'
                : 'radial-gradient(circle, rgba(20, 184, 166, 0.12) 0%, rgba(15, 23, 42, 0) 70%)',
            opacity: glowOpacity,
          }}
          animate={{
            scale: state === 'LISTENING' ? micPulseScale : [1, 1.06, 1],
          }}
          transition={{
            repeat: state === 'LISTENING' ? 0 : Infinity,
            duration: 3,
            ease: 'easeInOut',
          }}
        />

        {/* Orbit Ring 1 (Listening / Speaking) */}
        <motion.div
          className={`absolute inset-4 rounded-full border border-dashed transition-colors duration-500 ${
            state === 'SPEAKING'
              ? 'border-sky-400/40'
              : state === 'LISTENING'
              ? 'border-teal-400/40'
              : state === 'INTERRUPTED'
              ? 'border-amber-400/60'
              : 'border-slate-800'
          }`}
          animate={{
            rotate: state === 'THINKING' ? 360 : 180,
            scale: state === 'LISTENING' ? Math.max(1, micPulseScale * 0.98) : 1,
          }}
          transition={{
            rotate: {
              repeat: Infinity,
              duration: state === 'THINKING' ? 4 : 24,
              ease: 'linear',
            },
          }}
        />

        {/* Orbit Ring 2 (Counter-rotation) */}
        <motion.div
          className={`absolute inset-10 rounded-full border transition-colors duration-500 ${
            state === 'SPEAKING'
              ? 'border-cyan-300/30'
              : state === 'LISTENING'
              ? 'border-teal-300/30'
              : 'border-slate-800/60'
          }`}
          animate={{
            rotate: -360,
          }}
          transition={{
            repeat: Infinity,
            duration: 32,
            ease: 'linear',
          }}
        />

        {/* Ripple Waveforms when speaking or listening */}
        {(state === 'SPEAKING' || state === 'LISTENING') && (
          <motion.div
            className={`absolute inset-6 rounded-full border ${
              state === 'SPEAKING' ? 'border-sky-400/30' : 'border-teal-400/30'
            }`}
            animate={{
              scale: [1, 1.35],
              opacity: [0.7, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: state === 'SPEAKING' ? 1.4 : 1.8,
              ease: 'easeOut',
            }}
          />
        )}

        {/* Core Animated Avatar Orb */}
        <motion.div
          id="avatar-core-orb"
          className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-2xl overflow-hidden cursor-pointer border border-slate-700/50"
          style={{
            background:
              state === 'SPEAKING'
                ? 'linear-gradient(135deg, #0d9488 0%, #0891b2 50%, #0369a1 100%)'
                : state === 'LISTENING'
                ? 'linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #047857 100%)'
                : state === 'INTERRUPTED'
                ? 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #78350f 100%)'
                : state === 'THINKING'
                ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #312e81 100%)'
                : 'linear-gradient(135deg, #1e293b 0%, #0f172a 70%, #020617 100%)',
          }}
          animate={{
            scale:
              state === 'LISTENING'
                ? micPulseScale
                : state === 'SPEAKING'
                ? [1, 1.05, 0.98, 1.04, 1]
                : [1, 1.02, 1],
          }}
          transition={{
            scale: {
              repeat: state === 'LISTENING' ? 0 : Infinity,
              duration: state === 'SPEAKING' ? 1.2 : 4,
              ease: 'easeInOut',
            },
          }}
        >
          {/* Inner Light Core Reflection */}
          <div className="absolute -top-6 -left-6 w-24 h-24 bg-white/15 rounded-full blur-xl pointer-events-none" />

          {/* Animated Center Symbol or Audio Bars */}
          {state === 'SPEAKING' ? (
            <div className="flex items-center gap-1.5 z-10">
              {[0.4, 0.9, 0.6, 1.0, 0.5].map((h, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 bg-white rounded-full"
                  animate={{
                    height: [12, 34 * h, 12],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.6 + i * 0.1,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
          ) : state === 'LISTENING' ? (
            <div className="flex flex-col items-center gap-1 z-10 text-teal-100">
              <Mic className="w-8 h-8 drop-shadow" />
              <span className="text-[10px] font-medium tracking-wide uppercase text-teal-200/90 font-mono">
                {rms > 0.03 ? 'Hearing You' : 'Listening'}
              </span>
            </div>
          ) : state === 'THINKING' ? (
            <div className="flex flex-col items-center gap-1.5 z-10 text-cyan-100">
              <Sparkles className="w-8 h-8 animate-spin" />
              <span className="text-[10px] font-medium tracking-wide uppercase text-cyan-200/90 font-mono">
                Thinking
              </span>
            </div>
          ) : state === 'INTERRUPTED' ? (
            <div className="flex flex-col items-center gap-1 z-10 text-amber-100">
              <AlertCircle className="w-8 h-8 animate-bounce" />
              <span className="text-[10px] font-semibold tracking-wide uppercase text-amber-200 font-mono">
                Interrupted
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 z-10 text-slate-300">
              <div className="w-4 h-4 rounded-full bg-slate-400/30 border border-slate-300/40" />
              <span className="text-[11px] font-medium tracking-wider uppercase text-slate-400 font-mono">
                Echo
              </span>
            </div>
          )}

          {/* Real-time Pitch Ring Accent */}
          {pitchHz > 0 && (
            <div
              className="absolute inset-1 rounded-full border border-teal-300/30 pointer-events-none"
              style={{
                opacity: Math.min(1, pitchHz / 300),
              }}
            />
          )}
        </motion.div>
      </div>

      {/* Dynamic Conversational State Badge */}
      <motion.div
        id="avatar-state-badge"
        key={state}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`mt-4 px-4 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 backdrop-blur-md shadow-sm transition-all duration-300 font-mono tracking-wide ${status.color}`}
      >
        {status.icon}
        <span>{status.label}</span>
      </motion.div>
    </div>
  );
};
