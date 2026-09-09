/**
 * Echo Conversational AI Companion - Core Types & Interfaces
 */

export type VisualState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'SPEAKING'
  | 'INTERRUPTED'
  | 'PROCESSING';

export interface VocalCues {
  speech_active: boolean;
  pause_duration: number; // in seconds
  speaking_rate: 'slow' | 'medium' | 'fast';
  wpm: number;
  energy: 'low' | 'medium' | 'high';
  rms: number; // 0.0 to 1.0
  pitch_hz: number;
  pitch_variation: 'low' | 'medium' | 'high';
  hesitation: boolean;
  filler_words: string[];
  sentence_complete: boolean;
  continuation_probability: number; // 0.0 to 1.0
  is_question: boolean;
  is_interruption: boolean;
}

export type TurnAction = 'WAIT' | 'RESPOND' | 'BACKCHANNEL' | 'STOP';

export interface TurnDecision {
  action: TurnAction;
  confidence: number;
  reason: string;
  backchannel_phrase?: string;
  probabilities: {
    wait: number;
    respond: number;
    backchannel: number;
    stop: number;
  };
  rule_based_decision: TurnAction;
  ml_based_decision: TurnAction;
  model_divergence?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'system';
  text: string;
  timestamp: number;
  vocal_cues?: Partial<VocalCues>;
  interrupted?: boolean;
  backchannel?: boolean;
  extracted_memory?: string;
  tone?: string;
  latency_ms?: {
    vad?: number;
    turn_decision?: number;
    llm?: number;
    tts?: number;
    total?: number;
  };
}

export interface MemoryItem {
  id: string;
  content: string;
  category: 'project' | 'preference' | 'personal' | 'emotional_state' | 'work';
  timestamp: number;
  relevance_score?: number;
  source: 'auto_extracted' | 'user_specified';
}

export type CompanionPersonality =
  | 'british_witty'
  | 'friendly_casual'
  | 'warm_curious'
  | 'witty_banter'
  | 'zen_listener'
  | 'intellectual_peer';

export interface CompanionSettings {
  personality: CompanionPersonality;
  voice_id: string;
  voice_provider: 'rime' | 'browser_neural';
  voice_accent: 'british' | 'american' | 'neutral';
  rime_speaker: string;
  rime_model: 'coda' | 'mistv3';
  auto_speak: boolean;
  speaking_rate: number;
  backchannel_frequency: 'low' | 'moderate' | 'high' | 'off';
  interruption_sensitivity: 'sensitive' | 'normal' | 'relaxed';
  multilingual_hinglish: boolean;
  long_term_memory_enabled: boolean;
  turn_taking_mode: 'hybrid_ml' | 'rule_based' | 'neural_network';
  silence_timeout_sec: number;
}

export interface TurnTakingDatasetSample {
  id: string;
  audio_scenario: string;
  transcript: string;
  pause_duration: number;
  vocal_features: {
    pitch_variation: 'low' | 'medium' | 'high';
    energy: 'low' | 'medium' | 'high';
    speaking_rate: 'slow' | 'medium' | 'fast';
    hesitation: boolean;
    sentence_complete: boolean;
  };
  label: TurnAction;
  notes: string;
}
