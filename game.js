const sprites = {};
const spriteSources = {
  i: "assets/i.png",
  j: "assets/j.png",
  l: "assets/l.png",
  o: "assets/o.png",
  s: "assets/s.png",
  t: "assets/t.png",
  z: "assets/z.png",
};

Object.keys(spriteSources).forEach((key) => {
  const image = new Image();
  image.src = spriteSources[key];
  sprites[key] = image;
});

const get = (id) => document.getElementById(id);
const hide = (id) => (get(id).style.visibility = "hidden");
const show = (id) => (get(id).style.visibility = null);
const html = (id, content) => (get(id).innerHTML = content);
const timestamp = () => new Date().getTime();
const random = (min, max) => min + Math.random() * (max - min);
const randomChoice = (choices) =>
  choices[Math.round(random(0, choices.length - 1))];

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame =
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    ((callback) => window.setTimeout(callback, 1000 / 60));
}

const KEY = { ESC: 27, SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 };
const DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3, MIN: 0, MAX: 3 };
const canvas = get("canvas");
const ctx = canvas.getContext("2d");
const ucanvas = get("upcoming");
const uctx = ucanvas.getContext("2d");
const speed = { start: 0.6, decrement: 0.01, min: 0.1 };
const nx = 10;
const ny = 20;
const nu = 5;

let dx,
  dy,
  blocks,
  actions,
  playing,
  dt,
  current,
  next,
  score,
  vscore,
  rows,
  step;

const tetrominos = {
  i: { name: "i", size: 4, blocks: [0x0f00, 0x2222, 0x00f0, 0x4444] },
  j: { name: "j", size: 3, blocks: [0x44c0, 0x8e00, 0x6440, 0x0e20] },
  l: { name: "l", size: 3, blocks: [0x4460, 0x0e80, 0xc440, 0x2e00] },
  o: { name: "o", size: 2, blocks: [0xcc00, 0xcc00, 0xcc00, 0xcc00] },
  s: { name: "s", size: 3, blocks: [0x06c0, 0x8c40, 0x6c00, 0x4620] },
  t: { name: "t", size: 3, blocks: [0x0e40, 0x4c40, 0x4e00, 0x4640] },
  z: { name: "z", size: 3, blocks: [0x0c60, 0x4c80, 0xc600, 0x2640] },
};

function eachblock(type, x, y, dir, fn) {
  const blocks = type.blocks[dir];
  let row = 0,
    col = 0;
  for (let bit = 0x8000; bit > 0; bit >>= 1) {
    if (blocks & bit) fn(x + col, y + row);
    if (++col === 4) {
      col = 0;
      ++row;
    }
  }
}

function occupied(type, x, y, dir) {
  let result = false;
  eachblock(type, x, y, dir, (x, y) => {
    if (x < 0 || x >= nx || y < 0 || y >= ny || getBlock(x, y)) result = true;
  });
  return result;
}

function unoccupied(type, x, y, dir) {
  return !occupied(type, x, y, dir);
}

let pieces = [];

function randomPiece() {
  if (pieces.length === 0) pieces = Object.values(tetrominos).slice(); // Copy array
  const type = pieces.splice(random(0, pieces.length - 1), 1)[0];
  return { type, dir: DIR.UP, x: Math.round(random(0, nx - type.size)), y: 0 };
}

function run() {
  addEvents();
  let last = (now = timestamp());

  function frame() {
    now = timestamp();
    update(Math.min(1, (now - last) / 1000.0));
    draw();
    last = now;
    requestAnimationFrame(frame, canvas);
  }

  resize();
  reset();
  frame();
}

function addEvents() {
  document.addEventListener("keydown", keydown, false);
  window.addEventListener("resize", resize, false);
}

function resize(event) {
  canvas.width = nx * 128; // Assuming each block in main game is 128x128
  canvas.height = ny * 128;
  ucanvas.width = nu * 128; // Adjust based on your needs
  ucanvas.height = nu * 128;

  dx = canvas.width / nx; // Calculate block size
  dy = canvas.height / ny;

  invalidate();
  invalidateNext();
}

function keydown(ev) {
  let handled = false;
  if (playing) {
    switch (ev.keyCode) {
      case KEY.LEFT:
        actions.push(DIR.LEFT);
        handled = true;
        break;
      case KEY.RIGHT:
        actions.push(DIR.RIGHT);
        handled = true;
        break;
      case KEY.UP:
        actions.push(DIR.UP);
        handled = true;
        break;
      case KEY.DOWN:
        actions.push(DIR.DOWN);
        handled = true;
        break;
      case KEY.ESC:
        lose();
        handled = true;
        break;
    }
  } else if (ev.keyCode == KEY.SPACE) {
    play();
    handled = true;
  }
  if (handled) ev.preventDefault();
}

function play() {
  hide("start");
  reset();
  playing = true;
}

function lose() {
  show("start");
  setVisualScore();
  playing = false;
}

function setVisualScore(n) {
  vscore = n || score;
  invalidateScore();
}

function setScore(n) {
  score = n;
  setVisualScore(n);
}

function addScore(n) {
  score += n;
}

function clearScore() {
  setScore(0);
}

function clearRows() {
  setRows(0);
}

