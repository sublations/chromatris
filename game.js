(() => {
  'use strict';

  // DOM
  const canvas       = document.getElementById('game-canvas');
  const ctx          = canvas.getContext('2d');
  const upCanvas     = document.getElementById('upcoming-canvas');
  const uctx         = upCanvas.getContext('2d');
  const scoreEl      = document.getElementById('score');
  const rowsEl       = document.getElementById('rows');
  const highEl       = document.getElementById('highscore');
  const finalScoreEl = document.getElementById('final-score');

  // overlays
  const menuScreen   = document.getElementById('menu-screen');
  const pauseScreen  = document.getElementById('pause-screen');
  const overScreen   = document.getElementById('gameover-screen');
  const overlays     = [menuScreen, pauseScreen, overScreen];

  const btnStart     = document.getElementById('btn-start');
  const btnResume    = document.getElementById('btn-resume');
  const btnRestart   = document.getElementById('btn-restart');
  const btnPlayAgain = document.getElementById('btn-play-again');
  const btnMenu      = document.getElementById('btn-menu');
  const btnMute      = document.getElementById('btn-mute');
  const btnFS        = document.getElementById('btn-fullscreen');
  const touchZone    = document.getElementById('touch-controls');

  // Constants
  const NX = 10, NY = 20, NU = 5;
  const SPEED_START = 0.6, SPEED_DEC = 0.01, SPEED_MIN = 0.1;
  const KEY = { ESC:27, SPACE:32, LEFT:37, UP:38, RIGHT:39, DOWN:40 };
  const STORAGE_KEY = 'chromatris-highscore';

  // Sprites
  const SPRITES = {};
  ['i','j','l','o','s','t','z'].forEach(k => {
    const img = new Image();
    img.src = `assets/${k}.png`;
    SPRITES[k] = img;
  });

  // Audio
  const sounds = {
    move:    new Howl({ src:['assets/move.wav'] }),
    rotate:  new Howl({ src:['assets/rotate.wav'] }),
    drop:    new Howl({ src:['assets/drop.wav'] }),
    clear:   new Howl({ src:['assets/clear.wav'] }),
    gameover:new Howl({ src:['assets/gameover.wav'] }),
    music:   new Howl({ src:['assets/background.mp3'], loop:true, volume:0.5 })
  };

  // Tetrominos
  const TETROMINOS = {
    i:{ size:4, blocks:[0x0f00,0x2222,0x00f0,0x4444] },
    j:{ size:3, blocks:[0x44c0,0x8e00,0x6440,0x0e20] },
    l:{ size:3, blocks:[0x4460,0x0e80,0xc440,0x2e00] },
    o:{ size:2, blocks:[0xcc00,0xcc00,0xcc00,0xcc00] },
    s:{ size:3, blocks:[0x06c0,0x8c40,0x6c00,0x4620] },
    t:{ size:3, blocks:[0x0e40,0x4c40,0x4e00,0x4640] },
    z:{ size:3, blocks:[0x0c60,0x4c80,0xc600,0x2640] }
  };

  // State
  let blocks, current, next, score, rows, step, dt, state, actions;
  const STATE = { MENU:0, PLAY:1, PAUSE:2, OVER:3 };

  // Highscore
  let highscore = parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
  highEl.textContent = `Highscore: ${highscore}`;

  // Debounce
  const debounce = (fn, ms=100) => { let t; return (...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}};

  function resetGame(){
    blocks = Array.from({length:NX},()=>Array(NY).fill(null));
    score = 0; rows = 0; step = SPEED_START; dt = 0;
    updateStats();
    current = nextPiece(); next = nextPiece();
    actions = [];
    sounds.music.play();
  }

  function updateStats(){
    scoreEl.textContent = score;
    rowsEl.textContent = rows;
  }

  function nextPiece(){
    if(!nextPiece.pool||!nextPiece.pool.length){
      nextPiece.pool = Object.keys(TETROMINOS).slice();
    }
    const i = Math.floor(Math.random()*nextPiece.pool.length);
    const t = nextPiece.pool.splice(i,1)[0];
    return { type:t, dir:0, x:Math.floor((NX-TETROMINOS[t].size)/2), y:0 };
  }

  // Main loop
  let lastTime=0;
  function loop(ts=performance.now()){
    const delta=(ts-lastTime)/1000; lastTime=ts;
    if(state===STATE.PLAY){
      dt+=delta;
      handleActions();
      if(dt>step){ dt-=step; drop(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function handleActions(){
    const a=actions.shift(); if(!a) return;
    switch(a){
      case 'left':   move(-1,0); sounds.move.play();  break;
      case 'right':  move(1,0);  sounds.move.play();  break;
      case 'down':   drop();      sounds.drop.play();  break;
      case 'rotate': rotate();    sounds.rotate.play();break;
    }
  }

  function eachBlock(t,x,y,d,fn){
    let bit=0x8000,r=0,c=0,mask=TETROMINOS[t].blocks[d];
    for(;bit;bit>>=1){
      if(mask&bit) fn(x+c,y+r);
      if(++c===4){ c=0; r++; }
    }
  }

  function occupied(x,y){
    return x<0||x>=NX||y<0||y>=NY||blocks[x][y];
  }

  function canPlace(p){
    let ok=true;
    eachBlock(p.type,p.x,p.y,p.dir,(x,y)=>{ if(occupied(x,y)) ok=false });
    return ok;
  }

  function move(dx,dy){
    const p={...current,x:current.x+dx,y:current.y+dy};
    if(canPlace(p)) current=p;
  }

  function rotate(){
    const nd=(current.dir+1)%4;
    if(canPlace({...current,dir:nd})) current.dir=nd;
  }

  function drop(){
    if(!canPlace({...current,y:current.y+1})){
      eachBlock(current.type,current.x,current.y,current.dir,(x,y)=>blocks[x][y]=current.type);
      clearLines();
      current=next; next=nextPiece();
      if(!canPlace(current)) return gameOver();
    } else current.y++;
  }

  function clearLines(){
    let c=0;
    for(let y=NY-1;y>=0;y--){
      if(blocks.every(col=>col[y])){
        c++;
        for(let yy=y;yy>0;yy--) blocks.forEach(col=>col[yy]=col[yy-1]);
        blocks.forEach(col=>col[0]=null);
        y++;
      }
    }
    if(c){
      sounds.clear.play();
      rows+=c;
      score+=100*(2**(c-1));
      step=Math.max(SPEED_MIN,SPEED_START-SPEED_DEC*rows);
      updateStats();
    }
  }

  // Draw
  let dx, dy;
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let x=0;x<NX;x++) for(let y=0;y<NY;y++){
      const t=blocks[x][y];
      if(t) ctx.drawImage(SPRITES[t],x*dx,y*dy,dx,dy);
    }
    eachBlock(current.type,current.x,current.y,current.dir,(x,y)=>{
      ctx.drawImage(SPRITES[current.type],x*dx,y*dy,dx,dy);
    });
    ctx.strokeStyle='#222';
    for(let i=0;i<=NX;i++){
      ctx.beginPath(); ctx.moveTo(i*dx,0); ctx.lineTo(i*dx,canvas.height); ctx.stroke();
    }
    for(let i=0;i<=NY;i++){
      ctx.beginPath(); ctx.moveTo(0,i*dy); ctx.lineTo(canvas.width,i*dy); ctx.stroke();
    }

    uctx.clearRect(0,0,upCanvas.width,upCanvas.height);
    const p=next, pad=((NU-TETROMINOS[p.type].size)*dx)/2;
    eachBlock(p.type,pad/dx,pad/dy,p.dir,(x,y)=>{
      uctx.drawImage(SPRITES[p.type],x*dx,y*dy,dx,dy);
    });
  }

  // Resize
  const onResize=debounce(()=>{
    const avail=window.innerWidth<800?window.innerWidth*0.8:window.innerWidth*0.6;
    const size=Math.floor(avail/NX);
    canvas.width=size*NX; canvas.height=size*NY;
    upCanvas.width=size*NU; upCanvas.height=size*NU;
    dx=dy=size;
  },100);
  window.addEventListener('resize',onResize);

  // Keyboard
  document.addEventListener('keydown',e=>{
    if(state===STATE.PLAY){
      switch(e.keyCode){
        case KEY.LEFT:  actions.push('left');   break;
        case KEY.RIGHT: actions.push('right');  break;
        case KEY.DOWN:  actions.push('down');   break;
        case KEY.UP:    actions.push('rotate'); break;
        case KEY.ESC:   togglePause();          break;
      }
      e.preventDefault();
    } else if(state===STATE.MENU && e.keyCode===KEY.SPACE){
      startGame();
    }
  });

  // Touch (Hammer.js)
  const hammer=new Hammer(touchZone);
  hammer.get('swipe').set({ direction: Hammer.DIRECTION_HORIZONTAL });
  hammer.on('swipeleft',()=>actions.push('left'));
  hammer.on('swiperight',()=>actions.push('right'));
  hammer.on('swipedown',()=>actions.push('down'));
  hammer.on('tap',()=>actions.push('rotate'));

  touchZone.addEventListener('pointerdown',e=>{
    const act=e.target.dataset.action;
    if(act) actions.push(act);
  });

  // UI buttons
  btnStart.onclick     = startGame;
  btnResume.onclick    = resumeGame;
  btnRestart.onclick   = () => startGame();
  btnPlayAgain.onclick = startGame;
  btnMenu.onclick      = showMenu;
  btnMute.onclick      = () => {
    Howler.mute(!Howler._muted);
    btnMute.textContent = Howler._muted ? '🔇' : '🔊';
  };
  btnFS.onclick        = () => {
    if (!document.fullscreenElement) canvas.requestFullscreen();
    else document.exitFullscreen();
  };

  function startGame(){
    resetGame();
    state = STATE.PLAY;
    gsap.to(overlays, { autoAlpha: 0, duration: 0.3, onComplete: hideOverlays });
  }

  function resumeGame(){
    state = STATE.PLAY;
    gsap.to(pauseScreen, { autoAlpha: 0, duration: 0.3 });
  }

  function gameOver(){
    state = STATE.OVER;
    sounds.music.stop();
    sounds.gameover.play();
    finalScoreEl.textContent = score;
    if(score > highscore){
      highscore = score;
      localStorage.setItem(STORAGE_KEY, highscore);
      highEl.textContent = `Highscore: ${highscore}`;
    }
    gsap.to(overScreen, { autoAlpha: 1, duration: 0.3 });
  }

  function togglePause(){
    if(state === STATE.PLAY){
      state = STATE.PAUSE;
      gsap.to(pauseScreen, { autoAlpha: 1, duration: 0.3 });
    } else if(state === STATE.PAUSE){
      resumeGame();
    }
  }

  function showMenu(){
    state = STATE.MENU;
    gsap.to(overlays, { autoAlpha: 0, duration: 0.3, onComplete: hideOverlays });
    gsap.to(menuScreen, { autoAlpha: 1, duration: 0.3 });
  }

  function hideOverlays(){
    overlays.forEach(o => o.classList.add('hidden'));
  }

  // Init
  onResize();
  showMenu();
  requestAnimationFrame(loop);
})();
