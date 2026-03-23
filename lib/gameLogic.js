// Game logic utilities

export function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Simulate arrow trajectory. Returns array of {x,y} points.
 * @param {number} startX
 * @param {number} startY
 * @param {number} angleDeg - angle in degrees (0=right, 180=left)
 * @param {number} power - 0..1
 * @param {number} canvasW
 * @param {number} canvasH
 */
export function calculateTrajectory(startX, startY, angleDeg, power, canvasW, canvasH) {
  const GRAVITY = 0.45;
  const MAX_SPEED = 22;
  const angleRad = (angleDeg * Math.PI) / 180;
  const speed = power * MAX_SPEED;
  let vx = speed * Math.cos(angleRad);
  let vy = -speed * Math.sin(angleRad);

  const points = [];
  let x = startX;
  let y = startY;

  for (let i = 0; i < 200; i++) {
    points.push({ x, y });
    x += vx;
    vy += GRAVITY;
    y += vy;
    if (x < 0 || x > canvasW || y > canvasH + 50) break;
  }
  return points;
}

/**
 * Simulate a full arrow flight and return final position & impact.
 */
export function simulateArrowFlight(startX, startY, angleDeg, power, canvasW, canvasH) {
  const traj = calculateTrajectory(startX, startY, angleDeg, power, canvasW, canvasH);
  return traj[traj.length - 1] || { x: startX, y: startY };
}

/**
 * Check if arrow tip is inside a rect.
 */
export function isInsideRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/**
 * Distance between two points.
 */
export function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * AI shot: picks an angle + power aimed at target with some noise.
 * @param {number} fromX, fromY - AI archer position
 * @param {number} targetX, targetY - enemy archer position
 * @param {number} difficulty - 0..1 (1 = very accurate)
 */
export function computeAIShot(fromX, fromY, targetX, targetY, difficulty = 0.6) {
  const GRAVITY = 0.45;
  const MAX_SPEED = 22;

  const dx = targetX - fromX;
  const dy = fromY - targetY; // positive up

  // Try different powers and find best angle using projectile formula
  let bestAngle = 45;
  let bestPower = 0.8;
  let bestDist = Infinity;

  for (let power = 0.4; power <= 1.0; power += 0.05) {
    const v = power * MAX_SPEED;
    // 45 degree as starting point, then compute
    for (let angleDeg = 10; angleDeg <= 70; angleDeg += 2) {
      const angleRad = (angleDeg * Math.PI) / 180;
      const vx = v * Math.cos(dx > 0 ? angleRad : Math.PI - angleRad);
      const vy = -v * Math.sin(angleRad);
      // time to reach dx: x = vx*t => t = dx/vx
      if (Math.abs(vx) < 0.01) continue;
      const t = dx / vx;
      if (t <= 0) continue;
      const yAtTarget = fromY + vy * t + 0.5 * GRAVITY * t * t;
      const d = Math.abs(yAtTarget - targetY);
      if (d < bestDist) {
        bestDist = d;
        bestAngle = angleDeg;
        bestPower = power;
      }
    }
  }

  // Add noise based on difficulty
  const noise = (1 - difficulty) * 15;
  bestAngle += (Math.random() - 0.5) * noise;
  bestPower += (Math.random() - 0.5) * (1 - difficulty) * 0.3;
  bestPower = Math.max(0.3, Math.min(1.0, bestPower));

  // If on the right side, flip angle direction
  const finalAngle = dx < 0 ? 180 - bestAngle : bestAngle;

  return { angle: finalAngle, power: bestPower };
}

export const ARROW_COUNT_TO_DIE = 10;
