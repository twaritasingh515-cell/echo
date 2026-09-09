import { TurnAction, TurnDecision, VocalCues } from '../types';

// Incomplete grammatical and conversational continuation connectors
const CONTINUATION_CONNECTORS = [
  'and',
  'but',
  'or',
  'because',
  'so',
  'though',
  'although',
  'if',
  'that',
  'which',
  'where',
  'when',
  'while',
  'like',
  'actually',
  'maybe',
  'i mean',
  'you know',
  'well',
  'with',
  'about',
  'to',
  'for',
  'of',
  // Hinglish connectors
  'yaar',
  'matlab',
  'toh',
  'aur',
  'lekin',
  'par',
  'kyunki',
  'kya',
];

const HESITATION_TOKENS = ['uh', 'um', 'er', 'ah', 'umm', 'uhh', 'hmm'];

const QUESTION_STARTERS = [
  'do you',
  'did you',
  'can you',
  'could you',
  'would you',
  'should you',
  'what',
  'why',
  'how',
  'when',
  'where',
  'who',
  'which',
  'is it',
  'are you',
  'kya',
  'kaise',
  'kyun',
];

/**
 * Analyzes speech transcript and acoustic cues to determine if sentence is complete
 * and the likelihood of the speaker continuing.
 */
export function analyzeSentenceCompleteness(
  transcript: string,
  vocalCues?: Partial<VocalCues>
): {
  sentence_complete: boolean;
  continuation_probability: number;
  hesitation: boolean;
  is_question: boolean;
  filler_words: string[];
} {
  const trimmed = transcript.trim().toLowerCase();
  if (!trimmed) {
    return {
      sentence_complete: false,
      continuation_probability: 0.5,
      hesitation: false,
      is_question: false,
      filler_words: [],
    };
  }

  const words = trimmed.split(/\s+/);
  const lastWord = words[words.length - 1]?.replace(/[^a-zA-Z]/g, '') || '';
  const firstWords = words.slice(0, 3).join(' ');

  // Detect hesitation tokens
  const detectedFillers = words.filter((w) =>
    HESITATION_TOKENS.includes(w.replace(/[^a-zA-Z]/g, ''))
  );
  const hasHesitation =
    detectedFillers.length > 0 ||
    lastWord === 'uh' ||
    lastWord === 'um' ||
    Boolean(vocalCues?.hesitation);

  // Check question traits
  const hasQuestionMark = transcript.includes('?');
  const startsWithQuestion = QUESTION_STARTERS.some((q) =>
    firstWords.startsWith(q)
  );
  const isQuestion = hasQuestionMark || startsWithQuestion;

  // Check ending connectors
  const endsWithConnector = CONTINUATION_CONNECTORS.includes(lastWord);

  // Calculate base continuation probability
  let continuationProb = 0.2; // base probability

  if (endsWithConnector) {
    continuationProb += 0.55;
  }
  if (hasHesitation) {
    continuationProb += 0.35;
  }
  if (words.length <= 3 && !isQuestion) {
    // Short fragments often have continuations unless they are short answers
    continuationProb += 0.2;
  }
  if (trimmed.endsWith('...') || trimmed.endsWith('..')) {
    continuationProb += 0.4;
  }

  // Vocal cues factor in
  if (vocalCues?.speaking_rate === 'slow') {
    continuationProb += 0.1; // slow thoughtful speech
  }
  if (vocalCues?.pitch_variation === 'low' && endsWithConnector) {
    continuationProb += 0.15; // trailing level pitch on a connector indicates thinking
  }
  if (isQuestion && vocalCues?.pitch_hz && vocalCues.pitch_hz > 200) {
    continuationProb -= 0.3; // rising final pitch on a question = turn handoff
  }

  // Clamp probability between 0.05 and 0.98
  continuationProb = Math.min(0.98, Math.max(0.05, continuationProb));

  // Determine sentence completeness
  const sentenceComplete =
    !endsWithConnector &&
    !hasHesitation &&
    continuationProb < 0.45 &&
    (words.length >= 3 || isQuestion || trimmed.endsWith('.'));

  return {
    sentence_complete: sentenceComplete,
    continuation_probability: Math.round(continuationProb * 100) / 100,
    hesitation: hasHesitation,
    is_question: isQuestion,
    filler_words: detectedFillers,
  };
}

/**
 * Rule-Based Turn-Taking Evaluator
 */
