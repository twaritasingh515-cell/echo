import { MemoryItem } from '../types';

const MEMORY_STORAGE_KEY = 'echo_companion_long_term_memories';

// Seed memories that establish realistic continuity from previous sessions
const DEFAULT_MEMORIES: MemoryItem[] = [
  {
    id: 'mem_1',
    content: 'Building an AI companion for a college capstone project focusing on real-time conversational intelligence and turn-taking.',
    category: 'project',
    timestamp: Date.now() - 86400000 * 2, // 2 days ago
    source: 'auto_extracted',
  },
  {
    id: 'mem_2',
    content: 'Prefers casual, friendly conversations with occasional Hinglish slang (yaar, basically, chalega) rather than robotic assistant speech.',
    category: 'preference',
    timestamp: Date.now() - 86400000,
    source: 'auto_extracted',
  },
  {
    id: 'mem_3',
    content: 'Working late on backend services and audio latency optimizations; feeling excited about speech-AI engineering.',
    category: 'work',
    timestamp: Date.now() - 43200000,
    source: 'auto_extracted',
  },
];

class MemoryEngine {
  private memories: MemoryItem[] = [];

  constructor() {
    this.loadMemories();
  }

  private loadMemories(): void {
    try {
      const stored = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (stored) {
        this.memories = JSON.parse(stored);
      } else {
        this.memories = [...DEFAULT_MEMORIES];
        this.persist();
      }
    } catch {
      this.memories = [...DEFAULT_MEMORIES];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memories));
    } catch (e) {
      console.warn('Failed to persist memories to localStorage', e);
    }
  }

  public getAll(): MemoryItem[] {
    return [...this.memories];
  }

  public add(content: string, category: MemoryItem['category'] = 'personal', source: MemoryItem['source'] = 'user_specified'): MemoryItem {
    const newItem: MemoryItem = {
      id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      content: content.trim(),
      category,
      timestamp: Date.now(),
      source,
    };
    this.memories.unshift(newItem);
    this.persist();
    return newItem;
  }

  public remove(id: string): void {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.persist();
  }

  public clearAll(): void {
    this.memories = [];
    this.persist();
  }

  /**
   * Semantic and Keyword Retrieval based on query
   */
  public retrieveRelevant(query: string, maxItems: number = 3): MemoryItem[] {
    if (!query || this.memories.length === 0) return [];

    const queryTokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const scored = this.memories.map((mem) => {
      const memTokens = mem.content
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/);

      let score = 0;
      queryTokens.forEach((qt) => {
        if (memTokens.includes(qt)) {
          score += 2;
        } else if (mem.content.toLowerCase().includes(qt)) {
          score += 1;
        }
      });

      // Boost project or personal references if user says "remember", "project", "told you"
      if (/remember|told you|project|college|work/i.test(query) && (mem.category === 'project' || mem.category === 'work')) {
        score += 2.5;
      }

      return {
        ...mem,
        relevance_score: Math.min(1.0, score / Math.max(1, queryTokens.length * 1.5)),
      };
    });

    return scored
      .filter((m) => (m.relevance_score || 0) > 0.15)
      .sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
      .slice(0, maxItems);
  }

  /**
   * Lightweight rule-based client-side fact extractor for instant learning
   */
  public extractFactsFromSpeech(transcript: string): string | null {
    const text = transcript.trim();

    // Pattern: "I am building / working on / making X"
    const projectMatch = text.match(/(?:i am|i'm|currently)\s+(?:building|working on|creating|developing|making)\s+([^.!?]+)/i);
    if (projectMatch && projectMatch[1].length > 6) {
      return `User is working on: ${projectMatch[1].trim()}`;
    }

    // Pattern: "My name is X" or "Call me X"
    const nameMatch = text.match(/(?:my name is|call me|i'm|i am)\s+([A-Z][a-z]+)/);
    if (nameMatch && !['building', 'sorry', 'just', 'fine', 'ready'].includes(nameMatch[1].toLowerCase())) {
      return `User's name is ${nameMatch[1]}`;
    }

    // Pattern: "I prefer / I like / I love X"
    const prefMatch = text.match(/(?:i prefer|i like|i really like|i love)\s+([^.!?]+)/i);
    if (prefMatch && prefMatch[1].length > 4) {
      return `User preference: Likes ${prefMatch[1].trim()}`;
    }

    // Pattern: "I feel / I am feeling X"
    const emotionMatch = text.match(/(?:i feel|i am feeling|i'm feeling)\s+(tired|excited|stressed|happy|overwhelmed|nervous|great)/i);
    if (emotionMatch) {
      return `Emotional context: User felt ${emotionMatch[1].toLowerCase()} recently`;
    }

    return null;
  }
}

export const memoryEngine = new MemoryEngine();
