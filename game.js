// Ensure libraries are loaded (simple check)
if (typeof Howl === 'undefined' || typeof gsap === 'undefined') {
  console.error("Required libraries (Howler, GSAP) not loaded!");
  alert("Error: Could not load game resources. Please refresh the page.");
}

class Game {
  constructor() {
      // Constants
      this.NX = 10; // Board width
      this.NY = 20; // Board height
      this.NU = 5;  // Upcoming preview size (in blocks)
      this.SPEED_START = 0.6; // Initial time per step (seconds)
      this.SPEED_DEC = 0.005; // Speed decrement per row cleared (smaller for smoother progression)
      this.SPEED_MIN = 0.08; // Minimum time per step
      this.KEY = { ESC: 'Escape', SPACE: 'Space', LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', DOWN: 'ArrowDown' };
      this.STORAGE_KEY = 'chromatris-highscore';
      this.GHOST_ALPHA = 0.3;

      this.TETROMINOS = {
          // Bitmasks define the 4x4 grid for each piece orientation
          // 0x0F00 = 0000 1111 0000 0000 (line on 2nd row)
          // 0x2222 = 0010 0010 0010 0010 (vertical line in 2nd column)
          i: { size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 'cyan', spriteKey: 'i' },
          j: { size: 3, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 'blue', spriteKey: 'j' },
          l: { size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 'orange', spriteKey: 'l' },
          o: { size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 'yellow', spriteKey: 'o' },
          s: { size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 'lime', spriteKey: 's' },
          t: { size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 'purple', spriteKey: 't' },
          z: { size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 'red', spriteKey: 'z' }
      };

      this.STATE = { MENU: 0, PLAY: 1, PAUSE: 2, OVER: 3 };

      // DOM elements
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.upCanvas = document.getElementById('upcoming-canvas');
      this.uctx = this.upCanvas.getContext('2d');
      this.scoreEl = document.getElementById('score');
      this.rowsEl = document.getElementById('rows');
      this.highEl = document.getElementById('highscore');
      this.finalScoreEl = document.getElementById('final-score');
      this.srAnnouncer = document.getElementById('sr-announcer'); // For screen readers

      // Overlays
      this.menuScreen = document.getElementById('menu-screen');
      this.pauseScreen = document.getElementById('pause-screen');
      this.overScreen = document.getElementById('gameover-screen');
      this.overlays = [this.menuScreen, this.pauseScreen, this.overScreen];

      // Buttons / Controls
      this.btnStart = document.getElementById('btn-start');
      this.btnResume = document.getElementById('btn-resume');
      this.btnRestartPause = document.getElementById('btn-restart-pause');
      this.btnPlayAgain = document.getElementById('btn-play-again');
      this.btnMenu = document.getElementById('btn-menu');
      this.btnMute = document.getElementById('btn-mute');
      this.btnFS = document.getElementById('btn-fullscreen');
      this.touchControls = document.getElementById('touch-controls');

      // Game state variables
      this.blocks = null; // Game board grid
      this.currentPiece = null;
      this.nextPiece = null;
      this.ghostPieceY = 0; // Y position for the ghost piece
      this.score = 0;
      this.rows = 0;
      this.step = this.SPEED_START; // Current time per game step
      this.dt = 0; // Accumulated time since last step
      this.state = this.STATE.MENU;
      this.actions = []; // Queue for player actions
      this.lastTime = 0;
      this.animationFrameId = null;
      this.isMuted = false;
      this.blockSize = 30; // Default size, will be updated on resize

      // Assets
      this.sprites = {};
      this.sounds = {};
      this.assetsLoaded = false;
      this.assetPromises = [];

      // High Score
      this.highscore = parseInt(localStorage.getItem(this.STORAGE_KEY)) || 0;
      this.updateHighscoreDisplay();

      // Debounce utility
      this.debounce = (fn, ms = 100) => {
          let t;
          return (...args) => {
              clearTimeout(t);
              t = setTimeout(() => fn.apply(this, args), ms);
          };
      };

      this.onResizeDebounced = this.debounce(this.onResize, 150);

      this.loadAssets();
      this.bindEvents();
      this.initBoard(); // Initialize board structure even before assets load
      this.showOverlay(this.menuScreen, false); // Show menu initially without animation
      this.onResize(); // Initial sizing
  }

  // --- Asset Loading ---

  loadAssets() {
      // Sprites
      Object.keys(this.TETROMINOS).forEach(key => {
          const spriteKey = this.TETROMINOS[key].spriteKey;
          const img = new Image();
          const loadPromise = new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = `assets/${spriteKey}.png`;
          });
          this.sprites[spriteKey] = img;
          this.assetPromises.push(loadPromise);
      });