export function evaluateRuleBasedTurn(
  cues: VocalCues,
  transcript: string,
  isAiSpeaking: boolean
): { action: TurnAction; reason: string } {
  // 1. Interruption Check (User speaks with sustained vocal energy while AI is talking)
  if (isAiSpeaking && cues.speech_active && cues.rms > 0.085) {
    return {
      action: 'STOP',
      reason: 'User speech detected during AI output (Barge-in / Interruption).',
    };
  }

  // 2. User is currently active and talking
  if (cues.speech_active) {
    return {
      action: 'WAIT',
      reason: 'User is actively vocalizing.',
    };
  }

  // 3. User has paused
  const pause = cues.pause_duration;

  // If user ended with hesitation or continuation connector (e.g. "I was actually thinking that maybe...")
  if (cues.continuation_probability > 0.65) {
    if (pause < 1.3) {
      // If paused between 0.6s and 1.2s, a natural backchannel acknowledges receipt without taking over
      if (pause >= 0.6 && transcript.split(' ').length >= 4) {
        return {
          action: 'BACKCHANNEL',
          reason: `High continuation probability (${Math.round(cues.continuation_probability * 100)}%) with ${pause.toFixed(1)}s pause: provide gentle acknowledgement.`,
        };
      }
      return {
        action: 'WAIT',
        reason: `High continuation probability (${Math.round(cues.continuation_probability * 100)}%): allowing speaker to finish hesitation.`,
      };
    }
  }

  // 4. Definite question: snappy handoff (~380ms pause)
  if (cues.is_question && (pause >= 0.38 || (cues.sentence_complete && pause >= 0.28))) {
    return {
      action: 'RESPOND',
      reason: 'Question boundary recognized with natural turn-yield pause.',
    };
  }

  // 5. Complete sentence with natural conversational pause (~450ms)
  if (cues.sentence_complete && pause >= 0.45) {
    return {
      action: 'RESPOND',
      reason: 'Grammatically complete sentence with conversational pause (>=0.45s).',
    };
  }

  // 6. Conversational pause fallback (user has stopped for > 0.75s even if incomplete)
  if (pause >= 0.75 && transcript.trim().length > 0) {
    return {
      action: 'RESPOND',
      reason: `Conversational pause (${pause.toFixed(1)}s) indicates speaker has yielded turn.`,
    };
  }

  // Default: wait for more audio or pause accumulation
  return {
    action: 'WAIT',
    reason: 'Evaluating conversational timing...',
  };
}

/**
 * Neural Network / Machine Learning Softmax Turn-Taking Classifier Simulator
 * Represents Section 18:
 * Inputs: [pause_duration, sentence_complete, continuation_prob, hesitation, speech_rate, energy, is_question, is_ai_speaking]
 * Outputs: P(WAIT), P(RESPOND), P(BACKCHANNEL), P(STOP)
 */
export function evaluateMLTurn(
  cues: VocalCues,
  isAiSpeaking: boolean
): {
  action: TurnAction;
  probabilities: { wait: number; respond: number; backchannel: number; stop: number };
} {
  // Feature vector encoding
  const x_pause = Math.min(1.5, cues.pause_duration) / 1.5; // 0..1 (reaches 1.0 by 1.5s)
  const x_complete = cues.sentence_complete ? 1.0 : 0.0;
  const x_cont = cues.continuation_probability; // 0..1
  const x_hesit = cues.hesitation ? 1.0 : 0.0;
  const x_quest = cues.is_question ? 1.0 : 0.0;
  const x_active = cues.speech_active ? 1.0 : 0.0;
  const x_aispeak = isAiSpeaking ? 1.0 : 0.0;
  const x_rms = Math.min(1.0, cues.rms * 3.0);

  // Pre-trained weights for 4 logits [WAIT, RESPOND, BACKCHANNEL, STOP]
  // STOP logit requires high sustained energy while AI is speaking
  const logit_stop = 4.5 * (x_active * x_aispeak) + 3.0 * (x_rms * x_aispeak) - 3.8;

  // WAIT logit is driven by active speech, high continuation, hesitation, low pause
  const logit_wait =
    3.5 * x_active +
    2.8 * x_cont +
    1.8 * x_hesit -
    2.6 * x_pause -
    1.8 * x_complete +
    0.3;

  // RESPOND logit is driven by pause, sentence complete, question, low continuation
  const logit_respond =
    3.8 * x_pause +
    2.8 * x_complete +
    2.4 * x_quest -
    2.5 * x_cont -
    2.5 * x_active -
    0.4;

  // BACKCHANNEL logit is driven by mid-pause (0.3..0.6) with continuation and hesitation
  const midPauseFactor = cues.pause_duration >= 0.7 && cues.pause_duration <= 1.8 ? 2.5 : -1.5;
  const logit_backchannel =
    midPauseFactor +
    2.2 * x_cont +
    1.4 * x_hesit -
    1.8 * x_active -
    1.2 * x_complete;

  // Softmax
  const logits = [logit_wait, logit_respond, logit_backchannel, logit_stop];
  const maxLogit = Math.max(...logits);
  const exp = logits.map((l) => Math.exp(l - maxLogit));
  const sumExp = exp.reduce((a, b) => a + b, 0);
  const probs = exp.map((e) => Math.round((e / sumExp) * 1000) / 1000);

  const probObj = {
    wait: probs[0],
    respond: probs[1],
    backchannel: probs[2],
    stop: probs[3],
  };

  const actions: TurnAction[] = ['WAIT', 'RESPOND', 'BACKCHANNEL', 'STOP'];
  const maxIndex = probs.indexOf(Math.max(...probs));
  const mlAction = actions[maxIndex];

  return {
    action: mlAction,
    probabilities: probObj,
  };
}

