import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

const STORAGE_KEYS = {
  settings: "prism_omok_settings_v1",
  stats: "prism_omok_stats_v1",
  snapshot: "prism_omok_snapshot_v1",
};

const LETTERS = "ABCDEFGHJKLMNOPQRSTUVWXYZ";
const DIRECTIONS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const THEMES = {
  aurora: {
    accent: "#73f8f0",
    accent2: "#ffcc75",
    bg0: "#07121f",
    bg1: "#071c26",
    bg2: "#15394b",
    panel: "rgba(7, 16, 24, 0.66)",
    boardWoodA: "#8b6641",
    boardWoodB: "#5a381f",
    boardLine: "#2f190d",
    starPoint: "#211104",
    blackStone: "#181d25",
    whiteStone: "#f5fbff",
    glowBlack: "#5afcf0",
    glowWhite: "#fff0a5",
    fog: "#08151d",
    lightA: "#78fff0",
    lightB: "#ffc56f",
    rim: "#d1ffff",
  },
  ember: {
    accent: "#ff9469",
    accent2: "#ffe0a8",
    bg0: "#190b0c",
    bg1: "#321012",
    bg2: "#5a261d",
    panel: "rgba(23, 9, 9, 0.68)",
    boardWoodA: "#9b5536",
    boardWoodB: "#522414",
    boardLine: "#260b05",
    starPoint: "#1c0803",
    blackStone: "#140f0f",
    whiteStone: "#fff5ef",
    glowBlack: "#ff865a",
    glowWhite: "#ffdca0",
    fog: "#1b0908",
    lightA: "#ff7d53",
    lightB: "#ffe299",
    rim: "#fff1d0",
  },
  abyss: {
    accent: "#7eb3ff",
    accent2: "#82fff2",
    bg0: "#040916",
    bg1: "#0a1430",
    bg2: "#10335f",
    panel: "rgba(5, 10, 22, 0.68)",
    boardWoodA: "#476394",
    boardWoodB: "#1a2643",
    boardLine: "#0a1328",
    starPoint: "#040915",
    blackStone: "#0a1120",
    whiteStone: "#edf6ff",
    glowBlack: "#6ad4ff",
    glowWhite: "#90fff0",
    fog: "#030814",
    lightA: "#7db4ff",
    lightB: "#83fff1",
    rim: "#d8f0ff",
  },
};

const DEFAULT_SETTINGS = {
  mode: "ai",
  aiPlayer: -1,
  difficulty: "normal",
  boardSize: 15,
  winRule: "freestyle",
  timeLimit: 300,
  theme: "aurora",
  autoRotate: true,
  sound: true,
  cameraMode: "perspective",
};

const DEFAULT_STATS = {
  games: 0,
  blackWins: 0,
  whiteWins: 0,
  aiWins: 0,
  humanWins: 0,
};

const DIFFICULTY_CONFIG = {
  easy: { depth: 1, limit: 8, delay: 420, randomness: 0.25 },
  normal: { depth: 2, limit: 10, delay: 650, randomness: 0.08 },
  hard: { depth: 2, limit: 14, delay: 920, randomness: 0.02 },
};

const PATTERN_SCORES = [
  ["11111", 360000],
  ["011110", 120000],
  ["211110", 22000],
  ["011112", 22000],
  ["011100", 9600],
  ["001110", 9600],
  ["011010", 8600],
  ["010110", 8600],
  ["211100", 2400],
  ["001112", 2400],
  ["211010", 2300],
  ["010112", 2300],
  ["210110", 2300],
  ["011012", 2300],
  ["011000", 1200],
  ["000110", 1200],
  ["001100", 1100],
  ["001010", 980],
  ["010100", 980],
  ["010010", 920],
];

function qs(id) {
  return document.querySelector(id);
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function notationFor(x, y) {
  return `${LETTERS[x]}${y + 1}`;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const safe = Math.ceil(seconds);
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = (safe % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function boardKey(x, y) {
  return `${x}:${y}`;
}

function isInside(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

function hasNeighbor(board, size, x, y, range = 2) {
  for (let dx = -range; dx <= range; dx += 1) {
    for (let dy = -range; dy <= range; dy += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (isInside(size, nx, ny) && board[nx][ny] !== 0) {
        return true;
      }
    }
  }
  return false;
}

function buildPatternString(board, size, x, y, player, dx, dy) {
  let line = "";
  for (let offset = -4; offset <= 4; offset += 1) {
    const nx = x + dx * offset;
    const ny = y + dy * offset;
    if (!isInside(size, nx, ny)) {
      line += "2";
      continue;
    }
    if (nx === x && ny === y) {
      line += "1";
    } else if (board[nx][ny] === 0) {
      line += "0";
    } else if (board[nx][ny] === player) {
      line += "1";
    } else {
      line += "2";
    }
  }
  return line;
}

function scorePatternString(pattern) {
  let total = 0;
  for (const [needle, score] of PATTERN_SCORES) {
    if (pattern.includes(needle)) total += score;
  }
  return total;
}

function scoreCandidate(board, size, x, y, player) {
  if (board[x][y] !== 0) return -Infinity;
  let total = 0;
  for (const [dx, dy] of DIRECTIONS) {
    total += scorePatternString(buildPatternString(board, size, x, y, player, dx, dy));
  }
  const center = (size - 1) / 2;
  const distance = Math.abs(x - center) + Math.abs(y - center);
  total += Math.max(0, 26 - distance * 2);
  return total;
}

function getCandidateMoves(board, size, player, limit) {
  let occupied = 0;
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] !== 0) occupied += 1;
    }
  }

  if (occupied === 0) {
    const mid = Math.floor(size / 2);
    return [
      { x: mid, y: mid, score: 9999, attack: 9999, defense: 9999 },
      { x: mid - 1, y: mid, score: 9998, attack: 9998, defense: 9998 },
      { x: mid, y: mid - 1, score: 9997, attack: 9997, defense: 9997 },
    ].filter((move) => isInside(size, move.x, move.y));
  }

  const candidates = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] !== 0 || !hasNeighbor(board, size, x, y, 2)) continue;
      const attack = scoreCandidate(board, size, x, y, player);
      const defense = scoreCandidate(board, size, x, y, -player);
      const score = Math.max(attack, defense * 0.96) + attack * 0.74 + defense;
      candidates.push({ x, y, score, attack, defense });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

function checkWin(board, size, x, y, player, rule) {
  let bestLine = [];
  for (const [dx, dy] of DIRECTIONS) {
    const line = [[x, y]];
    let count = 1;

    for (let dir = -1; dir <= 1; dir += 2) {
      let step = 1;
      while (true) {
        const nx = x + dx * step * dir;
        const ny = y + dy * step * dir;
        if (!isInside(size, nx, ny) || board[nx][ny] !== player) break;
        if (dir < 0) line.unshift([nx, ny]);
        else line.push([nx, ny]);
        count += 1;
        step += 1;
      }
    }

    if (rule === "exact") {
      if (count === 5) {
        return { won: true, line };
      }
    } else if (count >= 5) {
      return { won: true, line };
    }

    if (line.length > bestLine.length) bestLine = line;
  }

  return { won: false, line: bestLine };
}

