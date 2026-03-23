'use client';
import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { getDb } from '@/lib/firebase';
import { ref, onValue, update } from 'firebase/database';
import GameCanvas from '@/components/GameCanvas';

function GameRoomInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = params.roomId;
  const rawRole = searchParams.get('role') || 'guest';

  const [gameState, setGameState] = useState(null);
  const [role] = useState(rawRole);
  const [guestName, setGuestName] = useState('');
  const [showNameModal, setShowNameModal] = useState(rawRole === 'guest');
  const [nameInput, setNameInput] = useState('');
  const [countdown, setCountdown] = useState(null);
  const [nameError, setNameError] = useState('');

  // Subscribe to room state
  useEffect(() => {
    if (!roomId) return;
    const db = getDb();
    if (!db) { router.push('/'); return; }
    const roomRef = ref(db, `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snap) => {
      const val = snap.val();
      if (!val) { router.push('/'); return; }
      setGameState(val);
    });
    return () => unsub();
  }, [roomId, router]);

  // Countdown when both players ready
  useEffect(() => {
    if (!gameState) return;
    if (gameState.status === 'playing' && countdown === null && gameState.mode !== 'computer' && !showNameModal) {
      setCountdown(3);
    }
  }, [gameState, countdown, showNameModal]);

  // Countdown ticker
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function joinAsGuest() {
    const n = nameInput.trim();
    if (!n) { setNameError('Naam daalo!'); return; }
    setNameError('');
    try {
      const db = getDb();
      await update(ref(db, `rooms/${roomId}`), { guest: { name: n }, status: 'playing' });
      setGuestName(n);
      setShowNameModal(false);
      setCountdown(3);
    } catch {
      setNameError('Connection error. Try again.');
    }
  }

  if (!gameState) {
    return (
      <div className="overlay">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
        <p style={{ marginTop: '1rem', color: 'var(--text-dim)' }}>Loading game...</p>
      </div>
    );
  }

  if (showNameModal) {
    return (
      <div className="overlay">
        <div className="modal-card">
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏹</div>
          <h2 className="modal-title">Join the Battle!</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            <strong style={{ color: 'var(--accent2)' }}>{gameState.host?.name}</strong> ne tumhe challenge kiya hai!
          </p>
          <input
            className="modal-input"
            type="text"
            placeholder="Apna naam daalo..."
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinAsGuest()}
            autoFocus
            maxLength={20}
          />
          {nameError && <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '0.8rem' }}>⚠️ {nameError}</p>}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={joinAsGuest}>
            ⚔️ Enter the Arena!
          </button>
        </div>
      </div>
    );
  }

  if (countdown !== null && countdown > 0) {
    return (
      <div className="overlay">
        <p className="countdown-label">Get Ready!</p>
        <div className="countdown">{countdown}</div>
        <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>
          {role === 'host' ? gameState.host?.name : (guestName || gameState.guest?.name)}
          {' vs '}
          {role === 'host' ? gameState.guest?.name : gameState.host?.name}
        </p>
      </div>
    );
  }

  if (gameState.status === 'waiting' && role === 'host') {
    return (
      <div className="overlay">
        <div className="modal-card">
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <h2 className="modal-title">Waiting for Friend</h2>
          <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem' }}>Apna invite link share karo!</p>
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.78rem', color: 'var(--text-dim)', wordBreak: 'break-all', marginBottom: '1rem' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/game/${roomId}?role=guest` : ''}
          </div>
          <div className="waiting-msg">
            <div className="spinner" />
            Friend ka wait kar rahe hain...
          </div>
          <button className="btn btn-ghost" style={{ marginTop: '1.5rem', width: '100%' }} onClick={() => router.push('/')}>
            ← Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="game-page">
      <GameCanvas
        roomId={roomId}
        role={role}
        gameState={gameState}
        myName={role === 'host' ? gameState.host?.name : (guestName || gameState.guest?.name)}
      />
    </div>
  );
}

export default function GameRoomPage() {
  return (
    <Suspense fallback={
      <div className="overlay">
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3 }} />
      </div>
    }>
      <GameRoomInner />
    </Suspense>
  );
}
