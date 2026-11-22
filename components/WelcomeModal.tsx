'use client'

import { useState, useEffect } from 'react'

const SLIDES = [
  {
    emoji: '✦',
    title: 'Welcome to Arize',
    body: 'Thank you for joining us. You\'ve taken a meaningful step — and we\'re honored to be part of your journey.',
    accent: "var(--green)",
  },
  {
    emoji: '🌿',
    title: 'Built for You',
    body: 'Arize was designed for diverse communities navigating spaces where they haven\'t always been seen, heard, or supported. This is a space that gets it.',
    accent: "var(--green)",
  },
  {
    emoji: '💫',
    title: 'Three Pillars',
    body: 'Be seen. Be heard. Feel connected. Every feature in this app serves one of these three goals — because you deserve all three.',
    accent: "var(--green)",
  },
  {
    emoji: '👥',
    title: 'The Village',
    body: 'Your community of peers and support. Real conversations in private rooms, with people who understand what you\'re navigating. The village gets stronger together.',
    accent: "var(--green)",
  },
  {
    emoji: '🌱',
    title: 'Clarity Coach',
    body: 'Your AI thinking partner — available 24/7 to help you process situations, prepare for hard conversations, and find your next move. You don\'t have to figure it out alone.',
    accent: "var(--green)",
  },
]

export function WelcomeModal() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      const seen = localStorage.getItem('arize_welcomed')
      if (!seen) queueMicrotask(() => setVisible(true))
    } catch {}
  }, [])

  function dismiss() {
    try { localStorage.setItem('arize_welcomed', '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null

  const slide = SLIDES[step]
  const isLast = step === SLIDES.length - 1

  return (
    <div className="adult-welcome-overlay" role="dialog" aria-modal="true" aria-labelledby="adult-welcome-title" style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(10,20,9,0.92)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      padding: '0',
    }}>
      <div className="adult-welcome-card" style={{
        width: '100%', maxWidth: '430px',
        background: "var(--green-soft)",
        border: "1px solid var(--border)",
        borderRadius: '28px 28px 0 0',
        padding: '32px 28px 40px',
        minHeight: '480px',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{
              width: i === step ? '20px' : '6px', height: '6px', borderRadius: '100px',
              background: i === step ? slide.accent : "var(--surface-soft)",
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '24px',
            background: `var(--green-soft)`,
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '32px', marginBottom: "20px",
          }}>
            {slide.emoji}
          </div>
          <h2 id="adult-welcome-title" style={{
            fontFamily: "var(--font-adult)", fontSize: '26px', color: "var(--ink)",
            fontWeight: 400, lineHeight: 1.2, marginBottom: '16px',
          }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: "16px", color: "var(--muted)", lineHeight: 1.7, maxWidth: '320px' }}>
            {slide.body}
          </p>
        </div>

        {/* Actions */}
        <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {isLast ? (
            <button
              onClick={dismiss}
              style={{
                width: '100%', background: "var(--orange)", color: "var(--ink)",
                border: 'none', borderRadius: '14px', padding: '16px',
                fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                fontFamily: "var(--font-adult)", letterSpacing: '0.02em',
              }}>
              Let&apos;s go →
            </button>
          ) : (
            <>
              <button
                onClick={() => setStep(s => s + 1)}
                style={{
                  width: '100%', background: "var(--orange)", color: "var(--ink)",
                  border: 'none', borderRadius: '14px', padding: '16px',
                  fontSize: '15px', fontWeight: 700, cursor: 'pointer',
                  fontFamily: "var(--font-adult)",
                }}>
                Next →
              </button>
              <button
                onClick={dismiss}
                style={{
                  width: '100%', background: 'transparent', color: "var(--muted)",
                  border: 'none', borderRadius: '14px', padding: '12px',
                  fontSize: "16px", cursor: 'pointer', fontFamily: "var(--font-adult)",
                }}>
                Skip intro
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
