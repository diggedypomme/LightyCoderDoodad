const assert = require('node:assert/strict');
const codegen = require('../app/static/scratch_codegen.js');

const trio = codegen.generate({
  sprites: [
    {id:'A',color:'blue',x:1,y:3,dx:1,dy:0},
    {id:'B',color:'green',x:6,y:1,dx:0,dy:1},
    {id:'C',color:'red',x:12,y:12,dx:-1,dy:-1},
  ],
  setupActions: [],
  loopActions: [{type:'bounce',sprite:'all',axes:'both'}],
});
assert.match(trio,/Engine\.spriteClasses\.push/);
assert.match(trio,/Engine\.WhenGameUpdates/);
assert.match(trio,/\[255,0,0\]/);
assert.match(trio,/\[0,0,255\]/);
assert.doesNotMatch(trio,/^var/m);
assert.doesNotMatch(trio,/\}\)\(\)/);
assert.ok(trio.length<480,`trio source unexpectedly large: ${trio.length}`);

const timed = codegen.generate({
  sprites:[{id:'A',color:'red',x:6,y:6,dx:0,dy:0}],
  setupActions:[{type:'place',sprite:'A',x:5,y:5}],
  loopActions:[
    {type:'every',ticks:4,actions:[{type:'colour',sprite:'A',color:'blue'}]},
    {type:'every',ticks:8,actions:[{type:'colour',sprite:'A',color:'red'}]},
  ],
});
assert.match(timed,/Engine\.T=0/);
assert.match(timed,/Engine\.T%4/);
assert.match(timed,/\.costume=/);
assert.match(timed,/\.x=5;.*\.y=5/);
assert.ok(timed.length<480,`timed source unexpectedly large: ${timed.length}`);
assert.throws(()=>codegen.generate({sprites:[]}),/at least one sprite|at least one light/);
assert.throws(()=>codegen.generate({sprites:[
  {id:'A',color:'red',x:1,y:1,dx:0,dy:0},
  {id:'A',color:'blue',x:2,y:2,dx:0,dy:0},
]}),/more than once|unique/i);
assert.throws(()=>codegen.generate({
  sprites:[{id:'A',color:'red',x:1,y:1,dx:0,dy:0}],
  loopActions:[{type:'colour',sprite:'B',color:'blue'}],
}),/no 'B' light|unknown sprite/i);
console.log(`scratch_codegen ok (trio ${trio.length}, timed ${timed.length} chars)`);

const randomBounce = codegen.generate({
  sprites:[{id:'A',color:'blue',x:1,y:6,dx:1,dy:0}],
  eventActions:[{type:'bounce_event',sprite:'A',axes:'horizontal',actions:[{type:'random_colour',sprite:'A'}]}],
});
assert.match(randomBounce,/Engine\.mathRandomInt\(0,255\)/);
assert.match(randomBounce,/speedX=-Engine\.B\.speedX/);
assert.ok(randomBounce.length<480,`random bounce unexpectedly large: ${randomBounce.length}`);

const sensors = codegen.generate({
  sprites:[{id:'A',color:'red',x:6,y:6,dx:0,dy:0}],
  eventActions:[
    {type:'shake',actions:[{type:'random_position',sprite:'A'}]},
    {type:'tilt',direction:'RIGHT',actions:[{type:'random_velocity',sprite:'A'}]},
  ],
});
assert.match(sensors,/Engine\.WhenShaken/);
assert.match(sensors,/Engine\.WhenTilted\("RIGHT"/);
assert.match(sensors,/Engine\.mathRandomInt\(-1,1\)/);
assert.ok(sensors.length<480,`sensor source unexpectedly large: ${sensors.length}`);
console.log(`event codegen ok (bounce ${randomBounce.length}, sensors ${sensors.length} chars)`);
