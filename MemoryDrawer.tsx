import React, { useState } from 'react';
import { MemoryItem } from '../types';
import { Brain, Trash2, Plus, Search, ShieldCheck, ShieldAlert, Sparkles, X } from 'lucide-react';

interface MemoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryItem[];
  onAddMemory: (content: string, category: MemoryItem['category']) => void;
  onDeleteMemory: (id: string) => void;
  onClearAll: () => void;
  longTermMemoryEnabled: boolean;
  onToggleMemoryEnabled: (enabled: boolean) => void;
}

export const MemoryDrawer: React.FC<MemoryDrawerProps> = ({
  isOpen,
  onClose,
  memories,
  onAddMemory,
  onDeleteMemory,
  onClearAll,
  longTermMemoryEnabled,
  onToggleMemoryEnabled,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryItem['category']>('project');
  const [showAddForm, setShowAddForm] = useState(false);

  if (!isOpen) return null;

  const filteredMemories = memories.filter((m) =>
    m.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    onAddMemory(newContent.trim(), newCategory);
    setNewContent('');
    setShowAddForm(false);
  };

  const getCategoryColor = (cat: MemoryItem['category']) => {
    switch (cat) {
      case 'project':
        return 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30';
      case 'preference':
        return 'bg-teal-500/10 text-teal-300 border-teal-500/30';
      case 'work':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'emotional_state':
        return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
      case 'personal':
      default:
        return 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-md bg-slate-950 border-l border-slate-800/90 h-full flex flex-col shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 font-mono">Long-Term Memory Vault</h2>
              <p className="text-[11px] text-slate-400">Retrieval-augmented conversational continuity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Safety & Privacy Notice (Section 20) */}
        <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800/90 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            {longTermMemoryEnabled ? (
              <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="font-medium text-slate-200 font-mono text-[11px]">
                {longTermMemoryEnabled ? 'Long-Term Memory Active' : 'Memory Vault Disabled'}
              </div>
              <div className="text-[10px] text-slate-400">
                {longTermMemoryEnabled
                  ? 'Non-sensitive facts remembered across sessions.'
                  : 'AI will not recall previous sessions.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => onToggleMemoryEnabled(!longTermMemoryEnabled)}
            className={`text-[11px] px-2.5 py-1 rounded-md font-mono font-medium transition-colors border ${
              longTermMemoryEnabled
                ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/25'
                : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-700'
            }`}
          >
            {longTermMemoryEnabled ? 'Enabled' : 'Disabled'}
          </button>
        </div>

        {/* Search & Action Bar */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-teal-500 transition-colors font-mono"
            />
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-2.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-semibold flex items-center gap-1 transition-colors font-mono shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        {/* Add Memory Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="mt-3 p-3.5 bg-slate-900/90 rounded-xl border border-teal-500/30 flex flex-col gap-2.5 shadow-md">
            <textarea
              rows={2}
              placeholder="E.g., User is preparing for their product launch next Tuesday..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-teal-500 font-mono"
            />
            <div className="flex items-center justify-between">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-md px-2 py-1 text-[11px] font-mono outline-none focus:border-teal-500"
              >
                <option value="project">Project</option>
                <option value="preference">Preference</option>
                <option value="work">Work</option>
                <option value="personal">Personal</option>
              </select>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-2 py-1 text-slate-400 hover:text-slate-200 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold rounded-md text-xs font-mono"
                >
                  Save Fact
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Memories List */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              No memories found. Converse naturally or add one above!
            </div>
          ) : (
            filteredMemories.map((mem) => (
              <div
                key={mem.id}
                className="bg-slate-900/80 rounded-xl p-3 border border-slate-800/90 flex flex-col gap-1.5 hover:border-slate-700 transition-colors group shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md uppercase tracking-wider font-mono font-semibold border ${getCategoryColor(mem.category)}`}>
                    {mem.category}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {mem.source === 'auto_extracted' ? (
                        <span className="flex items-center gap-1 text-cyan-400">
                          <Sparkles className="w-2.5 h-2.5" /> Inferred
                        </span>
                      ) : (
                        'User Added'
                      )}
                    </span>
                    <button
                      onClick={() => onDeleteMemory(mem.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                      title="Delete memory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-normal">{mem.content}</p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {memories.length > 0 && (
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
            <span>{memories.length} stored memories</span>
            <button
              onClick={onClearAll}
              className="text-rose-400 hover:text-rose-300 text-[11px] font-medium transition-colors"
            >
              Clear All Memories
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
