'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getDb, isFirebaseConfigured } from '@/lib/firebase';
import { ref, set, onValue } from 'firebase/database';
import { generateRoomId } from '@/lib/gameLogic';

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [waitingForGuest, setWaitingForGuest] = useState(false);
  const [error, setError] = useState('');

  const trimmedName = name.trim();

  function checkFirebase() {
    if (!isFirebaseConfigured()) {
      setError('Firebase not configured! Fill in .env.local with your Firebase credentials.');
      return false;
    }
    return true;
  }

  async function playVsComputer() {
    if (!trimmedName) { setError('Apna naam daalo pehle!'); return; }
    if (!checkFirebase()) return;
    setError('');
    setLoading(true);
    const roomId = generateRoomId();
    try {
      const db = getDb();
      await set(ref(db, `rooms/${roomId}`), {
        host: { name: trimmedName },
        guest: { name: 'Computer', isAI: true },
        status: 'playing',
        turn: 'host',
        hostArrows: 0,
        guestArrows: 0,
        shots: [],
        winner: null,
        mode: 'computer',
        createdAt: Date.now(),
      });
      router.push(`/game/${roomId}?role=host`);
    } catch (e) {
      setError('Something went wrong: ' + e.message);
      setLoading(false);
    }
  }

  async function inviteFriend() {
    if (!trimmedName) { setError('Apna naam daalo pehle!'); return; }
    if (!checkFirebase()) return;
    setError('');
    setLoading(true);
    const roomId = generateRoomId();
    try {
      const db = getDb();
      await set(ref(db, `rooms/${roomId}`), {
        host: { name: trimmedName },
        guest: null,
        status: 'waiting',
        turn: 'host',
        hostArrows: 0,
        guestArrows: 0,
        shots: [],
        winner: null,
        mode: 'friend',
        createdAt: Date.now(),
      });
      const link = `${window.location.origin}/game/${roomId}?role=guest`;
      setInviteLink(link);
      setLoading(false);
      setWaitingForGuest(true);

      const guestRef = ref(db, `rooms/${roomId}/guest`);
      const unsubscribe = onValue(guestRef, (snap) => {
        const val = snap.val();
        if (val && val.name && val.name !== '') {
          unsubscribe();
          router.push(`/game/${roomId}?role=host`);
        }
      });
    } catch (e) {
      setError('Something went wrong: ' + e.message);
      setLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch { /* ignore */ }
  }

  return (
    <main className="home-page">
      <div style={{ marginBottom: '1.5rem', fontSize: '5rem', lineHeight: 1, filter: 'drop-shadow(0 0 20px rgba(255,107,53,0.6))' }}>
        🏹
      </div>

      <h1 className="home-title">Archery Battle</h1>
      <p className="home-subtitle">Two-Player Archery Duel</p>

      <div className="home-card">
        <div className="input-group">
          <label htmlFor="player-name">Your Name</label>
          <input
            id="player-name"
            type="text"
            placeholder="Enter your name..."
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && playVsComputer()}
            maxLength={20}
            autoComplete="off"
            autoFocus
          />
        </div>

        {error && (
          <p style={{ color: 'var(--red)', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center', lineHeight: 1.4 }}>
            ⚠️ {error}
          </p>
        )}

        <div className="btn-row">
          <button
            id="btn-vs-computer"
            className="btn btn-primary"
            onClick={playVsComputer}
            disabled={loading || waitingForGuest}
          >
            🤖 Play vs Computer
          </button>
          <button
            id="btn-invite-friend"
            className="btn btn-secondary"
            onClick={inviteFriend}
            disabled={loading || waitingForGuest}
          >
            🔗 Invite a Friend
          </button>
        </div>

        {inviteLink && (
          <div className="invite-box">
            <p>📨 Share this link with your friend:</p>
            <div className="invite-link-row">
              <span className="invite-link-text">{inviteLink}</span>
              <button className="btn-copy" onClick={copyLink}>
                {copied ? '✅ Copied!' : 'Copy'}
              </button>
            </div>
            <p className="invite-hint">Friend ke click karte hi game automatic start hoga!</p>
            {waitingForGuest && (
              <div className="waiting-msg">
                <div className="spinner" />
                Friend ka wait kar rahe hain...
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ marginTop: '2rem', fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center' }}>
        Dark mode • Low internet friendly • Works on all devices
      </p>
    </main>
  );
}
