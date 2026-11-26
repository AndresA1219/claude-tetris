'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#b0bec5', // Tuerca - gris metálico
];

// Paleta más saturada/oscura para legibilidad sobre fondo claro
const COLORS_LIGHT = [
  null,
  '#00acc1', // I
  '#f9a825', // O
  '#8e24aa', // T
  '#43a047', // S
  '#e53935', // Z
  '#1e88e5', // J
  '#fb8c00', // L
  '#607d8b', // Tuerca
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (reto: hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let gridColor = '#22222e';
let palette = COLORS;
let blockHighlight = 'rgba(255,255,255,0.12)';

function applyTheme(light, persist) {
  if (light) document.documentElement.dataset.theme = 'light';
  else delete document.documentElement.dataset.theme;
  themeToggle.setAttribute('aria-checked', String(light));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  palette = light ? COLORS_LIGHT : COLORS;
  blockHighlight = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
  if (persist) {
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
  }
  if (current && next) { draw(); drawNext(); } // repinta también en pausa / game over
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0, started = false; // combo: locks seguidos que limpian línea

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  // combo: sube con cada fijación que limpia líneas, se reinicia si no limpia
  if (cleared) { combo++; maxCombo = Math.max(maxCombo, combo); }
  else combo = 0;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = palette[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = blockHighlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Círculo en la celda central vacía de la tuerca
function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = palette[8];
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size / 2 - 5, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (!current) return; // pantalla de inicio: solo tablero vacío

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === 8) drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === 8) drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === 8) drawNutHole(nextCtx, offX + 1, offY + 1, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // lockPiece() puede terminar el juego (endGame cancela el rAF); no reprogramar
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  resetRecordsUI();
  combo = 0;
  maxCombo = 0;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Records ----
const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-records-stats';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Anónimo';

const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const gameoverRecords = document.getElementById('gameover-records');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');

let pendingRecord = null; // partida que clasifica y aún espera nombre

function sanitizeName(raw) {
  const s = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return s || DEFAULT_NAME;
}

function num(v) {
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r === 'object' && Number.isFinite(r.score))
      .map(r => ({
        name: sanitizeName(r.name),
        score: num(r.score),
        lines: num(r.lines),
        maxCombo: num(r.maxCombo),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (e) { return []; }
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    if (s && typeof s === 'object') return { bestCombo: num(s.bestCombo), maxLines: num(s.maxLines) };
  } catch (e) {}
  return { bestCombo: 0, maxLines: 0 };
}

function updateStats(gameLines, gameCombo) {
  const s = loadStats();
  s.bestCombo = Math.max(s.bestCombo, gameCombo);
  s.maxLines = Math.max(s.maxLines, gameLines);
  try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
}

function qualifies(sc) {
  const list = loadRecords();
  return sc > 0 && (list.length < MAX_RECORDS || sc > list[list.length - 1].score);
}

// Inserta el record y devuelve su posición en el top (-1 si no entra)
function addRecord(entry) {
  const list = loadRecords();
  let idx = list.findIndex(r => r.score < entry.score);
  if (idx === -1) idx = list.length;
  list.splice(idx, 0, entry);
  list.length = Math.min(list.length, MAX_RECORDS);
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(list)); } catch (e) {}
  return idx < MAX_RECORDS ? idx : -1;
}

function renderRecords(el, highlight) {
  el.textContent = '';
  const list = loadRecords();
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'records-empty';
    p.textContent = 'Aún no hay records';
    el.appendChild(p);
    return;
  }
  const table = document.createElement('table');
  table.className = 'records-table';
  const head = table.createTHead().insertRow();
  ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'COMBO'].forEach(t => {
    const th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  const body = table.createTBody();
  list.forEach((r, i) => {
    const tr = body.insertRow();
    if (i === highlight) tr.className = 'new';
    if (r.date) {
      const d = new Date(r.date);
      if (!isNaN(d)) tr.title = d.toLocaleDateString();
    }
    [i + 1, r.name, r.score.toLocaleString(), r.lines, r.maxCombo].forEach(v => {
      tr.insertCell().textContent = String(v);
    });
  });
  el.appendChild(table);
}

function refreshRecordViews(highlight) {
  const s = loadStats();
  const txt = `Mejor combo: ${s.bestCombo} · Máx. líneas: ${s.maxLines}`;
  renderRecords(document.getElementById('start-table'), -1);
  renderRecords(document.getElementById('gameover-table'), highlight ?? -1);
  document.getElementById('start-stats').textContent = txt;
  document.getElementById('gameover-stats').textContent = txt;
}

function showGameOverRecords() {
  updateStats(lines, maxCombo);
  pendingRecord = qualifies(score) ? { score, lines, maxCombo } : null;
  refreshRecordViews(-1);
  nameInput.value = '';
  nameForm.classList.toggle('hidden', !pendingRecord);
  gameoverRecords.classList.remove('hidden');
  // el foco se retrasa para que un Space repetido del hard drop no se escriba en el input
  if (pendingRecord) setTimeout(() => { if (pendingRecord) nameInput.focus(); }, 400);
}

function commitPendingRecord() {
  if (!pendingRecord) return;
  const entry = { name: sanitizeName(nameInput.value), ...pendingRecord, date: new Date().toISOString() };
  pendingRecord = null;
  const idx = addRecord(entry);
  nameForm.classList.add('hidden');
  refreshRecordViews(idx);
}

// Se llama al empezar partida: guarda con nombre por defecto si quedó pendiente
function resetRecordsUI() {
  commitPendingRecord();
  gameoverRecords.classList.add('hidden');
  nameForm.classList.add('hidden');
  nameInput.blur();
}

function clearRecords() {
  if (!confirm('¿Borrar todos los records?')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) {}
  pendingRecord = null; // lo borrado no se vuelve a guardar
  nameForm.classList.add('hidden');
  refreshRecordViews(-1);
}

// Si se cierra la pestaña con un record pendiente, se guarda con el nombre escrito
window.addEventListener('pagehide', commitPendingRecord);

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
  if (document.activeElement) document.activeElement.blur();
});

['start-clear-btn', 'gameover-clear-btn'].forEach(id => {
  const btn = document.getElementById(id);
  btn.addEventListener('click', () => { clearRecords(); btn.blur(); });
});

startBtn.addEventListener('click', () => {
  startBtn.blur();
  startScreen.classList.add('hidden');
  started = true;
  init();
});

document.addEventListener('keydown', e => {
  // ignora el juego mientras se escribe en un input o en la pantalla de inicio
  if (!started || (e.target instanceof HTMLInputElement)) return;
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme !== 'light', true);
  themeToggle.blur(); // evita que Space active el botón en vez de la caída
});

// El juego arranca desde la pantalla de inicio (botón Jugar), no al cargar
board = createBoard();
refreshRecordViews(-1);
applyTheme(document.documentElement.dataset.theme === 'light', false);
draw();
startBtn.focus(); // Enter/Space también inician la partida
