'use client';
import { useState, useRef, useEffect } from 'react';

export default function DashboardChat({ matrices }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user', text: question }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: matrices, history: nextMessages }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'assistant', text: data.text || data.error || 'No response' }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 bg-accent text-bg font-medium text-sm px-4 py-3 rounded-full shadow-lg hover:opacity-90 transition z-20"
      >
        ✨ Ask about this data
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 w-80 max-w-[calc(100vw-2.5rem)] h-96 bg-surface border border-border rounded-2xl shadow-xl flex flex-col z-20">
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Ask about this dashboard</span>
        <button onClick={() => setOpen(false)} className="text-dim hover:text-text text-sm">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-dim">
            Ask things like &quot;what was the best day last week?&quot; or &quot;why did revenue drop?&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`text-xs ${m.role === 'user' ? 'text-right' : ''}`}>
            <div
              className={`inline-block rounded-lg px-3 py-2 max-w-[85%] ${
                m.role === 'user' ? 'bg-accent/15 text-text' : 'bg-surface2 text-text'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-dim">Thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 p-3 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a question..."
          className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 text-xs"
        />
        <button
          onClick={send}
          disabled={loading}
          className="bg-accent text-bg text-xs font-medium px-3 py-2 rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