      // Sounds
      this.sounds = {
          move:     new Howl({ src: ['assets/move.wav'], volume: 0.8 }),
          rotate:   new Howl({ src: ['assets/rotate.wav'], volume: 0.8 }),
          drop:     new Howl({ src: ['assets/drop.wav'], volume: 0.8 }),
          hardDrop: new Howl({ src: ['assets/drop.wav'], volume: 1.0 }), // Can use a different sound
          clear:    new Howl({ src: ['assets/clear.wav'], volume: 1.0 }),
          gameover: new Howl({ src: ['assets/gameover.wav'], volume: 1.0 }),
          // bgm: new Howl({ src: ['assets/music.mp3'], loop: true, volume: 0.3 }) // Example BGM
      };
      // Howler loads asynchronously, check Howler.state() if precise load tracking needed

      Promise.all(this.assetPromises)
          .then(() => {
              this.assetsLoaded = true;
              console.log("Assets loaded successfully.");
              // Consider enabling start button only after assets load
              this.btnStart.disabled = false;
              this.draw(); // Draw initial state once assets ready
          })
          .catch(error => {
              console.error("Error loading assets:", error);
              alert("Failed to load game graphics. Please check the console and refresh.");
              // Handle asset loading failure (e.g., show error message)
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
      this.currentPiece = this.randomPiece();
      this.nextPiece = this.randomPiece();
      this.calculateGhostPiece();
      this.updateStats();
      this.updateNextPieceDisplay();
      // this.sounds.bgm?.play(); // Start BGM if exists
  }

  // --- Game Loop ---

  startGame() {
      if (!this.assetsLoaded) {
          console.warn("Assets not loaded yet, cannot start game.");
          return;
      }
      // Resume audio context if needed (important for browsers restricting audio)
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
          Howler.ctx.resume().then(() => console.log("AudioContext resumed."));
      }

      this.hideAllOverlays();
      this.resetGame();
      this.state = this.STATE.PLAY;
      this.lastTime = performance.now();
      this.announce("Game started");
      this.loop();
  }

  loop(timestamp = performance.now()) {
      if (this.state !== this.STATE.PLAY) {
          this.animationFrameId = null; // Stop loop if not playing
          return;
      }

      const deltaTime = (timestamp - this.lastTime) / 1000; // Delta time in seconds
      this.lastTime = timestamp;
      this.dt += deltaTime;

      this.handleActions();

      // Game logic update based on step time
      if (this.dt > this.step) {
          this.dt -= this.step;
          this.dropPiece(false); // Natural drop
      }

      this.draw(); // Redraw canvas
      this.animationFrameId = requestAnimationFrame(this.loop.bind(this));
  }

