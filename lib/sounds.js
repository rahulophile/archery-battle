// Web Audio API sound effects — no external files needed
// All sounds synthesized procedurally

let _ctx = null;

function getAudioCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Bow twang / arrow release 🏹
export function playBowRelease() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    // Pluck: brief high oscillator with fast decay
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.22);

    // Whoosh: filtered noise
    const bufSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.8;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.12, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.15);
  } catch {}
}

// Arrow hits body 💥
export function playArrowHit() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    // Thud: low frequency pulse
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);

    // Flesh impact crack
    const bufSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.25, t);
    src.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.06);
  } catch {}
}

// Arrow misses — air whoosh 🌬️
export function playArrowMiss() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    const bufSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(200, t + 0.2);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.2);
  } catch {}
}

// Win fanfare 🏆
export function playWin() {
  try {
    const ctx = getAudioCtx();
    const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.15;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {}
}

// Lose sound 💀
export function playLose() {
  try {
    const ctx = getAudioCtx();
    const notes = [392, 330, 262]; // G4 E4 C4 descending
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch {}
}

// Arrow clash / explosion 💥
export function playArrowClash() {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    // Metallic ping
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.1);
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.15);

    // Boom noise
    const bufSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.4, t);
    // Apply lowpass for boom
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.2);
  } catch {}
}