function setRows(n) {
  rows = n;
  step = Math.max(speed.min, speed.start - speed.decrement * rows);
  invalidateRows();
}

function addRows(n) {
  setRows(rows + n);
}

function setBlock(x, y, type) {
  blocks[x] = blocks[x] || [];
  blocks[x][y] = type.name;
  invalidate();
}

function getBlock(x, y) {
  return blocks?.[x]?.[y] ?? null;
}

function clearBlocks() {
  blocks = [];
  invalidate();
}

function clearActions() {
  actions = [];
}

function setCurrentPiece(piece) {
  current = piece || randomPiece();
  invalidate();
}

function setNextPiece(piece) {
  next = piece || randomPiece();
  invalidateNext();
}

function reset() {
  dt = 0;
  clearActions();
  clearBlocks();
  clearRows();
  clearScore();
  setCurrentPiece(next);
  setNextPiece();
}

function update(idt) {
  if (playing) {
    if (vscore < score) setVisualScore(vscore + 1);
    handle(actions.shift());
    dt += idt;
    if (dt > step) {
      dt -= step;
      drop();
    }
  }
}

function handle(action) {
  switch (action) {
    case DIR.LEFT:
      move(DIR.LEFT);
      break;
    case DIR.RIGHT:
      move(DIR.RIGHT);
      break;
    case DIR.UP:
      rotate();
      break;
    case DIR.DOWN:
      drop();
      break;
  }
}

function move(dir) {
  let x = current.x,
    y = current.y;
  switch (dir) {
    case DIR.RIGHT:
      x++;
      break;
    case DIR.LEFT:
      x--;
      break;
    case DIR.DOWN:
      y++;
      break;
  }
  if (unoccupied(current.type, x, y, current.dir)) {
    current.x = x;
    current.y = y;
    invalidate();
    return true;
  } else {
    return false;
  }
}

function rotate() {
  const newdir = current.dir === DIR.MAX ? DIR.MIN : current.dir + 1;
  if (unoccupied(current.type, current.x, current.y, newdir)) {
    current.dir = newdir;
    invalidate();
  }
}

function drop() {
  if (!move(DIR.DOWN)) {
    dropPiece();
    removeLines();
    setCurrentPiece(next);
    setNextPiece(randomPiece());
    clearActions();
    if (occupied(current.type, current.x, current.y, current.dir)) {
      lose();
    }
  }
}

function dropPiece() {
  eachblock(current.type, current.x, current.y, current.dir, (x, y) =>
    setBlock(x, y, current.type)
  );
  removeLines();
}

function removeLines() {
  let n = 0;
  for (let y = ny; y > 0; y--) {
    let complete = true;
    for (let x = 0; x < nx; x++) {
      if (!getBlock(x, y)) {
        complete = false;
        break;
      }
    }
    if (complete) {
      removeLine(y);
      y++;
      n++;
    }
  }
  if (n > 0) {
    addRows(n);
    addScore(100 * Math.pow(2, n - 1));
  }
}

function removeLine(n) {
  for (let y = n; y > 0; y--) {
    for (let x = 0; x < nx; x++) {
      blocks[x][y] = blocks[x][y - 1];
    }
  }
  for (let x = 0; x < nx; x++) {
    blocks[x][0] = null;
  }
  invalidate();
}

const invalid = {};

function invalidate() {
  invalid.court = true;
}

function invalidateNext() {
  invalid.next = true;
}

function invalidateScore() {
  invalid.score = true;
}

function invalidateRows() {
  invalid.rows = true;
}

function draw() {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.translate(0.5, 0.5);
  if (invalid.court) drawCourt();
  if (invalid.next) drawNext();
  if (invalid.score) drawScore();
  if (invalid.rows) drawRows();
  ctx.restore();
  requestAnimationFrame(draw);
}

function drawCourt() {
  if (invalid.court) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (playing)
      drawPiece(ctx, current.type, current.x, current.y, current.dir);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const blockType = getBlock(x, y);
        if (blockType) drawBlock(ctx, x, y, tetrominos[blockType]);
      }
    }
    ctx.strokeRect(0, 0, nx * dx - 1, ny * dy - 1);
    invalid.court = false;
  }
}

function drawNext() {
  if (invalid.next) {
    uctx.clearRect(0, 0, ucanvas.width, ucanvas.height);
    const padding = ((nu - next.type.size) * dx) / 2;
    drawPiece(uctx, next.type, padding / dx, padding / dy, next.dir);
    invalid.next = false;
  }
}

function drawScore() {
  if (invalid.score) {
    html("score", ("00000" + Math.floor(vscore)).slice(-5));
    invalid.score = false;
  }
}

function drawRows() {
  if (invalid.rows) {
    html("rows", rows);
    invalid.rows = false;
  }
}

function drawPiece(ctx, type, x, y, dir) {
  eachblock(type, x, y, dir, (x, y) =>
    ctx.drawImage(sprites[type.name], x * dx, y * dy, dx, dy)
  );
}

function drawBlock(ctx, x, y, type) {
  const sprite = sprites[type.name];
  if (sprite) ctx.drawImage(sprite, x * dx, y * dy, dx, dy);
}

run();
