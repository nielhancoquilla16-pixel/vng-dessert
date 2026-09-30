import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, MessageCircle, X } from 'lucide-react';
import { useAI } from '../context/AIContext';
import AssistantMessage from './AssistantMessage';
import { CUSTOMER_SUPPORT_GREETING } from '../utils/customerSupportChat';
import './FloatingAI.css';

export default function FloatingAI({ inline = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'ai', text: CUSTOMER_SUPPORT_GREETING }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { queryGeneralAI } = useAI();
  const dialogRef = useRef(null);
  const messageRef = useRef(null);
  const toggleRef = useRef(null);
  const close = () => { setIsOpen(false); toggleRef.current?.focus(); };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const resize = () => {
      dialogRef.current?.style.setProperty('--chat-viewport-height', `${viewport?.height || window.innerHeight}px`);
      dialogRef.current?.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    return () => {
      document.body.style.overflow = previous;
      viewport?.removeEventListener('resize', resize);
      viewport?.removeEventListener('scroll', resize);
    };
  }, [isOpen]);
  useEffect(() => {
    if (messageRef.current) messageRef.current.scrollTop = messageRef.current.scrollHeight;
  }, [messages, isLoading]);

  async function handleSend(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setIsLoading(true);
    try {
      const reply = await queryGeneralAI(text, messages);
      setMessages((prev) => [...prev, { role: 'ai', text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Sorry, I had trouble connecting. Please try again.' }]);
    } finally { setIsLoading(false); }
  }

  return <>
    <button ref={toggleRef} type="button" className={`shop-help-toggle${inline ? ' inline' : ''}`} onClick={() => setIsOpen(true)} aria-label="Open dessert shop assistant" aria-haspopup="dialog"><MessageCircle size={21} /><span>Help</span></button>
    {createPortal(<dialog ref={dialogRef} className="shop-chat-dialog" aria-labelledby="shop-chat-title" onCancel={close} onClose={() => setIsOpen(false)} onClick={(event) => { if (event.target === dialogRef.current) close(); }}>
      <div className="shop-chat-panel">
        <div className="shop-chat-heading"><div><h2 id="shop-chat-title">A little help?</h2><p>V & G dessert assistant · AI</p></div><button type="button" aria-label="Close assistant" onClick={close} autoFocus><X size={22} /></button></div>
        <div className="shop-chat-messages" ref={messageRef} role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => <div key={index} className={`shop-chat-message ${message.role}`}>{message.role === 'user' ? message.text : <AssistantMessage text={message.text} />}</div>)}
          {isLoading && <p className="shop-chat-message ai" role="status">Thinking…</p>}
        </div>
        <form className="shop-chat-form" onSubmit={handleSend}><input aria-label="Message the dessert assistant" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type your question…" autoComplete="off" /><button type="submit" aria-label="Send message" disabled={isLoading || !input.trim()}><Send size={20} /></button></form>
      </div>
    </dialog>, document.body)}
  </>;
}
