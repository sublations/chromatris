// Ensure libraries are loaded (simple check)
if (typeof Howl === 'undefined' || typeof gsap === 'undefined') {
  console.error("Required libraries (Howler, GSAP) not loaded!");
  // Attempt to inform user non-intrusively
  const menuScreen = document.getElementById('menu-screen');
  if (menuScreen) {
    menuScreen.innerHTML = '<h1>Error</h1><p>Could not load game resources. Please check your connection and refresh.</p>';
    menuScreen.classList.add('visible');
    gsap.set(menuScreen, { autoAlpha: 1 });
  } else {
    alert("Error: Could not load game resources. Please refresh the page.");
  }
  // Prevent further execution if libraries are missing
  throw new Error("Missing required libraries.");
}

class Game {
  constructor() {
    // Constants
    this.NX = 10; // Board width
    this.NY = 20; // Board height
    this.NU = 5;  // Upcoming preview size (in blocks)
    this.SPEED_START = 0.6; // Initial time per step (seconds)
    this.SPEED_DEC = 0.005; // Speed decrement per row cleared
    this.SPEED_MIN = 0.08; // Minimum time per step
    this.KEY = { ESC: 'Escape', SPACE: ' ', LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', DOWN: 'ArrowDown' }; // Use ' ' for Spacebar event.key
    this.STORAGE_KEY = 'chromatris-highscore';
    this.GHOST_ALPHA = 0.3;

    this.TETROMINOS = {
      // Bitmasks define the 4x4 grid for each piece orientation
      i: { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan', spriteKey: 'i' },
      j: { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue', spriteKey: 'j' },
      l: { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange', spriteKey: 'l' },
      o: { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow', spriteKey: 'o' },
      s: { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'lime', spriteKey: 's' },
      t: { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple', spriteKey: 't' },
      z: { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red', spriteKey: 'z' }
    };

    this.STATE = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3 };

    // DOM elements - Caching happens before init now
    this.cacheDomElements();

    // Game state variables
    this.blocks = null;
    this.currentPiece = null;
    this.nextPiece = null;
    this.pieceBag = [];
    this.ghostPieceY = 0;
    this.score = 0;
    this.rows = 0;
    this.step = this.SPEED_START;
    this.dt = 0;
    this.state = this.STATE.MENU;
    this.actions = [];
    this.lastTime = 0;
    this.animationFrameId = null;
    this.isMuted = false;
    this.blockSize = 30;

    // Assets
    this.sprites = {};
    this.sounds = {};
    this.assetsLoaded = false;
    this.assetLoadPromise = null;

    // High Score
    this.highscore = 0; // Loaded in init

    // Debounce utility
    this.debounce = (fn, ms = 100) => {
      let t;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    };
    this.onResizeDebounced = this.debounce(this.onResize, 150);

    // Initialize after constructor setup
    this.init();
  }

  cacheDomElements() {
    this.canvas = document.getElementById('game-canvas');
    // Add checks for essential elements during caching
    if (!this.canvas) throw new Error("Fatal Error: Could not find game canvas element!");
    this.ctx = this.canvas.getContext('2d');

    this.upCanvas = document.getElementById('upcoming-canvas');
    if (!this.upCanvas) console.warn("Upcoming canvas not found."); // Less critical
    this.uctx = this.upCanvas ? this.upCanvas.getContext('2d') : null;

    this.scoreEl = document.getElementById('score');
    this.rowsEl = document.getElementById('rows');
    this.highEl = document.getElementById('highscore');
    this.finalScoreEl = document.getElementById('final-score');
    this.srAnnouncer = document.getElementById('sr-announcer');
    this.loadingIndicator = document.getElementById('loading-indicator');
    this.header = document.getElementById('header'); // Cache header
    this.sidebar = document.getElementById('sidebar'); // Cache sidebar
    this.touchControls = document.getElementById('touch-controls'); // Cache touch controls

    // Overlays
    this.menuScreen = document.getElementById('menu-screen');
    this.pauseScreen = document.getElementById('pause-screen');
    this.overScreen = document.getElementById('gameover-screen');
    this.overlays = [this.menuScreen, this.pauseScreen, this.overScreen].filter(el => el); // Filter out nulls if any overlay is missing

    // Buttons / Controls
    this.btnStart = document.getElementById('btn-start');
    this.btnResume = document.getElementById('btn-resume');
    this.btnRestartPause = document.getElementById('btn-restart-pause');
    this.btnPlayAgain = document.getElementById('btn-play-again');
    this.btnMenu = document.getElementById('btn-menu');
    this.btnMute = document.getElementById('btn-mute');
    this.btnFS = document.getElementById('btn-fullscreen');
  }


  init() {
    // Load high score safely
    try {
      this.highscore = parseInt(localStorage.getItem(this.STORAGE_KEY)) || 0;
    } catch (e) {
      console.warn("Could not read highscore from localStorage:", e);
      this.highscore = 0;
    }
    this.updateHighscoreDisplay();

    this.assetLoadPromise = this.loadAssets();
    this.bindEvents();
    this.initBoard();
    this.showOverlay(this.menuScreen, false);
    // Call onResize AFTER ensuring elements are cached and DOM is ready
    this.onResize();
  }

  // --- Asset Loading ---
  loadAssets() {
    const spritePromises = Object.keys(this.TETROMINOS).map(key => {
      return new Promise((resolve, reject) => {
        const spriteKey = this.TETROMINOS[key].spriteKey;
        const img = new Image();
        img.onload = () => {
          this.sprites[spriteKey] = img;
          resolve();
        };
        img.onerror = (err) => {
          console.error(`Failed to load sprite: assets/${spriteKey}.png`);
          reject(err);
        };
        img.src = `assets/${spriteKey}.png`;
      });
    });

    try {
      this.sounds = {
        move: new Howl({ src: ['assets/move.wav'], volume: 0.8 }),
        rotate: new Howl({ src: ['assets/rotate.wav'], volume: 0.8 }),
        drop: new Howl({ src: ['assets/drop.wav'], volume: 0.8 }),
        hardDrop: new Howl({ src: ['assets/drop.wav'], volume: 1.0 }),
        clear: new Howl({ src: ['assets/clear.wav'], volume: 1.0 }),
        gameover: new Howl({ src: ['assets/gameover.wav'], volume: 1.0 }),
      };
    } catch (e) {
      console.error("Failed to initialize Howler sounds:", e);
    }

    return Promise.all(spritePromises)
      .then(() => {
        this.assetsLoaded = true;
        console.log("Assets loaded successfully.");
        if (this.btnStart) this.btnStart.disabled = false;
        if (this.loadingIndicator) this.loadingIndicator.style.display = 'none';
        this.draw(); // Initial draw after assets loaded
      })
      .catch(error => {
        console.error("Error loading assets:", error);
        if (this.loadingIndicator) {
          this.loadingIndicator.textContent = 'Error loading assets. Please refresh.';
          this.loadingIndicator.style.color = 'red';
        }
        if (this.btnStart) this.btnStart.disabled = true;
        // Rethrow or handle more gracefully if needed
        // throw error;
      });
  }

  // --- Initialization & State ---
  initBoard() {
    this.blocks = Array.from({ length: this.NX }, () => Array(this.NY).fill(null));
  }

  resetGame() {
    this.initBoard();
    this.score = 0;
    this.rows = 0;
    this.step = this.SPEED_START;
    this.dt = 0;
    this.actions = [];
    // Ensure random piece generation doesn't fail if called early
    this.pieceBag = []; // Ensure bag is clear before generating
    this.currentPiece = this.randomPiece();
    this.nextPiece = this.randomPiece();
    this.calculateGhostPiece();
    this.updateStats();
    this.updateNextPieceDisplay();
  }

  // --- Game Loop ---
  async startGame() {
    // Ensure assets are loaded before starting
    if (!this.assetsLoaded) {
      console.log("Waiting for assets to load...");
      try {
        await this.assetLoadPromise;
        console.log("Assets finished loading, starting game.");
      } catch (error) {
        console.error("Cannot start game due to asset load failure.");
        alert("Failed to load game assets. Please refresh the page.");
        return;
      }
    }

    // Resume audio context if needed
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      try {
        await Howler.ctx.resume();
        console.log("AudioContext resumed.");
      } catch (e) {
        console.error("Failed to resume AudioContext:", e);
      }
    }

    this.hideAllOverlays();
    this.resetGame();
    this.state = this.STATE.PLAY;
    this.lastTime = performance.now();
    this.announce("Game started");
    if (!this.animationFrameId) { // Prevent multiple loops
      this.loop();
    }
  }

  loop(timestamp = performance.now()) {
    // Ensure loop stops if state changes mid-frame
    if (this.state !== this.STATE.PLAY) {
      this.animationFrameId = null;
      return;
    }
    const deltaTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    this.dt += deltaTime;
    this.handleActions();
    if (this.dt >= this.step) {
      this.dt %= this.step; // Use remainder for smoother timing
      this.dropPiece();
    }
    this.draw();
    this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  // --- Player Actions & Input Handling ---
  queueAction(action) {
    if (this.state === this.STATE.PLAY) {
      this.actions.push(action);
    }
  }

  handleActions() {
    // Process all queued actions within a frame
    while (this.actions.length > 0) {
      const action = this.actions.shift();
      if (!action) continue;
      let moved = false;
      let rotated = false;
      switch (action) {
        case 'left':
          moved = this.move(-1, 0);
          if (moved) this.playSound('move');
          break;
        case 'right':
          moved = this.move(1, 0);
          if (moved) this.playSound('move');
          break;
        case 'down':
          this.dropPiece(true); // Soft drop
          this.playSound('drop');
          this.dt = 0; // Reset auto-drop timer
          break;
        case 'rotate':
          rotated = this.rotate();
          if (rotated) this.playSound('rotate');
          break;
        case 'drop':
          this.hardDrop(); // Hard drop
          break;
      }
      if (moved || rotated) {
        this.calculateGhostPiece(); // Recalculate ghost only if needed
      }
    }
  }


  // --- Piece Movement & Logic ---
  eachBlock(piece, callback) {
    // Added checks for robustness
    if (!piece || !piece.type || !this.TETROMINOS[piece.type] || !this.TETROMINOS[piece.type].blocks) return;
    const tetromino = this.TETROMINOS[piece.type];
    const blocks = tetromino.blocks[piece.dir];
    if (blocks === undefined) return; // Ensure direction exists

    let bit = 0x8000;
    let row = 0;
    let col = 0;
    for (let i = 0; i < 16; i++) {
      if (blocks & bit) {
        callback(piece.x + col, piece.y + row);
      }
      bit >>= 1;
      col++;
      if (col === 4) {
        col = 0;
        row++;
      }
    }
  }

  isOccupied(x, y) {
    // Added check for this.blocks existing
    return !this.blocks || x < 0 || x >= this.NX || y >= this.NY || (y >= 0 && this.blocks[x] && this.blocks[x][y]);
  }

  canPlace(piece) {
    if (!piece) return false; // Cannot place a null piece
    let can = true;
    this.eachBlock(piece, (x, y) => {
      if (this.isOccupied(x, y)) {
        can = false;
        // Note: No need to continue checking if one block fails
      }
    });
    return can;
  }

  move(dx, dy) {
    if (!this.currentPiece) return false;
    const nextPos = { ...this.currentPiece, x: this.currentPiece.x + dx, y: this.currentPiece.y + dy };
    if (this.canPlace(nextPos)) {
      this.currentPiece = nextPos;
      return true;
    }
    return false;
  }

  rotate() {
    if (!this.currentPiece) return false;
    const nextDir = (this.currentPiece.dir + 1) % 4;
    const testPiece = { ...this.currentPiece, dir: nextDir };
    // Simplified kicks - adjust if full SRS is needed
    const kicks = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];
    for (const [dx, dy] of kicks) {
      const kickedPiece = { ...testPiece, x: testPiece.x + dx, y: testPiece.y + dy };
      if (this.canPlace(kickedPiece)) {
        this.currentPiece = kickedPiece;
        return true;
      }
    }
    return false;
  }

  dropPiece(isSoftDrop = false) {
    if (!this.currentPiece) return;
    const nextPos = { ...this.currentPiece, y: this.currentPiece.y + 1 };
    if (this.canPlace(nextPos)) {
      this.currentPiece.y++;
      if (isSoftDrop) this.score += 1; // Minimal score for soft drop
    } else {
      this.lockPiece();
    }
  }

  hardDrop() {
    if (!this.currentPiece) return;
    let distance = 0;
    const startY = this.currentPiece.y;
    while (this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 })) {
      this.currentPiece.y++;
      distance++;
    }
    if (distance > 0) this.score += distance * 2; // Score for hard drop distance

    this.playSound('hardDrop');
    this.lockPiece();
    this.dt = this.step; // Force next piece
  }

  lockPiece() {
    if (!this.currentPiece) return;
    let gameOverCondition = false;
    this.eachBlock(this.currentPiece, (x, y) => {
      if (y < 0) {
        gameOverCondition = true;
      } else if (y < this.NY && x >= 0 && x < this.NX && this.blocks[x]) { // Check column exists
        this.blocks[x][y] = this.currentPiece.type;
      }
    });

    if (gameOverCondition) {
      this.gameOver();
      return;
    }
    const linesCleared = this.clearLines();
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.randomPiece();
    this.updateNextPieceDisplay();
    if (!this.canPlace(this.currentPiece)) {
      this.draw(); // Draw piece causing game over
      this.gameOver();
    } else {
      this.calculateGhostPiece();
      if (linesCleared === 0 && this.state !== this.STATE.OVER) {
        this.playSound('drop'); // Normal lock sound
      }
    }
  }

  clearLines() {
    let linesToClearIndices = [];
    for (let y = this.NY - 1; y >= 0; y--) {
      let isLineFull = true;
      for (let x = 0; x < this.NX; x++) {
        if (!this.blocks[x] || !this.blocks[x][y]) {
          isLineFull = false; break;
        }
      }
      if (isLineFull) linesToClearIndices.push(y);
    }
    const clearedCount = linesToClearIndices.length;
    if (clearedCount > 0) {
      this.playSound('clear');
      linesToClearIndices.forEach(y => this.flashLine(y));
      let rowsToDrop = 0;
      for (let y = this.NY - 1; y >= 0; y--) {
        if (linesToClearIndices.includes(y)) {
          rowsToDrop++;
        } else if (rowsToDrop > 0 && y + rowsToDrop < this.NY) { // Check bounds
          for (let x = 0; x < this.NX; x++) {
            if (this.blocks[x]) {
              this.blocks[x][y + rowsToDrop] = this.blocks[x][y];
              this.blocks[x][y] = null;
            }
          }
        }
      }
      // Clear top rows that were shifted from
      for (let y = 0; y < rowsToDrop; y++) {
        for (let x = 0; x < this.NX; x++) {
          if (this.blocks[x]) this.blocks[x][y] = null;
        }
      }

      this.rows += clearedCount;
      const points = [0, 40, 100, 300, 1200]; // More standard scoring (adjust multiplier)
      const level = Math.floor(this.rows / 10) + 1;
      this.score += points[Math.min(clearedCount, 4)] * level;

      this.step = Math.max(this.SPEED_MIN, this.SPEED_START - this.SPEED_DEC * this.rows);
      this.updateStats();
      this.announce(`<span class="math-inline">\{clearedCount\} line</span>{clearedCount > 1 ? 's' : ''} cleared! Score ${this.score}. Rows ${this.rows}. Level ${level}.`);
    }
    return clearedCount;
  }

  // --- Ghost Piece ---
  calculateGhostPiece() {
    if (!this.currentPiece || this.state !== this.STATE.PLAY) {
      this.ghostPieceY = -1; return;
    };
    this.ghostPieceY = this.currentPiece.y;
    while (this.canPlace({ ...this.currentPiece, y: this.ghostPieceY + 1 })) {
      this.ghostPieceY++;
    }
  }

  // --- Random Piece Generation (7-Bag Randomizer) ---
  randomPiece() {
    if (this.pieceBag.length === 0) {
      this.pieceBag = Object.keys(this.TETROMINOS).slice();
      for (let i = this.pieceBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.pieceBag[i], this.pieceBag[j]] = [this.pieceBag[j], this.pieceBag[i]];
      }
    }
    const type = this.pieceBag.pop();
    if (!type || !this.TETROMINOS[type]) {
      console.error("Failed to get valid piece type from bag.");
      // Fallback to a default piece?
      return { type: 't', dir: 0, x: Math.floor((this.NX - 3) / 2), y: 0 };
    }
    return {
      type: type, dir: 0,
      x: Math.floor((this.NX - this.TETROMINOS[type].size) / 2),
      y: 0
    };
  }

  // --- Drawing ---
  draw() {
    if (!this.blocks || !this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid();
    for (let x = 0; x < this.NX; x++) {
      for (let y = 0; y < this.NY; y++) {
        if (this.blocks[x] && this.blocks[x][y]) {
          this.drawBlock(this.ctx, x, y, this.blocks[x][y]);
        }
      }
    }
    if (this.state === this.STATE.PLAY && this.currentPiece && this.ghostPieceY >= 0 && this.ghostPieceY >= this.currentPiece.y) {
      this.ctx.globalAlpha = this.GHOST_ALPHA;
      const ghostPiece = { ...this.currentPiece, y: this.ghostPieceY };
      this.eachBlock(ghostPiece, (x, y) => {
        // Only draw ghost blocks within the valid board area
        if (y >= 0) this.drawBlock(this.ctx, x, y, ghostPiece.type);
      });
      this.ctx.globalAlpha = 1.0;
    }
    if (this.state === this.STATE.PLAY && this.currentPiece) {
      this.eachBlock(this.currentPiece, (x, y) => {
        if (y >= 0) this.drawBlock(this.ctx, x, y, this.currentPiece.type);
      });
    }
  }

  drawBlock(context, x, y, type) {
    if (!context || x < 0 || y < 0 || // Basic bounds check
      x * this.blockSize >= context.canvas.width || // Check horizontal render bounds
      y * this.blockSize >= context.canvas.height) { // Check vertical render bounds
      return;
    }
    const spriteKey = this.TETROMINOS[type]?.spriteKey;
    const sprite = this.sprites[spriteKey];
    if (sprite && this.assetsLoaded) {
      context.drawImage(sprite, x * this.blockSize, y * this.blockSize, this.blockSize, this.blockSize);
    } else {
      context.fillStyle = this.TETROMINOS[type]?.color || '#888';
      // Draw slightly smaller to show grid lines
      context.fillRect(x * this.blockSize + 1, y * this.blockSize + 1, this.blockSize - 2, this.blockSize - 2);
    }
  }

  drawGrid() {
    if (!this.ctx) return;
    this.ctx.strokeStyle = 'var(--grid-line-color, #2a2a2a)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath(); // Optimize drawing lines
    for (let i = 0; i <= this.NX; i++) {
      this.ctx.moveTo(i * this.blockSize + 0.5, 0); // Offset by 0.5 for crisp lines
      this.ctx.lineTo(i * this.blockSize + 0.5, this.canvas.height);
    }
    for (let i = 0; i <= this.NY; i++) {
      this.ctx.moveTo(0, i * this.blockSize + 0.5);
      this.ctx.lineTo(this.canvas.width, i * this.blockSize + 0.5);
    }
    this.ctx.stroke(); // Single stroke call
  }

  updateNextPieceDisplay() {
    if (!this.nextPiece || !this.uctx || !this.assetsLoaded || !this.upCanvas) return;

    const previewBlockSize = Math.floor(this.upCanvas.width / this.NU);
    this.upCanvas.height = previewBlockSize * this.NU;

    this.uctx.clearRect(0, 0, this.upCanvas.width, this.upCanvas.height);
    const piece = this.nextPiece;
    const tetromino = this.TETROMINOS[piece.type];
    if (!tetromino) return; // Guard against invalid piece type

    const scale = previewBlockSize;
    const pieceActualWidth = tetromino.size;
    const pieceActualHeight = tetromino.size;
    const offsetXBlocks = (this.NU - pieceActualWidth) / 2;
    let offsetYBlocks = (this.NU - pieceActualHeight) / 2;
    if (piece.type === 'i') offsetYBlocks -= 0.5;
    if (piece.type === 'o') offsetYBlocks += 0.5;

    const mainBlockSize = this.blockSize;
    this.blockSize = previewBlockSize; // Temporarily set for drawBlock
    const tempPiece = { ...piece, x: offsetXBlocks, y: offsetYBlocks };
    this.eachBlock(tempPiece, (x, y) => this.drawBlock(this.uctx, x, y, piece.type));
    this.blockSize = mainBlockSize; // Restore
  }

  flashLine(y) {
    if (!this.canvas || !this.canvas.parentNode) return;
    const flashElement = document.createElement('div');
    flashElement.className = 'line-clear-flash';
    flashElement.style.top = `${y * this.blockSize}px`;
    flashElement.style.left = `0px`;
    flashElement.style.width = `${this.canvas.width}px`;
    flashElement.style.height = `${this.blockSize}px`;
    this.canvas.parentNode.appendChild(flashElement);
    setTimeout(() => {
      if (flashElement.parentNode) flashElement.remove();
    }, 300); // Match CSS animation duration
  }

  // --- UI Updates & Stats ---
  updateStats() {
    if (this.scoreEl) this.scoreEl.textContent = this.score;
    if (this.rowsEl) this.rowsEl.textContent = this.rows;
  }

  updateHighscoreDisplay() {
    if (this.highEl) this.highEl.textContent = `Highscore: ${this.highscore}`;
  }

  // --- State Transitions & Overlays ---
  togglePause() {
    if (this.state === this.STATE.PLAY) {
      this.state = this.STATE.PAUSE;
      this.stopLoop();
      this.showOverlay(this.pauseScreen);
      this.announce("Game paused");
    } else if (this.state === this.STATE.PAUSE) {
      this.resumeGame();
    }
  }

  resumeGame() {
    if (this.state !== this.STATE.PAUSE) return;
    // Check audio context again before resuming play
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().then(() => {
        console.log("AudioContext resumed on game resume.");
        this.finalizeResume();
      }).catch(e => {
        console.error("Failed to resume AudioContext on game resume:", e);
        this.finalizeResume(); // Continue resume even if audio fails
      });
    } else {
      this.finalizeResume();
    }
  }

  finalizeResume() {
    this.state = this.STATE.PLAY;
    this.hideOverlay(this.pauseScreen);
    this.lastTime = performance.now();
    this.announce("Game resumed");
    if (!this.animationFrameId) {
      this.loop();
    }
  }


  gameOver() {
    if (this.state === this.STATE.OVER) return;
    this.state = this.STATE.OVER;
    this.stopLoop();
    this.playSound('gameover');
    if (this.finalScoreEl) this.finalScoreEl.textContent = this.score;
    if (this.score > this.highscore) {
      this.highscore = this.score;
      try {
        localStorage.setItem(this.STORAGE_KEY, this.highscore.toString());
        this.updateHighscoreDisplay();
        this.announce(`Game Over. New Highscore: ${this.highscore}`);
      } catch (e) {
        console.warn("Could not save highscore:", e);
        this.announce(`Game Over. Score: ${this.score}. Highscore error.`);
      }
    } else {
      this.announce(`Game Over. Final Score: ${this.score}`);
    }
    this.showOverlay(this.overScreen);
  }

  showMenu() {
    this.state = this.STATE.MENU;
    this.stopLoop();
    this.hideAllOverlays(true);
    this.showOverlay(this.menuScreen);
    this.announce("Main Menu");
    // Optionally reset score/rows display when returning to menu
    // this.score = 0; this.rows = 0; this.updateStats();
  }

  showOverlay(overlayElement, animate = true) {
    if (!overlayElement) return;
    overlayElement.classList.add('visible');
    const action = animate
      ? () => gsap.to(overlayElement, { autoAlpha: 1, duration: 0.3, ease: "power1.out", overwrite: true })
      : () => gsap.set(overlayElement, { autoAlpha: 1 });
    action();
    const focusable = overlayElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
  }

  hideOverlay(overlayElement, animate = true) {
    if (!overlayElement) return;
    const onComplete = () => overlayElement.classList.remove('visible');
    const action = animate
      ? () => gsap.to(overlayElement, { autoAlpha: 0, duration: 0.2, ease: "power1.in", onComplete: onComplete, overwrite: true })
      : () => { gsap.set(overlayElement, { autoAlpha: 0 }); onComplete(); };
    action();
  }

  hideAllOverlays(instant = false) {
    this.overlays.forEach(overlay => this.hideOverlay(overlay, !instant));
  }

  // --- Sound Control ---
  playSound(soundKey) {
    if (!this.isMuted && this.sounds[soundKey] && typeof this.sounds[soundKey].play === 'function') {
      if (Howler.state === 'running') {
        this.sounds[soundKey].play();
      }
      // No warning needed here, as user interaction will resume context
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    Howler.mute(this.isMuted);
    const muteIcon = this.btnMute?.querySelector('.mute-icon');
    const unmuteIcon = this.btnMute?.querySelector('.unmute-icon');
    if (!muteIcon || !unmuteIcon || !this.btnMute) return;
    muteIcon.style.display = this.isMuted ? 'none' : 'inline';
    unmuteIcon.style.display = this.isMuted ? 'inline' : 'none';
    this.btnMute.setAttribute('aria-pressed', this.isMuted.toString());
    this.announce(this.isMuted ? "Sound muted" : "Sound unmuted");
  }

  // --- Fullscreen ---
  toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      this.announce("Fullscreen not supported"); return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
        .then(() => this.announce("Entered fullscreen"))
        .catch(err => this.announce("Could not enter fullscreen"));
    } else {
      if (document.exitFullscreen) document.exitFullscreen()
        .then(() => this.announce("Exited fullscreen"))
        .catch(err => console.error("Error exiting fullscreen:", err));
    }
  }

  // --- Accessibility ---
  announce(message) {
    if (this.srAnnouncer) {
      // Use requestAnimationFrame to prevent interfering with rendering
      requestAnimationFrame(() => {
        this.srAnnouncer.textContent = message;
        // Clear after a delay
        setTimeout(() => { if (this.srAnnouncer) this.srAnnouncer.textContent = ''; }, 1000); // Slightly longer timeout
      });
    }
  }

  // --- Event Binding ---
  bindEvents() {
    // Use passive for scroll/touch listeners if they don't preventDefault
    window.addEventListener('resize', this.onResizeDebounced, { passive: true });
    document.addEventListener('keydown', this.handleKeyDown.bind(this));

    // Add listeners only if buttons exist
    this.btnStart?.addEventListener('click', () => this.startGame());
    this.btnResume?.addEventListener('click', () => this.resumeGame());
    this.btnRestartPause?.addEventListener('click', () => this.startGame());
    this.btnPlayAgain?.addEventListener('click', () => this.startGame());
    this.btnMenu?.addEventListener('click', () => this.showMenu());
    this.btnMute?.addEventListener('click', () => this.toggleMute());
    this.btnFS?.addEventListener('click', () => this.toggleFullscreen());

    // Touch controls
    this.touchControls?.addEventListener('pointerdown', (e) => {
      const button = e.target.closest('button');
      if (button && button.dataset.action && this.state === this.STATE.PLAY) {
        this.queueAction(button.dataset.action);
        e.preventDefault(); // Prevent scrolling/zoom on game buttons
      }
    });
    this.touchControls?.addEventListener('contextmenu', e => e.preventDefault());

    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === this.STATE.PLAY) {
        this.togglePause();
      }
    }, { passive: true }); // Can be passive
  }

  handleKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
      if (e.key === this.KEY.ESC && this.state === this.STATE.PLAY) {
        this.togglePause(); e.preventDefault();
      }
      return;
    }
    // Prevent default action for arrow keys, space, p, esc ONLY when game is active/paused appropriately
    let handled = false;
    if (this.state === this.STATE.PLAY) {
      switch (e.key) {
        case this.KEY.LEFT: case this.KEY.RIGHT: case this.KEY.DOWN: case this.KEY.UP:
        case this.KEY.SPACE: case this.KEY.ESC: case 'p': case 'P':
          handled = true; break;
      }
      if (handled) {
        switch (e.key) {
          case this.KEY.LEFT: this.queueAction('left'); break;
          case this.KEY.RIGHT: this.queueAction('right'); break;
          case this.KEY.DOWN: this.queueAction('down'); break;
          case this.KEY.UP: this.queueAction('rotate'); break;
          case this.KEY.SPACE: this.queueAction('drop'); break;
          case this.KEY.ESC: this.togglePause(); break;
          case 'p': case 'P': this.togglePause(); break;
        }
      }
    } else if (this.state === this.STATE.PAUSE) {
      if (e.key === this.KEY.ESC || e.key === 'p' || e.key === 'P') {
        this.resumeGame(); handled = true;
      }
    }
    if (handled) e.preventDefault();
  }

  // --- Resize Handling ---
  onResize() {
    if (!this.canvas || !this.ctx || !this.header) {
      console.warn("Resize skipped: Essential elements missing.");
      return;
    }
    const container = this.canvas.closest('#game-container') || document.body; // Find container relative to canvas

    // Use innerWidth/Height as fallback if visualViewport is unavailable
    const vpWidth = window.visualViewport?.width ?? window.innerWidth;
    const vpHeight = window.visualViewport?.height ?? window.innerHeight;
    const headerHeight = this.header.offsetHeight || 48;
    // Recalculate available space more dynamically
    const containerPaddingTop = parseFloat(window.getComputedStyle(container).paddingTop) || 0;
    const availableHeight = vpHeight - headerHeight - containerPaddingTop - 10; // Reduce bottom padding guess
    let availableWidth = vpWidth - 20; // Reduce side padding guess

    let sidebarVisible = false;
    if (this.sidebar) {
      try { sidebarVisible = window.getComputedStyle(this.sidebar).display !== 'none'; } catch (e) { }
    }

    let touchControlsVisible = false;
    if (this.touchControls) {
      try { touchControlsVisible = window.getComputedStyle(this.touchControls).display !== 'none'; } catch (e) { }
    }

    if (sidebarVisible && this.sidebar) {
      availableWidth -= (this.sidebar.offsetWidth || 150) + (parseFloat(window.getComputedStyle(container).gap) || 32);
    }
    if (touchControlsVisible && this.touchControls) {
      // Consider element position relative to canvas, not just screen orientation
      const controlsRect = this.touchControls.getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      if (controlsRect.bottom > canvasRect.bottom) { // Controls below canvas
        availableHeight -= this.touchControls.offsetHeight + 16;
      } else if (controlsRect.left > canvasRect.right || controlsRect.right < canvasRect.left) { // Controls beside canvas
        availableWidth -= this.touchControls.offsetWidth + 16;
      }
    }

    const blockW = Math.max(1, Math.floor(availableWidth / this.NX));
    const blockH = Math.max(1, Math.floor(availableHeight / this.NY));
    this.blockSize = Math.max(5, Math.min(blockW, blockH));

    this.canvas.width = this.blockSize * this.NX;
    this.canvas.height = this.blockSize * this.NY;

    this.updateNextPieceDisplay(); // Recalculate preview size too
    this.draw(); // Redraw everything with new size
  }
}

// --- Global Initialization ---
function initializeGame() {
  if (!window.tetrisGame) {
    try {
      window.tetrisGame = new Game();
      console.log("Chromatris Initialized");
    } catch (e) {
      console.error("Failed to initialize game:", e);
      const menuScreen = document.getElementById('menu-screen');
      if (menuScreen && !menuScreen.querySelector('h1')?.textContent.includes('Error')) {
        menuScreen.innerHTML = `<h1>Initialization Error</h1><p>${e.message || 'Could not start the game.'}</p><p>Please ensure essential HTML elements exist.</p>`;
        menuScreen.classList.add('visible');
        gsap?.set(menuScreen, { autoAlpha: 1 }); // Use gsap if available
      } else if (!document.getElementById('menu-screen')) {
        alert(`Fatal Error: ${e.message || 'Could not start the game.'}`);
      }
    }
  }
}

// Ensure initialization runs after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGame);
} else {
  initializeGame();
}