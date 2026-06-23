const statusEl = document.querySelector("#status");
const gridEl = document.querySelector("#grid");
const logEl = document.querySelector("#log");
const previewEl = document.querySelector("#preview");
const scriptEl = document.querySelector("#script");
const exampleEl = document.querySelector("#example");
const fpsEl = document.querySelector("#fps");
const frameNoEl = document.querySelector("#frameNo");

const W = 12;
const H = 12;
const pixels = Array.from({ length: W * H }, () => [0, 0, 0]);
const cells = [];
let timer = null;
let frame = 0;
let autoSkipTimer = null;

const EXAMPLES = {
  "pet blink": `// Tiny pet face. Blinks every 8 frames.
const blink = i % 8 === 0 || i % 8 === 1;
rect(3, 3, 6, 6, 60, 180, 90);
set(4, 5, 0, 0, 0);
set(7, 5, 0, 0, 0);
if (blink) {
  line(4, 5, 5, 5, 60, 180, 90);
  line(7, 5, 8, 5, 60, 180, 90);
}
line(5, 7, 6, 8, 0, 0, 0);
line(6, 8, 7, 7, 0, 0, 0);`,
  "pet walk": `// Tiny pet walking in place.
const bob = i % 2;
rect(4, 3 + bob, 4, 4, 90, 200, 120);
set(5, 5 + bob, 0, 0, 0); set(7, 5 + bob, 0, 0, 0);
set(4, 7 + bob, 40, 120, 60); set(7, 7 + (1 - bob), 40, 120, 60);
set(3, 6 + bob, 90, 200, 120); set(8, 6 + bob, 90, 200, 120);`,
  "pet sleep": `// Sleeping pet with drifting Zs.
rect(3, 6, 6, 3, 60, 150, 90);
line(4, 7, 5, 7, 0, 0, 0); line(7, 7, 8, 7, 0, 0, 0);
const z = i % 6;
text('111|001|111', 7 - z, 1 + Math.floor(z / 2), 80, 120, 255);`,
  "pet hungry": `// Hungry pet plus food dot.
rect(3, 3, 6, 6, 220, 160, 50);
set(4, 5, 0, 0, 0); set(7, 5, 0, 0, 0);
line(5, 8, 7, 8, 0, 0, 0);
set(10, 8 + (i % 2), 255, 0, 0);`,
  "pet happy": `// Happy pet bounce.
const y = 3 + (i % 2);
rect(3, y, 6, 5, 80, 220, 110);
set(4, y + 2, 0, 0, 0); set(7, y + 2, 0, 0, 0);
line(4, y + 4, 5, y + 5, 0, 0, 0); line(5, y + 5, 7, y + 5, 0, 0, 0); line(7, y + 5, 8, y + 4, 0, 0, 0);`,
  "pet sick": `// Sick pet, green and wobbling.
const x = 3 + (i % 3 === 0 ? -1 : 0);
rect(x, 4, 6, 5, 120, 210, 70);
set(x + 1, 6, 0, 0, 0); set(x + 4, 6, 0, 0, 0);
line(x + 2, 8, x + 4, 8, 0, 0, 0);
set(9, 2, 130, 255, 70); set(10, 3, 130, 255, 70);`,
  "bounce": `// Bouncing dot with trail.
const x = Math.abs((i % 22) - 11);
const y = 5 + Math.round(Math.sin(i / 2) * 4);
for (let n = 0; n < 5; n++) {
  const xx = Math.abs(((i - n) % 22) - 11);
  const yy = 5 + Math.round(Math.sin((i - n) / 2) * 4);
  set(xx, yy, 255 - n * 40, 80, 20);
}`,
  "rainbow scanner": `// Sweeping rainbow bar.
const x = i % W;
for (let y = 0; y < H; y++) {
  const [r,g,b] = hsv((i * 18 + y * 20) % 360, 1, 1);
  set(x, y, r, g, b);
  if (x > 0) set(x - 1, y, r * 0.25, g * 0.25, b * 0.25);
}`,
  "rain": `// Falling rain.
for (let x = 0; x < W; x++) {
  const y = (i + x * 3) % H;
  set(x, y, 0, 80, 255);
  set(x, (y + H - 1) % H, 0, 20, 80);
}`,
  "snow": `// Soft snow drift.
for (let n = 0; n < 18; n++) {
  const x = (n * 5 + Math.floor(i / 3)) % W;
  const y = (i + n * 4) % H;
  set(x, y, 220, 240, 255);
}`,
  "sparkle": `// Deterministic sparkle field.
for (let n = 0; n < 18; n++) {
  const x = (n * 7 + i * 3) % W;
  const y = (n * 5 + i * 2) % H;
  const v = ((n * 31 + i * 17) % 100) / 100;
  set(x, y, 255 * v, 255 * v, 255 * v);
}`,
  "heart pulse": `// Heart shape with pulsing brightness.
const pts = [[3,3],[4,2],[5,2],[6,3],[7,2],[8,2],[9,3],[2,4],[10,4],[2,5],[10,5],[3,6],[9,6],[4,7],[8,7],[5,8],[7,8],[6,9]];
const v = 0.45 + 0.55 * Math.abs(Math.sin(i / 3));
for (const [x,y] of pts) set(x, y, 255 * v, 20 * v, 60 * v);`,
  "fire": `// Chunky fake fire.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const heat = Math.max(0, 1 - y / H) * (((x * 17 + i * 13 + y * 9) % 12) / 12);
    if (heat > 0.18) set(x, H - 1 - y, 255, 150 * heat, 20 * heat);
  }
}`,
  "matrix rain": `// Green digital rain.
for (let x = 0; x < W; x++) {
  const head = (i + x * 4) % H;
  set(x, head, 180, 255, 180);
  set(x, (head + H - 1) % H, 0, 180, 40);
  set(x, (head + H - 2) % H, 0, 70, 20);
}`,
  "comet": `// Orbiting comet.
const pts = [[1,5],[2,3],[4,2],[7,2],[9,3],[10,5],[9,8],[7,9],[4,9],[2,8]];
for (let n = 0; n < pts.length; n++) {
  const [x,y] = pts[(i - n + pts.length * 10) % pts.length];
  const v = Math.max(0, 1 - n / 6);
  set(x, y, 80 * v, 180 * v, 255 * v);
}`,
  "spinner": `// Loading spinner.
const arms = [[6,2],[8,3],[10,5],[9,8],[6,10],[3,9],[2,6],[3,3]];
for (let n = 0; n < arms.length; n++) {
  const [x,y] = arms[n];
  const v = ((n - i) % arms.length + arms.length) % arms.length;
  set(x, y, 255 - v * 25, 255 - v * 25, 255);
}
set(6,6,120,120,255);`,
  "equalizer": `// Fake audio bars.
for (let x = 0; x < W; x++) {
  const h = 1 + Math.floor((Math.sin(i / 2 + x) + 1) * 5.5);
  const [r,g,b] = hsv(x * 25, 1, 1);
  for (let y = 0; y < h; y++) set(x, H - 1 - y, r, g, b);
}`,
  "clock sweep": `// Second-hand style sweep.
const a = i / 12 * Math.PI * 2;
const cx = 5.5, cy = 5.5;
for (let n = 0; n < 6; n++) {
  const x = Math.round(cx + Math.cos(a) * n);
  const y = Math.round(cy + Math.sin(a) * n);
  set(x, y, 255, 255, 255);
}
set(5,5,255,0,0); set(6,6,255,0,0);`,
  "orbit": `// Two dots orbiting.
for (let n = 0; n < 2; n++) {
  const a = i / 5 + n * Math.PI;
  set(Math.round(5.5 + Math.cos(a) * 4), Math.round(5.5 + Math.sin(a) * 4), n ? 255 : 0, 80, n ? 80 : 255);
}`,
  "checker wave": `// Colour checker wave.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if ((x + y + i) % 3 === 0) {
      const [r,g,b] = hsv((x * 20 + y * 20 + i * 15) % 360, 1, 1);
      set(x, y, r, g, b);
    }
  }
}`,
  "wipe": `// Horizontal wipe.
const n = i % (W + 1);
for (let x = 0; x < n; x++) rect(x, 0, 1, H, 30, 180, 255);`,
  "box grow": `// Growing box.
const n = 1 + (i % 6);
rect(6 - n, 6 - n, n * 2, n * 2, 255, 80, 30);`,
  "eyes look": `// Eyes looking around.
const look = [[0,0],[1,0],[0,1],[-1,0],[0,-1]][i % 5];
rect(2,3,3,4,255,255,255); rect(7,3,3,4,255,255,255);
set(3 + look[0], 5 + look[1], 0,0,0); set(8 + look[0], 5 + look[1], 0,0,0);`,
  "smile": `// Smiley blink.
const blink = i % 10 < 2;
if (blink) { line(3,4,4,4,255,255,0); line(8,4,9,4,255,255,0); }
else { set(4,4,255,255,0); set(8,4,255,255,0); }
line(3,7,4,8,255,255,0); line(4,8,7,8,255,255,0); line(7,8,8,7,255,255,0);`,
  "hi text": `// Proper chunky HI.
text('1010111|1010010|1110010|1010010|1010111', 2, 3, 255, 255, 255);`,
  "love text": `// Alternates HI and heart.
if (i % 12 < 6) {
  text('1010111|1010010|1110010|1010010|1010111', 2, 3, 255, 255, 255);
} else {
  const pts = [[4,3],[5,3],[7,3],[8,3],[3,4],[6,4],[9,4],[3,5],[9,5],[4,6],[8,6],[5,7],[7,7],[6,8]];
  for (const p of pts) set(p[0], p[1], 255, 20, 80);
}`,
  "progress": `// Progress bar around edge.
const total = 44;
const lit = i % (total + 1);
const edge = [];
for (let x=0;x<W;x++) edge.push([x,0]);
for (let y=1;y<H;y++) edge.push([W-1,y]);
for (let x=W-2;x>=0;x--) edge.push([x,H-1]);
for (let y=H-2;y>0;y--) edge.push([0,y]);
for (let n=0;n<lit;n++) { const [x,y]=edge[n]; set(x,y,80,255,120); }`,
  "alert flash": `// Red alert flash.
if (i % 2 === 0) {
  rect(0,0,W,H,255,0,0);
  text('111010111|010010100|010010111|010010100|010111111', 1, 3, 0,0,0);
}`,

  // Claude's animations - Part 1
  "claude wave": `// Sine wave ripple
for (let x = 0; x < W; x++) {
  const y = Math.round(5.5 + Math.sin((x + i) / 2) * 4);
  const [r,g,b] = hsv((x * 30 + i * 10) % 360, 1, 1);
  set(x, y, r, g, b);
}`,

  "claude plasma": `// Plasma effect
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const v = Math.sin(x / 2 + i / 4) + Math.sin(y / 2 + i / 4) + Math.sin((x + y) / 3 + i / 4);
    const [r,g,b] = hsv((v * 60 + i * 10) % 360, 1, 0.8);
    set(x, y, r, g, b);
  }
}`,

  "claude tunnel": `// Tunnel zoom effect
const zoom = (i % 20) / 20;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - 5.5, dy = y - 5.5;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d > 2 * zoom && d < 6 * zoom) {
      const [r,g,b] = hsv((d * 40 + i * 20) % 360, 1, 1);
      set(x, y, r, g, b);
    }
  }
}`,

  "claude spiral": `// Rotating spiral
const cx = 5.5, cy = 5.5;
for (let n = 0; n < 40; n++) {
  const a = (i + n) / 8;
  const r = n / 8;
  const x = Math.round(cx + Math.cos(a) * r);
  const y = Math.round(cy + Math.sin(a) * r);
  const [rr,g,b] = hsv((n * 15 + i * 10) % 360, 1, 1);
  set(x, y, rr, g, b);
}`,

  "claude DNA": `// DNA double helix
for (let x = 0; x < W; x++) {
  const y1 = Math.round(5.5 + Math.sin((x + i) / 2) * 3);
  const y2 = Math.round(5.5 - Math.sin((x + i) / 2) * 3);
  set(x, y1, 0, 200, 255);
  set(x, y2, 255, 100, 0);
  if (x % 3 === (i % 3)) line(x, y1, x, y2, 100, 100, 100);
}`,

  "claude ripple": `// Circular ripple
const cx = 5.5, cy = 5.5;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx*dx + dy*dy);
    const wave = Math.sin(d - i / 2) * 0.5 + 0.5;
    set(x, y, 255 * wave, 100 * wave, 200 * wave);
  }
}`,

  "claude starfield": `// Starfield zoom
for (let n = 0; n < 30; n++) {
  const z = ((i + n * 7) % 40) / 40;
  const x = Math.round(5.5 + (n % 7 - 3) * z * 3);
  const y = Math.round(5.5 + (Math.floor(n / 7) - 2) * z * 3);
  set(x, y, 255 * z, 255 * z, 255 * z);
}`,

  "claude radar": `// Radar sweep
const a = (i / 6) * Math.PI;
const cx = 5.5, cy = 5.5;
for (let r = 1; r < 7; r++) {
  for (let aa = 0; aa < Math.PI * 2; aa += 0.3) {
    const x = Math.round(cx + Math.cos(aa) * r);
    const y = Math.round(cy + Math.sin(aa) * r);
    const diff = Math.abs(aa - a);
    if (diff < 0.5 || diff > Math.PI * 2 - 0.5) set(x, y, 0, 255, 100);
  }
}`,

  "claude knight rider": `// KITT scanner
const x = Math.abs((i % (W * 2)) - W);
for (let n = 0; n < 4; n++) {
  const xx = x - n;
  if (xx >= 0 && xx < W) set(xx, 5, 255 - n * 50, 0, 0);
  if (xx >= 0 && xx < W) set(xx, 6, 255 - n * 50, 0, 0);
}`,

  "claude tetris": `// Falling blocks
const block = [[0,0],[1,0],[0,1],[1,1]];
const y = (i % 12);
for (const [bx, by] of block) {
  set(4 + bx, y + by, 255, 0, 200);
  set(7 + bx, y + by, 0, 255, 200);
}`,

  "claude meteor": `// Meteor shower
for (let n = 0; n < 8; n++) {
  const t = (i + n * 15) % 20;
  const x = n + Math.floor(t / 2);
  const y = t;
  for (let trail = 0; trail < 4; trail++) {
    const xx = x - trail;
    const yy = y - trail;
    if (xx >= 0 && yy >= 0) set(xx, yy, 255 - trail * 60, 200 - trail * 50, 100 - trail * 25);
  }
}`,

  "claude pac": `// Pac-Man chase
const px = (i % 8) + 1;
for (let n = 0; n < 3; n++) set(px, 6, 255, 255, 0);
const gx = (i % 8) + 4;
set(gx, 6, 255, 0, 0);
set(gx + 1, 6, 255, 0, 0);`,

  "claude sine bars": `// Vertical sine bars
for (let x = 0; x < W; x++) {
  const h = Math.round((Math.sin(x / 2 + i / 3) + 1) * 5);
  for (let y = 0; y < h; y++) {
    const [r,g,b] = hsv(x * 30, 1, 1);
    set(x, H - 1 - y, r, g, b);
  }
}`,

  "claude kaleidoscope": `// Kaleidoscope
for (let y = 0; y < H / 2; y++) {
  for (let x = 0; x < W / 2; x++) {
    const val = ((x + y + i) % 4) === 0;
    if (val) {
      const [r,g,b] = hsv((x * 20 + y * 20 + i * 10) % 360, 1, 1);
      set(x, y, r, g, b);
      set(W - 1 - x, y, r, g, b);
      set(x, H - 1 - y, r, g, b);
      set(W - 1 - x, H - 1 - y, r, g, b);
    }
  }
}`,

  "claude lightning": `// Lightning bolt
const pts = [[6,0],[5,3],[6,3],[5,6],[6,6],[4,9],[6,9],[3,11]];
const on = i % 6 < 1;
if (on) for (const [x,y] of pts) set(x, y, 200, 200, 255);`,

  "claude vortex": `// Rotating vortex
const cx = 5.5, cy = 5.5;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const angle = Math.atan2(dy, dx) + i / 10;
    const d = Math.sqrt(dx*dx + dy*dy);
    const val = Math.sin(angle * 3 + d - i / 3) * 0.5 + 0.5;
    set(x, y, 255 * val, 100 * val, 255 * val);
  }
}`,

  "claude pixels fade": `// Random pixel fade
for (let n = 0; n < 20; n++) {
  const x = (n * 7 + i * 3) % W;
  const y = (n * 5 + i * 2) % H;
  const fade = ((i + n) % 12) / 12;
  set(x, y, 255 * fade, 150 * fade, 200 * fade);
}`,

  "claude binary rain": `// Binary code rain
for (let x = 0; x < W; x++) {
  const h = (i + x * 3) % H;
  const val = ((i + x) % 2) ? 255 : 0;
  set(x, h, val, 255, val);
  set(x, (h + H - 1) % H, 0, 150, 0);
}`,

  "claude xmas": `// Christmas tree
const tree = [[5,2],[4,3],[5,3],[6,3],[3,4],[4,4],[5,4],[6,4],[7,4],[3,5],[4,5],[5,5],[6,5],[7,5],[2,6],[3,6],[4,6],[5,6],[6,6],[7,6],[8,6],[5,7],[5,8]];
for (const [x,y] of tree) {
  if (y < 7) set(x, y, 0, 150 + (i % 2) * 100, 0);
  else set(x, y, 139, 69, 19);
}
if (i % 4 < 2) set(5, 2, 255, 255, 0);`,

  "claude circle pulse": `// Pulsing circle
const r = 2 + Math.floor((i % 8) / 2);
const cx = 5.5, cy = 5.5;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (Math.abs(d - r) < 0.7) set(x, y, 255, 100, 200);
  }
}`,

  "claude diamond": `// Rotating diamond
const pts = [[6,1],[9,4],[6,7],[3,4]];
for (let n = 0; n < pts.length; n++) {
  const [x,y] = pts[(i + n) % pts.length];
  set(x, y, 255 - n * 60, 255 - n * 60, 255);
}
line(6,1,9,4,100,100,255);
line(9,4,6,7,100,100,255);
line(6,7,3,4,100,100,255);
line(3,4,6,1,100,100,255);`,

  "claude hourglass": `// Sand falling
const y = i % H;
rect(2, 0, 8, 1, 200, 200, 200);
rect(2, 11, 8, 1, 200, 200, 200);
if (y < 5) set(5 + (y % 2), y, 255, 200, 100);
else if (y > 6) set(6 - ((y - 7) % 2), y, 255, 200, 100);`,

  "claude zebra": `// Zebra stripes scroll
for (let y = 0; y < H; y++) {
  if ((y + i) % 3 === 0) rect(0, y, W, 1, 255, 255, 255);
}`,

  "claude lava lamp": `// Lava lamp blobs
for (let n = 0; n < 6; n++) {
  const y = 5.5 + Math.sin(i / 4 + n) * 4;
  const x = n * 2;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      set(x + dx, Math.round(y) + dy, 255, 100, 0);
    }
  }
}`,

  "claude targeting": `// Targeting reticle
const cx = 5.5 + Math.sin(i / 5) * 2;
const cy = 5.5 + Math.cos(i / 5) * 2;
const x = Math.round(cx), y = Math.round(cy);
line(x - 2, y, x + 2, y, 255, 0, 0);
line(x, y - 2, x, y + 2, 255, 0, 0);
rect(x - 3, y - 3, 7, 1, 0, 255, 0);
rect(x - 3, y + 3, 7, 1, 0, 255, 0);
rect(x - 3, y - 3, 1, 7, 0, 255, 0);
rect(x + 3, y - 3, 1, 7, 0, 255, 0);`,

  "claude thermometer": `// Temperature rising
const h = 1 + (i % 10);
rect(5, 11 - h, 2, h, 255, 0, 0);
rect(5, 0, 2, 11 - h, 100, 100, 100);`,

  "claude loading dots": `// Loading animation
const dots = [3, 5, 7, 9];
for (let n = 0; n < dots.length; n++) {
  const bright = ((i + n * 2) % 8) / 8;
  set(dots[n], 6, 255 * bright, 255 * bright, 255 * bright);
}`,

  "claude arrows": `// Flowing arrows
for (let y = 0; y < H; y += 3) {
  const x = (i + y) % W;
  text('111.1|.1.1|..1.', x, y, 0, 255, 255);
}`,

  "claude neon sign": `// Flickering neon
const flicker = (i % 8) < 7;
if (flicker) {
  text('10101|01010|10101|01010|10101', 1, 3, 255, 0, 200);
}`,

  "claude radar blip": `// Radar with blips
for (let r = 1; r < 6; r++) {
  for (let a = 0; a < Math.PI * 2; a += 0.5) {
    const x = Math.round(5.5 + Math.cos(a) * r);
    const y = Math.round(5.5 + Math.sin(a) * r);
    set(x, y, 0, 50, 0);
  }
}
const a = (i / 5) * Math.PI * 2;
for (let r = 0; r < 6; r++) {
  set(Math.round(5.5 + Math.cos(a) * r), Math.round(5.5 + Math.sin(a) * r), 0, 255, 0);
}
if (i % 12 < 2) set(8, 3, 255, 0, 0);`,

  "claude breathing": `// Breathing glow
const v = (Math.sin(i / 4) + 1) / 2;
for (let r = 0; r < 5; r++) {
  for (let a = 0; a < Math.PI * 2; a += 0.3) {
    const x = Math.round(5.5 + Math.cos(a) * r);
    const y = Math.round(5.5 + Math.sin(a) * r);
    set(x, y, 100 * v, 150 * v, 255 * v);
  }
}`,

  "claude conveyor": `// Conveyor belt
for (let x = 0; x < W; x++) {
  if ((x + i) % 4 < 2) {
    rect(x, 5, 1, 2, 200, 200, 200);
  }
}
const box = (i % W);
rect(box, 3, 2, 2, 200, 100, 0);`,

  "claude disco": `// Disco floor
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if ((x + y + i) % 3 === 0) {
      const [r,g,b] = hsv(((x + y) * 40 + i * 20) % 360, 1, 1);
      set(x, y, r, g, b);
    }
  }
}`,

  "claude warp speed": `// Warp speed stars
for (let n = 0; n < 15; n++) {
  const z = ((i + n * 5) % 30) / 30;
  const len = Math.floor(z * 4);
  const x = 5 + ((n % 5) - 2);
  const y = Math.round(5.5 - (1 - z) * 5);
  for (let l = 0; l < len; l++) {
    set(x, y + l, 200, 200, 255);
  }
}`,

  // Claude's animations - Part 2
  "claude crosshair": `// Moving crosshair
const x = 2 + (i % 8);
const y = 2 + ((i * 2) % 8);
line(x, 0, x, H - 1, 255, 0, 0);
line(0, y, W - 1, y, 255, 0, 0);
set(x, y, 255, 255, 0);`,

  "claude sonar": `// Sonar ping
const r = (i % 10) * 1.2;
const cx = 5.5, cy = 5.5;
for (let a = 0; a < Math.PI * 2; a += 0.2) {
  const x = Math.round(cx + Math.cos(a) * r);
  const y = Math.round(cy + Math.sin(a) * r);
  set(x, y, 0, 255 - r * 20, 255 - r * 20);
}`,

  "claude squares": `// Concentric squares
const s = i % 6;
rect(5 - s, 5 - s, 1 + s * 2, 1 + s * 2, 255, 100, 200);`,

  "claude bubbles": `// Rising bubbles
for (let n = 0; n < 6; n++) {
  const x = (n * 2) % W;
  const y = H - 1 - ((i + n * 7) % H);
  set(x, y, 100, 200, 255);
  if (y > 0) set(x, y - 1, 150, 220, 255);
}`,

  "claude rain drops": `// Rain with splashes
for (let n = 0; n < 8; n++) {
  const x = (n * 3) % W;
  const y = (i + n * 4) % H;
  set(x, y, 100, 150, 255);
  if (y === H - 1) {
    set(x - 1, y, 150, 200, 255);
    set(x + 1, y, 150, 200, 255);
  }
}`,

  "claude pong": `// Pong game
const ballX = Math.abs((i % (W * 2)) - W);
const ballY = 5 + Math.floor(Math.sin(i / 3) * 3);
set(ballX, ballY, 255, 255, 255);
const paddle1 = 4 + Math.floor(Math.sin(i / 4) * 2);
const paddle2 = 4 + Math.floor(Math.cos(i / 4) * 2);
for (let y = paddle1; y < paddle1 + 3; y++) set(0, y, 255, 0, 0);
for (let y = paddle2; y < paddle2 + 3; y++) set(W - 1, y, 0, 0, 255);`,

  "claude snake": `// Snake game trail
const len = 8;
for (let n = 0; n < len; n++) {
  const x = ((i - n) % W + W) % W;
  const y = 5 + Math.floor(Math.sin((i - n) / 3) * 2);
  const v = 1 - n / len;
  set(x, y, 100 * v, 255 * v, 100 * v);
}`,

  "claude fireworks": `// Firework burst
const stage = i % 16;
if (stage < 8) {
  set(6, 11 - stage, 255, 200, 0);
} else {
  const s = stage - 8;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const x = Math.round(6 + Math.cos(a) * s);
    const y = Math.round(3 + Math.sin(a) * s);
    set(x, y, 255 - s * 30, 200 - s * 25, s * 30);
  }
}`,

  "claude tv static": `// TV static noise
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const v = ((x * 17 + y * 13 + i * 7) % 3) === 0 ? 255 : 0;
    set(x, y, v, v, v);
  }
}`,

  "claude barcode": `// Scrolling barcode
for (let x = 0; x < W; x++) {
  if (((x + i) % 7) < 3) rect(x, 0, 1, H, 0, 0, 0);
  else rect(x, 0, 1, H, 255, 255, 255);
}`,

  "claude pac dots": `// Pac-Man eating dots
const px = (i % W);
set(px, 6, 255, 255, 0);
for (let x = 0; x < W; x++) {
  if (x > px && x % 2 === 0) set(x, 6, 255, 255, 255);
}`,

  "claude slot machine": `// Slot machine reels
const r1 = (i % 4), r2 = ((i * 2) % 4), r3 = ((i * 3) % 4);
const symbols = ['111|101|111', '010|111|010', '111|111|111', '101|111|101'];
text(symbols[r1], 0, 4, 255, 0, 0);
text(symbols[r2], 4, 4, 0, 255, 0);
text(symbols[r3], 8, 4, 0, 0, 255);`,

  "claude spin cycle": `// Washing machine
for (let n = 0; n < 8; n++) {
  const a = (i / 4 + n * Math.PI / 4) % (Math.PI * 2);
  const x = Math.round(5.5 + Math.cos(a) * 4);
  const y = Math.round(5.5 + Math.sin(a) * 4);
  const [r,g,b] = hsv(n * 45, 1, 1);
  set(x, y, r, g, b);
}`,

  "claude traffic light": `// Traffic signal
const state = Math.floor(i / 8) % 3;
set(6, 2, state === 0 ? 255 : 50, 0, 0);
set(6, 5, state === 1 ? 255 : 50, state === 1 ? 255 : 50, 0);
set(6, 8, state === 2 ? 0 : 20, state === 2 ? 255 : 50, 0);`,

  "claude elevator": `// Elevator going up and down
const y = Math.abs((i % 20) - 10);
rect(4, y, 4, 2, 200, 200, 200);
set(5, y + 1, 100, 100, 100);
set(6, y + 1, 100, 100, 100);`,

  "claude pendulum": `// Swinging pendulum
const angle = Math.sin(i / 3) * 4;
const x = Math.round(6 + angle);
line(6, 0, x, 6, 150, 150, 150);
set(x, 6, 200, 200, 0);
set(x, 7, 200, 200, 0);`,

  "claude typing": `// Typing cursor
const chars = 'HELLO';
const pos = Math.floor(i / 6) % (chars.length + 3);
text(chars.substring(0, Math.min(pos, chars.length)), 1, 5, 255, 255, 255);
if ((i % 12) < 6 && pos <= chars.length) set(1 + pos * 2, 5, 255, 255, 255);`,

  "claude portal": `// Portal vortex
for (let r = 0; r < 6; r++) {
  const rr = 6 - r;
  const offset = (i + r * 2) / 8;
  for (let a = 0; a < Math.PI * 2; a += 0.4) {
    const x = Math.round(5.5 + Math.cos(a + offset) * rr);
    const y = Math.round(5.5 + Math.sin(a + offset) * rr);
    const [rr2,g,b] = hsv((r * 60 + i * 10) % 360, 1, 1);
    set(x, y, rr2, g, b);
  }
}`,

  "claude pipes": `// Screensaver pipes
const path = [[5,0],[5,1],[5,2],[6,2],[7,2],[7,3],[7,4]];
const len = Math.min(i % (path.length + 4), path.length);
for (let n = 0; n < len; n++) {
  const [x,y] = path[n];
  set(x, y, 0, 255, 0);
}`,

  "claude gauge": `// Fuel gauge
const level = i % 12;
for (let y = 0; y < level; y++) {
  const color = y < 3 ? [255,0,0] : y < 7 ? [255,255,0] : [0,255,0];
  rect(4, H - 1 - y, 4, 1, ...color);
}`,

  "claude music notes": `// Floating music notes
for (let n = 0; n < 3; n++) {
  const y = (H - 1 - ((i + n * 10) % H));
  const x = 2 + n * 4;
  set(x, y, 255, 100, 255);
  set(x, y + 1, 255, 100, 255);
  set(x + 1, y - 1, 255, 100, 255);
}`,

  "claude battery": `// Battery charging
const level = (i / 2) % 8;
rect(2, 4, 8, 4, 200, 200, 200);
rect(10, 5, 1, 2, 200, 200, 200);
for (let x = 0; x < level; x++) {
  rect(3 + x, 5, 1, 2, 0, 255, 0);
}`,

  "claude wifi": `// WiFi signal bars
const strength = Math.floor(i / 6) % 5;
for (let n = 0; n < strength; n++) {
  rect(4 + n, 8 - n * 2, 1, 2 + n * 2, 0, 200, 255);
}`,

  "claude download": `// Download progress
const progress = i % W;
rect(0, 5, progress, 2, 0, 255, 100);
rect(progress, 5, W - progress, 2, 50, 50, 50);`,

  "claude compass": `// Rotating compass
const dirs = [[6,0,'N'],[11,5,'E'],[6,11,'S'],[0,5,'W']];
const dir = Math.floor((i / 4) % 4);
for (let n = 0; n < dirs.length; n++) {
  const [x,y,lbl] = dirs[n];
  const bright = n === dir ? 255 : 50;
  set(x, y, bright, bright, bright);
}`,

  "claude sunrise": `// Sunrise effect
const sun_y = 10 - (i % 11);
for (let r = 0; r < 4; r++) {
  for (let a = 0; a < Math.PI; a += 0.3) {
    const x = Math.round(6 + Math.cos(a + Math.PI) * (r + 2));
    const y = Math.round(sun_y + Math.sin(a + Math.PI) * (r + 2));
    if (y >= 0) {
      const v = 1 - r / 4;
      set(x, y, 255, 200 * v, 50 * v);
    }
  }
}`,

  "claude fish swim": `// Swimming fish
const x = (i % 16);
const y = 5 + Math.floor(Math.sin(i / 2) * 2);
const facing = x < 8;
if (facing) {
  set(x, y, 255, 150, 0);
  set(x - 1, y, 255, 150, 0);
  set(x - 1, y - 1, 100, 200, 255);
  set(x - 1, y + 1, 100, 200, 255);
} else {
  set(15 - x, y, 255, 150, 0);
  set(16 - x, y, 255, 150, 0);
  set(16 - x, y - 1, 100, 200, 255);
  set(16 - x, y + 1, 100, 200, 255);
}`,

  "claude butterfly": `// Butterfly flapping
const flap = (i % 4) < 2;
const y = 5 + Math.floor(Math.sin(i / 2) * 2);
set(6, y, 255, 0, 200);
if (flap) {
  set(5, y - 1, 255, 100, 200);
  set(5, y + 1, 255, 100, 200);
  set(7, y - 1, 255, 100, 200);
  set(7, y + 1, 255, 100, 200);
} else {
  set(5, y, 255, 150, 200);
  set(7, y, 255, 150, 200);
}`,

  "claude windmill": `// Spinning windmill
const a1 = (i / 3) % (Math.PI * 2);
const a2 = a1 + Math.PI / 2;
const a3 = a1 + Math.PI;
const a4 = a1 + 3 * Math.PI / 2;
line(6, 6, Math.round(6 + Math.cos(a1) * 4), Math.round(6 + Math.sin(a1) * 4), 255, 255, 255);
line(6, 6, Math.round(6 + Math.cos(a2) * 4), Math.round(6 + Math.sin(a2) * 4), 255, 255, 255);
line(6, 6, Math.round(6 + Math.cos(a3) * 4), Math.round(6 + Math.sin(a3) * 4), 255, 255, 255);
line(6, 6, Math.round(6 + Math.cos(a4) * 4), Math.round(6 + Math.sin(a4) * 4), 255, 255, 255);
set(6, 6, 200, 200, 200);`,

  "claude rocket": `// Rocket launch
const y = Math.max(0, 10 - i);
if (y > 0) {
  rect(5, y, 2, 3, 200, 200, 200);
  set(5, y, 255, 0, 0);
  set(6, y, 255, 0, 0);
  if (i % 2 === 0) {
    set(5, y + 3, 255, 150, 0);
    set(6, y + 3, 255, 150, 0);
    set(5, y + 4, 255, 50, 0);
    set(6, y + 4, 255, 50, 0);
  }
}`,
};

