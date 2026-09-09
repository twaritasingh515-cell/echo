import { VocalCues } from '../types';

export interface AudioEngineCallbacks {
  onVocalCuesUpdate: (cues: VocalCues, liveTranscript: string) => void;
  onInterimTranscript: (text: string) => void;
  onFinalTranscript: (text: string) => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onInterruptionDetected: () => void;
  onError: (err: string) => void;
}

// Window declaration for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

export class AudioEngine {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private recognition: any = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private isTranscribingAudio = false;
  private hasNativeSpeechRecognition = false;
  private animationFrameId: number | null = null;

  private isRunning = false;
  private isAiSpeaking = false;
  private callbacks: AudioEngineCallbacks;

  // Real-time acoustic tracking
  private speechActive = false;
  private speechStartTime = 0;
  private silenceStartTime = 0;
  private pauseDuration = 0;
  private recentPitches: number[] = [];
  private wordTimestamps: number[] = [];
  private currentTranscript = '';
  private interimTranscript = '';

  // Interruption debounce & speaker bleed management
  private aiSpeakingStartTime = 0;
  private consecutiveInterruptionFrames = 0;
  private recognitionRestartTimeout: any = null;
  private aiSpeakingWatchdogTimeout: any = null;

  // Sensitivity thresholds
  private vadThreshold = 0.028;
  private interruptionThreshold = 0.045;

  constructor(callbacks: AudioEngineCallbacks) {
    this.callbacks = callbacks;
  }

  public setAiSpeaking(speaking: boolean): void {
    this.isAiSpeaking = speaking;
    if (this.aiSpeakingWatchdogTimeout) {
      clearTimeout(this.aiSpeakingWatchdogTimeout);
      this.aiSpeakingWatchdogTimeout = null;
    }

    if (speaking) {
      this.aiSpeakingStartTime = performance.now();
      this.consecutiveInterruptionFrames = 0;
      // Auto-clear watchdog after 9 seconds if onEnd was dropped
      this.aiSpeakingWatchdogTimeout = setTimeout(() => {
        if (this.isAiSpeaking) {
          console.log('[AudioEngine] Watchdog auto-cleared isAiSpeaking');
          this.isAiSpeaking = false;
        }
      }, 9000);
    } else {
      this.consecutiveInterruptionFrames = 0;
      // When AI completes speaking, clear residual acoustic feedback from room speakers
      this.currentTranscript = '';
      this.interimTranscript = '';
      this.audioChunks = [];
      this.silenceStartTime = performance.now();
    }
  }

  public getLiveTranscript(): string {
    if (this.currentTranscript && this.interimTranscript) {
      return `${this.currentTranscript} ${this.interimTranscript}`.trim();
    }
    return (this.currentTranscript || this.interimTranscript || '').trim();
  }

  public getStatus(): {
    isRunning: boolean;
    hasNativeSpeech: boolean;
    isAiSpeaking: boolean;
    isTranscribing: boolean;
    vadThreshold: number;
  } {
    return {
      isRunning: this.isRunning,
      hasNativeSpeech: this.hasNativeSpeechRecognition,
      isAiSpeaking: this.isAiSpeaking,
      isTranscribing: this.isTranscribingAudio,
      vadThreshold: this.vadThreshold,
    };
  }

  public setSensitivity(sensitivity: 'sensitive' | 'normal' | 'relaxed'): void {
    if (sensitivity === 'sensitive') {
      this.vadThreshold = 0.02;
      this.interruptionThreshold = 0.035;
    } else if (sensitivity === 'relaxed') {
      this.vadThreshold = 0.04;
      this.interruptionThreshold = 0.06;
    } else {
      this.vadThreshold = 0.028;
      this.interruptionThreshold = 0.045;
    }
  }

