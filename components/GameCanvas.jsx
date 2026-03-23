'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { getDb } from '@/lib/firebase';
import { ref, update, onValue } from 'firebase/database';
import {
  calculateTrajectory,
  computeAIShot,
  isInsideRect,
  dist,
  ARROW_COUNT_TO_DIE,
} from '@/lib/gameLogic';
import { playBowRelease, playArrowHit, playArrowMiss, playWin, playLose, playArrowClash } from '@/lib/sounds';
import { useRouter } from 'next/navigation';

// ─── Drawing helpers ──────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Draw a single stuck arrow embedded in body at offset (ox, oy) with angle
function drawStuckArrow(ctx, cx, cy, ox, oy, angle) {
  ctx.save();
  ctx.translate(cx + ox, cy + oy);
  ctx.rotate(angle);
  // shaft going into body (half hidden)
  ctx.strokeStyle = '#c8a050';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -18);  // tip inside body
  ctx.lineTo(0, 14);   // tail sticking out
  ctx.stroke();
  // tail feathers
  ctx.strokeStyle = '#e05555';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 10);
  ctx.lineTo(-5, 16);
  ctx.moveTo(0, 10);
  ctx.lineTo(5, 16);
  ctx.stroke();
  ctx.restore();
}

function drawArcher(ctx, cx, cy, facing, stuckArrows, isMe, joltOffset, aimParams) {
  const dir = facing === 'right' ? 1 : -1;
  const jx = joltOffset || 0; // horizontal jolt

  ctx.save();
  ctx.translate(jx, 0);
  ctx.shadowBlur = 20;
  ctx.shadowColor = isMe ? 'rgba(255,160,50,0.5)' : 'rgba(100,100,255,0.5)';

  // legs
  ctx.fillStyle = isMe ? '#d97706' : '#5b63d6';
  ctx.fillRect(cx - 10, cy + 20, 10, 22);
  ctx.fillRect(cx, cy + 20, 10, 22);

  // Body
  ctx.fillStyle = isMe ? '#ff9f1c' : '#7c85ff';
  roundRect(ctx, cx - 12, cy - 28, 24, 48, 6);
  ctx.fill();

  // Stuck arrows drawn ON BODY
  if (stuckArrows && stuckArrows.length > 0) {
    for (const sa of stuckArrows) {
      drawStuckArrow(ctx, cx, cy, sa.ox, sa.oy, sa.angle);
    }
  }

  // Head
  ctx.beginPath();
  ctx.arc(cx, cy - 40, 16, 0, Math.PI * 2);
  ctx.fillStyle = isMe ? '#ffb347' : '#9097ff';
  ctx.shadowBlur = 0;
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#0a0a0f';
  ctx.beginPath();
  ctx.arc(cx + 6 * dir, cy - 43, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx + 4 * dir, cy - 44, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Realistic Bow & Arrow Nocking
  const bx = cx + 8 * dir; // Hand position
  const by = cy - 20;

  let bowAngle = 0;
  let pullDist = 0;
  if (aimParams) {
    // Determine the base elevation angle (0 is horizontal facing opponent, positive is UP)
    let elevationDeg = aimParams.angleDeg;
    if (facing === 'left') elevationDeg = 180 - elevationDeg;
    
    // Rotate counter-clockwise from horizontal in standard space
    bowAngle = -elevationDeg * (Math.PI / 180);
    pullDist = (aimParams.power / 100) * 22; // pull back max 22px
  }

  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(dir, 1); // Flip everything if facing left! Now the local space always aims RIGHT.

  // Add base rotation so bow points slightly forward naturally when not pulling
  ctx.rotate(bowAngle + (aimParams ? 0 : 0.2));

  // Recurve Bow Body
  ctx.strokeStyle = '#6b4c3a'; // Dark wood
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.quadraticCurveTo(15, -15, 4, 0); // Upper limb
  ctx.quadraticCurveTo(15, 15, 0, 32);  // Lower limb
  ctx.stroke();

  // Drawn Arrow
  if (pullDist > 0) {
    ctx.strokeStyle = '#d4b881';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-pullDist, 0); // Nock
    ctx.lineTo(24, 0);        // Tip
    ctx.stroke();

    // Arrowhead
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.lineTo(20, -3);
    ctx.lineTo(20, 3);
    ctx.fill();

    // Feathers
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(-pullDist, 0);
    ctx.lineTo(-pullDist + 6, -4);
    ctx.lineTo(-pullDist + 6, 4);
    ctx.fill();
  }

  // Bow string
  ctx.strokeStyle = 'rgba(232, 213, 163, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -32);
  ctx.lineTo(-pullDist, 0);
  ctx.lineTo(0, 32);
  ctx.stroke();

  ctx.restore(); // end bow context

  ctx.restore(); // end archer context
}