function isFull(board, size) {
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      if (board[x][y] === 0) return false;
    }
  }
  return true;
}

function findForcedMove(board, size, player, rule) {
  const candidates = getCandidateMoves(board, size, player, 20);
  for (const move of candidates) {
    board[move.x][move.y] = player;
    const result = checkWin(board, size, move.x, move.y, player, rule);
    board[move.x][move.y] = 0;
    if (result.won) return move;
  }
  return null;
}

function evaluatePosition(board, size, player) {
  const ours = getCandidateMoves(board, size, player, 6);
  const theirs = getCandidateMoves(board, size, -player, 6);
  const ownTop = ours[0]?.score ?? 0;
  const enemyTop = theirs[0]?.score ?? 0;
  return ownTop - enemyTop * 1.08;
}

function negamax(board, size, player, rule, depth, alpha, beta, lastMove, limit) {
  if (lastMove) {
    const lastResult = checkWin(board, size, lastMove.x, lastMove.y, lastMove.player, rule);
    if (lastResult.won) return -900000 - depth * 1000;
  }

  if (depth === 0 || isFull(board, size)) {
    return evaluatePosition(board, size, player);
  }

  const candidates = getCandidateMoves(board, size, player, limit);
  if (candidates.length === 0) return 0;

  let best = -Infinity;
  for (const move of candidates) {
    board[move.x][move.y] = player;
    let score;
    if (checkWin(board, size, move.x, move.y, player, rule).won) {
      score = 880000 + depth * 1200;
    } else {
      score = -negamax(
        board,
        size,
        -player,
        rule,
        depth - 1,
        -beta,
        -alpha,
        { x: move.x, y: move.y, player },
        Math.max(6, limit - 2),
      );
    }
    board[move.x][move.y] = 0;
    best = Math.max(best, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return best;
}

class AudioEngine {
  constructor() {
    this.enabled = true;
    this.context = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  ensure() {
    if (!this.enabled) return null;
    if (!this.context) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.context = new Ctx();
    }
    if (this.context.state === "suspended") {
      this.context.resume();
    }
    return this.context;
  }

  tone(frequency, duration, type, gainValue) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = gainValue;
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  ui() {
    this.tone(520, 0.09, "triangle", 0.05);
  }

  move(player) {
    this.tone(player === 1 ? 240 : 360, 0.16, "sine", 0.06);
    this.tone(player === 1 ? 480 : 640, 0.14, "triangle", 0.03);
  }

  hint() {
    this.tone(660, 0.18, "triangle", 0.05);
  }

  win() {
    this.tone(440, 0.18, "triangle", 0.07);
    window.setTimeout(() => this.tone(660, 0.2, "triangle", 0.06), 80);
    window.setTimeout(() => this.tone(880, 0.28, "triangle", 0.05), 160);
  }
}

class PrismOmok3D {
  constructor() {
    this.dom = {
      sceneContainer: qs("#scene-container"),
      modeSelect: qs("#mode-select"),
      aiSideSelect: qs("#ai-side-select"),
      difficultySelect: qs("#difficulty-select"),
      boardSizeSelect: qs("#board-size-select"),
      ruleSelect: qs("#rule-select"),
      timeSelect: qs("#time-select"),
      themeSelect: qs("#theme-select"),
      autorotateToggle: qs("#autorotate-toggle"),
      newGameButton: qs("#new-game-button"),
      undoButton: qs("#undo-button"),
      redoButton: qs("#redo-button"),
      hintButton: qs("#hint-button"),
      replayButton: qs("#replay-button"),
      swapButton: qs("#swap-button"),
      soundButton: qs("#sound-button"),
      helpButton: qs("#help-button"),
      closeHelpButton: qs("#close-help-button"),
      helpModal: qs("#help-modal"),
      cameraButton: qs("#camera-button"),
      introOverlay: qs("#intro-overlay"),
      toastStack: qs("#toast-stack"),
      moveList: qs("#move-list"),
      statusText: qs("#status-text"),
      substatusText: qs("#substatus-text"),
      turnChip: qs("#turn-chip"),
      hintText: qs("#hint-text"),
      cameraLabel: qs("#camera-label"),
      boardLabel: qs("#board-label"),
      modePill: qs("#mode-pill"),
      blackCard: qs("#black-card"),
      whiteCard: qs("#white-card"),
      blackTimer: qs("#black-timer"),
      whiteTimer: qs("#white-timer"),
      blackLabel: qs("#black-label"),
      whiteLabel: qs("#white-label"),
      gamesStat: qs("#games-stat"),
      blackStat: qs("#black-stat"),
      whiteStat: qs("#white-stat"),
      aiStat: qs("#ai-stat"),
      moveCountLabel: qs("#move-count-label"),
      lastMoveText: qs("#last-move-text"),
      victoryText: qs("#victory-text"),
      aiText: qs("#ai-text"),
      saveText: qs("#save-text"),
    };

    this.settings = loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    this.stats = loadJson(STORAGE_KEYS.stats, DEFAULT_STATS);
    this.audio = new AudioEngine();
    this.audio.setEnabled(this.settings.sound);

    this.board = createBoard(this.settings.boardSize);
    this.moves = [];
    this.historyIndex = 0;
    this.currentPlayer = 1;
    this.winner = 0;
    this.draw = false;
    this.winningLine = [];
    this.isThinking = false;
    this.isReplay = false;
    this.resultRecorded = false;
    this.pendingAiTimer = 0;
    this.replayTimer = 0;
    this.hoverCell = null;
    this.lastHint = null;
    this.cameraMode = this.settings.cameraMode;
    this.pointer = new THREE.Vector2(999, 999);
    this.pointerDown = null;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.clockA = this.settings.timeLimit;
    this.clockB = this.settings.timeLimit;
    this.animations = [];
    this.bursts = [];
    this.boardMeshes = [];
    this.stoneMeshes = new Map();
    this.coordSprites = [];
    this.shared = {};

    this.initScene();
    this.bindEvents();
    this.applyTheme(true);
    this.applySettingsToControls();
    this.restoreSnapshotOrReset();
    this.updateStatsUI();
    this.animate();
  }

  initScene() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.dom.sceneContainer.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.world = new THREE.Group();
    this.boardGroup = new THREE.Group();
    this.stoneGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.coordGroup = new THREE.Group();
    this.scene.add(this.world);
    this.world.add(this.boardGroup, this.stoneGroup, this.effectGroup, this.coordGroup);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 54;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = 0.1;
    this.controls.target.set(0, 0.3, 0);

    this.shared.stoneGeometry = new THREE.SphereGeometry(0.72, 48, 36);
    this.shared.ringGeometry = new THREE.TorusGeometry(0.92, 0.05, 24, 72);
    this.shared.shadowGeometry = new THREE.CircleGeometry(0.92, 32);
    this.shared.burstGeometry = new THREE.BufferGeometry();
    this.shared.burstMaterial = new THREE.PointsMaterial({
      size: 0.12,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });

    this.createLights();
    this.createBackgroundStars();
    this.createDustField();
    this.createHoverMarker();
    this.createLastMoveMarker();
    this.resize();
  }

  createLights() {
    this.ambientLight = new THREE.AmbientLight("#ffffff", 0.66);
    this.hemiLight = new THREE.HemisphereLight("#bfefff", "#0b121d", 0.66);
    this.keyLight = new THREE.DirectionalLight("#ffffff", 2.0);
    this.keyLight.position.set(8, 18, 10);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -18;
    this.keyLight.shadow.camera.right = 18;
    this.keyLight.shadow.camera.top = 18;
    this.keyLight.shadow.camera.bottom = -18;

    this.fillLight = new THREE.PointLight("#ffffff", 14, 90, 2);
    this.fillLight.position.set(-12, 8, -8);
    this.rimLight = new THREE.PointLight("#ffffff", 12, 80, 2);
    this.rimLight.position.set(12, 7, 10);

    this.scene.add(this.ambientLight, this.hemiLight, this.keyLight, this.fillLight, this.rimLight);
  }

  createBackgroundStars() {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 48 + Math.random() * 38;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.8;
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi) * radius * 0.6 + 18;
      const z = radius * Math.sin(phi) * Math.sin(theta);
      positions.set([x, y, z], i * 3);
      colors.set([0.7 + Math.random() * 0.3, 0.75 + Math.random() * 0.25, 1], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    this.starField = new THREE.Points(geometry, material);
    this.scene.add(this.starField);
  }

  createDustField() {
    const count = 360;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 34;
      positions[i * 3 + 1] = Math.random() * 4 + 0.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("seed", new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.PointsMaterial({
      size: 0.08,
      color: "#dffcff",
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.dustField = new THREE.Points(geometry, material);
    this.scene.add(this.dustField);
  }

  createHoverMarker() {
    this.hoverGroup = new THREE.Group();
    this.hoverStone = new THREE.Mesh(
      this.shared.stoneGeometry,
      new THREE.MeshPhysicalMaterial({
        color: "#dffcff",
        transparent: true,
        opacity: 0.32,
        roughness: 0.18,
        metalness: 0.12,
        clearcoat: 1,
      }),
    );
    this.hoverStone.scale.set(1, 0.42, 1);
    const hoverRing = new THREE.Mesh(
      this.shared.ringGeometry,
      new THREE.MeshBasicMaterial({
        color: "#9effff",
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    hoverRing.rotation.x = Math.PI / 2;
    this.hoverRing = hoverRing;
    this.hoverGroup.add(this.hoverStone, hoverRing);
    this.hoverGroup.visible = false;
    this.effectGroup.add(this.hoverGroup);
  }

  createLastMoveMarker() {
    this.lastMoveMarker = new THREE.Group();
    const ring = new THREE.Mesh(
      this.shared.ringGeometry,
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24),
      new THREE.MeshBasicMaterial({ color: "#ffffff" }),
    );
    cap.position.y = 0.38;
    this.lastMoveRing = ring;
    this.lastMoveMarker.add(ring, cap);
    this.lastMoveMarker.visible = false;
    this.effectGroup.add(this.lastMoveMarker);
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());
    this.renderer.domElement.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.renderer.domElement.addEventListener("pointerleave", () => this.onPointerLeave());
    this.renderer.domElement.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.renderer.domElement.addEventListener("pointerup", (event) => this.onPointerUp(event));

    this.dom.newGameButton.addEventListener("click", () => {
      this.hideIntro();
      this.audio.ui();
      this.resetGame();
    });
    this.dom.undoButton.addEventListener("click", () => this.undo());
    this.dom.redoButton.addEventListener("click", () => this.redo());
    this.dom.hintButton.addEventListener("click", () => this.showHint());
    this.dom.replayButton.addEventListener("click", () => this.toggleReplay());
    this.dom.swapButton.addEventListener("click", () => this.swapSides());
    this.dom.soundButton.addEventListener("click", () => this.toggleSound());
    this.dom.helpButton.addEventListener("click", () => this.dom.helpModal.classList.remove("hidden"));
    this.dom.closeHelpButton.addEventListener("click", () => this.dom.helpModal.classList.add("hidden"));
    this.dom.helpModal.addEventListener("click", (event) => {
      if (event.target === this.dom.helpModal) this.dom.helpModal.classList.add("hidden");
    });
    this.dom.cameraButton.addEventListener("click", () => this.toggleCamera());

    for (const button of this.dom.introOverlay.querySelectorAll("[data-start-mode]")) {
      button.addEventListener("click", () => {
        this.settings.mode = button.dataset.startMode;
        this.applySettingsToControls();
        this.hideIntro();
        this.persistSettings();
        this.resetGame();
      });
    }

    const restartRequired = () => {
      this.hideIntro();
      this.persistSettings();
      this.resetGame();
    };

    this.dom.modeSelect.addEventListener("change", () => {
      this.settings.mode = this.dom.modeSelect.value;
      restartRequired();
    });
    this.dom.aiSideSelect.addEventListener("change", () => {
      this.settings.aiPlayer = Number(this.dom.aiSideSelect.value);
      restartRequired();
    });
    this.dom.difficultySelect.addEventListener("change", () => {
      this.settings.difficulty = this.dom.difficultySelect.value;
      this.persistSettings();
      this.updateUi();
    });
    this.dom.boardSizeSelect.addEventListener("change", () => {
      this.settings.boardSize = Number(this.dom.boardSizeSelect.value);
      restartRequired();
    });
    this.dom.ruleSelect.addEventListener("change", () => {
      this.settings.winRule = this.dom.ruleSelect.value;
      restartRequired();
    });
    this.dom.timeSelect.addEventListener("change", () => {
      this.settings.timeLimit = Number(this.dom.timeSelect.value);
      restartRequired();
    });
    this.dom.themeSelect.addEventListener("change", () => {
      this.settings.theme = this.dom.themeSelect.value;
      this.applyTheme();
      this.persistSettings();
    });
    this.dom.autorotateToggle.addEventListener("change", () => {
      this.settings.autoRotate = this.dom.autorotateToggle.checked;
      this.persistSettings();
    });

    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      if (key === "n") this.resetGame();
      if (key === "z") this.undo();
      if (key === "y") this.redo();
      if (key === "h") this.showHint();
      if (key === "r") this.toggleReplay();
      if (key === "c") this.toggleCamera();
    });
  }

  applySettingsToControls() {
    this.dom.modeSelect.value = this.settings.mode;
    this.dom.aiSideSelect.value = String(this.settings.aiPlayer);
    this.dom.difficultySelect.value = this.settings.difficulty;
    this.dom.boardSizeSelect.value = String(this.settings.boardSize);
    this.dom.ruleSelect.value = this.settings.winRule;
    this.dom.timeSelect.value = String(this.settings.timeLimit);
    this.dom.themeSelect.value = this.settings.theme;
    this.dom.autorotateToggle.checked = this.settings.autoRotate;
    this.dom.soundButton.textContent = this.settings.sound ? "사운드 ON" : "사운드 OFF";
  }

  restoreSnapshotOrReset() {
    let snapshot = null;
    try {
      snapshot = JSON.parse(localStorage.getItem(STORAGE_KEYS.snapshot) || "null");
    } catch {
      snapshot = null;
    }

    if (snapshot && Array.isArray(snapshot.moves) && snapshot.moves.length > 0) {
      this.settings = { ...this.settings, ...snapshot.settings };
      this.audio.setEnabled(this.settings.sound);
      this.cameraMode = this.settings.cameraMode || "perspective";
      this.applySettingsToControls();
      this.applyTheme(true);
      this.board = createBoard(this.settings.boardSize);
      this.moves = snapshot.moves.filter(
        (move) =>
          Number.isInteger(move.x) &&
          Number.isInteger(move.y) &&
          (move.player === 1 || move.player === -1) &&
          isInside(this.settings.boardSize, move.x, move.y),
      );
      this.historyIndex = clamp(snapshot.historyIndex ?? this.moves.length, 0, this.moves.length);
      this.clockA = snapshot.clockA ?? this.settings.timeLimit;
      this.clockB = snapshot.clockB ?? this.settings.timeLimit;
      this.hideIntro();
      this.rebuildFromHistory({ silent: true });
      this.notify("게임 복원", "이전 경기 상태를 자동으로 불러왔습니다.");
      this.updateUi();
      return;
    }

    this.resetGame({ suppressToast: true });
  }

  applyTheme(skipRebuild = false) {
    this.theme = THEMES[this.settings.theme] || THEMES.aurora;
    const root = document.documentElement.style;
    root.setProperty("--accent", this.theme.accent);
    root.setProperty("--accent-2", this.theme.accent2);
    root.setProperty("--bg-0", this.theme.bg0);
    root.setProperty("--bg-1", this.theme.bg1);
    root.setProperty("--bg-2", this.theme.bg2);
    root.setProperty("--panel", this.theme.panel);

    this.scene.fog = new THREE.Fog(this.theme.fog, 26, 110);
    this.scene.background = this.createGradientBackground();
    this.hemiLight.color.set(this.theme.lightA);
    this.hemiLight.groundColor.set(this.theme.fog);
    this.fillLight.color.set(this.theme.lightA);
    this.rimLight.color.set(this.theme.lightB);
    this.lastMoveRing.material.color.set(this.theme.rim);
    this.hoverRing.material.color.set(this.theme.accent);
    this.hoverStone.material.color.set(this.theme.rim);
    if (!skipRebuild) {
      this.buildBoard();
      this.rebuildFromHistory({ silent: true });
    } else {
      this.buildBoard();
    }
  }

  createGradientBackground() {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, this.theme.bg2);
    gradient.addColorStop(0.42, this.theme.bg1);
    gradient.addColorStop(1, this.theme.bg0);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glow = ctx.createRadialGradient(110, 100, 20, 110, 100, 220);
    glow.addColorStop(0, `${this.theme.accent}55`);
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const glow2 = ctx.createRadialGradient(400, 120, 12, 400, 120, 180);
    glow2.addColorStop(0, `${this.theme.accent2}66`);
    glow2.addColorStop(1, "transparent");
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  resize() {
    const { clientWidth, clientHeight } = this.dom.sceneContainer;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(clientWidth, clientHeight, false);
  }

  resetGame({ suppressToast = false } = {}) {
    window.clearTimeout(this.pendingAiTimer);
    window.clearTimeout(this.replayTimer);
    this.isThinking = false;
    this.isReplay = false;
    this.resultRecorded = false;
    this.board = createBoard(this.settings.boardSize);
    this.moves = [];
    this.historyIndex = 0;
    this.currentPlayer = 1;
    this.winner = 0;
    this.draw = false;
    this.winningLine = [];
    this.lastHint = null;
    this.clockA = this.settings.timeLimit;
    this.clockB = this.settings.timeLimit;
    this.hoverCell = null;
    this.dom.replayButton.textContent = "리플레이";
    this.buildBoard();
    this.clearStones();
    this.updateUi();
    this.persistSnapshot();
    this.scheduleAiIfNeeded();
    if (!suppressToast) this.notify("새 게임", "새로운 매치를 시작했습니다.");
  }

  buildBoard() {
    while (this.boardGroup.children.length) {
      this.boardGroup.remove(this.boardGroup.children[0]);
    }
    while (this.coordGroup.children.length) {
      this.coordGroup.remove(this.coordGroup.children[0]);
    }

    this.coordSprites.length = 0;
    this.stoneMeshes.clear();

    this.boardSize = this.settings.boardSize;
    this.spacing = this.boardSize <= 11 ? 2.1 : this.boardSize <= 15 ? 1.65 : 1.34;
    this.boardHalf = ((this.boardSize - 1) * this.spacing) / 2;
    this.boardTopY = 0.26;
    this.interactionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.boardTopY);
    this.controls.maxDistance = Math.max(28, this.boardHalf * 4);
    this.controls.minDistance = Math.max(10, this.boardHalf * 1.1);

    const boardWidth = this.boardHalf * 2 + this.spacing * 1.6;
    const baseGeometry = new THREE.BoxGeometry(boardWidth, 0.52, boardWidth);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: this.theme.boardWoodB,
      roughness: 0.72,
      metalness: 0.08,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0;
    base.receiveShadow = true;
    base.castShadow = true;

    const topGeometry = new THREE.PlaneGeometry(boardWidth - 0.1, boardWidth - 0.1);
    const topMaterial = new THREE.MeshStandardMaterial({
      map: this.createBoardTexture(),
      roughness: 0.58,
      metalness: 0.12,
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.rotation.x = -Math.PI / 2;
    top.position.y = this.boardTopY;
    top.receiveShadow = true;

    const trim = new THREE.Mesh(
      new THREE.TorusGeometry(boardWidth * 0.36, 0.08, 24, 90),
      new THREE.MeshStandardMaterial({
        color: this.theme.accent,
        emissive: this.theme.accent,
        emissiveIntensity: 0.08,
        roughness: 0.3,
        metalness: 0.5,
      }),
    );
    trim.rotation.x = Math.PI / 2;
    trim.position.y = this.boardTopY + 0.04;

    this.boardGroup.add(base, top, trim);
    this.boardTexture = topMaterial.map;

    this.addBoardCoordinates();
    this.updateCameraPose(true);
  }

  createBoardTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = this.theme.boardWoodA;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 420; i += 1) {
      const y = (i / 420) * canvas.height;
      const alpha = 0.04 + Math.random() * 0.06;
      ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1 + Math.random() * 7;
      ctx.beginPath();
      ctx.moveTo(0, y + Math.sin(i * 1.9) * 12);
      ctx.bezierCurveTo(
        canvas.width * 0.3,
        y + Math.sin(i * 0.4) * 22,
        canvas.width * 0.7,
        y + Math.cos(i * 0.8) * 28,
        canvas.width,
        y + Math.sin(i * 1.3) * 14,
      );
      ctx.stroke();
    }

    const border = 180;
    const playable = canvas.width - border * 2;
    const cell = playable / (this.boardSize - 1);
    ctx.strokeStyle = this.theme.boardLine;
    ctx.lineWidth = 4;

    for (let i = 0; i < this.boardSize; i += 1) {
      const pos = border + i * cell;
      ctx.beginPath();
      ctx.moveTo(border, pos);
      ctx.lineTo(canvas.width - border, pos);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pos, border);
      ctx.lineTo(pos, canvas.width - border);
      ctx.stroke();
    }

    const starPoints = this.boardSize === 19 ? [3, 9, 15] : this.boardSize === 15 ? [3, 7, 11] : [3, 5, 7];
    ctx.fillStyle = this.theme.starPoint;
    for (const gx of starPoints) {
      for (const gy of starPoints) {
        const px = border + gx * cell;
        const py = border + gy * cell;
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = `${this.theme.accent}66`;
    ctx.lineWidth = 10;
    ctx.strokeRect(border * 0.76, border * 0.76, canvas.width - border * 1.52, canvas.height - border * 1.52);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }

  addBoardCoordinates() {
    const labelOffset = this.spacing * 0.95;
    for (let i = 0; i < this.boardSize; i += 1) {
      const labelX = this.makeSpriteLabel(LETTERS[i], this.theme.rim);
      labelX.position.set(this.gridToWorld(i, 0).x, this.boardTopY + 0.06, this.boardHalf + labelOffset);
      labelX.scale.setScalar(this.spacing * 0.65);
      this.coordGroup.add(labelX);

      const labelY = this.makeSpriteLabel(String(i + 1), this.theme.rim);
      labelY.position.set(-this.boardHalf - labelOffset, this.boardTopY + 0.06, this.gridToWorld(0, i).z);
      labelY.scale.setScalar(this.spacing * 0.65);
      this.coordGroup.add(labelY);

      this.coordSprites.push(labelX, labelY);
    }
  }

  makeSpriteLabel(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(6, 12, 20, 0.72)";
    ctx.beginPath();
    ctx.arc(128, 128, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = `${color}66`;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "bold 118px Orbitron";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 138);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Sprite(material);
  }

  gridToWorld(x, y) {
    return new THREE.Vector3(
      x * this.spacing - this.boardHalf,
      this.boardTopY + 0.02,
      y * this.spacing - this.boardHalf,
    );
  }

  worldToGrid(point) {
    const x = Math.round((point.x + this.boardHalf) / this.spacing);
    const y = Math.round((point.z + this.boardHalf) / this.spacing);
    if (!isInside(this.boardSize, x, y)) return null;
    return { x, y };
  }

  clearStones() {
    while (this.stoneGroup.children.length) {
      this.stoneGroup.remove(this.stoneGroup.children[0]);
    }
    while (this.effectGroup.children.length > 2) {
      this.effectGroup.remove(this.effectGroup.children[this.effectGroup.children.length - 1]);
    }
    for (const burst of this.bursts) {
      burst.geometry.dispose();
      burst.material.dispose();
    }
    this.bursts = [];
    this.animations = [];
    this.stoneMeshes.clear();
    this.lastMoveMarker.visible = false;
    this.clearWinningLine();
  }

  clearWinningLine() {
    if (this.winLine) {
      this.effectGroup.remove(this.winLine);
      this.winLine.geometry.dispose();
      this.winLine.material.dispose();
      this.winLine = null;
    }
  }

  updateCameraPose(immediate = false) {
    const target = new THREE.Vector3(0, 0.25, 0);
    const perspective = new THREE.Vector3(this.boardHalf * 0.94, this.boardHalf * 1.32 + 7, this.boardHalf * 1.06);
    const top = new THREE.Vector3(0, this.boardHalf * 2.35 + 8, 0.001);
    const destination = this.cameraMode === "top" ? top : perspective;
    this.dom.cameraLabel.textContent = this.cameraMode === "top" ? "Top View" : "Perspective";

    if (immediate) {
      this.camera.position.copy(destination);
      this.controls.target.copy(target);
      this.controls.update();
      return;
    }

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    this.animations.push({
      duration: 0.65,
      elapsed: 0,
      update: (t) => {
        const eased = easeOutCubic(t);
        this.camera.position.lerpVectors(startPos, destination, eased);
        this.controls.target.lerpVectors(startTarget, target, eased);
        this.controls.update();
      },
    });
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === "perspective" ? "top" : "perspective";
    this.settings.cameraMode = this.cameraMode;
    this.persistSettings();
    this.updateCameraPose();
    this.audio.ui();
  }

  toggleSound() {
    this.settings.sound = !this.settings.sound;
    this.audio.setEnabled(this.settings.sound);
    this.dom.soundButton.textContent = this.settings.sound ? "사운드 ON" : "사운드 OFF";
    this.persistSettings();
  }

  onPointerMove(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  onPointerLeave() {
    this.pointer.set(999, 999);
    this.pointerDown = null;
    this.hoverCell = null;
    this.hoverGroup.visible = false;
  }

  onPointerDown(event) {
    if (event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY };
  }

  onPointerUp(event) {
    if (event.button !== 0 || !this.pointerDown) return;
    const distance = Math.hypot(event.clientX - this.pointerDown.x, event.clientY - this.pointerDown.y);
    this.pointerDown = null;
    if (distance > 5) return;
    if (!this.hoverCell || !this.canHumanPlay()) return;
    this.hideIntro();
    this.placeMove(this.hoverCell.x, this.hoverCell.y);
  }

  canHumanPlay() {
    if (this.winner || this.draw || this.isThinking || this.isReplay) return false;
    if (this.settings.mode === "ai" && this.currentPlayer === this.settings.aiPlayer) return false;
    return true;
  }

  updateHover() {
    if (!this.canHumanPlay()) {
      this.hoverGroup.visible = false;
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.interactionPlane, point)) {
      this.hoverGroup.visible = false;
      return;
    }
    const cell = this.worldToGrid(point);
    if (!cell || this.board[cell.x][cell.y] !== 0) {
      this.hoverGroup.visible = false;
      this.hoverCell = null;
      return;
    }
    this.hoverCell = cell;
    const world = this.gridToWorld(cell.x, cell.y);
    this.hoverGroup.position.set(world.x, this.boardTopY + 0.28, world.z);
    this.hoverGroup.visible = true;
    this.hoverStone.material.color.set(this.currentPlayer === 1 ? this.theme.glowBlack : this.theme.glowWhite);
  }

  placeMove(x, y, player = this.currentPlayer, options = {}) {
    if (this.board[x][y] !== 0 || this.winner || this.draw) return;
    if (this.historyIndex < this.moves.length) {
      this.moves = this.moves.slice(0, this.historyIndex);
    }

    const move = {
      x,
      y,
      player,
      notation: notationFor(x, y),
      timestamp: Date.now(),
    };

    this.moves.push(move);
    this.historyIndex = this.moves.length;
    this.rebuildFromHistory({ animateIndex: this.historyIndex - 1 });
    if (!options.silent) this.audio.move(player);

    if (this.winner || this.draw) {
      this.finishGame();
      return;
    }

    this.scheduleAiIfNeeded();
  }

  rebuildFromHistory({ animateIndex = -1, silent = false } = {}) {
    this.board = createBoard(this.settings.boardSize);
    this.clearStones();
    this.winner = 0;
    this.draw = false;
    this.winningLine = [];
    this.resultRecorded = false;

    for (let index = 0; index < this.historyIndex; index += 1) {
      const move = this.moves[index];
      this.board[move.x][move.y] = move.player;
      const mesh = this.createStone(move, index === animateIndex && !silent);
      this.stoneGroup.add(mesh);
      this.stoneMeshes.set(boardKey(move.x, move.y), mesh);
    }

    const lastMove = this.moves[this.historyIndex - 1];
    if (lastMove) {
      const lastPos = this.gridToWorld(lastMove.x, lastMove.y);
      this.lastMoveMarker.visible = true;
      this.lastMoveMarker.position.set(lastPos.x, this.boardTopY + 0.36, lastPos.z);
      const result = checkWin(this.board, this.settings.boardSize, lastMove.x, lastMove.y, lastMove.player, this.settings.winRule);
      if (result.won) {
        this.winner = lastMove.player;
        this.winningLine = result.line;
        this.drawWinningLine(result.line, !silent);
      } else if (isFull(this.board, this.settings.boardSize)) {
        this.draw = true;
      }
    } else {
      this.lastMoveMarker.visible = false;
    }

    this.currentPlayer = lastMove ? -lastMove.player : 1;
    this.lastHint = null;
    this.renderMoveList();
    this.updateUi();
    this.persistSnapshot();
  }

  createStone(move, animate) {
    const stone = new THREE.Group();
    const baseColor = move.player === 1 ? this.theme.blackStone : this.theme.whiteStone;
    const glowColor = move.player === 1 ? this.theme.glowBlack : this.theme.glowWhite;

    const body = new THREE.Mesh(
      this.shared.stoneGeometry,
      new THREE.MeshPhysicalMaterial({
        color: baseColor,
        roughness: move.player === 1 ? 0.18 : 0.09,
        metalness: move.player === 1 ? 0.16 : 0.08,
        clearcoat: 1,
        clearcoatRoughness: 0.16,
      }),
    );
    body.scale.set(1, 0.42, 1);
    body.castShadow = true;
    body.receiveShadow = true;

    const halo = new THREE.Mesh(
      this.shared.ringGeometry,
      new THREE.MeshBasicMaterial({
        color: glowColor,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.06;

    const shadow = new THREE.Mesh(
      this.shared.shadowGeometry,
      new THREE.MeshBasicMaterial({
        color: "#000000",
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.18;
    shadow.scale.set(1.15, 1.15, 1.15);

    stone.add(shadow, halo, body);
    const world = this.gridToWorld(move.x, move.y);
    stone.position.set(world.x, this.boardTopY + 0.3, world.z);
    stone.userData.halo = halo;

    if (animate) {
      stone.scale.setScalar(0.01);
      this.animations.push({
        duration: 0.24,
        elapsed: 0,
        update: (t) => {
          const eased = easeOutCubic(t);
          stone.scale.setScalar(lerp(0.01, 1, eased));
          stone.position.y = lerp(this.boardTopY + 1.8, this.boardTopY + 0.3, eased);
          halo.material.opacity = lerp(0.9, 0.55, eased);
        },
      });
      this.emitBurst(world, glowColor);
    }

    return stone;
  }

  drawWinningLine(line, withEffects = true) {
    this.clearWinningLine();
    if (!line.length) return;
    const points = line.map(([x, y]) => {
      const world = this.gridToWorld(x, y);
      return new THREE.Vector3(world.x, this.boardTopY + 0.42, world.z);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: this.winner === 1 ? this.theme.glowBlack : this.theme.glowWhite,
      transparent: true,
      opacity: 0.95,
    });
    this.winLine = new THREE.Line(geometry, material);
    this.effectGroup.add(this.winLine);
    for (const [x, y] of line) {
      const ring = new THREE.Mesh(
        this.shared.ringGeometry,
        new THREE.MeshBasicMaterial({
          color: material.color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      const world = this.gridToWorld(x, y);
      ring.position.set(world.x, this.boardTopY + 0.36, world.z);
      ring.scale.setScalar(1.15);
      this.effectGroup.add(ring);
      this.animations.push({
        duration: 1.1,
        elapsed: 0,
        update: (t) => {
          ring.material.opacity = 0.9 * (1 - t);
          ring.scale.setScalar(1.15 + t * 0.6);
        },
      });
    }
    if (withEffects) {
      this.emitVictoryBurst(points);
    }
  }

  emitBurst(world, color) {
    const count = 28;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = [];
    const colorValue = new THREE.Color(color);
    for (let i = 0; i < count; i += 1) {
      positions.set([world.x, this.boardTopY + 0.42, world.z], i * 3);
      colors.set([colorValue.r, colorValue.g, colorValue.b], i * 3);
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.2,
          0.1 + Math.random() * 0.16,
          (Math.random() - 0.5) * 0.2,
        ),
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, this.shared.burstMaterial.clone());
    points.userData.velocities = velocities;
    points.userData.life = 0.65;
    this.effectGroup.add(points);
    this.bursts.push(points);
  }

  emitVictoryBurst(points) {
    for (const point of points) {
      this.emitBurst(point, this.winner === 1 ? this.theme.glowBlack : this.theme.glowWhite);
    }
    this.audio.win();
  }

  finishGame() {
    if (this.resultRecorded) return;
    this.resultRecorded = true;
    this.stats.games += 1;
    if (this.winner === 1) this.stats.blackWins += 1;
    if (this.winner === -1) this.stats.whiteWins += 1;
    if (this.settings.mode === "ai" && this.winner !== 0) {
      if (this.winner === this.settings.aiPlayer) this.stats.aiWins += 1;
      else this.stats.humanWins += 1;
    }
    this.updateStatsUI();
    this.persistStats();

    if (this.winner) {
      const label = this.winner === 1 ? "흑" : "백";
      this.notify(`${label} 승리`, "승리 라인이 강조되고 전적이 저장되었습니다.");
    } else if (this.draw) {
      this.notify("무승부", "모든 칸이 채워졌습니다.");
    }
  }

  undo() {
    if (this.isReplay || this.isThinking || this.historyIndex === 0) return;
    this.historyIndex -= 1;
    this.rebuildFromHistory();
    this.audio.ui();
  }

  redo() {
    if (this.isReplay || this.isThinking || this.historyIndex >= this.moves.length) return;
    this.historyIndex += 1;
    this.rebuildFromHistory({ animateIndex: this.historyIndex - 1 });
    this.audio.ui();
  }

  swapSides() {
    if (this.settings.mode !== "ai") {
      this.notify("AI 모드 전용", "진영 전환은 AI 대전에서 동작합니다.");
      return;
    }
    this.settings.aiPlayer *= -1;
    this.dom.aiSideSelect.value = String(this.settings.aiPlayer);
    this.persistSettings();
    this.resetGame();
    this.notify("진영 전환", `AI가 ${this.settings.aiPlayer === 1 ? "흑" : "백"}으로 플레이합니다.`);
  }

  showHint() {
    if (this.winner || this.draw || this.isThinking) return;
    const suggestion = this.computeBestMove(this.currentPlayer, true);
    if (!suggestion) return;
    this.lastHint = suggestion;
    this.dom.hintText.textContent = `${notationFor(suggestion.x, suggestion.y)} 추천`;
    const world = this.gridToWorld(suggestion.x, suggestion.y);
    this.emitBurst(world, this.theme.accent2);
    this.audio.hint();
    this.notify("힌트", `${notationFor(suggestion.x, suggestion.y)} 자리가 가장 유리합니다.`);
  }

  toggleReplay() {
    if (this.isReplay) {
      this.stopReplay(true);
      return;
    }
    if (this.moves.length === 0) {
      this.notify("리플레이 불가", "재생할 수순이 없습니다.");
      return;
    }
    this.hideIntro();
    this.isReplay = true;
    this.dom.replayButton.textContent = "리플레이 종료";
    this.historyIndex = 0;
    this.rebuildFromHistory({ silent: true });
    const step = () => {
      if (!this.isReplay) return;
      if (this.historyIndex < this.moves.length) {
        this.historyIndex += 1;
        this.rebuildFromHistory({ animateIndex: this.historyIndex - 1 });
        this.replayTimer = window.setTimeout(step, 460);
      } else {
        this.stopReplay(false);
        this.notify("리플레이 완료", "전체 수순을 다시 재생했습니다.");
      }
    };
    this.replayTimer = window.setTimeout(step, 300);
  }

  stopReplay(restore) {
    window.clearTimeout(this.replayTimer);
    this.isReplay = false;
    this.dom.replayButton.textContent = "리플레이";
    if (restore) {
      this.historyIndex = this.moves.length;
      this.rebuildFromHistory({ silent: true });
    }
  }

  computeBestMove(player, forHint = false) {
    const config = DIFFICULTY_CONFIG[this.settings.difficulty];
    const forcedWin = findForcedMove(this.board, this.settings.boardSize, player, this.settings.winRule);
    if (forcedWin) return forcedWin;
    const forcedBlock = findForcedMove(this.board, this.settings.boardSize, -player, this.settings.winRule);
    if (forcedBlock) return forcedBlock;

    const candidates = getCandidateMoves(this.board, this.settings.boardSize, player, config.limit);
    let bestMove = null;
    let bestScore = -Infinity;

    for (const move of candidates) {
      this.board[move.x][move.y] = player;
      const tactical = move.attack * 0.8 + move.defense;
      let score;
      if (checkWin(this.board, this.settings.boardSize, move.x, move.y, player, this.settings.winRule).won) {
        score = 950000;
      } else if (config.depth > 1 || forHint) {
        score =
          tactical -
          negamax(
            this.board,
            this.settings.boardSize,
            -player,
            this.settings.winRule,
            config.depth - 1,
            -Infinity,
            Infinity,
            { x: move.x, y: move.y, player },
            Math.max(6, config.limit - 2),
          );
      } else {
        score = tactical;
      }
      this.board[move.x][move.y] = 0;
      score += Math.random() * config.randomness * 1000;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove ?? candidates[0] ?? null;
  }

  scheduleAiIfNeeded() {
    window.clearTimeout(this.pendingAiTimer);
    if (this.settings.mode !== "ai" || this.currentPlayer !== this.settings.aiPlayer) return;
    if (this.winner || this.draw || this.isReplay) return;
    const config = DIFFICULTY_CONFIG[this.settings.difficulty];
    this.isThinking = true;
    this.updateUi();
    this.pendingAiTimer = window.setTimeout(() => {
      this.isThinking = false;
      const move = this.computeBestMove(this.currentPlayer);
      if (move) this.placeMove(move.x, move.y, this.currentPlayer);
      this.updateUi();
    }, config.delay);
  }

  handleTimeLoss(loser) {
    if (this.winner || this.draw) return;
    this.winner = -loser;
    this.finishGame();
    this.updateUi();
    this.notify("시간 종료", `${loser === 1 ? "흑" : "백"}의 시간이 모두 소진되었습니다.`);
  }

  renderMoveList() {
    this.dom.moveList.innerHTML = "";
    const shownMoves = this.moves.map((move, index) => ({ ...move, index }));
    for (const move of shownMoves) {
      const button = document.createElement("button");
      button.className = `move-item ${move.index === this.historyIndex - 1 ? "current" : ""}`;
      button.innerHTML = `
        <span class="move-badge ${move.player === 1 ? "black" : "white"}">${move.index + 1}</span>
        <span>
          <strong>${move.player === 1 ? "흑" : "백"}</strong><br />
          <small>${move.notation}</small>
        </span>
        <span>${new Date(move.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      `;
      button.addEventListener("click", () => {
        if (this.isReplay) this.stopReplay(false);
        this.historyIndex = move.index + 1;
        this.rebuildFromHistory({ silent: true });
      });
      this.dom.moveList.appendChild(button);
    }
  }

  updateStatsUI() {
    this.dom.gamesStat.textContent = String(this.stats.games);
    this.dom.blackStat.textContent = String(this.stats.blackWins);
    this.dom.whiteStat.textContent = String(this.stats.whiteWins);
    this.dom.aiStat.textContent = String(this.stats.aiWins);
  }

  updateUi() {
    const chipPlayer = this.winner || this.currentPlayer;
    const turnText = this.winner
      ? `${this.winner === 1 ? "흑" : "백"} 승리`
      : this.draw
        ? "무승부"
        : `${this.currentPlayer === 1 ? "흑" : "백"} 차례`;

    this.dom.statusText.textContent = turnText;
    this.dom.substatusText.textContent = this.isThinking
      ? "AI가 가장 강한 수를 계산 중입니다."
      : this.winner
        ? `${this.winner === 1 ? "흑" : "백"}이 승리했습니다.`
        : this.draw
          ? "보드가 가득 찼습니다."
          : this.settings.mode === "ai"
            ? `${this.currentPlayer === this.settings.aiPlayer ? "AI" : "플레이어"} 턴입니다.`
            : "로컬 2인 대전 중입니다.";
    this.dom.turnChip.textContent = turnText;
    this.dom.turnChip.className = `turn-chip ${chipPlayer === 1 ? "black-turn" : "white-turn"}`;
    this.dom.hintText.textContent = this.lastHint ? `${notationFor(this.lastHint.x, this.lastHint.y)} 추천` : "아직 힌트가 없습니다.";
    this.dom.boardLabel.textContent = `${this.settings.boardSize} x ${this.settings.boardSize}`;
    this.dom.modePill.textContent = this.settings.mode === "ai" ? "AI" : "PVP";
    this.dom.blackCard.classList.toggle("active", !this.winner && !this.draw && this.currentPlayer === 1);
    this.dom.whiteCard.classList.toggle("active", !this.winner && !this.draw && this.currentPlayer === -1);
    this.dom.blackTimer.textContent = this.settings.timeLimit ? formatTime(this.clockA) : "무제한";
    this.dom.whiteTimer.textContent = this.settings.timeLimit ? formatTime(this.clockB) : "무제한";
    this.dom.blackLabel.textContent = this.settings.mode === "ai" && this.settings.aiPlayer === 1 ? "AI" : "Player 1";
    this.dom.whiteLabel.textContent = this.settings.mode === "ai" && this.settings.aiPlayer === -1 ? "AI" : "Player 2";
    this.dom.moveCountLabel.textContent = `${this.historyIndex} 수`;
    this.dom.lastMoveText.textContent = this.historyIndex ? this.moves[this.historyIndex - 1].notation : "-";
    this.dom.victoryText.textContent = this.winningLine.length ? this.winningLine.map(([x, y]) => notationFor(x, y)).join(" · ") : "대기 중";
    this.dom.aiText.textContent =
      this.settings.mode === "ai"
        ? this.isThinking
          ? "계산 중"
          : `${this.settings.difficulty.toUpperCase()} / ${this.settings.aiPlayer === 1 ? "흑" : "백"}`
        : "비활성";
    this.dom.saveText.textContent = "자동 저장";
  }

  persistSettings() {
    saveJson(STORAGE_KEYS.settings, this.settings);
  }

  persistStats() {
    saveJson(STORAGE_KEYS.stats, this.stats);
  }

  persistSnapshot() {
    saveJson(STORAGE_KEYS.snapshot, {
      settings: this.settings,
      moves: this.moves,
      historyIndex: this.historyIndex,
      clockA: this.clockA,
      clockB: this.clockB,
    });
  }

  notify(title, message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<strong>${title}</strong><span>${message}</span>`;
    this.dom.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      toast.style.transition = "160ms ease";
      window.setTimeout(() => toast.remove(), 180);
    }, 2400);
  }

  hideIntro() {
    this.dom.introOverlay.classList.add("hidden");
  }

  tickClocks(delta) {
    if (!this.settings.timeLimit || this.winner || this.draw || this.isReplay) return;
    if (this.currentPlayer === 1) {
      this.clockA = Math.max(0, this.clockA - delta);
      if (this.clockA === 0) this.handleTimeLoss(1);
    } else {
      this.clockB = Math.max(0, this.clockB - delta);
      if (this.clockB === 0) this.handleTimeLoss(-1);
    }
  }

  updateBursts(delta) {
    const gravity = new THREE.Vector3(0, -0.22 * delta, 0);
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const burst = this.bursts[i];
      burst.userData.life -= delta;
      const positions = burst.geometry.attributes.position;
      burst.material.opacity = Math.max(0, burst.userData.life * 1.2);
      for (let p = 0; p < positions.count; p += 1) {
        const velocity = burst.userData.velocities[p];
        velocity.add(gravity);
        positions.array[p * 3] += velocity.x;
        positions.array[p * 3 + 1] += velocity.y;
        positions.array[p * 3 + 2] += velocity.z;
      }
      positions.needsUpdate = true;
      if (burst.userData.life <= 0) {
        this.effectGroup.remove(burst);
        burst.geometry.dispose();
        burst.material.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(0.05, this.clock.getDelta());

    this.controls.autoRotate = this.settings.autoRotate && !this.isReplay;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.update();
    this.updateHover();
    this.tickClocks(delta);

    if (this.starField) {
      this.starField.rotation.y += delta * 0.01;
    }
    if (this.dustField) {
      const positions = this.dustField.geometry.attributes.position;
      const seeds = this.dustField.geometry.attributes.seed;
      for (let i = 0; i < positions.count; i += 1) {
        positions.array[i * 3 + 1] += Math.sin(performance.now() * 0.0008 + seeds.array[i]) * 0.0008;
      }
      positions.needsUpdate = true;
    }

    const time = performance.now() * 0.001;
    this.fillLight.position.x = Math.cos(time * 0.7) * (this.boardHalf + 8);
    this.fillLight.position.z = Math.sin(time * 0.7) * (this.boardHalf + 8);
    this.rimLight.position.x = Math.cos(time * 0.45 + 1.4) * (this.boardHalf + 9);
    this.rimLight.position.z = Math.sin(time * 0.45 + 1.4) * (this.boardHalf + 9);
    this.hoverRing.rotation.z += delta * 2.4;
    this.lastMoveRing.rotation.z += delta * 1.8;
    if (this.lastMoveMarker.visible) {
      this.lastMoveMarker.position.y = this.boardTopY + 0.36 + Math.sin(time * 4) * 0.05;
    }
    if (this.hoverGroup.visible) {
      this.hoverGroup.position.y = this.boardTopY + 0.28 + Math.sin(time * 7) * 0.04;
    }

    for (let i = this.animations.length - 1; i >= 0; i -= 1) {
      const animation = this.animations[i];
      animation.elapsed += delta;
      const t = clamp(animation.elapsed / animation.duration, 0, 1);
      animation.update(t);
      if (t >= 1) this.animations.splice(i, 1);
    }

    for (const stone of this.stoneGroup.children) {
      if (stone.userData.halo) {
        stone.userData.halo.rotation.z += delta * 0.7;
      }
    }

    this.updateBursts(delta);
    this.updateUi();
    this.renderer.render(this.scene, this.camera);
  }
}

new PrismOmok3D();