  public async start(): Promise<boolean> {
    try {
      if (this.isRunning) return true;

      // 1. Initialize AudioContext
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      // 2. Request user microphone
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // 3. Set up AnalyserNode for pitch and RMS
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.75;

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.micStream);
      this.sourceNode.connect(this.analyser);

      // 4. Initialize MediaRecorder for universal audio recording
      this.initMediaRecorder();

      // 5. Initialize Speech Recognition
      this.initSpeechRecognition();

      this.isRunning = true;
      this.silenceStartTime = performance.now();

      // 6. Start RAF processing loop
      this.processAudioLoop();
      return true;
    } catch (err: any) {
      console.error('Failed to start AudioEngine:', err);
      this.callbacks.onError(err.message || 'Microphone access denied or audio unavailable.');
      return false;
    }
  }

  private initMediaRecorder(): void {
    if (!this.micStream || typeof MediaRecorder === 'undefined') return;
    try {
      let mimeType = '';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      this.mediaRecorder = mimeType ? new MediaRecorder(this.micStream, { mimeType }) : new MediaRecorder(this.micStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
    } catch (e) {
      console.warn('MediaRecorder init fallback:', e);
    }
  }

  public stop(): void {
    this.isRunning = false;

    if (this.aiSpeakingWatchdogTimeout) {
      clearTimeout(this.aiSpeakingWatchdogTimeout);
      this.aiSpeakingWatchdogTimeout = null;
    }

    if (this.recognitionRestartTimeout) {
      clearTimeout(this.recognitionRestartTimeout);
      this.recognitionRestartTimeout = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    this.mediaRecorder = null;
    this.audioChunks = [];

    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }

  private initSpeechRecognition(): void {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      console.warn('SpeechRecognition not supported in this browser. Running with Neural Audio Transcription fallback.');
      this.hasNativeSpeechRecognition = false;
      return;
    }

    this.hasNativeSpeechRecognition = true;
    try {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-IN'; // Better for Indian English + Hinglish; Gemini audio fallback handles mixed Hindi/English.

      this.recognition.onstart = () => {
        // Recognition started
      };

      this.recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const trans = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += trans;
          } else {
            interim += trans;
          }
        }

        // If AI is speaking and this is not an active interruption, ignore speaker output
        if (this.isAiSpeaking) {
          return;
        }

        if (interim) {
          this.interimTranscript = interim;
          this.callbacks.onInterimTranscript(interim);
          this.recordWordEvent(interim);
        }

        if (final) {
          this.currentTranscript = (this.currentTranscript + ' ' + final).trim();
          this.interimTranscript = '';
          this.callbacks.onFinalTranscript(this.currentTranscript);
          this.recordWordEvent(final);
          // When native speech yields words, clear audio chunks
          this.audioChunks = [];
        }
      };

      this.recognition.onerror = (event: any) => {
        // Ignore expected non-fatal events like no-speech or aborted
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('SpeechRecognition non-fatal event:', event.error);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            this.hasNativeSpeechRecognition = false;
            // Do not alarm the user if mic stream is alive; Gemini Audio fallback will transcribe
            if (!this.micStream) {
              this.callbacks.onError('Microphone access was blocked. Please grant microphone permission in your browser.');
            }
          }
        }
      };

      this.recognition.onend = () => {
        // Auto-restart with safe debounce only if still running and native speech is allowed
        if (this.isRunning && this.recognition && this.hasNativeSpeechRecognition) {
          if (this.recognitionRestartTimeout) {
            clearTimeout(this.recognitionRestartTimeout);
          }
          this.recognitionRestartTimeout = setTimeout(() => {
            if (this.isRunning && this.recognition && this.hasNativeSpeechRecognition) {
              try {
                this.recognition.start();
              } catch {}
            }
          }, 300);
        }
      };

      this.recognition.start();
    } catch (e) {
      console.warn('SpeechRecognition initialization error:', e);
    }
  }

  private recordWordEvent(text: string): void {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const now = performance.now();
    for (let i = 0; i < words.length; i++) {
      this.wordTimestamps.push(now);
    }
    // Keep only timestamps within last 15 seconds
    this.wordTimestamps = this.wordTimestamps.filter((t) => now - t < 15000);
  }

  private calculateWPM(): number {
    const now = performance.now();
    const recentWords = this.wordTimestamps.filter((t) => now - t <= 6000).length;
    // Extrapolate recent 6 seconds to 1 minute
    const wpm = Math.round((recentWords / 6) * 60);
    return Math.min(260, Math.max(0, wpm));
  }

  /**
   * Autocorrelation Pitch Detection algorithm (efficient time-domain estimation)
   */
  private detectPitch(buffer: Float32Array, sampleRate: number): number {
    const SIZE = buffer.length;
    let sum = 0;
    for (let i = 0; i < SIZE; i++) {
      sum += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sum / SIZE);
    if (rms < 0.02) return 0; // too quiet to resolve pitch

    // Autocorrelation
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buffer[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buffer[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const buf = buffer.slice(r1, r2);
    const c = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
      for (let j = 0; j < buf.length - i; j++) {
        c[i] = c[i] + buf[j] * buf[j + i];
      }
    }

    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1;
    let maxpos = -1;
    for (let i = d; i < buf.length; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }

    let T0 = maxpos;
    if (T0 > 0 && T0 < buf.length - 1) {
      // Parabolic interpolation
      const x1 = c[T0 - 1];
      const x2 = c[T0];
      const x3 = c[T0 + 1];
      const a = (x1 + x3 - 2 * x2) / 2;
      const b = (x3 - x1) / 2;
      if (a) T0 = T0 - b / (2 * a);
      const pitch = sampleRate / T0;
      if (pitch >= 65 && pitch <= 450) {
        return Math.round(pitch);
      }
    }
    return 0;
  }

  private processAudioLoop = (): void => {
    if (!this.isRunning || !this.analyser || !this.audioCtx) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    // Compute RMS Energy
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    const now = performance.now();

    // 1. Interruption / Barge-in check:
    // When AI is speaking, filter speaker output and transient pops
    let isInterruptionActive = false;
    if (this.isAiSpeaking) {
      const timeSinceAiStarted = now - this.aiSpeakingStartTime;
      // Auto-release AI lock if it exceeds 9 seconds
      if (timeSinceAiStarted > 9000) {
        this.isAiSpeaking = false;
      } else if (timeSinceAiStarted > 300) {
        // While speaker is active, require sustained vocal volume above speaker level
        const activeSpeakerThreshold = Math.max(this.interruptionThreshold * 1.8, 0.085);
        if (rms > activeSpeakerThreshold) {
          this.consecutiveInterruptionFrames++;
          // Require at least 8 consecutive frames (~130ms) of sustained user voice
          if (this.consecutiveInterruptionFrames >= 8) {
            isInterruptionActive = true;
            this.isAiSpeaking = false; // Immediately clear AI speaking so user input is accepted!
            this.callbacks.onInterruptionDetected();
            this.consecutiveInterruptionFrames = 0;
          }
        } else {
          this.consecutiveInterruptionFrames = Math.max(0, this.consecutiveInterruptionFrames - 1);
        }
      }
    } else {
      this.consecutiveInterruptionFrames = 0;
    }

    // 2. Voice Activity Detection (VAD)
    const isNowSpeaking = rms > this.vadThreshold;

    if (isNowSpeaking) {
      if (!this.speechActive) {
        this.speechActive = true;
        this.speechStartTime = now;
        this.pauseDuration = 0;
        this.callbacks.onSpeechStart();

        // Start media recorder chunks if available
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive' && !this.isAiSpeaking) {
          try {
            this.audioChunks = [];
            this.mediaRecorder.start(200);
          } catch {}
        }
      }
    } else {
      if (this.speechActive) {
        this.speechActive = false;
        this.silenceStartTime = now;
        this.callbacks.onSpeechEnd();

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          try {
            this.mediaRecorder.stop();
          } catch {}
        }
      }
      if (this.silenceStartTime > 0) {
        this.pauseDuration = Math.round(((now - this.silenceStartTime) / 1000) * 10) / 10;
      }

      // Check for Gemini audio transcription fallback
      // Triggered if speech is finished, no native transcript was received, and we have recorded audio
      if (
        this.pauseDuration >= 0.5 &&
        !this.currentTranscript.trim() &&
        !this.interimTranscript.trim() &&
        this.audioChunks.length > 0 &&
        !this.isAiSpeaking &&
        !this.isTranscribingAudio
      ) {
        this.transcribeBufferedAudio();
      }
    }

    // 3. Pitch Detection
    const pitch = this.detectPitch(buffer, this.audioCtx.sampleRate);
    if (pitch > 0) {
      this.recentPitches.push(pitch);
      if (this.recentPitches.length > 25) this.recentPitches.shift();
    }

    // Pitch variation
    let pitchVariation: 'low' | 'medium' | 'high' = 'medium';
    if (this.recentPitches.length >= 5) {
      const avg = this.recentPitches.reduce((a, b) => a + b, 0) / this.recentPitches.length;
      const stdDev = Math.sqrt(
        this.recentPitches.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / this.recentPitches.length
      );
      if (stdDev < 12) pitchVariation = 'low';
      else if (stdDev > 28) pitchVariation = 'high';
    }

    // 4. Energy Categorization
    let energy: 'low' | 'medium' | 'high' = 'low';
    if (rms > 0.075) energy = 'high';
    else if (rms > 0.035) energy = 'medium';

    // 5. Speaking Rate
    const wpm = this.calculateWPM();
    let speakingRate: 'slow' | 'medium' | 'fast' = 'medium';
    if (wpm > 165) speakingRate = 'fast';
    else if (wpm < 110 && wpm > 0) speakingRate = 'slow';

    // Construct full VocalCues telemetry
    const cues: VocalCues = {
      speech_active: this.speechActive,
      pause_duration: this.pauseDuration,
      speaking_rate: speakingRate,
      wpm,
      energy,
      rms: Math.round(rms * 1000) / 1000,
      pitch_hz: pitch > 0 ? pitch : this.recentPitches[this.recentPitches.length - 1] || 135,
      pitch_variation: pitchVariation,
      hesitation: false, // will be augmented with lexical analysis
      filler_words: [],
      sentence_complete: false,
      continuation_probability: 0.5,
      is_question: false,
      is_interruption: isInterruptionActive,
    };

    const liveTranscript = this.getLiveTranscript();
    this.callbacks.onVocalCuesUpdate(cues, liveTranscript);

    this.animationFrameId = requestAnimationFrame(this.processAudioLoop);
  };

  /**
   * Universal audio transcription fallback powered by Gemini Audio API
   * Ensures voice companion works even if Web Speech API is absent or blocked in the browser
   */
  private async transcribeBufferedAudio(): Promise<void> {
    if (this.isTranscribingAudio || this.audioChunks.length === 0) return;
    this.isTranscribingAudio = true;
    const chunks = [...this.audioChunks];
    this.audioChunks = [];

    try {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(chunks, { type: mimeType });

      // If audio blob is under 2KB, likely just ambient noise or click
      if (audioBlob.size < 2000) {
        this.isTranscribingAudio = false;
        return;
      }

      this.callbacks.onInterimTranscript('Transcribing speech with AI...');

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || '';
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);

      const audioBase64 = await base64Promise;
      console.log('[VOICE] Audio captured for transcription:', { mimeType, bytes: audioBlob.size });
      if (!audioBase64) {
        this.isTranscribingAudio = false;
        return;
      }

      const res = await fetch('/api/companion/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data.transcript || '').trim();
        if (text) {
          console.log('[VOICE] Gemini transcription:', text);
          this.currentTranscript = text;
          this.interimTranscript = '';
          this.callbacks.onFinalTranscript(text);
          this.recordWordEvent(text);
        } else {
          this.callbacks.onInterimTranscript('');
        }
      } else {
        this.callbacks.onInterimTranscript('');
      }
    } catch (e) {
      console.warn('Audio transcription error:', e);
      this.callbacks.onInterimTranscript('');
    } finally {
      this.isTranscribingAudio = false;
    }
  }

  public async triggerPushToTalkTranscription(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    // Give 80ms for ondataavailable to deliver remaining chunks
    await new Promise((resolve) => setTimeout(resolve, 80));
    await this.transcribeBufferedAudio();
  }

  public resetTranscript(): void {
    this.currentTranscript = '';
    this.interimTranscript = '';
    this.pauseDuration = 0;
    this.silenceStartTime = performance.now();
  }
}
