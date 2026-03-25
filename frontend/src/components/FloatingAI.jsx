import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { useAI } from '../context/AIContext';

const FloatingAI = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: "Hi! I'm your V&G Llama AI assistant. Ask me anything about our desserts, location, hours, delivery, and more!",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const { queryGeneralAI } = useAI();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleViewportChange = (event) => {
      setIsCompactViewport(event.matches);
    };

    setIsCompactViewport(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleViewportChange);
      return () => mediaQuery.removeEventListener('change', handleViewportChange);
    }

    mediaQuery.addListener(handleViewportChange);
    return () => mediaQuery.removeListener(handleViewportChange);
  }, []);

  const toggleLabel = isOpen ? 'Close AI' : 'Ask Llama AI';

  async function handleSend(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsLoading(true);

    try {
      const reply = await queryGeneralAI(text);
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, I had trouble connecting. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: isCompactViewport ? 'max(1rem, env(safe-area-inset-bottom))' : '2rem',
        right: isCompactViewport ? '1rem' : '2rem',
        left: isCompactViewport ? '1rem' : 'auto',
        zIndex: 99999,
        pointerEvents: 'auto',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        justifyContent: isCompactViewport ? 'flex-end' : 'stretch',
      }}
    >
      {isOpen ? (
        <div
          style={{
            position: 'absolute',
            bottom: isCompactViewport ? '72px' : '80px',
            right: 0,
            width: isCompactViewport ? '100%' : '360px',
            maxWidth: 'calc(100vw - 2rem)',
            height: isCompactViewport ? 'min(70vh, 500px)' : '500px',
            background: 'white',
            borderRadius: isCompactViewport ? '1rem' : '1.25rem',
            boxShadow: '0 25px 50px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              padding: '1rem 1.25rem',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <div style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem' }}>
                  V&G Llama AI
                </div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.7rem' }}>
                  Online and ready
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              background: '#f8fafc',
            }}
          >
            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '0.7rem 0.9rem',
                  borderRadius:
                    message.role === 'user' ? '1rem 1rem 0.2rem 1rem' : '1rem 1rem 1rem 0.2rem',
                  background: message.role === 'user' ? '#6366f1' : 'white',
                  color: message.role === 'user' ? 'white' : '#334155',
                  fontSize: '0.875rem',
                  lineHeight: 1.5,
                  boxShadow: message.role === 'ai' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  border: message.role === 'ai' ? '1px solid #e2e8f0' : 'none',
                }}
              >
                {message.text}
              </div>
            ))}

            {isLoading ? (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '1rem 1rem 1rem 0.2rem',
                  padding: '0.7rem 1rem',
                  display: 'flex',
                  gap: '4px',
                }}
              >
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    style={{
                      width: 6,
                      height: 6,
                      background: '#94a3b8',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: `bounce 1.4s ${index * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={handleSend}
            style={{
              padding: '0.75rem 1rem',
              background: 'white',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about our desserts, hours, delivery..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '0.6rem 0.9rem',
                border: '1.5px solid #e2e8f0',
                borderRadius: '0.6rem',
                outline: 'none',
                fontSize: '0.875rem',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              style={{
                width: 38,
                height: 38,
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: isLoading || !input.trim() ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : null}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={toggleLabel}
        style={{
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          color: 'white',
          border: '3px solid white',
          width: isCompactViewport ? '56px' : 'auto',
          height: isCompactViewport ? '56px' : 'auto',
          padding: isCompactViewport ? '0' : '0.85rem 1.25rem',
          borderRadius: '9999px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isCompactViewport ? 0 : '0.6rem',
          cursor: 'pointer',
          boxShadow: '0 10px 25px rgba(99, 102, 241, 0.45)',
          fontSize: isCompactViewport ? '0.88rem' : '0.95rem',
          fontWeight: 700,
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.transform = 'translateY(-3px)';
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <Sparkles size={isCompactViewport ? 20 : 22} />
        {!isCompactViewport ? toggleLabel : null}
      </button>
    </div>
  );
};

export default FloatingAI;
