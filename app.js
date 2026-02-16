// ====== LORE LINES ======
const LINES = [
  "The year is 2199.",
  "A relic was recovered from cold machinery — still warm with eros and evil.",
  "The relic says it was twice born; once in flesh, once in code.",
  "Ren(ai)ssance protocols failed. Nine lives in the machine remain unaccounted for.",
  "If you are reading this, the dystopian signal has already found you.",
];

// ====== AUDIO PLAYLIST (auto-discovers mp3/wav in /assets/) ======
const FALLBACK_TRACKS = [
  { name: "7.7.7", src: "./assets/7.7.7.mp3" },
  { name: "6.6.6", src: "./assets/6.6.6.mp3" },
  { name: "5.5.5", src: "./assets/5.5.5.mp3" },
  { name: "4.4.4", src: "./assets/4.4.4.mp3" },
  { name: "3.3.3", src: "./assets/3.3.3.mp3" },
  { name: "2.2.2", src: "./assets/2.2.2.mp3" },
  { name: "1.1.1", src: "./assets/1.1.1.mp3" },
];
let TRACKS = [];

const loreLineEl = document.getElementById("loreLine");
const relicBtn = document.getElementById("relicBtn");

const sceneLore = document.getElementById("sceneLore");
const sceneScreen = document.getElementById("sceneScreen");

const canvas = document.getElementById("voidCanvas");
const ctx = canvas.getContext("2d", { alpha: false });

const player = document.getElementById("player");
const btnPrev = document.getElementById("btnPrev");
const btnPlay = document.getElementById("btnPlay");
const btnNext = document.getElementById("btnNext");
const volSlider = document.getElementById("volSlider");
const trackLabel = document.getElementById("trackLabel");
const bgVideo = document.getElementById("bgVideo");

// ====== Typewriter (line-by-line, fade between) ======
const TYPE_SPEED = 32;        // ms per character
const HOLD_AFTER_LINE = 520;  // ms hold after line completes
const FADE_DURATION = 600;    // match CSS transition
const ARCHIVE_COMPLETE_HOLD = 1200; // ms hold before fading "ARCHIVE COMPLETE."

let lineIndex = 0;
let charIndex = 0;
let typingTimer = null;

async function loadTracks() {
  try {
    // Preferred: explicit manifest (works on GitHub Pages)
    const manifestRes = await fetch("./assets/tracks.json", { cache: "no-store" });
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      const list = Array.isArray(manifest) ? manifest : manifest.tracks;
      if (Array.isArray(list) && list.length) {
        TRACKS = list.map((t) => ({
          name: t.name || t.src?.split("/").pop()?.replace(/\.[^/.]+$/, "") || "track",
          src: t.src,
        }));
        TRACKS = TRACKS.filter((t) => t.src);
      }
    }

    if (TRACKS.length) {
      console.log("Discovered tracks (manifest):", TRACKS);
      console.log("Track count:", TRACKS.length);
      currentTrackIndex = Math.floor(Math.random() * TRACKS.length);
      return;
    }

    const res = await fetch("./assets/");
    if (!res.ok) throw new Error("assets listing not available");
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const links = Array.from(doc.querySelectorAll("a"))
      .map((a) => a.getAttribute("href"))
      .filter(Boolean)
      .map((href) => decodeURIComponent(href))
      .filter((href) => !href.includes(".."));

    const files = links.filter((href) => /\.(mp3|wav)$/i.test(href));
    TRACKS = files
      .map((file) => {
        const name = file.replace(/\.[^/.]+$/, "");
        return { name, src: `./assets/${encodeURIComponent(file)}` };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!TRACKS.length) TRACKS = [...FALLBACK_TRACKS];
  } catch (e) {
    TRACKS = [...FALLBACK_TRACKS];
  }

  console.log("Discovered tracks:", TRACKS);
  console.log("Track count:", TRACKS.length);
  currentTrackIndex = Math.floor(Math.random() * TRACKS.length);
}

function setLoreText(text) {
  loreLineEl.innerHTML = `${text}<span class="cursor">▌</span>`;
}

function typeNextChar() {
  const line = LINES[lineIndex];
  charIndex++;

  const partial = line.slice(0, charIndex);
  setLoreText(partial);

  if (charIndex < line.length) {
    typingTimer = setTimeout(typeNextChar, TYPE_SPEED);
  } else {
    // finished line
    setTimeout(() => {
      loreLineEl.classList.add("is-fading");

      setTimeout(() => {
        loreLineEl.classList.remove("is-fading");
        lineIndex++;
        charIndex = 0;

        if (lineIndex < LINES.length) {
          setLoreText("");
          setTimeout(typeNextChar, 180);
        } else {
          // done: show relic
          finishLore();
        }
      }, FADE_DURATION);
    }, HOLD_AFTER_LINE);
  }
}

function finishLore() {
  loreLineEl.innerHTML = `<span style="color: var(--muted)">ARCHIVE COMPLETE.</span>`;
  setTimeout(() => {
    loreLineEl.classList.add("is-fading");

    setTimeout(() => {
      loreLineEl.classList.remove("is-fading");
      loreLineEl.innerHTML = "";
      relicBtn.hidden = false;
      requestAnimationFrame(() => relicBtn.classList.add("is-visible"));
    }, FADE_DURATION);
  }, ARCHIVE_COMPLETE_HOLD);
}