async function api(path, body = null) {
  const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {};
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || res.statusText);
  return data;
}

function addLog(text) {
  const now = new Date().toLocaleTimeString();
  logEl.textContent = `[${now}] ${text}\n` + logEl.textContent;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function clear(r = 0, g = 0, b = 0) {
  const rgb = [clampByte(r), clampByte(g), clampByte(b)];
  for (let n = 0; n < pixels.length; n++) pixels[n] = [...rgb];
}

function set(x, y, r, g, b) {
  const xx = Math.round(x);
  const yy = Math.round(y);
  if (xx < 0 || yy < 0 || xx >= W || yy >= H) return;
  pixels[yy * W + xx] = [clampByte(r), clampByte(g), clampByte(b)];
}

function rect(x, y, w, h, r, g, b) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) set(xx, yy, r, g, b);
  }
}

function line(x0, y0, x1, y1, r, g, b) {
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    set(x0, y0, r, g, b);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function hsv(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let rgb = [0, 0, 0];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((channel) => clampByte((channel + m) * 255));
}

function text(pattern, x, y, r, g, b) {
  const rows = String(pattern).split("|");
  rows.forEach((row, yy) => {
    [...row].forEach((ch, xx) => {
      if (ch !== "0" && ch !== "." && ch !== " ") set(x + xx, y + yy, r, g, b);
    });
  });
}

function displayToWirePixel(pixel) {
  return [pixel[2], pixel[1], pixel[0]];
}

function renderGrid() {
  if (!cells.length) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const button = document.createElement("button");
        button.className = "cell";
        button.textContent = `${x},${y}`;
        cells.push(button);
        gridEl.appendChild(button);
      }
    }
  }
  pixels.forEach((rgb, index) => {
    const lit = rgb.some((value) => value > 0);
    const cell = cells[index];
    cell.classList.toggle("lit", lit);
    cell.style.background = lit ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : "";
    cell.style.color = lit && rgb[0] + rgb[1] + rgb[2] < 380 ? "#fff" : "";
  });
}

