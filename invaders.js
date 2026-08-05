// Space Invaders — canvas, no dependencies. Every wave is randomly generated.
// Arrows / A-D to move, space to shoot, P to pause.

(() => {
  const canvas = document.getElementById('invaders');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;   // 480 logical units
  const H = canvas.height;  // 360

  const ui = {
    score: document.getElementById('iv-score'),
    best: document.getElementById('iv-best'),
    wave: document.getElementById('iv-wave'),
    lives: document.getElementById('iv-lives'),
    formation: document.getElementById('iv-formation'),
    overlay: document.getElementById('iv-overlay'),
    title: document.getElementById('iv-title'),
    sub: document.getElementById('iv-sub'),
    start: document.getElementById('iv-start'),
  };

  const ALIEN_W = 24;
  const ALIEN_H = 16;
  const MARGIN = 34;

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---- randomizable content -------------------------------------------------

  // Each formation returns true when a grid cell should hold an alien.
  const FORMATIONS = [
    { name: 'block',    fn: () => true },
    { name: 'pyramid',  fn: (r, c, rows, cols) => {
        const pad = (rows - 1 - r) * (cols / (2 * rows));
        return c >= pad && c <= cols - 1 - pad;
      } },
    { name: 'diamond',  fn: (r, c, rows, cols) => {
        const dr = Math.abs(r - (rows - 1) / 2) / ((rows - 1) / 2 || 1);
        const dc = Math.abs(c - (cols - 1) / 2) / ((cols - 1) / 2 || 1);
        return dr + dc <= 1.05;
      } },
    { name: 'checker',  fn: (r, c) => (r + c) % 2 === 0 },
    { name: 'arrow',    fn: (r, c, rows, cols) =>
        Math.abs(c - (cols - 1) / 2) <= r * 0.9 },
    { name: 'columns',  fn: (r, c) => c % 3 !== 1 },
    { name: 'scatter',  fn: () => Math.random() < 0.72 },
    { name: 'hollow',   fn: (r, c, rows, cols) =>
        r === 0 || r === rows - 1 || c === 0 || c === cols - 1 },
  ];

  // 8x5 two-frame sprites.
  const SPRITES = [
    [['00111100', '01111110', '11011011', '11111111', '01000010'],
     ['00111100', '01111110', '11011011', '11111111', '10000001']],
    [['00011000', '00111100', '01111110', '11011011', '01000010'],
     ['00011000', '00111100', '01111110', '11011011', '00100100']],
    [['01000010', '00111100', '01111110', '11100111', '10100101'],
     ['00000000', '00111100', '01111110', '11100111', '01011010']],
    [['11000011', '01111110', '11111111', '10111101', '01011010'],
     ['11000011', '01111110', '11111111', '10111101', '10100101']],
  ];

  // ---- state ----------------------------------------------------------------

  let state = 'idle';   // idle | playing | paused | dead | won
  let score = 0;
  let best = Number(localStorage.getItem('invaders-best') || 0);
  let wave = 1;
  let lives = 3;

  let player, aliens, bullets, bombs, dir, stepTimer, raf, last;
  let level;            // the randomized config for the current wave
  let pendingLevel;     // rolled at wave-clear so the overlay can name it
  const keys = new Set();

  // Builds a fresh random wave. Difficulty scales with `wave`, but the
  // shape, sprite, spacing and pacing are all rolled fresh each time.
  function buildLevel() {
    const rows = randInt(3, Math.min(6, 3 + Math.floor(wave / 2)));
    const cols = randInt(6, 9);
    const formation = pick(FORMATIONS);
    const sprite = pick(SPRITES);

    const gapX = (W - MARGIN * 2) / cols;
    const gapY = rand(26, 32);

    const list = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!formation.fn(r, c, rows, cols)) continue;
        list.push({
          x: MARGIN + c * gapX + (gapX - ALIEN_W) / 2,
          y: 34 + r * gapY,
          w: ALIEN_W,
          h: ALIEN_H,
          row: r,
          rows,
          alive: true,
        });
      }
    }

    // A formation can roll empty (scatter/checker on a small grid) — retry.
    if (list.length < 6) return buildLevel();

    return {
      name: formation.name,
      sprite,
      aliens: list,
      total: list.length,
      stepDelay: Math.max(0.14, rand(0.48, 0.62) - (wave - 1) * 0.05),
      stepX: rand(8, 13),
      dropY: rand(10, 16),
      fireChance: Math.min(0.85, rand(0.4, 0.6) + (wave - 1) * 0.05),
      bombSpeed: rand(130, 175) + wave * 6,
    };
  }

  function reset(full) {
    if (full) { score = 0; wave = 1; lives = 3; }
    player = { x: W / 2 - 14, y: H - 26, w: 28, h: 10, speed: 210, cool: 0 };
    bullets = [];
    bombs = [];
    dir = Math.random() < 0.5 ? 1 : -1;
    stepTimer = 0;

    level = pendingLevel || buildLevel();
    pendingLevel = null;
    aliens = level.aliens;
    syncHud();
  }

  function syncHud() {
    ui.score.textContent = String(score).padStart(4, '0');
    ui.best.textContent = String(best).padStart(4, '0');
    ui.wave.textContent = wave;
    ui.lives.textContent = '▲'.repeat(Math.max(0, lives)) || '—';
    if (ui.formation) ui.formation.textContent = level ? level.name : '—';
  }

  function overlay(title, sub, btn) {
    ui.title.textContent = title;
    ui.sub.textContent = sub;
    ui.start.textContent = btn;
    ui.overlay.hidden = false;
  }

  function start(full) {
    reset(full);
    ui.overlay.hidden = true;
    state = 'playing';
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    canvas.focus({ preventScroll: true });
  }

  const hit = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function shoot() {
    if (player.cool > 0) return;
    bullets.push({ x: player.x + player.w / 2 - 1.5, y: player.y - 8, w: 3, h: 9 });
    player.cool = 0.32;
  }

  function alienFire() {
    // only the bottom-most alien in each column may drop a bomb
    const columns = new Map();
    for (const a of aliens) {
      if (!a.alive) continue;
      const key = Math.round(a.x);
      if (!columns.has(key) || a.y > columns.get(key).y) columns.set(key, a);
    }
    const shooters = [...columns.values()];
    if (!shooters.length) return;
    const a = pick(shooters);
    bombs.push({ x: a.x + a.w / 2 - 1.5, y: a.y + a.h, w: 3, h: 9 });
  }

  function killPlayer() {
    lives--;
    bombs = [];
    bullets = [];
    syncHud();
    if (lives <= 0) {
      state = 'dead';
      if (score > best) {
        best = score;
        localStorage.setItem('invaders-best', String(best));
        syncHud();
      }
      overlay('game over', `score ${score} · best ${best}`, 'play again');
    } else {
      player.x = W / 2 - player.w / 2;
    }
  }

  function update(dt) {
    // --- player ---
    let vx = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) vx -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) vx += 1;
    player.x = Math.max(4, Math.min(W - player.w - 4, player.x + vx * player.speed * dt));
    player.cool = Math.max(0, player.cool - dt);

    // --- projectiles ---
    for (const b of bullets) b.y -= 320 * dt;
    bullets = bullets.filter((b) => b.y + b.h > 0);

    for (const b of bombs) b.y += level.bombSpeed * dt;
    bombs = bombs.filter((b) => b.y < H);

    // --- alien march (stepped, classic feel) ---
    stepTimer += dt;
    const living = aliens.filter((a) => a.alive);
    const speedup = level.stepDelay * (0.35 + 0.65 * (living.length / level.total));

    if (living.length && stepTimer >= speedup) {
      stepTimer = 0;
      const minX = Math.min(...living.map((a) => a.x));
      const maxX = Math.max(...living.map((a) => a.x + a.w));

      if ((dir > 0 && maxX + level.stepX >= W - 4) ||
          (dir < 0 && minX - level.stepX <= 4)) {
        dir *= -1;
        for (const a of aliens) a.y += level.dropY;
      } else {
        for (const a of aliens) a.x += level.stepX * dir;
      }

      if (Math.random() < level.fireChance) alienFire();

      // reached the player's row
      if (living.some((a) => a.y + a.h >= player.y)) {
        lives = 1;
        killPlayer();
        return;
      }
    }

    // --- collisions ---
    for (const b of bullets) {
      for (const a of aliens) {
        if (!a.alive || !hit(b, a)) continue;
        a.alive = false;
        b.y = -99;
        score += (a.rows - a.row) * 10;
        syncHud();
        break;
      }
    }
    bullets = bullets.filter((b) => b.y > -50);

    for (const b of bombs) {
      if (hit(b, player)) { killPlayer(); return; }
    }

    // --- wave clear ---
    if (!aliens.some((a) => a.alive)) {
      wave++;
      score += 100;
      state = 'won';
      pendingLevel = buildLevel();  // roll it now so the overlay can name it
      overlay(`wave ${wave - 1} cleared`,
        `+100 bonus · next up: ${pendingLevel.name}`, 'next wave');
    }
  }

  function drawAlien(a, t) {
    const rows = level.sprite[Math.floor(t * 2) % 2];
    const px = a.w / 8;
    const py = a.h / 5;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < 8; c++) {
        if (rows[r][c] === '1') ctx.fillRect(a.x + c * px, a.y + r * py, px, py);
      }
    }
  }

  function render(t) {
    const fg = css('--fg') || '#111';
    const accent = css('--accent') || '#4fcfa5';
    const accent2 = css('--accent-2') || '#f7a183';
    const muted = css('--muted') || '#888';

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = accent;
    for (const a of aliens) if (a.alive) drawAlien(a, t);

    // player ship and its shots — the warm accent
    ctx.fillStyle = accent2;
    ctx.fillRect(player.x, player.y + 4, player.w, 6);
    ctx.fillRect(player.x + player.w / 2 - 3, player.y, 6, 5);

    for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    ctx.fillStyle = muted;
    for (const b of bombs) ctx.fillRect(b.x, b.y, b.w, b.h);

    // ground line
    ctx.fillStyle = fg;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, H - 8, W, 1);
    ctx.globalAlpha = 1;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'playing') update(dt);
    render(now / 1000);
    if (state === 'playing' || state === 'paused') raf = requestAnimationFrame(loop);
  }

  // --- input ---
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', ' ', 'a', 'd', 'p'];

  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!GAME_KEYS.includes(k)) return;
    // only capture the page scroll keys while the game is actually live
    if (state === 'playing' && (k === ' ' || k.startsWith('Arrow'))) e.preventDefault();

    if (k === 'p' && (state === 'playing' || state === 'paused')) {
      if (state === 'playing') {
        state = 'paused';
        overlay('paused', 'press p or click to resume', 'resume');
      } else {
        ui.overlay.hidden = true;
        state = 'playing';
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
      return;
    }

    keys.add(k);
    if (k === ' ' && state === 'playing') shoot();
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  });

  // touch / click controls
  canvas.addEventListener('pointerdown', (e) => {
    if (state !== 'playing') return;
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    player.x = Math.max(4, Math.min(W - player.w - 4, x - player.w / 2));
    shoot();
  });

  ui.start.addEventListener('click', () => {
    if (state === 'paused') {
      ui.overlay.hidden = true;
      state = 'playing';
      last = performance.now();
      raf = requestAnimationFrame(loop);
    } else {
      start(state !== 'won');
    }
  });

  // pause when scrolled away — no phantom game running offscreen
  new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting && state === 'playing') {
        state = 'paused';
        overlay('paused', 'press p or click to resume', 'resume');
      }
    }
  }, { threshold: 0.2 }).observe(canvas);

  reset(true);
  render(0);
  overlay('space invaders', 'arrows / a-d to move · space to shoot · p to pause', 'start');
})();
