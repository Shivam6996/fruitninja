/* Fruit Ninja clone main script
   Place in fruit-ninja/script.js
   Make sure to add your assets in the same folder with names:
   fruit1.png, fruit2.png, fruit3.png, bomb.png, splatter.png
   slice.mp3, bomb.mp3, bg.mp3, throw.mp3
*/

(function(){
  // Configurable values (tweak to taste)
  const CONFIG = {
    baseTime: 60,                 // seconds game lasts
    spawnBase: 2.2,               // seconds between spawns at start (higher = much slower)
    spawnMin: 1.2,                // fastest spawn interval (also slower)
    spawnRampSpeed: 0.0002,       // how fast spawn interval decreases per ms (slower ramp)
    fruitSpeedBase: 22,           // base upward velocity magnitude (higher = falls faster)
    fruitSpeedRamp: 0.0012,       // speed increases per ms (fruits get even faster over time)
    bombBaseChance: 0.03,
    bombMaxChance: 0.18,
    bombRamp: 0.00005,
    trailMax: 12
  };

  // Difficulty presets
  const DIFF = {
    easy:   { spawnMult: 1.15, speedMult: 0.9, bombMult: 0.6 },
    medium: { spawnMult: 1.0,  speedMult: 1.0, bombMult: 1.0 },
    hard:   { spawnMult: 0.78, speedMult: 1.18, bombMult: 1.4 }
  };

  // DOM
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('scoreVal');
  const timerEl = document.getElementById('timerVal');
  const menu = document.getElementById('menu');
  const settingsPanel = document.getElementById('settings');
  const aboutPanel = document.getElementById('about');
  const playBtn = document.getElementById('playBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const soundBtn = document.getElementById('soundBtn');
  const soundState = document.getElementById('soundState');
  const quitBtn = document.getElementById('quitBtn');
  const diffBtns = document.querySelectorAll('.diff-btn');
  const muteToggle = document.getElementById('muteToggle');
  const backFromSettings = document.getElementById('backFromSettings');
  const aboutBtn = document.getElementById('aboutBtn');
  const backFromAbout = document.getElementById('backFromAbout');

  // Asset filenames (user should replace images & sounds in folder)
  const IMAGES = ['fruit1.png','fruit2.png','fruit3.png'];
  const BOMB_IMG = 'bomb.png';
  const SPLAT_IMG = 'splatter.png';
  const SFX = {
    slice: 'slice.mp3',
    bomb: 'bomb.mp3',
    throw: 'throw.mp3',
    bg: 'bg.mp3'
  };

  // Game state
  let W = 0, H = 0, DPR = Math.max(1, window.devicePixelRatio || 1);
  let running = false, lastFrame = 0;
  let spawnInterval = CONFIG.spawnBase;
  let score = 0;
  let fruits = [];
  let trail = [];
  let timeLeft = CONFIG.baseTime;
  let startTimestamp = 0;
  let muted = false;
  let difficulty = 'medium';
  let audio = {};
  let assets = { images: [], bomb: null, splat: null };
  let gameOverPanel;

  // Helpers
  function isTouchDevice(){ return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  // Resize canvas
  function resize(){
    DPR = Math.max(1, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resize);

  // Preload images & audio
  function preload(){
    // images
    assets.images = IMAGES.map(n => {
      const i=new Image(); i.src = n; return i;
    });
    assets.bomb = new Image(); assets.bomb.src = BOMB_IMG;
    assets.splat = new Image(); assets.splat.src = SPLAT_IMG;

    // audio
    audio.slice = new Audio(SFX.slice); audio.slice.preload='auto';
    audio.bomb = new Audio(SFX.bomb); audio.bomb.preload='auto';
    audio.throw = new Audio(SFX.throw); audio.throw.preload='auto';
    audio.bg = new Audio(SFX.bg); audio.bg.loop = true; audio.bg.preload='auto';
    // keep low volume
    audio.bg.volume = 0.45;
    audio.slice.volume = 0.9;
    audio.bomb.volume = 0.9;
  }

  // Game objects
  class Fruit {
    constructor(opts){
      this.isBomb = !!opts.isBomb;
      this.img = this.isBomb ? assets.bomb : assets.images[Math.floor(Math.random()*assets.images.length)];
      this.r = 28 + Math.random()*18;
      this.x = Math.random()*(W-160)+80;
      // Start just below the bottom edge
      this.y = H - 20;
      this.vx = 0;
      // Initial slow upward velocity
      this.vy = - (16 + Math.random()*6); // go up fast enough to reach top
      this.rot = Math.random()*Math.PI*2;
      this.vr = (Math.random()-0.5)*0.12;
      this.sliced = false;
      this.t = 0;
      this.spawned = performance.now();
      this.gravity = 0.45 + Math.random() * 0.09; // gravity for acceleration
      this.reachedApex = false;
    }
    update(dt, timeElapsed){
      // dt is in ms, convert to seconds for physics
      const dtSec = dt / 1000;
      // Apply gravity always
      this.vy += this.gravity;
      this.y += this.vy;
      this.x += this.vx;
      this.rot += this.vr;
      this.t += dt;

      // Detect apex (top) and mark as falling
      if (!this.reachedApex && this.vy > 0) {
        this.reachedApex = true;
      }
    }
    draw(ctx){
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.drawImage(this.img, -this.r, -this.r, this.r*2, this.r*2);
      ctx.restore();
    }
  }

  // Particles for splatter
  class Particle {
    constructor(x,y,color){
      this.x=x;this.y=y;
      this.vx=(Math.random()-0.5)*6;
      this.vy=(Math.random()-1.5)*6;
      this.life=600 + Math.random()*300;
      this.size=4+Math.random()*6;
      this.created=performance.now();
      this.color=color || '#fff';
    }
    update(dt){
      this.vy += 18*(dt/1000);
      this.x += this.vx;
      this.y += this.vy;
      this.life -= dt;
    }
    draw(ctx){
      ctx.globalCompositeOperation='lighter';
      ctx.beginPath();
      ctx.fillStyle = this.color;
      ctx.arc(this.x,this.y,this.size,0,Math.PI*2);
      ctx.fill();
      ctx.globalCompositeOperation='source-over';
    }
  }
  let particles = [];

  // trail management (slice path)
  let pointer = {x:0,y:0,down:false};

  function addTrail(x,y){
    trail.push({x,y, t: performance.now()});
    if(trail.length > CONFIG.trailMax) trail.shift();
  }

  // spawn logic
  function spawnFruit(now, timeElapsed){
    // decide bomb probability ramped by timeElapsed
    const bombChance = Math.min(CONFIG.bombMaxChance,
      CONFIG.bombBaseChance + CONFIG.bombRamp * timeElapsed) * DIFF[difficulty].bombMult;
    const isBomb = Math.random() < bombChance;
    const f = new Fruit({isBomb});
    // if bomb, make it slightly bigger and faster
    if(isBomb){
      f.r *= 1.06;
      f.vx *= 1.2;
      f.vy *= 1.2;
    }
    fruits.push(f);
    // small throw sound occasionally
    if(!muted){
      try{ audio.throw.currentTime = 0; audio.throw.play().catch(()=>{}); }catch(e){}
    }
  }

  // collision: check if latest trail segment intersects fruit
  function checkSlices(){
    if(trail.length < 2) return;
    for(let i = fruits.length-1; i>=0; i--){
      const f = fruits[i];
      if(f.sliced) continue;
      // check distance from fruit to any recent trail point
      for(let j = 1; j < trail.length; j++){
        const p1 = trail[j-1], p2 = trail[j];
        // treat as point vs point (simple) — check distance to p2
        const dx = f.x - p2.x, dy = f.y - p2.y;
        const dist = Math.hypot(dx,dy);
        if(dist < f.r + 10){
          // slice!
          f.sliced = true;
          // spawn particles
          const col = '#ff5f3d';
          for(let k=0;k<14;k++) particles.push(new Particle(f.x,f.y, col));
          if(f.isBomb){
            // bomb explosion: big particles + sound + end game immediate (or -score)
            for(let k=0;k<30;k++) particles.push(new Particle(f.x,f.y, '#ffeb3b'));
            if(!muted){
              try{ audio.bomb.currentTime=0; audio.bomb.play().catch(()=>{}); }catch(e){}
            }
            // END GAME IMMEDIATELY ON BOMB SLICE
            endGame();
            running = false;
            return; // stop checking further
          }else{
            // normal fruit: increment score
            score += 1;
            updateScore();
            if(!muted){
              try{ audio.slice.currentTime = 0; audio.slice.play().catch(()=>{}); }catch(e){}
            }
          }
          // remove fruit visually after a small delay
          setTimeout(()=> {
            // leave it to update loop to filter out
          }, 120);
          break;
        }
      }
    }
  }

  // update UI score
  function updateScore(){
    scoreEl.textContent = score;
  }

  // Game loop
  function tick(ts){
    if(!lastFrame) lastFrame = ts;
    const dt = Math.min(40, ts - lastFrame); // cap dt for stability
    lastFrame = ts;
    ctx.clearRect(0,0,W,H);

    // background gradient overlay (vibrant)
    const g = ctx.createLinearGradient(0,0, W, H);
    g.addColorStop(0, 'rgba(255,92,56,0.06)');
    g.addColorStop(0.5, 'rgba(255,217,61,0.04)');
    g.addColorStop(1, 'rgba(255,120,54,0.06)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);

    const now = performance.now();
    const timeElapsed = now - startTimestamp;

    // spawn logic: spawnInterval ramps down over time
    const diffMult = DIFF[difficulty].spawnMult;
    spawnInterval = Math.max(CONFIG.spawnMin,
      CONFIG.spawnBase * diffMult - CONFIG.spawnRampSpeed * timeElapsed);

    if(now - lastSpawn > spawnInterval*1000){
      spawnFruit(now, timeElapsed);
      lastSpawn = now;
    }

    // update fruits
    fruits.forEach(f => f.update(dt, timeElapsed));
    // draw fruits
    fruits.forEach(f => {
      if(!f.sliced) f.draw(ctx);
      else {
        // draw small fade-out
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - (performance.now() - f.spawned)/400);
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.drawImage(f.img, -f.r, -f.r, f.r*2, f.r*2);
        ctx.restore();
      }
    });

    // remove fruits offscreen or sliced long enough
    fruits = fruits.filter(f => (f.y < H + 250) && !((f.sliced) && (performance.now() - f.spawned > 180)));

    // particles
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => p.life > 0 && p.y < H + 200);
    particles.forEach(p => p.draw(ctx));

    // trail draw
    drawTrail(ctx);

    // slice detection
    if(pointer.down) checkSlices();

    // timer update
    if(running){
      const elapsed = Math.floor((performance.now() - startTimestamp)/1000);
      timeLeft = Math.max(0, CONFIG.baseTime - elapsed);
      timerEl.textContent = timeLeft;
      if(timeLeft <= 0){ endGame(); running=false; }
    }

    if(running) requestAnimationFrame(tick);
    else requestAnimationFrame(renderIdle); // still animate background/trail when in menu
  }

  // Idle render (menu visible)
  function renderIdle(ts){
    lastFrame = ts;
    ctx.clearRect(0,0,W,H);
    // subtle background
    const g = ctx.createLinearGradient(0,0, W, H);
    g.addColorStop(0, 'rgba(255,92,56,0.05)');
    g.addColorStop(0.6, 'rgba(255,217,61,0.03)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
    drawTrail(ctx);
    requestAnimationFrame(renderIdle);
  }

  // Draw trail function
  function drawTrail(ctx){
    // fade old points
    const now = performance.now();
    trail = trail.filter(t => now - t.t < 400);
    if(trail.length < 2) return;
    ctx.lineWidth = 6;
    // gradient stroke
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for(let i=0;i<2;i++){
      ctx.beginPath();
      for(let j=0;j<trail.length;j++){
        const p = trail[j];
        if(j===0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      if(i===0){ ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 12; ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  // Input handlers
  function onPointerDown(e){
    pointer.down = true;
    const {x,y} = getXY(e);
    addTrail(x,y);
    pointer.x=x; pointer.y=y;
  }
  function onPointerMove(e){
    const {x,y} = getXY(e);
    pointer.x=x; pointer.y=y;
    if(pointer.down) addTrail(x,y);
  }
  function onPointerUp(e){
    pointer.down = false;
    trail = []; // clear trail on lift
  }
  function getXY(e){
    if(e.touches && e.touches[0]){
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }else{
      return { x: e.clientX, y: e.clientY };
    }
  }

  // Start game
  async function startGame(){
    // hide panels
    menu.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    aboutPanel.classList.add('hidden');

    // request fullscreen for desktop only
    if(!isTouchDevice()){
      try{
        if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      }catch(e){}
    }

    // initialize
    running = true;
    lastFrame = 0;
    lastSpawn = 0;
    startTimestamp = performance.now();
    score = 0; updateScore();
    timeLeft = CONFIG.baseTime;
    fruits = []; particles = []; trail = [];
    spawnInterval = CONFIG.spawnBase * DIFF[difficulty].spawnMult;

    // play bg music if not muted
    if(!muted){
      try{ audio.bg.currentTime=0; audio.bg.play().catch(()=>{}); }catch(e){}
    }

    requestAnimationFrame(tick);
  }

  // Update createGameOverPanel to make the Game Over title and panel mobile-friendly and responsive
  function createGameOverPanel() {
    // Remove if already exists
    const oldPanel = document.getElementById('gameOverPanel');
    if (oldPanel) oldPanel.remove();

    gameOverPanel = document.createElement('div');
    gameOverPanel.id = 'gameOverPanel';
    gameOverPanel.className = 'panel';
    gameOverPanel.style.position = 'fixed';
    gameOverPanel.style.left = '50%';
    gameOverPanel.style.top = '50%';
    gameOverPanel.style.transform = 'translate(-50%, -50%)';
    gameOverPanel.style.background = 'none';
    gameOverPanel.style.borderRadius = '16px';
    gameOverPanel.style.boxShadow = 'none';
    gameOverPanel.style.padding = '0';
    gameOverPanel.style.display = 'flex';
    gameOverPanel.style.flexDirection = 'column';
    gameOverPanel.style.alignItems = 'center';
    gameOverPanel.style.zIndex = '1000';
    gameOverPanel.style.width = 'min(92vw, 340px)';
    gameOverPanel.style.minWidth = '0';
    gameOverPanel.style.maxWidth = '92vw';

    const title = document.createElement('h2');
    title.textContent = 'Game Over';
    title.style.fontFamily = "'Cinzel', serif";
    title.style.fontWeight = '700';
    title.style.fontSize = 'clamp(1.2rem, 6vw, 2.1rem)';
    title.style.color = '#ff5f3d';
    title.style.marginBottom = '10px';
    title.style.background = 'none';
    title.style.textAlign = 'center';
    title.style.wordBreak = 'break-word';

    const scoreText = document.createElement('div');
    scoreText.textContent = `Your Score: ${score}`;
    scoreText.style.fontFamily = "'Inter', sans-serif";
    scoreText.style.fontSize = 'clamp(1rem, 4vw, 1.15rem)';
    scoreText.style.color = '#fff';
    scoreText.style.marginBottom = '18px';
    scoreText.style.background = 'none';
    scoreText.style.textAlign = 'center';

    const playAgainBtn = document.createElement('button');
    playAgainBtn.textContent = 'Play Again';
    playAgainBtn.style.background = 'linear-gradient(90deg, #ff5f3d 0%, #ffd93d 100%)';
    playAgainBtn.style.color = '#222';
    playAgainBtn.style.fontFamily = "'Inter', sans-serif";
    playAgainBtn.style.fontWeight = '600';
    playAgainBtn.style.fontSize = 'clamp(1rem, 4vw, 1.1rem)';
    playAgainBtn.style.border = 'none';
    playAgainBtn.style.borderRadius = '12px';
    playAgainBtn.style.padding = '12px 36px';
    playAgainBtn.style.cursor = 'pointer';
    playAgainBtn.style.boxShadow = '0 2px 12px rgba(255,95,61,0.12)';
    playAgainBtn.style.transition = 'background 0.2s';
    playAgainBtn.style.marginBottom = '2px';
    playAgainBtn.style.maxWidth = '100%';
    playAgainBtn.style.wordBreak = 'break-word';

    playAgainBtn.addEventListener('mouseenter', () => {
      playAgainBtn.style.background = 'linear-gradient(90deg, #ffd93d 0%, #ff5f3d 100%)';
    });
    playAgainBtn.addEventListener('mouseleave', () => {
      playAgainBtn.style.background = 'linear-gradient(90deg, #ff5f3d 0%, #ffd93d 100%)';
    });

    playAgainBtn.addEventListener('click', async () => {
      gameOverPanel.remove();
      await startGame();
    });

    gameOverPanel.appendChild(title);
    gameOverPanel.appendChild(scoreText);
    gameOverPanel.appendChild(playAgainBtn);

    document.body.appendChild(gameOverPanel);
  }

  // Update endGame function:
  function endGame(){
    running = false;
    // stop music
    try{ audio.bg.pause(); }catch(e){}
    // show Game Over panel after short delay
    setTimeout(() => {
      createGameOverPanel();
    }, 400);
  }

  // UI actions
  playBtn.addEventListener('click', async ()=>{
    await startGame();
  });
  settingsBtn.addEventListener('click', ()=>{
    settingsPanel.classList.remove('hidden');
    menu.classList.add('hidden');
  });
  backFromSettings.addEventListener('click', ()=>{
    settingsPanel.classList.add('hidden');
    menu.classList.remove('hidden');
  });
  aboutBtn.addEventListener('click', ()=>{
    aboutPanel.classList.remove('hidden');
    menu.classList.add('hidden');
  });
  backFromAbout.addEventListener('click', ()=>{
    aboutPanel.classList.add('hidden');
    menu.classList.remove('hidden');
  });

  soundBtn.addEventListener('click', ()=> {
    muted = !muted;
    updateSoundUI();
    if(muted) try{ audio.bg.pause(); }catch(e){}
    else try{ audio.bg.play().catch(()=>{}); }catch(e){}
  });
  muteToggle.addEventListener('click', ()=> {
    muted = !muted;
    updateSoundUI();
    if(muted) try{ audio.bg.pause(); }catch(e){}
    else try{ audio.bg.play().catch(()=>{}); }catch(e){}
  });
  function updateSoundUI(){
    soundState.textContent = muted ? 'Off' : 'On';
    muteToggle.textContent = muted ? 'Unmute' : 'Mute';
  }

  // difficulty buttons
  diffBtns.forEach(b=>{
    b.addEventListener('click', ()=>{
      diffBtns.forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      difficulty = b.dataset.diff;
    });
  });

  // Quit button link
  quitBtn.addEventListener('click', ()=> {
    window.location.href = 'https://shivam6996.github.io/Gameslibrary/';
  });

  // Input attach
  if('ontouchstart' in window){
    window.addEventListener('touchstart', onPointerDown, {passive:true});
    window.addEventListener('touchmove', onPointerMove, {passive:true});
    window.addEventListener('touchend', onPointerUp);
  }else{
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  }

  // Keep trail updated periodically (trim)
  setInterval(()=>{
    const now = performance.now();
    trail = trail.filter(t => now - t.t < 450);
  }, 120);

  // helpers
  function updateScore(){ scoreEl.textContent = score; }

  // initial boot
  function boot(){
    resize();
    preload();
    updateSoundUI();
    // start idle render
    requestAnimationFrame(renderIdle);
  }

  // Start booting after DOM ready
  window.addEventListener('load', boot);

  // Wait for DOM to load
  window.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('playBtn');
    const title = document.getElementById('title');
    if (playBtn && title) {
      playBtn.addEventListener('click', () => {
        title.style.display = 'none';
      });
    }
  });

})();