function runFrame() {
  clear();
  const source = scriptEl.value;
  const fn = new Function("W", "H", "i", "frame", "clear", "set", "rect", "line", "hsv", "text", `const t=i; ${source}`);
  fn(W, H, frame, frame, clear, set, rect, line, hsv, text);
  renderGrid();
  frameNoEl.value = String(frame);
  previewEl.textContent = `frame=${frame}\nlit=${pixels.filter((p) => p.some((v) => v > 0)).length}`;
}

async function sendFrame() {
  runFrame();
  const result = await api("/api/send-rgb-buffer", {
    width: W,
    height: H,
    pixels: pixels.map(displayToWirePixel),
    startIfNeeded: false,
  });
  previewEl.textContent += `\ncompact bytes=${result.canvasBytes}\ncompact hex=${result.canvasHex}`;
  addLog(`sent animation frame ${frame} ${result.canvasBytes} bytes`);
}

async function tickAndSend() {
  try {
    await sendFrame();
    frame += 1;
  } catch (err) {
    addLog(err.message);
    stop();
  }
}

function play() {
  stop();
  const fps = Math.max(1, Math.min(20, Number(fpsEl.value) || 4));
  timer = setInterval(tickAndSend, 1000 / fps);
  tickAndSend();
  addLog(`play ${fps} fps`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

async function refreshStatus() {
  const status = await api("/api/status");
  statusEl.textContent = `${status.connected ? "Connected" : "Disconnected"} | paint ${status.paintStarted ? "started" : "not started"} | ${status.address}`;
}

function loadExample(name) {
  scriptEl.value = EXAMPLES[name];
  frame = 0;
  runFrame();
}

function pickRandomExample() {
  const names = Object.keys(EXAMPLES);
  const randomName = names[Math.floor(Math.random() * names.length)];
  exampleEl.value = randomName;
  loadExample(randomName);
  addLog(`random: ${randomName}`);
}

function startAutoSkip() {
  stopAutoSkip();
  const seconds = Math.max(1, Number(document.querySelector("#skipInterval").value) || 5);
  autoSkipTimer = setInterval(() => {
    pickRandomExample();
  }, seconds * 1000);
  addLog(`auto-skip started (${seconds}s)`);

  // Start playing if not already
  if (!timer) play();
}

function stopAutoSkip() {
  if (autoSkipTimer) {
    clearInterval(autoSkipTimer);
    autoSkipTimer = null;
  }
  stop();
  addLog("auto-skip stopped, animation stopped");
}

function freezeAutoSkip() {
  if (autoSkipTimer) {
    clearInterval(autoSkipTimer);
    autoSkipTimer = null;
  }
  addLog("auto-skip frozen, animation continues");
}

for (const name of Object.keys(EXAMPLES)) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  exampleEl.appendChild(option);
}

exampleEl.addEventListener("change", () => loadExample(exampleEl.value));
frameNoEl.addEventListener("change", () => { frame = Math.max(0, Number(frameNoEl.value) || 0); runFrame(); });
document.querySelector("#connect").addEventListener("click", async () => { await api("/api/connect", {}); addLog("connected"); await refreshStatus(); });
document.querySelector("#startPaint").addEventListener("click", async () => { await api("/api/start-paint", {}); addLog("sent start paint"); await refreshStatus(); });
document.querySelector("#play").addEventListener("click", play);
document.querySelector("#stop").addEventListener("click", () => { stop(); addLog("stop"); });
document.querySelector("#step").addEventListener("click", () => { frame += 1; runFrame(); });
document.querySelector("#sendFrame").addEventListener("click", () => sendFrame().catch((err) => addLog(err.message)));
document.querySelector("#nextRandom").addEventListener("click", pickRandomExample);
document.querySelector("#startAutoSkip").addEventListener("click", startAutoSkip);
document.querySelector("#stopAll").addEventListener("click", stopAutoSkip);
document.querySelector("#freezeAutoSkip").addEventListener("click", freezeAutoSkip);

async function init() {
  renderGrid();
  loadExample("pet blink");
  await refreshStatus();
  setInterval(() => refreshStatus().catch((err) => addLog(err.message)), 1500);
}

init().catch((err) => addLog(err.message));