/**
 * Master Turn-Taking Engine: Combines Rule-based heuristics and ML Classifier
 */
export function decideTurnTaking(
  cues: VocalCues,
  transcript: string,
  isAiSpeaking: boolean,
  mode: 'hybrid_ml' | 'rule_based' | 'neural_network' = 'hybrid_ml'
): TurnDecision {
  const ruleResult = evaluateRuleBasedTurn(cues, transcript, isAiSpeaking);
  const mlResult = evaluateMLTurn(cues, isAiSpeaking);

  let selectedAction: TurnAction;
  let confidence: number;
  let reason: string;

  if (mode === 'rule_based') {
    selectedAction = ruleResult.action;
    confidence = 0.88;
    reason = `[Rule-Engine] ${ruleResult.reason}`;
  } else if (mode === 'neural_network') {
    selectedAction = mlResult.action;
    confidence = mlResult.probabilities[mlResult.action.toLowerCase() as keyof typeof mlResult.probabilities];
    reason = `[ML-TurnNet] Predicted ${selectedAction} with ${(confidence * 100).toFixed(1)}% softmax probability.`;
  } else {
    // Hybrid Mode (Best of both worlds: safety override for barge-in, ML for nuance)
    if (ruleResult.action === 'STOP') {
      selectedAction = 'STOP';
      confidence = 0.98;
      reason = 'Emergency Barge-in override triggered by acoustic energy.';
    } else {
      // When rule and ML agree, confidence is high
      if (ruleResult.action === mlResult.action) {
        selectedAction = ruleResult.action;
        confidence = Math.max(0.92, mlResult.probabilities[ruleResult.action.toLowerCase() as keyof typeof mlResult.probabilities]);
        reason = `Consensus: ${ruleResult.reason}`;
      } else {
        // Subtle preference: if ML has high confidence (> 0.70) in BACKCHANNEL or WAIT, favor ML
        if (
          (mlResult.action === 'BACKCHANNEL' || mlResult.action === 'WAIT') &&
          mlResult.probabilities[mlResult.action.toLowerCase() as keyof typeof mlResult.probabilities] > 0.65
        ) {
          selectedAction = mlResult.action;
          confidence = mlResult.probabilities[mlResult.action.toLowerCase() as keyof typeof mlResult.probabilities];
          reason = `ML Softmax prioritized natural pause pacing (${selectedAction}).`;
        } else {
          selectedAction = ruleResult.action;
          confidence = 0.84;
          reason = `Rule heuristic prioritized: ${ruleResult.reason}`;
        }
      }
    }
  }

  // Select appropriate natural backchannel vocalization
  let backchannelPhrase: string | undefined;
  if (selectedAction === 'BACKCHANNEL') {
    const isHinglish = /yaar|bhai|matlab|kya|toh|chalega/i.test(transcript);
    const phrases = isHinglish
      ? ['Hmm', 'Sahi baat', 'Achaa', 'Haan', 'Right']
      : ['Hmm', 'Yeah', 'Right', 'I see', 'Okay'];
    backchannelPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  }

  return {
    action: selectedAction,
    confidence: Math.round(confidence * 100) / 100,
    reason,
    backchannel_phrase: backchannelPhrase,
    probabilities: mlResult.probabilities,
    rule_based_decision: ruleResult.action,
    ml_based_decision: mlResult.action,
    model_divergence: ruleResult.action !== mlResult.action,
  };
}