  stopLoop() {
      if (this.animationFrameId) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
      }
      // this.sounds.bgm?.pause(); // Pause BGM
  }

  // --- Player Actions & Input Handling ---

  queueAction(action) {
      if (this.state === this.STATE.PLAY) {
          this.actions.push(action);
          // Optional: Limit queue size to prevent input lag buildup
          // if (this.actions.length > 3) this.actions.shift();
      }
  }

  handleActions() {
      const action = this.actions.shift(); // Process one action per frame (or more if needed)
      if (!action) return;

      switch (action) {
          case 'left':
              if (this.move(-1, 0)) this.playSound('move');
              break;
          case 'right':
              if (this.move(1, 0)) this.playSound('move');
              break;
          case 'down':
              this.dropPiece(false); // Soft drop
              this.playSound('drop');
              this.dt = 0; // Reset drop timer after manual down
              break;
          case 'rotate':
              if (this.rotate()) this.playSound('rotate');
              break;
          case 'drop':
              this.hardDrop(); // Hard drop
              break;
      }
      // Recalculate ghost after any move/rotate
      if (['left', 'right', 'rotate'].includes(action)) {
          this.calculateGhostPiece();
      }
  }

  // --- Piece Movement & Logic ---

  eachBlock(piece, callback) {
      if (!piece || !piece.type) return; // Guard against null piece
      const tetromino = this.TETROMINOS[piece.type];
      let bit = 0x8000; // Start with the top-left bit of a 4x4 grid (1000 0000 0000 0000)
      let row = 0;
      let col = 0;
      const blocks = tetromino.blocks[piece.dir];
      const size = tetromino.size; // Use size for loop limit? (bitmask handles 4x4 anyway)

      for (let i = 0; i < 16; i++) { // Iterate through all 16 bits of the mask
          if (blocks & bit) {
              callback(piece.x + col, piece.y + row);
          }
          bit >>= 1; // Move to the next bit
          col++;
          if (col === 4) {
              col = 0;
              row++;
          }
      }
  }

  isOccupied(x, y) {
      // Check bounds and if the cell in the grid is filled
      return x < 0 || x >= this.NX || y >= this.NY || (y >= 0 && this.blocks[x][y]);
  }

  canPlace(piece) {
      let can = true;
      this.eachBlock(piece, (x, y) => {
          if (this.isOccupied(x, y)) {
              can = false;
          }
      });
      return can;
  }

  move(dx, dy) {
      const nextPos = { ...this.currentPiece, x: this.currentPiece.x + dx, y: this.currentPiece.y + dy };
      if (this.canPlace(nextPos)) {
          this.currentPiece = nextPos;
          return true; // Move successful
      }
      return false; // Move failed
  }

  rotate() {
      const nextDir = (this.currentPiece.dir + 1) % 4;
      const nextRot = { ...this.currentPiece, dir: nextDir };

      // Basic Wall Kick logic (can be expanded for SRS)
      let kickX = 0;
      let kickY = 0;

      if (!this.canPlace(nextRot)) {
           // Try kicking left/right
          if (this.canPlace({ ...nextRot, x: nextRot.x - 1 })) {
              kickX = -1;
          } else if (this.canPlace({ ...nextRot, x: nextRot.x + 1 })) {
              kickX = 1;
          // Add more complex kicks if needed (especially for I piece)
          } else {
               return false; // Rotation failed even with basic kicks
          }
      }

      this.currentPiece.dir = nextDir;
      this.currentPiece.x += kickX;
      this.currentPiece.y += kickY;
      return true; // Rotation successful
  }

  dropPiece(isHardDrop) {
      const nextPos = { ...this.currentPiece, y: this.currentPiece.y + 1 };
      if (this.canPlace(nextPos)) {
          this.currentPiece.y++;
      } else {
          // Piece cannot move down further, lock it in place
          this.lockPiece();
      }
  }

  hardDrop() {
      // Move piece down until it locks
      while (this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 })) {
          this.currentPiece.y++;
      }
      this.playSound('hardDrop');
      this.lockPiece();
      this.dt = this.step; // Force next piece immediately after hard drop
  }

  lockPiece() {
      this.eachBlock(this.currentPiece, (x, y) => {
          // Ensure piece locks within bounds (can happen at top on game over)
          if (y >= 0 && y < this.NY && x >=0 && x < this.NX) {
               this.blocks[x][y] = this.currentPiece.type;
          }
      });

      const linesCleared = this.clearLines();

      // Get next piece
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.randomPiece();
      this.calculateGhostPiece(); // Calculate ghost for the new piece
      this.updateNextPieceDisplay();

      // Check for game over
      if (!this.canPlace(this.currentPiece)) {
          this.gameOver();
      } else if (linesCleared === 0) {
           // Slight variation in sound if no lines cleared on lock
           this.playSound('drop');
      }
  }

  clearLines() {
      let clearedCount = 0;
      let linesToClear = [];

      for (let y = this.NY - 1; y >= 0; y--) {
          let isLineFull = true;
          for (let x = 0; x < this.NX; x++) {
              if (!this.blocks[x][y]) {
                  isLineFull = false;
                  break;
              }
          }

          if (isLineFull) {
              clearedCount++;
              linesToClear.push(y);
              this.flashLine(y); // Trigger visual flash
          }
      }

      if (clearedCount > 0) {
          this.playSound('clear');

          // Remove cleared lines and shift down
          for (let y = this.NY - 1; y >= 0; y--) {
              if (linesToClear.includes(y)) {
                  // Shift all rows above this down
                  for (let yy = y; yy > 0; yy--) {
                      for (let x = 0; x < this.NX; x++) {
                          this.blocks[x][yy] = this.blocks[x][yy - 1];
                      }
                  }
                  // Clear the top row
                  for (let x = 0; x < this.NX; x++) {
                      this.blocks[x][0] = null;
                  }
                  // Since we shifted down, re-check the current row index
                  // Find the next line index to check (adjusting for shifted rows)
                  linesToClear = linesToClear.map(ly => ly < y ? ly : ly + 1);
                  y++; // Re-check this index after shifting
              }
          }


          // Update score, rows, speed
          this.rows += clearedCount;
           // Scoring: 1 line = 100, 2 lines = 300, 3 lines = 500, 4 lines = 800 (Tetris standard)
          const points = [0, 100, 300, 500, 800];
          this.score += points[clearedCount] || points[4]; // Use 800 for 4+ lines

          // Update speed based on total rows cleared
          this.step = Math.max(this.SPEED_MIN, this.SPEED_START - this.SPEED_DEC * this.rows);

          this.updateStats();
           this.announce(`${clearedCount} line${clearedCount > 1 ? 's' : ''} cleared! Score ${this.score}. Rows ${this.rows}.`);
      }
      return clearedCount;
  }

  // --- Ghost Piece ---
  calculateGhostPiece() {
      if (!this.currentPiece) return;
      this.ghostPieceY = this.currentPiece.y;
      while (this.canPlace({ ...this.currentPiece, y: this.ghostPieceY + 1 })) {
          this.ghostPieceY++;
      }
  }

  // --- Random Piece Generation (Bag Randomizer) ---

  randomPiece() {
      if (!this.pieceBag || this.pieceBag.length === 0) {
          // Refill the bag when empty
          this.pieceBag = Object.keys(this.TETROMINOS).slice();
          // Shuffle the bag (Fisher-Yates shuffle)
          for (let i = this.pieceBag.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [this.pieceBag[i], this.pieceBag[j]] = [this.pieceBag[j], this.pieceBag[i]];
          }
      }
      // Pull next piece from the bag
      const type = this.pieceBag.pop();
      return {
          type: type,
          dir: 0,
          x: Math.floor((this.NX - this.TETROMINOS[type].size) / 2),
          y: 0 // Start at the top
      };
  }

  // --- Drawing ---

  draw() {
      if (!this.assetsLoaded || !this.blocks) return;

      // Clear main canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Semi-transparent background
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw placed blocks
      for (let x = 0; x < this.NX; x++) {
          for (let y = 0; y < this.NY; y++) {
              const type = this.blocks[x][y];
              if (type) {
                  this.drawBlock(this.ctx, x, y, type);
              }
          }
      }

      // Draw ghost piece (if playing and piece exists)
      if (this.state === this.STATE.PLAY && this.currentPiece && this.ghostPieceY > this.currentPiece.y) {
           this.ctx.globalAlpha = this.GHOST_ALPHA;
           const ghostPiece = { ...this.currentPiece, y: this.ghostPieceY };
           this.eachBlock(ghostPiece, (x, y) => {
               this.drawBlock(this.ctx, x, y, ghostPiece.type);
           });
           this.ctx.globalAlpha = 1.0;
      }

      // Draw current piece
      if (this.state === this.STATE.PLAY && this.currentPiece) {
           this.eachBlock(this.currentPiece, (x, y) => {
               this.drawBlock(this.ctx, x, y, this.currentPiece.type);
           });
      }

      // Draw grid lines (optional, can be toggled)
      this.drawGrid();
  }

  drawBlock(context, x, y, type) {
       if (!this.sprites[type]) {
            // Fallback color if sprite missing
            context.fillStyle = this.TETROMINOS[type]?.color || '#ffffff';
            context.fillRect(x * this.blockSize, y * this.blockSize, this.blockSize, this.blockSize);
            context.strokeStyle = 'rgba(0,0,0,0.5)';
            context.strokeRect(x * this.blockSize, y * this.blockSize, this.blockSize, this.blockSize);
       } else {
            context.drawImage(
                this.sprites[type],
                x * this.blockSize,
                y * this.blockSize,
                this.blockSize,
                this.blockSize
            );
       }
  }

  drawGrid() {
      this.ctx.strokeStyle = 'var(--grid-line-color, #2a2a2a)';
      this.ctx.lineWidth = 1;

      for (let i = 0; i <= this.NX; i++) {
          this.ctx.beginPath();
          this.ctx.moveTo(i * this.blockSize, 0);
          this.ctx.lineTo(i * this.blockSize, this.canvas.height);
          this.ctx.stroke();
      }
      for (let i = 0; i <= this.NY; i++) {
          this.ctx.beginPath();
          this.ctx.moveTo(0, i * this.blockSize);
          this.ctx.lineTo(this.canvas.width, i * this.blockSize);
          this.ctx.stroke();
      }
  }

  updateNextPieceDisplay() {
      if (!this.nextPiece || !this.assetsLoaded) return;

      const previewSize = this.blockSize * this.NU; // Use main block size for consistency
      this.upCanvas.width = previewSize;
      this.upCanvas.height = previewSize;

      this.uctx.clearRect(0, 0, this.upCanvas.width, this.upCanvas.height);

      const piece = this.nextPiece;
      const tetromino = this.TETROMINOS[piece.type];
      const blockSize = this.blockSize; // Use consistent block size
      const scale = blockSize; // Direct mapping

      // Center the piece in the preview box
      const pieceWidth = tetromino.size * scale;
      const pieceHeight = tetromino.size * scale; // Assume square for simplicity here
      const offsetX = (this.upCanvas.width - pieceWidth) / 2;
      // Adjust Y offset based on piece type for better centering
      let offsetY = (this.upCanvas.height - pieceHeight) / 2;
      if (piece.type === 'i') offsetY -= scale / 2; // Adjust I piece slightly higher
      if (piece.type === 'o') offsetY += scale / 2; // Adjust O piece slightly lower

      // Use a temporary piece object for drawing, centered
      const tempPiece = {
          ...piece,
          // Calculate drawing position relative to canvas (0,0)
          // Need to translate block coords (0-3) to canvas coords
          x: offsetX / scale,
          y: offsetY / scale
      };

      this.eachBlock(tempPiece, (x, y) => {
           // Adjust coordinates by the offset calculated
           this.drawBlock(this.uctx, x, y, piece.type);
      });
  }

  flashLine(y) {
      const flashElement = document.createElement('div');
      flashElement.className = 'line-clear-flash';
      flashElement.style.top = `${y * this.blockSize}px`;
      flashElement.style.height = `${this.blockSize}px`;
      // Set dynamic CSS variable for height if needed by animation
      flashElement.style.setProperty('--block-size-dynamic', `${this.blockSize}px`);

      this.canvas.parentNode.appendChild(flashElement); // Append relative to canvas

      // Remove the element after animation
      setTimeout(() => {
          flashElement.remove();
      }, 300); // Match animation duration
  }


  // --- UI Updates & Stats ---

  updateStats() {
      this.scoreEl.textContent = this.score;
      this.rowsEl.textContent = this.rows;
  }

  updateHighscoreDisplay() {
      this.highEl.textContent = `Highscore: ${this.highscore}`;
  }

  // --- State Transitions & Overlays ---

  togglePause() {
      if (this.state === this.STATE.PLAY) {
          this.state = this.STATE.PAUSE;
          this.stopLoop();
          this.showOverlay(this.pauseScreen);
          this.announce("Game paused");
          // this.sounds.bgm?.pause();
      } else if (this.state === this.STATE.PAUSE) {
          this.resumeGame();
      }
  }

  resumeGame() {
      if (this.state !== this.STATE.PAUSE) return;
      this.state = this.STATE.PLAY;
      this.hideOverlay(this.pauseScreen);
      this.lastTime = performance.now(); // Reset timer to avoid jump
      this.announce("Game resumed");
      // this.sounds.bgm?.play();
      this.loop();
  }

  gameOver() {
      this.state = this.STATE.OVER;
      this.stopLoop();
      this.playSound('gameover');
      this.finalScoreEl.textContent = this.score;

      if (this.score > this.highscore) {
          this.highscore = this.score;
          localStorage.setItem(this.STORAGE_KEY, this.highscore);
          this.updateHighscoreDisplay();
           this.announce(`Game Over. New Highscore: ${this.highscore}`);
      } else {
          this.announce(`Game Over. Final Score: ${this.score}`);
      }

      this.showOverlay(this.overScreen);
  }

  showMenu() {
      this.state = this.STATE.MENU;
      this.stopLoop();
      this.resetGame(); // Reset board when going to menu
      this.hideAllOverlays(true); // Hide others instantly
      this.showOverlay(this.menuScreen);
      this.announce("Main Menu");
  }

  showOverlay(overlayElement, animate = true) {
      overlayElement.classList.add('visible'); // Use class for visibility state
      if (animate) {
           gsap.to(overlayElement, { autoAlpha: 1, duration: 0.3, ease: "power1.out" });
      } else {
           gsap.set(overlayElement, { autoAlpha: 1 });
      }
      // Make sure overlay is focusable
      overlayElement.querySelector('button')?.focus();
  }

  hideOverlay(overlayElement, animate = true) {
       if (animate) {
          gsap.to(overlayElement, { autoAlpha: 0, duration: 0.3, ease: "power1.in", onComplete: () => overlayElement.classList.remove('visible') });
       } else {
          gsap.set(overlayElement, { autoAlpha: 0 });
          overlayElement.classList.remove('visible');
       }
  }

  hideAllOverlays(instant = false) {
      this.overlays.forEach(overlay => this.hideOverlay(overlay, !instant));
  }

  // --- Sound Control ---

  playSound(soundKey) {
      if (!this.isMuted && this.sounds[soundKey]) {
          this.sounds[soundKey].play();
      }
  }

  toggleMute() {
       this.isMuted = !this.isMuted;
       Howler.mute(this.isMuted);
       const muteIcon = this.btnMute.querySelector('.mute-icon');
       const unmuteIcon = this.btnMute.querySelector('.unmute-icon');
       if (this.isMuted) {
           muteIcon.style.display = 'none';
           unmuteIcon.style.display = 'inline';
           this.btnMute.setAttribute('aria-pressed', 'true');
           this.announce("Sound muted");
       } else {
           muteIcon.style.display = 'inline';
           unmuteIcon.style.display = 'none';
           this.btnMute.setAttribute('aria-pressed', 'false');
           this.announce("Sound unmuted");
       }
  }

  // --- Fullscreen ---

  toggleFullscreen() {
      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen()
              .catch(err => console.error(`Error attempting fullscreen: ${err.message} (${err.name})`));
          this.announce("Entered fullscreen");
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen();
               this.announce("Exited fullscreen");
          }
      }
  }

  // --- Accessibility ---
  announce(message) {
      this.srAnnouncer.textContent = message;
      // Clear after a delay so repeated messages are read
      setTimeout(() => { this.srAnnouncer.textContent = ''; }, 500);
  }


  // --- Event Binding ---

  bindEvents() {
      // Window events
      window.addEventListener('resize', this.onResizeDebounced);
      document.addEventListener('keydown', this.handleKeyDown.bind(this));

      // Button clicks
      this.btnStart.addEventListener('click', this.startGame.bind(this));
      this.btnResume.addEventListener('click', this.resumeGame.bind(this));
      this.btnRestartPause.addEventListener('click', () => this.startGame()); // Restart from pause menu
      this.btnPlayAgain.addEventListener('click', this.startGame.bind(this));
      this.btnMenu.addEventListener('click', this.showMenu.bind(this));
      this.btnMute.addEventListener('click', this.toggleMute.bind(this));
      this.btnFS.addEventListener('click', this.toggleFullscreen.bind(this));

      // Touch controls (using direct button clicks)
      this.touchControls.addEventListener('click', (e) => {
           // Use pointerdown for faster response on touch devices
           const button = e.target.closest('button');
           if (button && button.dataset.action) {
               this.queueAction(button.dataset.action);
               e.preventDefault(); // Prevent double actions (like zoom)
           }
      });

      // Prevent context menu on touch controls
       this.touchControls.addEventListener('contextmenu', e => e.preventDefault());
  }

  handleKeyDown(e) {
      // Allow default browser shortcuts unless we handle the key
      let handled = false;

      if (this.state === this.STATE.PLAY) {
          switch (e.key) {
              case this.KEY.LEFT: this.queueAction('left'); handled = true; break;
              case this.KEY.RIGHT: this.queueAction('right'); handled = true; break;
              case this.KEY.DOWN: this.queueAction('down'); handled = true; break;
              case this.KEY.UP: this.queueAction('rotate'); handled = true; break;
              case this.KEY.SPACE: this.queueAction('drop'); handled = true; break;
              case this.KEY.ESC: this.togglePause(); handled = true; break;
          }
      } else if (this.state === this.STATE.PAUSE) {
           if (e.key === this.KEY.ESC) {
               this.resumeGame();
               handled = true;
           }
      } else if (this.state === this.STATE.MENU) {
          // Allow starting with Enter/Space if Start button focused?
          // The button handler already covers Enter/Space when focused.
      } else if (this.state === this.STATE.OVER) {
          // Allow restarting with Enter/Space if button focused?
      }

      // Prevent default browser action ONLY if we handled the key
      if (handled) {
          e.preventDefault();
      }
  }

  // --- Resize Handling ---

  onResize() {
       const container = document.getElementById('game-container');
       const containerWidth = container.clientWidth;
       const containerHeight = container.clientHeight - 50; // Approx space for header/padding

       // Determine available space based on layout (media queries control layout)
       const isMobileLayout = window.innerWidth <= 768;
       let availableWidth = containerWidth;
       let availableHeight = containerHeight;

       if (!isMobileLayout) {
           // Desktop layout: reserve space for sidebar
           availableWidth -= 170; // Approx sidebar width + gap
       } else if (window.matchMedia("(orientation: landscape)").matches) {
           // Mobile landscape: reserve space for vertical controls
           availableWidth -= 80; // Approx controls width + gap
       } else {
           // Mobile portrait: reserve space for bottom controls
            availableHeight -= 90; // Approx controls height + gap
       }


       // Calculate block size based on limiting dimension (width or height)
       const blockW = Math.floor(availableWidth / this.NX);
       const blockH = Math.floor(availableHeight / this.NY);
       this.blockSize = Math.max(1, Math.min(blockW, blockH)); // Ensure at least 1px

       // Set canvas dimensions
       this.canvas.width = this.blockSize * this.NX;
       this.canvas.height = this.blockSize * this.NY;

       // Update preview canvas based on new block size
       this.updateNextPieceDisplay();

       // Force redraw if game is running or paused
       if (this.state === this.STATE.PLAY || this.state === this.STATE.PAUSE) {
           this.draw();
       }
  }
}

// --- Global Initialization ---
// Use 'DOMContentLoaded' to ensure the DOM is ready before creating the game instance
document.addEventListener('DOMContentLoaded', () => {
  // Disable start button until assets are loaded (re-enabled in loadAssets callback)
  const startButton = document.getElementById('btn-start');
  if(startButton) startButton.disabled = true;

  window.tetrisGame = new Game(); // Make it global for easy debugging if needed
});