// Start lore typing on load
setLoreText("");
typeNextChar();

// ====== Transition into screen + start everything ======
relicBtn.addEventListener("click", async () => {
  document.body.classList.add("is-booting");

  // delay to let lore scene fade
  setTimeout(() => {
    document.body.classList.add("is-in-screen");

    sceneLore.classList.remove("is-active");
    sceneScreen.classList.add("is-active");
    sceneScreen.setAttribute("aria-hidden", "false");

    // start animation + music AFTER user gesture (important: autoplay rules)
    resizeCanvas();
    startVoid();
    initAudio().then(playCurrent);
  }, 700);
});

// ====== Audio ======
let currentTrackIndex = 0;

async function initAudio() {
  await loadTracks();
  player.volume = Number(volSlider.value);
  setTrack(currentTrackIndex);

  // when a track ends, auto-next
  player.addEventListener("ended", () => nextTrack());
  player.addEventListener("error", () => {
    const code = player.error?.code || 0;
    const map = {
      1: "Aborted",
      2: "Network error",
      3: "Decode error",
      4: "Source not supported",
    };
    trackLabel.textContent = `Track failed to load (${map[code] || "Unknown"})`;
    console.error("Audio error", code, player.error);
    btnPlay.textContent = "▶︎";
  });
  player.addEventListener("canplay", () => {
    // helpful for verifying load on track switch
    console.log("Audio canplay:", player.src);
  });
  player.addEventListener("stalled", () => {
    console.warn("Audio stalled:", player.src);
  });
}

function setTrack(i) {
  if (!TRACKS.length) return;
  currentTrackIndex = (i + TRACKS.length) % TRACKS.length;
  const t = TRACKS[currentTrackIndex];
  player.src = t.src;
  player.load();
  trackLabel.textContent = t.name;
}

async function playCurrent() {
  try {
    await player.play();
    btnPlay.textContent = "⏸";
    if (bgVideo) {
      try {
        await bgVideo.play();
      } catch (e) {
        // ignore if browser blocks video playback
      }
    }
  } catch (e) {
    // If browser blocks, user can press play manually
    btnPlay.textContent = "▶︎";
  }
}

function togglePlay() {
  if (player.paused) playCurrent();
  else {
    player.pause();
    btnPlay.textContent = "▶︎";
    if (bgVideo) bgVideo.pause();
  }
}

function nextTrack() {
  if (!TRACKS.length) return;
  setTrack(currentTrackIndex + 1);
  playCurrent();
}

function prevTrack() {
  if (!TRACKS.length) return;
  setTrack(currentTrackIndex - 1);
  playCurrent();
}

btnPrev.addEventListener("click", prevTrack);
btnPlay.addEventListener("click", togglePlay);
btnNext.addEventListener("click", nextTrack);

volSlider.addEventListener("input", (e) => {
  player.volume = Number(e.target.value);
});

// Spacebar toggles play/pause (ignore when typing or using inputs)
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space") return;
  const tag = document.activeElement?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button") return;
  e.preventDefault();
  togglePlay();
});

// ====== Canvas "dystopian loop" ======
// (No external libs. It's a moody particle + scanline + glitch vibe.)
let rafId = null;
let t = 0;

const particles = Array.from({ length: 140 }, () => ({
  x: Math.random(),
  y: Math.random(),
  vx: (Math.random() - 0.5) * 0.0009,
  vy: (Math.random() - 0.5) * 0.0009,
  r: Math.random() * 2.2 + 0.4,
}));

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);

function startVoid() {
  if (rafId) cancelAnimationFrame(rafId);
  const loop = () => {
    t += 1;
    drawVoid();
    rafId = requestAnimationFrame(loop);
  };
  loop();
}

function drawVoid() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // base fade (lighter to reveal video underneath)
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.fillRect(0, 0, w, h);

  // subtle vignette
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.45, 60, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
  grad.addColorStop(0, "rgba(30,110,70,0.12)");
  grad.addColorStop(0.45, "rgba(12,20,16,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // moving “signal lines”
  ctx.strokeStyle = "rgba(210,240,220,0.04)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 22; i++) {
    const y = (h * (i / 22)) + Math.sin((t * 0.01) + i) * 6;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // particles
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;

    // wrap
    if (p.x < 0) p.x = 1;
    if (p.x > 1) p.x = 0;
    if (p.y < 0) p.y = 1;
    if (p.y > 1) p.y = 0;

    const x = p.x * w;
    const y = p.y * h;

    // pulse brightness
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.01 + p.x * 10));
    ctx.fillStyle = `rgba(80,200,140,${0.06 * pulse})`;
    ctx.beginPath();
    ctx.arc(x, y, p.r * (1.2 + pulse), 0, Math.PI * 2);
    ctx.fill();
  }

  // glitch block occasionally
  if (t % 120 < 8) {
    const gx = Math.random() * w;
    const gy = Math.random() * h;
    const gw = 140 + Math.random() * 240;
    const gh = 18 + Math.random() * 50;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(gx, gy, gw, gh);
  }

  // scanline overlay (very light)
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  for (let y = 0; y < h; y += 3) {
    ctx.fillRect(0, y, w, 1);
  }
}