function drawFlyingArrow(ctx, x, y, vx, vy) {
  const angle = Math.atan2(vy, vx);
  const speed = Math.sqrt(vx * vx + vy * vy);
  
  // Animate the trail lengths and opacities over time for a flickering effect
  const time = Date.now();
  const trailLen = speed * 1.5 + Math.sin(time / 50) * 8 + 5; 
  const trailOpacity = 0.2 + (Math.sin(time / 30) + 1) * 0.2; // pulse 0.2 to 0.6
  
  // Arrow flight slight wobble
  const wobble = Math.sin(time / 40) * 0.05;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + wobble);

  // Motion blur trail
  ctx.strokeStyle = `rgba(255, 255, 255, ${trailOpacity})`;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-18 - trailLen, 0);
  ctx.lineTo(-20, 0);
  ctx.stroke();

  // Wood shaft
  ctx.strokeStyle = '#d4b881';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(12, 0);
  ctx.stroke();

  // Arrowhead (metal)
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(8, -4);
  ctx.lineTo(8, 4);
  ctx.closePath();
  ctx.fill();

  // Fletching (feathers)
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-12, -4);
  ctx.lineTo(-12, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-18, 0);
  ctx.lineTo(-12, 4);
  ctx.lineTo(-12, 0);
  ctx.fill();

  ctx.restore();
}

