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

      // DOM elements
      this.cacheDomElements();

      // Game state variables
      this.blocks = null; // Game board grid
      this.currentPiece = null;
      this.nextPiece = null;
      this.pieceBag = []; // For 7-bag randomizer
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
      this.blockSize = 30; // Default size, updated on resize

      // Assets
      this.sprites = {};
      this.sounds = {};
      this.assetsLoaded = false;
      this.assetLoadPromise = null; // Store the promise

      // High Score
      this.highscore = 0; // Loaded after DOM ready

      // Debounce utility for resize
      this.debounce = (fn, ms = 100) => {
          let t;
          return (...args) => {
              clearTimeout(t);
              t = setTimeout(() => fn.apply(this, args), ms);
          };
      };
      this.onResizeDebounced = this.debounce(this.onResize, 150);

      // Initialize after DOM is potentially ready
      this.init();
  }

  cacheDomElements() {
       this.canvas = document.getElementById('game-canvas');
       this.ctx = this.canvas.getContext('2d');
       this.upCanvas = document.getElementById('upcoming-canvas');
       this.uctx = this.upCanvas.getContext('2d');
       this.scoreEl = document.getElementById('score');
       this.rowsEl = document.getElementById('rows');
       this.highEl = document.getElementById('highscore');
       this.finalScoreEl = document.getElementById('final-score');
       this.srAnnouncer = document.getElementById('sr-announcer');
       this.loadingIndicator = document.getElementById('loading-indicator');

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

      this.assetLoadPromise = this.loadAssets(); // Start loading assets
      this.bindEvents();
      this.initBoard(); // Initialize board structure
      this.showOverlay(this.menuScreen, false); // Show menu immediately
      this.onResize(); // Initial sizing
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

      // Simplified sound loading assumption (Howler handles internal loading state)
      try {
           this.sounds = {
               move:     new Howl({ src: ['assets/move.wav'], volume: 0.8 }),
               rotate:   new Howl({ src: ['assets/rotate.wav'], volume: 0.8 }),
               drop:     new Howl({ src: ['assets/drop.wav'], volume: 0.8 }),
               hardDrop: new Howl({ src: ['assets/drop.wav'], volume: 1.0 }), // Reusing drop sound
               clear:    new Howl({ src: ['assets/clear.wav'], volume: 1.0 }),
               gameover: new Howl({ src: ['assets/gameover.wav'], volume: 1.0 }),
           };
      } catch (e) {
          console.error("Failed to initialize Howler sounds:", e);
           // Optionally, disable sound features if Howler fails
      }


      return Promise.all(spritePromises)
          .then(() => {
              this.assetsLoaded = true;
              console.log("Assets loaded successfully.");
              if (this.btnStart) this.btnStart.disabled = false;
              if (this.loadingIndicator) this.loadingIndicator.style.display = 'none'; // Hide loading text
              this.draw(); // Draw initial board state (like grid) if needed
          })
          .catch(error => {
              console.error("Error loading assets:", error);
               if (this.loadingIndicator) {
                  this.loadingIndicator.textContent = 'Error loading assets. Please refresh.';
                  this.loadingIndicator.style.color = 'red';
               }
              // Don't enable start button if assets failed
               if (this.btnStart) this.btnStart.disabled = true;
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
  }

  // --- Game Loop ---
  async startGame() {
      // Ensure assets are loaded before starting
      if (!this.assetsLoaded) {
          console.log("Waiting for assets to load...");
          try {
               await this.assetLoadPromise; // Wait for the loading promise to resolve
               console.log("Assets finished loading, starting game.");
          } catch (error) {
               console.error("Cannot start game due to asset load failure.");
               alert("Failed to load game assets. Please refresh the page.");
               return; // Don't start if assets failed
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

      const deltaTime = (timestamp - this.lastTime) / 1000; // Delta time in seconds
      this.lastTime = timestamp;
      this.dt += deltaTime;

      this.handleActions();

      // Game logic update based on step time
      if (this.dt >= this.step) {
          this.dt -= this.step; // Use remainder for next frame if needed
          this.dropPiece(); // Natural drop
      }

      this.draw(); // Redraw canvas
      // Request next frame
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
      // Process all queued actions within a frame to feel responsive
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
                  this.dropPiece(true); // Soft drop initiated by user
                  this.playSound('drop');
                  this.dt = 0; // Reset auto-drop timer after manual down
                  break;
              case 'rotate':
                  rotated = this.rotate();
                  if (rotated) this.playSound('rotate');
                  break;
              case 'drop':
                  this.hardDrop(); // Hard drop action
                  // Hard drop handles its own sound and state update
                  break;
          }
           // Recalculate ghost after any move/rotate that changes position/orientation
           if (moved || rotated) {
              this.calculateGhostPiece();
           }
      }
  }


  // --- Piece Movement & Logic ---
  eachBlock(piece, callback) {
      if (!piece || !piece.type || !this.TETROMINOS[piece.type]) return;
      const tetromino = this.TETROMINOS[piece.type];
      let bit = 0x8000; // Start with the top-left bit of a 4x4 grid
      let row = 0;
      let col = 0;
      const blocks = tetromino.blocks[piece.dir];

      for (let i = 0; i < 16; i++) { // Iterate through all 16 bits
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
      return x < 0 || x >= this.NX || y >= this.NY || (y >= 0 && this.blocks[x] && this.blocks[x][y]);
  }


  canPlace(piece) {
      let can = true;
      this.eachBlock(piece, (x, y) => {
          // Important: Check if piece is outside top boundary (y < 0) ONLY if it's occupied there (relevant for rotation checks at spawn)
           // But mostly, we care about collision with existing blocks or boundaries below y=0.
          if (this.isOccupied(x, y)) {
              can = false;
          }
      });
      return can;
  }

  move(dx, dy) {
      if (!this.currentPiece) return false;
      const nextPos = { ...this.currentPiece, x: this.currentPiece.x + dx, y: this.currentPiece.y + dy };
      if (this.canPlace(nextPos)) {
          this.currentPiece = nextPos;
          // Ghost piece needs recalculation after successful move
          // this.calculateGhostPiece(); // Moved calculation to handleActions for efficiency
          return true;
      }
      return false;
  }

  rotate() {
      if (!this.currentPiece) return false;
      const nextDir = (this.currentPiece.dir + 1) % 4;
      const testPiece = { ...this.currentPiece, dir: nextDir };

      // Wall Kick Attempts (simplified - full SRS is more complex)
      const kicks = [
           [0, 0],   // Try 0,0 first
           [-1, 0],  // Try left 1
           [1, 0],   // Try right 1
           [0, -1],  // Try up 1 (less common, but possible)
           [-2, 0],  // Try left 2 (for I piece mainly)
           [2, 0]    // Try right 2 (for I piece mainly)
           // Full SRS has different tables based on piece and rotation state
      ];

      for (const [dx, dy] of kicks) {
           const kickedPiece = { ...testPiece, x: testPiece.x + dx, y: testPiece.y + dy };
           if (this.canPlace(kickedPiece)) {
                this.currentPiece = kickedPiece; // Apply rotation and kick
                // Ghost piece needs recalculation after successful rotation
                // this.calculateGhostPiece(); // Moved calculation to handleActions
                return true; // Rotation successful
           }
      }

      return false; // Rotation failed after all kick attempts
  }

  dropPiece(isSoftDrop = false) {
      if (!this.currentPiece) return;
      const nextPos = { ...this.currentPiece, y: this.currentPiece.y + 1 };
      if (this.canPlace(nextPos)) {
          this.currentPiece.y++;
          // If it was a user-initiated soft drop, maybe add minimal score? (optional)
          // if (isSoftDrop) this.score += 1;
      } else {
          // Piece cannot move down further, lock it in place
          this.lockPiece();
      }
  }

  hardDrop() {
      if (!this.currentPiece) return;
      let distance = 0;
      // Calculate how far down it can go
      while (this.canPlace({ ...this.currentPiece, y: this.currentPiece.y + 1 })) {
          this.currentPiece.y++;
          distance++;
      }
      // Optional: Score points for hard drop distance
      // this.score += distance * 2;

      this.playSound('hardDrop');
      this.lockPiece(); // Lock the piece in its final position
      // Reset drop timer to force next piece immediately
      this.dt = this.step;
  }

  lockPiece() {
      if (!this.currentPiece) return;
      let gameOverCondition = false;
      this.eachBlock(this.currentPiece, (x, y) => {
          if (y < 0) {
               // Piece locked entirely or partially above the visible board - GAME OVER
               gameOverCondition = true;
          } else if (y < this.NY && x >= 0 && x < this.NX) {
              this.blocks[x][y] = this.currentPiece.type;
          }
      });

      if (gameOverCondition) {
           this.gameOver();
           return; // Stop further processing if game is over
      }

      const linesCleared = this.clearLines(); // Clear lines and get count

      // Get next piece
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.randomPiece();
      this.updateNextPieceDisplay(); // Update preview

      // Check if the new piece spawns in an occupied space -> GAME OVER
      if (!this.canPlace(this.currentPiece)) {
           // Draw the newly spawned piece partially for visual feedback before game over screen
           this.draw();
           this.gameOver();
      } else {
          // Calculate ghost for the new piece only if game continues
          this.calculateGhostPiece();
          // Play lock sound only if game isn't over and no lines were cleared
           if (linesCleared === 0 && this.state !== this.STATE.OVER) {
              this.playSound('drop'); // Use drop sound for normal lock
           }
      }
  }


  clearLines() {
      let linesToClearIndices = [];
      for (let y = this.NY - 1; y >= 0; y--) {
          let isLineFull = true;
          for (let x = 0; x < this.NX; x++) {
              if (!this.blocks[x] || !this.blocks[x][y]) { // Check column exists and block exists
                  isLineFull = false;
                  break;
              }
          }
          if (isLineFull) {
              linesToClearIndices.push(y);
          }
      }

      const clearedCount = linesToClearIndices.length;

      if (clearedCount > 0) {
           this.playSound('clear');

           // Flash effect for each cleared line
           linesToClearIndices.forEach(y => this.flashLine(y));

           // Shift blocks down - Iterate from bottom up
           let rowsToDrop = 0;
           for (let y = this.NY - 1; y >= 0; y--) {
                if (linesToClearIndices.includes(y)) {
                     rowsToDrop++; // Count how many rows need to drop at this point
                } else if (rowsToDrop > 0) {
                     // Shift this non-cleared row down by 'rowsToDrop'
                     for (let x = 0; x < this.NX; x++) {
                          if (this.blocks[x]) { // Check if column exists
                              this.blocks[x][y + rowsToDrop] = this.blocks[x][y];
                              this.blocks[x][y] = null; // Clear original position
                          }
                     }
                }
           }


          // Update score, rows, speed
          this.rows += clearedCount;
          const points = [0, 100, 300, 500, 800]; // Standard Tetris scoring
          this.score += points[Math.min(clearedCount, 4)] * (this.rows / 10 + 1); // Add level bonus? Simplified here
          this.score = Math.floor(this.score); // Ensure integer score


          this.step = Math.max(this.SPEED_MIN, this.SPEED_START - this.SPEED_DEC * this.rows);
          this.updateStats();
          this.announce(`${clearedCount} line${clearedCount > 1 ? 's' : ''} cleared! Score ${this.score}. Rows ${this.rows}.`);
      }
      return clearedCount;
  }

  // --- Ghost Piece ---
  calculateGhostPiece() {
      if (!this.currentPiece || this.state !== this.STATE.PLAY) {
          this.ghostPieceY = -1; // Indicate no ghost piece
          return;
      };
      // Start ghost check from current piece position
      this.ghostPieceY = this.currentPiece.y;
      // Move ghost down until it hits something
      while (this.canPlace({ ...this.currentPiece, y: this.ghostPieceY + 1 })) {
          this.ghostPieceY++;
      }
  }

  // --- Random Piece Generation (7-Bag Randomizer) ---
  randomPiece() {
      if (this.pieceBag.length === 0) {
          // Refill the bag with all 7 tetromino types
          this.pieceBag = Object.keys(this.TETROMINOS).slice();
          // Shuffle the bag (Fisher-Yates shuffle)
          for (let i = this.pieceBag.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [this.pieceBag[i], this.pieceBag[j]] = [this.pieceBag[j], this.pieceBag[i]];
          }
           // console.log("Generated new bag:", this.pieceBag); // For debugging
      }
      // Pull the next piece from the shuffled bag
      const type = this.pieceBag.pop();
      return {
          type: type,
          dir: 0,
          x: Math.floor((this.NX - this.TETROMINOS[type].size) / 2),
          y: (type === 'i') ? -1 : 0 // Start I piece slightly higher potentially
          // Starting at y=0 is standard, -1 might feel better for I piece rotations
      };
  }

  // --- Drawing ---
  draw() {
      if (!this.blocks || !this.ctx) return; // Ensure context and blocks exist

      // Clear main canvas
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // Optional: Draw background if needed (or rely on CSS background)
      // this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      // this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw grid lines first (so blocks are on top)
      this.drawGrid();

      // Draw placed blocks
      for (let x = 0; x < this.NX; x++) {
          for (let y = 0; y < this.NY; y++) {
              if (this.blocks[x] && this.blocks[x][y]) {
                  this.drawBlock(this.ctx, x, y, this.blocks[x][y]);
              }
          }
      }

      // Draw ghost piece (only during play and if different from current position)
      if (this.state === this.STATE.PLAY && this.currentPiece && this.ghostPieceY >= 0 && this.ghostPieceY > this.currentPiece.y) {
           this.ctx.globalAlpha = this.GHOST_ALPHA;
           const ghostPiece = { ...this.currentPiece, y: this.ghostPieceY };
           this.eachBlock(ghostPiece, (x, y) => {
               this.drawBlock(this.ctx, x, y, ghostPiece.type);
           });
           this.ctx.globalAlpha = 1.0; // Reset alpha
      }

      // Draw current piece (only during play)
      if (this.state === this.STATE.PLAY && this.currentPiece) {
           this.eachBlock(this.currentPiece, (x, y) => {
                // Only draw blocks that are within the visible board area (y >= 0)
                if (y >= 0) {
                   this.drawBlock(this.ctx, x, y, this.currentPiece.type);
                }
           });
      }
  }


  drawBlock(context, x, y, type) {
       // Avoid drawing outside canvas bounds (especially relevant for preview)
       if (x * this.blockSize >= context.canvas.width || y * this.blockSize >= context.canvas.height || x < 0 || y < 0) {
           return;
       }

       const spriteKey = this.TETROMINOS[type]?.spriteKey;
       const sprite = this.sprites[spriteKey];

       if (sprite && this.assetsLoaded) { // Check if assets are loaded
           context.drawImage(
               sprite,
               x * this.blockSize,
               y * this.blockSize,
               this.blockSize,
               this.blockSize
           );
       } else {
           // Fallback drawing if sprites aren't loaded or missing
           context.fillStyle = this.TETROMINOS[type]?.color || '#888'; // Grey fallback
           context.fillRect(x * this.blockSize, y * this.blockSize, this.blockSize - 1, this.blockSize - 1); // Leave gap for grid
       }
  }

  drawGrid() {
      this.ctx.strokeStyle = 'var(--grid-line-color, #2a2a2a)';
      this.ctx.lineWidth = 1;

      for (let i = 0; i <= this.NX; i++) { // Vertical lines
          this.ctx.beginPath();
          this.ctx.moveTo(i * this.blockSize, 0);
          this.ctx.lineTo(i * this.blockSize, this.canvas.height);
          this.ctx.stroke();
      }
      for (let i = 0; i <= this.NY; i++) { // Horizontal lines
          this.ctx.beginPath();
          this.ctx.moveTo(0, i * this.blockSize);
          this.ctx.lineTo(this.canvas.width, i * this.blockSize);
          this.ctx.stroke();
      }
  }

  updateNextPieceDisplay() {
       if (!this.nextPiece || !this.uctx || !this.assetsLoaded) return; // Ensure context and assets ready

       const previewBlockSize = Math.floor(this.upCanvas.width / this.NU); // Calculate based on canvas size / desired block count
       this.upCanvas.height = previewBlockSize * this.NU; // Maintain square aspect ratio potentially

       this.uctx.clearRect(0, 0, this.upCanvas.width, this.upCanvas.height);

       const piece = this.nextPiece;
       const tetromino = this.TETROMINOS[piece.type];
       const scale = previewBlockSize; // Use the calculated preview block size

       // Center the piece
       const pieceActualWidth = tetromino.size; // Width in blocks
       const pieceActualHeight = tetromino.size; // Height in blocks (approximation)

       // Calculate offsets in terms of BLOCKS
       const offsetXBlocks = (this.NU - pieceActualWidth) / 2;
       let offsetYBlocks = (this.NU - pieceActualHeight) / 2;
        // Fine-tune vertical centering
       if (piece.type === 'i') offsetYBlocks -= 0.5; // Nudge I up slightly
       if (piece.type === 'o') offsetYBlocks += 0.5; // Nudge O down slightly


       // Temporarily store main blockSize, use preview size for drawing next piece
       const mainBlockSize = this.blockSize;
       this.blockSize = previewBlockSize;

       // Use a temporary piece object positioned correctly for the preview canvas
       const tempPiece = {
          ...piece,
          x: offsetXBlocks,
          y: offsetYBlocks
       };

       this.eachBlock(tempPiece, (x, y) => {
           this.drawBlock(this.uctx, x, y, piece.type);
       });

       // Restore main block size
       this.blockSize = mainBlockSize;
  }


  flashLine(y) {
      const flashElement = document.createElement('div');
      flashElement.className = 'line-clear-flash';
      // Position relative to the game area container
      flashElement.style.top = `${y * this.blockSize}px`;
      flashElement.style.left = `0px`; // Align with canvas left
      flashElement.style.width = `${this.canvas.width}px`; // Match canvas width
      flashElement.style.height = `${this.blockSize}px`;

      // Set dynamic CSS variable for height if needed by animation (already in CSS var)
      // flashElement.style.setProperty('--block-size-dynamic', `${this.blockSize}px`);

      // Append relative to the canvas's parent for correct positioning within game-area
      this.canvas.parentNode.appendChild(flashElement);

      // Remove the element after animation completes (match CSS duration)
      setTimeout(() => {
           if (flashElement.parentNode) { // Check if still attached before removing
              flashElement.remove();
           }
      }, 300);
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
      this.state = this.STATE.PLAY;
      this.hideOverlay(this.pauseScreen);
      this.lastTime = performance.now(); // Reset timer to avoid jump
      this.announce("Game resumed");
      if (!this.animationFrameId) { // Prevent multiple loops if resume is rapid
          this.loop();
      }
  }

  gameOver() {
      if (this.state === this.STATE.OVER) return; // Prevent multiple triggers
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
                console.warn("Could not save highscore to localStorage:", e);
                this.announce(`Game Over. Score: ${this.score}. Highscore could not be saved.`);
           }
      } else {
          this.announce(`Game Over. Final Score: ${this.score}`);
      }

      this.showOverlay(this.overScreen);
  }

  showMenu() {
      this.state = this.STATE.MENU;
      this.stopLoop();
      // Don't necessarily reset the board here, maybe only on startGame
      // this.resetGame();
      this.hideAllOverlays(true); // Hide others instantly
      this.showOverlay(this.menuScreen);
      this.announce("Main Menu");
  }

  showOverlay(overlayElement, animate = true) {
       if (!overlayElement) return;
       overlayElement.classList.add('visible');
       if (animate) {
           gsap.to(overlayElement, { autoAlpha: 1, duration: 0.3, ease: "power1.out", overwrite: true });
       } else {
           gsap.set(overlayElement, { autoAlpha: 1 });
       }
       // Focus the first interactive element in the overlay
       const focusable = overlayElement.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
       focusable?.focus();
  }

  hideOverlay(overlayElement, animate = true) {
       if (!overlayElement) return;
       const onComplete = () => overlayElement.classList.remove('visible');
       if (animate) {
           gsap.to(overlayElement, { autoAlpha: 0, duration: 0.2, ease: "power1.in", onComplete: onComplete, overwrite: true });
       } else {
           gsap.set(overlayElement, { autoAlpha: 0 });
           onComplete();
       }
  }

  hideAllOverlays(instant = false) {
      this.overlays.forEach(overlay => this.hideOverlay(overlay, !instant));
  }

  // --- Sound Control ---
  playSound(soundKey) {
      if (!this.isMuted && this.sounds[soundKey] && typeof this.sounds[soundKey].play === 'function') {
          // Check Howler state before playing - prevents errors if context is suspended
           if (Howler.state === 'running') {
               this.sounds[soundKey].play();
           } else {
               console.warn(`Sound ${soundKey} skipped: Howler state is ${Howler.state}`);
               // Attempt to resume context on next interaction? (Handled in startGame)
           }
      }
  }

  toggleMute() {
       this.isMuted = !this.isMuted;
       Howler.mute(this.isMuted); // Global mute for all Howl instances

       const muteIcon = this.btnMute?.querySelector('.mute-icon');
       const unmuteIcon = this.btnMute?.querySelector('.unmute-icon');

       if (!muteIcon || !unmuteIcon) return; // Guard if buttons not found

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
      if (!document.fullscreenEnabled) {
          console.warn("Fullscreen API is not enabled or supported.");
          this.announce("Fullscreen not supported");
          return;
      }

      if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen()
              .then(() => this.announce("Entered fullscreen"))
              .catch(err => {
                  console.error(`Error attempting fullscreen: ${err.message} (${err.name})`);
                  this.announce("Could not enter fullscreen");
              });
      } else {
          if (document.exitFullscreen) {
              document.exitFullscreen()
                  .then(() => this.announce("Exited fullscreen"))
                  .catch(err => console.error("Error exiting fullscreen:", err));
          }
      }
  }

  // --- Accessibility ---
  announce(message) {
       if (this.srAnnouncer) {
           this.srAnnouncer.textContent = message;
           // Clear after a short delay so screen readers pick up changes
           setTimeout(() => { if(this.srAnnouncer) this.srAnnouncer.textContent = ''; }, 750);
       }
  }

  // --- Event Binding ---
  bindEvents() {
      // Window events
      window.addEventListener('resize', this.onResizeDebounced);
      document.addEventListener('keydown', this.handleKeyDown.bind(this));

      // Ensure buttons exist before adding listeners
      this.btnStart?.addEventListener('click', () => this.startGame());
      this.btnResume?.addEventListener('click', () => this.resumeGame());
      this.btnRestartPause?.addEventListener('click', () => this.startGame());
      this.btnPlayAgain?.addEventListener('click', () => this.startGame());
      this.btnMenu?.addEventListener('click', () => this.showMenu());
      this.btnMute?.addEventListener('click', () => this.toggleMute());
      this.btnFS?.addEventListener('click', () => this.toggleFullscreen());

      // Touch controls (using pointerdown for better responsiveness)
      this.touchControls?.addEventListener('pointerdown', (e) => {
          const button = e.target.closest('button');
          if (button && button.dataset.action && this.state === this.STATE.PLAY) {
               this.queueAction(button.dataset.action);
               e.preventDefault(); // Prevent default touch actions like scrolling/zooming
          }
      });

      // Prevent context menu on touch controls (optional)
      this.touchControls?.addEventListener('contextmenu', e => e.preventDefault());

       // Handle visibility change to pause game
       document.addEventListener('visibilitychange', () => {
           if (document.hidden && this.state === this.STATE.PLAY) {
               this.togglePause();
               this.announce("Game paused due to window losing focus");
           }
       });
  }

  handleKeyDown(e) {
      // Ignore keydowns if focused on an input/textarea, unless it's ESC
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
           if (e.key === this.KEY.ESC && this.state === this.STATE.PLAY) {
               this.togglePause();
               e.preventDefault();
           }
          return;
      }

      let handled = false;

      if (this.state === this.STATE.PLAY) {
          switch (e.key) {
              case this.KEY.LEFT:   this.queueAction('left'); handled = true; break;
              case this.KEY.RIGHT:  this.queueAction('right'); handled = true; break;
              case this.KEY.DOWN:   this.queueAction('down'); handled = true; break;
              case this.KEY.UP:     this.queueAction('rotate'); handled = true; break;
              case this.KEY.SPACE:  this.queueAction('drop'); handled = true; break;
              case this.KEY.ESC:    this.togglePause(); handled = true; break;
               // Add other potential keys like 'p' for pause?
               case 'p': case 'P':  this.togglePause(); handled = true; break;
          }
      } else if (this.state === this.STATE.PAUSE) {
           if (e.key === this.KEY.ESC || e.key === 'p' || e.key === 'P') {
               this.resumeGame();
               handled = true;
           }
      }
      // No specific key actions needed for MENU or OVER states here,
      // as button focus handles Enter/Space.

      if (handled) {
          e.preventDefault(); // Prevent default browser action (scrolling, etc.)
      }
  }

  // --- Resize Handling ---
  onResize() {
       if (!this.canvas || !this.ctx) return; // Ensure canvas is ready

       const container = document.getElementById('game-container');
       if (!container) return;

       // Use visual viewport for more accurate dimensions on mobile with toolbars
       const vpWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
       const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

       // Estimate available height considering header
       const availableHeight = vpHeight - (this.header?.offsetHeight || 48) - 30; // Subtract header height + padding
       let availableWidth = vpWidth - 40; // Subtract some horizontal padding


       // Adjust available space based on layout (CSS media queries determine layout)
       const sidebarVisible = window.getComputedStyle(this.sidebar)?.display !== 'none';
       const touchControlsVisible = window.getComputedStyle(this.touchControls)?.display !== 'none';


       if (sidebarVisible) {
           availableWidth -= (this.sidebar?.offsetWidth || 150) + 32; // Sidebar width + gap
       }

       if (touchControlsVisible) {
            // Heuristic: Reduce available height more in portrait, width more in landscape
           if (vpWidth < vpHeight) { // Portrait-ish
                availableHeight -= (this.touchControls?.offsetHeight || 80) + 16; // Controls height + gap
           } else { // Landscape-ish
                availableWidth -= (this.touchControls?.offsetWidth || 65) + 16; // Controls width + gap
           }
       }

       // Calculate block size based on limiting dimension
       const blockW = Math.floor(availableWidth / this.NX);
       const blockH = Math.floor(availableHeight / this.NY);
       this.blockSize = Math.max(5, Math.min(blockW, blockH)); // Ensure minimum size, use smallest fit

       // Apply dimensions to canvas
       this.canvas.width = this.blockSize * this.NX;
       this.canvas.height = this.blockSize * this.NY;

       // Update preview canvas (needs recalculation based on main block size or fixed size)
       this.updateNextPieceDisplay();

       // Redraw immediately
       this.draw();
  }
}

// --- Global Initialization ---
// Defer game creation until DOM is fully loaded
function initializeGame() {
  // Check if already initialized to prevent duplicates if script runs multiple times
  if (!window.tetrisGame) {
      window.tetrisGame = new Game();
      console.log("Chromatris Initialized");
  }
}

if (document.readyState === 'loading') { // Loading hasn't finished yet
  document.addEventListener('DOMContentLoaded', initializeGame);
} else { // `DOMContentLoaded` has already fired
  initializeGame();
}