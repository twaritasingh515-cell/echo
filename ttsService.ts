/**
 * Response Controller & Modular TTS Service (Rime TTS with Browser Neural Fallback)
 * Handles speech synthesis, instant barge-in cancellation, British accent prosody, and natural backchanneling.
 */

export interface TTSOptions {
  voiceId?: string;
  speaker?: string;
  modelId?: string;
  accent?: 'british' | 'american' | 'neutral';
  rate?: number;
  pitch?: number;
  volume?: number;
  tone?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onInterrupted?: () => void;
}

class TTSService {
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private chromeKeepAliveInterval: any = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private isUnlocked = false;
  private rimeAvailable: boolean | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initVoices();
      this.setupAudioUnlockListeners();
    }
  }

  public resetRimeAvailability(): void {
    this.rimeAvailable = null;
  }

  private initVoices(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      this.cachedVoices = window.speechSynthesis.getVoices();
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  /**
   * Unlocks Web Audio and SpeechSynthesis on first user gesture to satisfy browser autoplay policies
   */
  public unlockAudio(): void {
    if (this.isUnlocked || typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        if (!this.audioContext) {
          this.audioContext = new AudioCtx();
        }
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      }

      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }

      this.isUnlocked = true;
    } catch {
      // Ignored if user hasn't interacted yet
    }
  }

  private setupAudioUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    const unlockHandler = () => {
      this.unlockAudio();
      window.removeEventListener('click', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };

    window.addEventListener('click', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }

  public getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  /**
   * Immediately aborts any ongoing speech playback (Barge-in / Interruption).
   * Crucial for natural conversational turn-taking!
   */
  public cancel(): void {
    if (this.chromeKeepAliveInterval) {
      clearInterval(this.chromeKeepAliveInterval);
      this.chromeKeepAliveInterval = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.currentTime = 0;
      this.currentAudioElement = null;
    }
    this.currentUtterance = null;
    this.isSpeaking = false;
  }

  /**
   * Synthesize and speak the companion's response
   */
  public async speak(
    text: string,
    options: TTSOptions = {},
    provider: 'rime' | 'browser_neural' = 'rime'
  ): Promise<void> {
    this.unlockAudio();
    this.cancel();

    if (!text || !text.trim()) return;

    this.isSpeaking = true;
    options.onStart?.();

    // 1. Rime TTS API proxy (Ultra-Low Latency Conversational Voice powered by RIME_API_KEY)
    if (provider === 'rime') {
      try {
        const played = await this.speakViaRimeTTS(text, options);
        if (played) return;
      } catch (e) {
        console.warn('Rime TTS synthesis failed, switching to browser neural fallback:', e);
      }
    }

    // 2. Resilient High-Quality British Neural Browser Speech Synthesis
    this.speakViaSpeechSynthesis(text, options);
  }

  /**
   * Call server-side Rime TTS proxy with British accent options
   */
  private async speakViaRimeTTS(text: string, options: TTSOptions): Promise<boolean> {
    try {
      const cleanText = this.sanitizeTextForSpeech(text);
      if (!cleanText) return false;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/companion/rime-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text: cleanText,
          speaker: options.speaker || 'albion',
          modelId: options.modelId || 'coda',
          accent: options.accent || 'british',
          speedAlpha: options.rate || 1.0,
        }),
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        return false;
      }

      const data = await res.json();

      if (data.fallbackToClient) {
        return false;
      }

      if (!data.audio) return false;

      return await this.playBase64Audio(data.audio, options);
    } catch (e) {
      console.warn('Rime TTS invocation exception:', e);
      return false;
    }
  }

  private pcmToWavBlob(bytes: Uint8Array, sampleRate = 24000): Blob {
    // Check if already has a container signature (RIFF for WAV, ID3 or 0xFF for MP3, OggS for OGG)
    if (bytes.length >= 4) {
      const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46; // "RIFF"
      const isId3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33; // "ID3"
      const isMp3Sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0; // MP3 sync frame
      const isOgg = bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53; // "OggS"

      if (isWav) return new Blob([bytes], { type: 'audio/wav' });
      if (isId3 || isMp3Sync) return new Blob([bytes], { type: 'audio/mp3' });
      if (isOgg) return new Blob([bytes], { type: 'audio/ogg' });
    }

    // Wrap raw 16-bit mono PCM into standard 44-byte RIFF WAV container
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const wavBuffer = new ArrayBuffer(44 + bytes.length);
    const view = new DataView(wavBuffer);

    // "RIFF" chunk
    view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
    view.setUint32(4, 36 + bytes.length, true);
    // "WAVE"
    view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
    // "fmt " subchunk
    view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // "data" subchunk
    view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
    view.setUint32(40, bytes.length, true);

    new Uint8Array(wavBuffer, 44).set(bytes);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private async playBase64Audio(base64Audio: string, options: TTSOptions): Promise<boolean> {
    try {
      // Decode base64 to binary byte array
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      this.currentAudioElement = audio;
      audio.playbackRate = options.rate || 1.0;

      return new Promise<boolean>((resolve) => {
        let hasResolved = false;

        const cleanup = () => {
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
        };

        audio.onended = () => {
          if (hasResolved) return;
          hasResolved = true;
          this.isSpeaking = false;
          this.currentAudioElement = null;
          cleanup();
          options.onEnd?.();
          resolve(true);
        };

        audio.onerror = (e) => {
          if (hasResolved) return;
          hasResolved = true;
          console.warn('Audio playback error, falling back to neural speech:', e);
          this.currentAudioElement = null;
          cleanup();
          // IMPORTANT: Do NOT call options.onEnd here because caller will fall back to SpeechSynthesis
          resolve(false);
        };

        audio.play().catch((playErr) => {
          if (hasResolved) return;
          hasResolved = true;
          console.warn('Audio autoplay blocked by browser policy:', playErr);
          this.currentAudioElement = null;
          cleanup();
          resolve(false);
        });
      });
    } catch (err) {
      console.warn('Failed to parse or play audio buffer:', err);
      return false;
    }
  }

  private sanitizeTextForSpeech(text: string): string {
    return text
      .replace(/\*.*?\*/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/#+/g, '')
      .trim();
  }

  /**
   * High-Fidelity Client-side Speech Synthesis prioritizing British English voices
   */
  private speakViaSpeechSynthesis(text: string, options: TTSOptions): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.isSpeaking = false;
      options.onEnd?.();
      return;
    }

    const cleanText = this.sanitizeTextForSpeech(text);
    if (!cleanText) {
      this.isSpeaking = false;
      options.onEnd?.();
      return;
    }

    // Chrome resume fix
    window.speechSynthesis.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.currentUtterance = utterance;

    const hasDevanagari = /[\u0900-\u097F]/.test(cleanText);
    const hasHindiRomanWords = /\b(bhai|yaar|kya|kaise|kaisa|kyun|kyu|mujhe|mera|meri|tum|aap|haan|nahi|nahin|hai|hoon|hun|karna|karo|kuch|abhi|kal|acha|achha|theek|sahi|batao|bata|chahiye|kyon|matlab)\b/i.test(cleanText);
    const shouldUseHindi = hasDevanagari || hasHindiRomanWords;

    utterance.rate = options.rate || 1.05;
    utterance.pitch = options.pitch || (options.accent === 'british' ? 1.03 : 1.0);
    utterance.volume = options.volume ?? 1.0;
    utterance.lang = shouldUseHindi ? 'hi-IN' : (options.accent === 'american' ? 'en-US' : options.accent === 'british' ? 'en-GB' : 'en-IN');

    // Retrieve loaded voices
    const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();

    if (voices.length > 0) {
      const isBritish = options.accent !== 'american';
      let preferredVoice: SpeechSynthesisVoice | undefined;

      if (shouldUseHindi) {
        preferredVoice =
          voices.find((v) => v.lang === 'hi-IN' || v.lang.startsWith('hi-IN')) ||
          voices.find((v) => v.lang.startsWith('hi'));
      }

      if (!preferredVoice && isBritish) {
        // Priority 1: British English specific voices (Daniel, Oliver, George, Arthur, Hazel, Google UK)
        preferredVoice =
          voices.find((v) => (v.lang === 'en-GB' || v.lang.startsWith('en-GB') || v.lang === 'en_GB') && (v.name.includes('Daniel') || v.name.includes('Oliver') || v.name.includes('George') || v.name.includes('Arthur') || v.name.includes('Hazel') || v.name.includes('Natural') || v.name.includes('Neural'))) ||
          voices.find((v) => v.name.includes('Google UK English') || v.name.includes('British') || v.name.includes('United Kingdom')) ||
          voices.find((v) => v.lang === 'en-GB' || v.lang.startsWith('en-GB') || v.lang === 'en_GB') ||
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Daniel') || v.name.includes('Oliver')));
      }

      // Priority 2: General natural high-quality voice
      if (!preferredVoice) {
        preferredVoice =
          voices.find((v) => v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google US English')) ||
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Alex'))) ||
          voices.find((v) => v.lang.startsWith('en'));
      }

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }

    // Chrome 15s SpeechSynthesis bug watchdog
    this.chromeKeepAliveInterval = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } else {
        if (this.chromeKeepAliveInterval) {
          clearInterval(this.chromeKeepAliveInterval);
          this.chromeKeepAliveInterval = null;
        }
      }
    }, 10000);

    utterance.onend = () => {
      if (this.chromeKeepAliveInterval) {
        clearInterval(this.chromeKeepAliveInterval);
        this.chromeKeepAliveInterval = null;
      }
      this.isSpeaking = false;
      this.currentUtterance = null;
      options.onEnd?.();
    };

    utterance.onerror = (e) => {
      if (this.chromeKeepAliveInterval) {
        clearInterval(this.chromeKeepAliveInterval);
        this.chromeKeepAliveInterval = null;
      }
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (e.error === 'interrupted' || e.error === 'canceled') {
        options.onInterrupted?.();
      } else {
        options.onEnd?.();
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  /**
   * Play a natural, brief conversational backchannel sound ("Right", "Indeed", "Hmm")
   * without seizing the conversational turn from the user.
   */
  public playBackchannel(phrase: string = 'Right', accent: 'british' | 'american' | 'neutral' = 'british'): void {
    if (typeof window === 'undefined') return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const utter = new SpeechSynthesisUtterance(phrase);
      utter.rate = 1.2;
      utter.pitch = 1.08;
      utter.volume = 0.55;

      const voices = this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
      const preferred = voices.find((v) => v.lang.startsWith('en-GB')) || voices.find((v) => v.lang.startsWith('en'));
      if (preferred) utter.voice = preferred;

      window.speechSynthesis.speak(utter);
    }
  }

  /**
   * Renders gentle acoustic backchannel chime using Web Audio API
   */
  public playBackchannelChime(): void {
    try {
      this.unlockAudio();
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, this.audioContext.currentTime); // A4
      osc.frequency.exponentialRampToValueAtTime(554.37, this.audioContext.currentTime + 0.18); // C#5

      gain.gain.setValueAtTime(0.08, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.25);
    } catch {
      // Audio context error fallback
    }
  }
}

export const ttsService = new TTSService();