function drawBackground(ctx, W, H) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  skyGrad.addColorStop(0, '#020210');
  skyGrad.addColorStop(0.6, '#0a0825');
  skyGrad.addColorStop(1, '#18102a');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Moon
  ctx.save();
  ctx.fillStyle = '#fffde7';
  ctx.shadowBlur = 30;
  ctx.shadowColor = '#fffde7';
  ctx.beginPath();
  ctx.arc(W * 0.8, H * 0.12, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0825';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(W * 0.8 + 10, H * 0.12 - 5, 23, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Stars
  const stars = [
    [0.1,0.05],[0.2,0.12],[0.3,0.07],[0.45,0.04],[0.55,0.1],
    [0.65,0.06],[0.15,0.18],[0.5,0.17],[0.35,0.14],[0.75,0.08],
    [0.9,0.15],[0.05,0.25],[0.4,0.22],[0.6,0.19],[0.88,0.25],
  ];
  const t = Date.now() / 2000;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < stars.length; i++) {
    const [sx, sy] = stars[i];
    ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t + i * 0.7));
    ctx.beginPath();
    ctx.arc(sx * W, sy * H, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ground
  const gGrad = ctx.createLinearGradient(0, H * 0.75, 0, H);
  gGrad.addColorStop(0, '#1a1008');
  gGrad.addColorStop(1, '#0a0803');
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, H * 0.75, W, H * 0.25);

  ctx.strokeStyle = '#3a2a10';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.75);
  ctx.lineTo(W, H * 0.75);
  ctx.stroke();

  // Grass
  ctx.strokeStyle = '#2d4a1e';
  ctx.lineWidth = 2;
  for (let gx = 30; gx < W; gx += 55 + (gx * 7) % 40) {
    const gy = H * 0.75;
    ctx.beginPath();
    ctx.moveTo(gx, gy); ctx.lineTo(gx - 5, gy - 12);
    ctx.moveTo(gx, gy); ctx.lineTo(gx + 5, gy - 14);
    ctx.moveTo(gx, gy); ctx.lineTo(gx, gy - 10);
    ctx.stroke();
  }

  // Center divider
  ctx.strokeStyle = 'rgba(255,107,53,0.12)';
  ctx.setLineDash([8, 12]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H * 0.75);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawAimTrajectory(ctx, points) {
  if (points.length < 2) return;
  ctx.save();
  for (let i = 0; i < points.length; i += 3) {
    const p = points[i];
    const alpha = (1 - i / points.length) * 0.75;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff9f1c';
    ctx.shadowBlur = 5;
    ctx.shadowColor = '#ff9f1c';
    const r = 3 - (i / points.length) * 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(r, 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Generate a random stuck arrow offset for a body hit
function randomStuckArrowData(archerCx, archerCy) {
  // Body region: x ±12, y -28 to +20 relative to archer cy
  const ox = (Math.random() - 0.5) * 20;  // ±10px from center
  const oy = (Math.random() * 36) - 20;    // -20 to +16 (torso range)
  const angle = (Math.random() - 0.5) * 0.6 + Math.PI / 2; // mostly vertical, slight tilt
  return { ox, oy, angle };
}

// ─── Main Component ──────────────────────────────────────────────
export default function GameCanvas({ roomId, role, gameState, myName }) {
  const canvasRef = useRef(null);
  const router = useRouter();
  const animRef = useRef(null);
  const stateRef = useRef(gameState);

  // Flying arrows: array of {trajectory, tickIndex, shooter, destroyed?}
  const flyingArrowsRef = useRef([]);
  const explosionsRef = useRef([]);
  const aimingRef = useRef(null);
  const lastAimSyncRef = useRef(0);

  // Jolt animations: {host: {startTime, dir}, guest: {...}}
  const joltRef = useRef({ host: null, guest: null });

  // Cooldown: prevent firing too fast
  const lastFireTimeRef = useRef(0);
  const FIRE_COOLDOWN_MS = 1800;

  const [hudState, setHudState] = useState({
    hostArrows: 0,
    guestArrows: 0,
  });
  const [winner, setWinner] = useState(null);
  const [showAimInfo, setShowAimInfo] = useState(false);
  const [aimAngle, setAimAngle] = useState(null);
  const [aimPower, setAimPower] = useState(null);
  const [canFire, setCanFire] = useState(true);

  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  // Watch for winner / quit
  const handledWinnerRef = useRef(null);
  useEffect(() => {
    if (!gameState) return;
    
    // Win scenario
    if (gameState.winner && gameState.winner !== handledWinnerRef.current) {
      handledWinnerRef.current = gameState.winner;
      setWinner(gameState.winner);
      if (gameState.winner === role) playWin(); else playLose();
    }
    // Quit scenario
    else if (gameState.quit && gameState.quit !== handledWinnerRef.current) {
      handledWinnerRef.current = gameState.quit;
      const quitter = gameState.quit;
      const winnerRole = quitter === 'host' ? 'guest' : 'host';
      setWinner(winnerRole + '_by_quit');
      if (winnerRole === role) playWin(); else playLose();
    }
    // Restart scenario
    else if (!gameState.winner && !gameState.quit && handledWinnerRef.current) {
      handledWinnerRef.current = null;
      setWinner(null);
    }
  }, [gameState, role]);

  // Watch for new opponent shots → animate incoming arrow + trigger jolt on hit
  const lastHostShotRef = useRef(0);
  const lastGuestShotRef = useRef(0);
  useEffect(() => {
    if (!gameState) return;
    if (!gameState.shots) {
      lastHostShotRef.current = 0;
      lastGuestShotRef.current = 0;
      flyingArrowsRef.current = [];
      return;
    }
    const shots = Array.isArray(gameState.shots) ? gameState.shots : Object.values(gameState.shots);
    const oppShots = shots.filter(s => s.shooter !== role);
    const myCount = role === 'host' ? lastHostShotRef : lastGuestShotRef;
    const oppCount = role === 'host' ? lastGuestShotRef : lastHostShotRef;

    if (oppShots.length > oppCount.current) {
      const newShots = oppShots.slice(oppCount.current);
      oppCount.current = oppShots.length;
      for (const shot of newShots) {
        animateIncomingArrow(shot);
        if (shot.hitType === 'body') {
          // Trigger jolt on ME (I got hit)
          joltRef.current[role] = { startTime: Date.now(), dir: role === 'host' ? 1 : -1 };
        }
      }
    }
  }, [gameState?.shots, role]);

  // HUD sync
  useEffect(() => {
    if (!gameState) return;
    setHudState({
      hostArrows: gameState.hostArrows || 0,
      guestArrows: gameState.guestArrows || 0,
    });
  }, [gameState]);

  // Quit on unload
  useEffect(() => {
    const handleUnload = () => {
      const db = getDb();
      if (db) update(ref(db, `rooms/${roomId}`), { quit: role });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [roomId, role]);

  function getCanvasSize() {
    const c = canvasRef.current;
    return c ? { W: c.width, H: c.height } : { W: 800, H: 500 };
  }

  function getArcherPositions(W, H) {
    const groundY = H * 0.75;
    return {
      host: { x: W * 0.18, y: groundY - 44, facing: 'right' },
      guest: { x: W * 0.82, y: groundY - 44, facing: 'left' },
    };
  }

  function getPowerAndAngle(startX, startY, curX, curY, facing) {
    const dx = curX - startX;
    const dy = curY - startY;
    const rawDist = Math.sqrt(dx * dx + dy * dy);
    const power = Math.min(rawDist / 100, 1);
    // Angry Birds mechanic: drag BACK to shoot FORWARD
    // For right-facing: pull left (dx<0) + down (dy>0) → arrow goes right+up
    //   angle = atan2(dy, -dx): atan2(+50, +80) = +32° ✓
    // For left-facing: pull right (dx>0) + down (dy>0) → arrow goes left+up
    //   angle = atan2(dy, dx): atan2(+50, +80) = +32°, then flipped to 148° ✓
    let angleDeg = Math.atan2(dy, facing === 'right' ? -dx : dx) * (180 / Math.PI);
    angleDeg = Math.max(5, Math.min(80, angleDeg));
    if (facing === 'left') angleDeg = 180 - angleDeg;
    return { power, angleDeg };
  }

  // ── Canvas rendering loop ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function render() {
      const { W, H } = getCanvasSize();
      const s = stateRef.current;
      if (!s) { animRef.current = requestAnimationFrame(render); return; }

      const positions = getArcherPositions(W, H);
      const now = Date.now();

      // Parse stuck arrows
      const hostStuck = s.hostStuck
        ? (Array.isArray(s.hostStuck) ? s.hostStuck : Object.values(s.hostStuck))
        : [];
      const guestStuck = s.guestStuck
        ? (Array.isArray(s.guestStuck) ? s.guestStuck : Object.values(s.guestStuck))
        : [];

      // Compute jolt offsets
      const JOLT_DURATION = 500;
      const JOLT_AMPLITUDE = 12;
      function getJolt(playerRole) {
        const j = joltRef.current[playerRole];
        if (!j) return 0;
        const elapsed = now - j.startTime;
        if (elapsed > JOLT_DURATION) { joltRef.current[playerRole] = null; return 0; }
        const t = elapsed / JOLT_DURATION;
        return j.dir * JOLT_AMPLITUDE * Math.sin(t * Math.PI * 4) * (1 - t);
      }

      drawBackground(ctx, W, H);

      // Aim trajectory
      let myAim = null;
      if (aimingRef.current) {
        const { startX, startY, curX, curY } = aimingRef.current;
        const myPos = positions[role];
        const { power, angleDeg } = getPowerAndAngle(startX, startY, curX, curY, myPos.facing);
        myAim = { power, angleDeg };
        const traj = calculateTrajectory(myPos.x, myPos.y, angleDeg, power, W, H);
        drawAimTrajectory(ctx, traj);
      }

      // Draw archers
      const oppRole = role === 'host' ? 'guest' : 'host';
      const myPos = positions[role];
      const oppPos = positions[oppRole];
      const myStuck = role === 'host' ? hostStuck : guestStuck;
      const oppStuck = role === 'host' ? guestStuck : hostStuck;

      const oppAim = s?.[oppRole + 'Aim'] || null;

      drawArcher(ctx, myPos.x, myPos.y, myPos.facing, myStuck, true, getJolt(role), myAim);
      drawArcher(ctx, oppPos.x, oppPos.y, oppPos.facing, oppStuck, false, getJolt(oppRole), oppAim);

      // Life counters
      const myHits = role === 'host' ? (s.hostArrows || 0) : (s.guestArrows || 0);
      const oppHits = role === 'host' ? (s.guestArrows || 0) : (s.hostArrows || 0);
      drawLifeCounter(ctx, myPos.x, myPos.y - 72, myHits, true);
      drawLifeCounter(ctx, oppPos.x, oppPos.y - 72, oppHits, false);
      drawPlayerLabel(ctx, myPos.x, myPos.y - 90, s[role]?.name || 'You', true);
      drawPlayerLabel(ctx, oppPos.x, oppPos.y - 90, s[oppRole]?.name || 'Opponent', false);

      // Mid-air collision detection
      const arrows = flyingArrowsRef.current;
      for (let i = 0; i < arrows.length; i++) {
        for (let j = i + 1; j < arrows.length; j++) {
          const a1 = arrows[i];
          const a2 = arrows[j];
          if (a1.shooter !== a2.shooter && !a1.destroyed && !a2.destroyed) {
            const p1 = a1.trajectory[Math.floor(a1.tickIndex)];
            const p2 = a2.trajectory[Math.floor(a2.tickIndex)];
            if (p1 && p2) {
              const dx = p1.x - p2.x;
              const dy = p1.y - p2.y;
              if (Math.sqrt(dx * dx + dy * dy) < 25) { // Collision threshold
                a1.destroyed = true;
                a2.destroyed = true;
                explosionsRef.current.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, frame: 0 });
                playArrowClash();
              }
            }
          }
        }
      }

      // Draw flying arrows
      flyingArrowsRef.current = flyingArrowsRef.current.filter(fa => {
        if (fa.destroyed) return false;
        const currentIndex = Math.floor(fa.tickIndex);
        const pt = fa.trajectory[currentIndex];
        const ptNext = fa.trajectory[Math.min(currentIndex + 2, fa.trajectory.length - 1)];
        if (!pt) return false;
        const vx = ptNext.x - pt.x;
        const vy = ptNext.y - pt.y;
        drawFlyingArrow(ctx, pt.x, pt.y, vx, vy);
        fa.tickIndex += 0.7; // Very slow cinematic speed
        return currentIndex < fa.trajectory.length - 1;
      });

      // Draw Explosions
      explosionsRef.current = explosionsRef.current.filter(exp => {
        ctx.save();
        ctx.translate(exp.x, exp.y);
        const radius = exp.frame * 2.5;
        const alpha = Math.max(0, 1 - (exp.frame / 20)); // 20 frames
        ctx.globalAlpha = alpha;
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb347';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff6b35';
        ctx.fill();

        ctx.fillStyle = '#fff';
        for(let i=0; i<6; i++) {
           const ang = i * Math.PI * 2 / 6 + exp.frame * 0.1;
           const r = radius * 1.5;
           ctx.beginPath();
           ctx.arc(Math.cos(ang)*r, Math.sin(ang)*r, 2.5, 0, Math.PI * 2);
           ctx.fill();
        }
        ctx.restore();
        
        exp.frame += 0.8;
        return exp.frame < 20;
      });

      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [role]);

  function drawLifeCounter(ctx, x, y, arrowsHit, isMe) {
    const remaining = ARROW_COUNT_TO_DIE - arrowsHit;
    ctx.save();
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = remaining <= 3 ? '#ef4444' : remaining <= 6 ? '#f59e0b' : '#22c55e';
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillText(`❤️ ${remaining}/${ARROW_COUNT_TO_DIE}`, x, y);
    ctx.restore();
  }

  function drawPlayerLabel(ctx, x, y, name, isMe) {
    ctx.save();
    ctx.font = "bold 13px 'Inter', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#ff9f1c' : '#7c85ff';
    ctx.shadowBlur = 8;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fillText(name, x, y);
    ctx.restore();
  }

  // ── Pointer events ─────────────────────────────────────────────
  function getCanvasXY(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onPointerDown(e) {
    if (winner) return;
    const { x, y } = getCanvasXY(e);
    const { W, H } = getCanvasSize();
    const myPos = getArcherPositions(W, H)[role];
    if (dist(x, y, myPos.x, myPos.y) > 100) return;
    aimingRef.current = { startX: x, startY: y, curX: x, curY: y };
    setShowAimInfo(true);
  }

  function onPointerMove(e) {
    if (!aimingRef.current) return;
    const { x, y } = getCanvasXY(e);
    aimingRef.current.curX = x;
    aimingRef.current.curY = y;
    const { W, H } = getCanvasSize();
    const myPos = getArcherPositions(W, H)[role];
    const { power, angleDeg } = getPowerAndAngle(
      aimingRef.current.startX, aimingRef.current.startY, x, y, myPos.facing
    );
    setAimAngle(Math.round(angleDeg));
    setAimPower(Math.round(power * 100));

    // Live sync aim to opponent
    const now = Date.now();
    if (now - lastAimSyncRef.current > 80) {
      lastAimSyncRef.current = now;
      update(ref(getDb()), {
        [`rooms/${roomId}/${role}Aim`]: { angleDeg, power: power * 100 }
      });
    }
  }

  async function onPointerUp(e) {
    if (!aimingRef.current || winner) { aimingRef.current = null; return; }
    const { W, H } = getCanvasSize();
    const myPos = getArcherPositions(W, H)[role];
    const { startX, startY, curX, curY } = aimingRef.current;
    const { power, angleDeg } = getPowerAndAngle(startX, startY, curX, curY, myPos.facing);
    aimingRef.current = null;
    setShowAimInfo(false);
    setAimAngle(null);
    setAimPower(null);

    // Clear live aim
    update(ref(getDb()), { [`rooms/${roomId}/${role}Aim`]: null });

    playBowRelease();
    if (power < 0.05) return;

    // Cooldown check
    const now = Date.now();
    if (now - lastFireTimeRef.current < FIRE_COOLDOWN_MS) return;
    lastFireTimeRef.current = now;

    await fireArrow(angleDeg, power, myPos.x, myPos.y);
  }

  function animateIncomingArrow(shot) {
    const { W, H } = getCanvasSize();
    const positions = getArcherPositions(W, H);
    const shooterPos = positions[shot.shooter];
    const traj = calculateTrajectory(shooterPos.x, shooterPos.y, shot.angleDeg, shot.power, W, H);
    flyingArrowsRef.current.push({ trajectory: traj, tickIndex: 0, shooter: shot.shooter });
  }

  async function fireArrow(angleDeg, power, startX, startY) {
    const { W, H } = getCanvasSize();
    const positions = getArcherPositions(W, H);
    const fullTraj = calculateTrajectory(startX, startY, angleDeg, power, W, H);

    const oppRole = role === 'host' ? 'guest' : 'host';
    const oppPos = positions[oppRole];
    const archerRect = { x: oppPos.x - 35, y: oppPos.y - 80, w: 70, h: 120 };

    // Find hit index (sweep every point)
    let hitType = 'miss';
    let hitIndex = fullTraj.length - 1;
    for (let i = 0; i < fullTraj.length; i++) {
      if (isInsideRect(fullTraj[i].x, fullTraj[i].y, archerRect)) {
        hitType = 'body';
        hitIndex = i;
        break;
      }
    }

    // Truncate trajectory so arrow STOPS at body on hit
    const traj = hitType === 'body' ? fullTraj.slice(0, hitIndex + 1) : fullTraj;
    
    const myArrowObj = { trajectory: traj, tickIndex: 0, shooter: role, destroyed: false };
    flyingArrowsRef.current.push(myArrowObj);

    // Wait for the duration of the arrow flight animation
    const flightTicks = traj.length - 1;
    const tickMs = 1000 / 60; // assumption: 60fps
    const waitMs = Math.min((flightTicks / 0.7) * tickMs, 3000);
    await new Promise(r => setTimeout(r, waitMs));

    if (myArrowObj.destroyed) {
      // Arrow collided in mid-air and exploded. Do not update Firebase hit!
      return;
    }

    const s = stateRef.current;
    const oppArrowField = oppRole === 'host' ? 'hostArrows' : 'guestArrows';
    const oppStuckField = oppRole === 'host' ? 'hostStuck' : 'guestStuck';
    const oppArrowCount = s?.[oppArrowField] || 0;

    const shot = { shooter: role, angleDeg, power, hitType, timestamp: Date.now() };
    const shots = s?.shots
      ? (Array.isArray(s.shots) ? s.shots : Object.values(s.shots))
      : [];

    let updates = {
      [`rooms/${roomId}/shots`]: [...shots, shot],
    };

    if (hitType === 'body') {
      playArrowHit();
      const newCount = oppArrowCount + 1;
      const isWinner = newCount >= ARROW_COUNT_TO_DIE ? role : null;

      const stuckData = randomStuckArrowData(oppPos.x, oppPos.y);
      const existingStuck = s?.[oppStuckField]
        ? (Array.isArray(s[oppStuckField]) ? s[oppStuckField] : Object.values(s[oppStuckField]))
        : [];

      updates[`rooms/${roomId}/${oppArrowField}`] = newCount;
      updates[`rooms/${roomId}/${oppStuckField}`] = [...existingStuck, stuckData];
      updates[`rooms/${roomId}/winner`] = isWinner;

      joltRef.current[oppRole] = { startTime: Date.now(), dir: oppRole === 'host' ? 1 : -1 };

      await update(ref(getDb()), updates);

      if (!isWinner && s?.mode === 'computer' && oppRole === 'guest') {
        setTimeout(() => aiTakeTurn(positions), 1000 + Math.random() * 600);
      }
    } else {
      playArrowMiss();
      await update(ref(getDb()), updates);
      if (s?.mode === 'computer' && oppRole === 'guest') {
        setTimeout(() => aiTakeTurn(positions), 1000 + Math.random() * 600);
      }
    }
  }

  async function aiTakeTurn(positions) {
    const W = canvasRef.current?.width || 800;
    const H = canvasRef.current?.height || 500;
    const pos = positions || getArcherPositions(W, H);
    const { angle, power } = computeAIShot(
      pos.guest.x, pos.guest.y,
      pos.host.x, pos.host.y,
      0.6
    );

    // AI Aiming Animation
    await new Promise(resolve => {
      let curPower = 0;
      const aimInterval = setInterval(() => {
        curPower += (power * 100) / 8; // takes 8 ticks to draw full power
        if (curPower >= power * 100) {
          clearInterval(aimInterval);
          update(ref(getDb()), { [`rooms/${roomId}/guestAim`]: null });
          resolve();
        } else {
          update(ref(getDb()), { [`rooms/${roomId}/guestAim`]: { angleDeg: angle, power: curPower } });
        }
      }, 60);
    });
    // AI local arrow animation
    const fullTraj = calculateTrajectory(pos.guest.x, pos.guest.y, angle, power, W, H);

    // AI: find hit index with sweep
    const myPos = pos.host;
    const archerRect = { x: myPos.x - 35, y: myPos.y - 80, w: 70, h: 120 };
    let hitType = 'miss';
    let hitIndex = fullTraj.length - 1;
    for (let i = 0; i < fullTraj.length; i++) {
      if (isInsideRect(fullTraj[i].x, fullTraj[i].y, archerRect)) {
        hitType = 'body';
        hitIndex = i;
        break;
      }
    }

    // Truncate so AI arrow stops at body on hit
    const traj = hitType === 'body' ? fullTraj.slice(0, hitIndex + 1) : fullTraj;
    
    const aiArrowObj = { trajectory: traj, tickIndex: 0, shooter: 'guest', destroyed: false };
    flyingArrowsRef.current.push(aiArrowObj);

    const flightTicks = traj.length - 1;
    const tickMs = 1000 / 60; 
    const waitMs = Math.min((flightTicks / 0.7) * tickMs, 3000);
    await new Promise(r => setTimeout(r, waitMs));

    if (aiArrowObj.destroyed) {
       // AI arrow exploded mid-air, no hit recorded!
       return;
    }


    const s = stateRef.current;
    const myArrows = s?.hostArrows || 0;
    const shot = { shooter: 'guest', angleDeg: angle, power, hitType, timestamp: Date.now() };
    const shots = s?.shots
      ? (Array.isArray(s.shots) ? s.shots : Object.values(s.shots))
      : [];

    let updates = { [`rooms/${roomId}/shots`]: [...shots, shot] };

    if (hitType === 'body') {
      const newCount = myArrows + 1;
      const isWinner = newCount >= ARROW_COUNT_TO_DIE ? 'guest' : null;
      const stuckData = randomStuckArrowData(myPos.x, myPos.y);
      const existingStuck = s?.hostStuck
        ? (Array.isArray(s.hostStuck) ? s.hostStuck : Object.values(s.hostStuck))
        : [];

      updates[`rooms/${roomId}/hostArrows`] = newCount;
      updates[`rooms/${roomId}/hostStuck`] = [...existingStuck, stuckData];
      updates[`rooms/${roomId}/winner`] = isWinner;
      joltRef.current['host'] = { startTime: Date.now(), dir: 1 };
    }

    await update(ref(getDb()), updates);
  }

  async function restartGame() {
    await update(ref(getDb()), {
      [`rooms/${roomId}/hostArrows`]: 0,
      [`rooms/${roomId}/guestArrows`]: 0,
      [`rooms/${roomId}/hostStuck`]: null,
      [`rooms/${roomId}/guestStuck`]: null,
      [`rooms/${roomId}/turn`]: 'host',
      [`rooms/${roomId}/winner`]: null,
      [`rooms/${roomId}/quit`]: null,
      [`rooms/${roomId}/shots`]: null,
      [`rooms/${roomId}/status`]: 'playing',
    });
    // Local resets for instant feedback
    handledWinnerRef.current = null;
    flyingArrowsRef.current = [];
    joltRef.current = { host: null, guest: null };
    lastFireTimeRef.current = 0;
    lastHostShotRef.current = 0;
    lastGuestShotRef.current = 0;
    setWinner(null);
  }

  const myScore = role === 'host' ? hudState.hostArrows : hudState.guestArrows;
  const oppScore = role === 'host' ? hudState.guestArrows : hudState.hostArrows;
  const myDisplayName = myName || 'You';
  const oppRole = role === 'host' ? 'guest' : 'host';
  const oppDisplayName = role === 'host'
    ? (gameState?.guest?.name || 'Opponent')
    : (gameState?.host?.name || 'Opponent');

  // Win screen variables
  let isQuit = false, actualWinner = '', iWon = false, winnerName = '';
  if (winner) {
    isQuit = winner.includes('_by_quit');
    actualWinner = isQuit ? winner.replace('_by_quit', '') : winner;
    iWon = actualWinner === role;
    winnerName = actualWinner === 'host'
      ? (gameState?.host?.name || 'Player 1')
      : (gameState?.guest?.name || 'Player 2');
  }

  return (
    <>
      {/* HUD */}
      <div className="game-hud">
        <div className="hud-player">
          <span className="hud-name">{myDisplayName}</span>
          <span className="hud-arrows">Arrows: {myScore}/{ARROW_COUNT_TO_DIE}</span>
          <div className="arrow-pips">
            {Array.from({ length: ARROW_COUNT_TO_DIE }).map((_, i) => (
              <div key={i} className={`arrow-pip${i < myScore ? '' : ' empty'}`} />
            ))}
          </div>
        </div>

        <div className="hud-center">
          <div className="hud-turn">🏹 Fire at Will!</div>
          <div className="hud-info">Drag from archer · Release to shoot</div>
        </div>

        <div className="hud-player">
          <span className="hud-name">{oppDisplayName}</span>
          <span className="hud-arrows">Arrows: {oppScore}/{ARROW_COUNT_TO_DIE}</span>
          <div className="arrow-pips">
            {Array.from({ length: ARROW_COUNT_TO_DIE }).map((_, i) => (
              <div key={i} className={`arrow-pip${i < oppScore ? '' : ' empty'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, width: '100%', cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      />

      {/* Aim info */}
      {showAimInfo && aimAngle !== null && !winner && (
        <div className="aim-info">
          <div className="aim-stat">
            <span className="aim-stat-label">Angle</span>
            <span className="aim-stat-value">{aimAngle}°</span>
          </div>
          <div className="aim-stat">
            <span className="aim-stat-label">Power</span>
            <span className="aim-stat-value">{aimPower}%</span>
          </div>
        </div>
      )}

      {/* Winner Overlay */}
      {winner && (
        <div className="overlay">
          <div className="trophy">{iWon ? '🏆' : '💀'}</div>
          <div className="win-title">{iWon ? 'Victory!' : 'Defeated!'}</div>
          <div className="win-subtitle">
            {isQuit
              ? (iWon ? `${oppDisplayName} quit the game!` : 'You quit.')
              : (iWon ? `${myDisplayName} wins! 🎉` : `${winnerName} wins!`)}
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn btn-primary" style={{ minWidth: 160 }} onClick={restartGame}>
              🔄 Play Again
            </button>
            <button className="btn btn-secondary" style={{ minWidth: 140 }} onClick={() => router.push('/')}>
              🏠 Home
            </button>
          </div>
        </div>
      )}
    </>
  );
}
