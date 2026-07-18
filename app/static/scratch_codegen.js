(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ArcadeScratchCodegen = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const COLOR_HEX = {
    red: "#ff0000", orange: "#ff7a00", yellow: "#ffff00", green: "#00ff00",
    cyan: "#00ffff", blue: "#0000ff", purple: "#a000ff", white: "#ffffff",
  };
  const SPRITE_IDS = ["A", "B", "C", "D"];

  function integer(value, min, max, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
      throw new Error(`${label} must be an integer from ${min} to ${max}`);
    }
    return number;
  }

  function deviceRgb(color) {
    const hex = COLOR_HEX[color] || color;
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Unsupported colour: ${color}`);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [b, g, r];
  }

  function costume(color) {
    const [r, g, b] = deviceRgb(color);
    return `Engine.makeGameCostume(1,1,[${r},${g},${b}])`;
  }

  function generate(project) {
    if (!project || !Array.isArray(project.sprites)) throw new Error("Project has no sprite list");
    if (project.sprites.length < 1) throw new Error("Add at least one light block");
    if (project.sprites.length > 4) throw new Error("This compiler supports at most four named lights");

    const spriteIndex = new Map();
    const sprites = project.sprites.map((sprite, index) => {
      const id = String(sprite.id || SPRITE_IDS[index]).toUpperCase();
      if (!SPRITE_IDS.includes(id)) throw new Error(`Unsupported light name: ${id}`);
      if (spriteIndex.has(id)) throw new Error(`Light ${id} is created more than once`);
      spriteIndex.set(id, index);
      const x = integer(sprite.x, 1, 12, `Light ${id} x`);
      const y = integer(sprite.y, 1, 12, `Light ${id} y`);
      const dx = integer(sprite.dx, -1, 1, `Light ${id} horizontal speed`);
      const dy = integer(sprite.dy, -1, 1, `Light ${id} vertical speed`);
      return `new Engine.Sprite(${costume(sprite.color || "blue")},${x},${y},${dx},${dy})`;
    });

    function ref(id) {
      const key = String(id || "A").toUpperCase();
      if (!spriteIndex.has(key)) throw new Error(`Action uses light ${key}, but no '${key}' light was created`);
      return `Engine.spriteClasses[0][${spriteIndex.get(key)}]`;
    }

    function bounceCode(target, axes) {
      const horizontal = axes === "both" || axes === "horizontal";
      const vertical = axes === "both" || axes === "vertical";
      const out = [];
      if (target === "all") {
        if (horizontal) out.push("if(S.x>=12)S.speedX=-1", "if(S.x<=1&&S.speedX)S.speedX=1");
        if (vertical) out.push("if(S.y>=12)S.speedY=-1", "if(S.y<=1&&S.speedY)S.speedY=1");
        return `Engine.spriteClasses[0].forEach(function(S){${out.join(";")};})`;
      }
      const sprite = ref(target);
      if (horizontal) out.push(`if(${sprite}.x>=12)${sprite}.speedX=-1`, `if(${sprite}.x<=1&&${sprite}.speedX)${sprite}.speedX=1`);
      if (vertical) out.push(`if(${sprite}.y>=12)${sprite}.speedY=-1`, `if(${sprite}.y<=1&&${sprite}.speedY)${sprite}.speedY=1`);
      return out.join(";");
    }

    function bounceEventCode(event) {
      const sprite = ref(event.sprite);
      const axes = event.axes || "both";
      const horizontal = "(Engine.B.x>=12&&Engine.B.speedX>0)||(Engine.B.x<=1&&Engine.B.speedX<0)";
      const vertical = "(Engine.B.y>=12&&Engine.B.speedY>0)||(Engine.B.y<=1&&Engine.B.speedY<0)";
      const body = (event.actions || []).map((child) => actionCode(child, true)).join(";");
      if (!body) throw new Error("Put at least one action inside the bounce event");
      if (axes === "horizontal") return `Engine.B=${sprite};if(${horizontal}){Engine.B.speedX=-Engine.B.speedX;${body};}`;
      if (axes === "vertical") return `Engine.B=${sprite};if(${vertical}){Engine.B.speedY=-Engine.B.speedY;${body};}`;
      return `Engine.B=${sprite};Engine.X=${horizontal};Engine.Y=${vertical};if(Engine.X||Engine.Y){if(Engine.X)Engine.B.speedX=-Engine.B.speedX;if(Engine.Y)Engine.B.speedY=-Engine.B.speedY;${body};}`;
    }
    function actionCode(action, nested = false) {
      if (!action || !action.type) throw new Error("Malformed action block");
      const sprite = action.sprite && action.sprite !== "all" ? ref(action.sprite) : null;
      switch (action.type) {
        case "place":
          return `${sprite}.x=${integer(action.x, 1, 12, "x")};${sprite}.y=${integer(action.y, 1, 12, "y")}`;
        case "velocity":
          return `${sprite}.speedX=${integer(action.dx, -1, 1, "horizontal speed")};${sprite}.speedY=${integer(action.dy, -1, 1, "vertical speed")}`;
        case "move": {
          const dx = integer(action.dx, -12, 12, "horizontal movement");
          const dy = integer(action.dy, -12, 12, "vertical movement");
          return `${sprite}.x+=${dx};${sprite}.y+=${dy}`;
        }
        case "colour":
          return `${sprite}.costume=${costume(action.color)}`;
        case "visible":
          return `Engine.${action.visible ? "Show" : "Hide"}(${sprite})`;
        case "random_colour":
          return `${sprite}.costume=Engine.makeGameCostume(1,1,[Engine.mathRandomInt(0,255),Engine.mathRandomInt(0,255),Engine.mathRandomInt(0,255)])`;
        case "random_velocity":
          return `${sprite}.speedX=Engine.mathRandomInt(-1,1);${sprite}.speedY=Engine.mathRandomInt(-1,1)`;
        case "random_position":
          return `${sprite}.x=Engine.mathRandomInt(1,12);${sprite}.y=Engine.mathRandomInt(1,12)`;
        case "bounce":
          return bounceCode(action.sprite || "all", action.axes || "both");
        case "every": {
          if (nested) throw new Error("'every N ticks' blocks cannot be nested");
          const ticks = integer(action.ticks, 1, 80, "tick interval");
          const body = (action.actions || []).map((child) => actionCode(child, true)).join(";");
          if (!body) throw new Error("Put at least one action inside 'every N ticks'");
          return `if(Engine.T%${ticks}===0){${body};}`;
        }
        default:
          throw new Error(`Unsupported action: ${action.type}`);
      }
    }

    const lines = [`Engine.spriteClasses.push([${sprites.join(",")}]);`];
    for (const action of project.setupActions || []) lines.push(`${actionCode(action)};`);

    const updateEvents = [];
    for (const event of project.eventActions || []) {
      const body = (event.actions || []).map((action) => actionCode(action, true)).join(";");
      if (!body) throw new Error(`Put at least one action inside the ${event.type} event`);
      if (event.type === "shake") lines.push(`Engine.WhenShaken(function(){${body};});`);
      else if (event.type === "tilt") lines.push(`Engine.WhenTilted("${event.direction}",function(){${body};});`);
      else if (event.type === "bounce_event") updateEvents.push(bounceEventCode(event));
      else throw new Error(`Unsupported event: ${event.type}`);
    }

    const loopActions = project.loopActions || [];
    if (loopActions.length || updateEvents.length) {
      const usesTimer = loopActions.some((action) => action.type === "every");
      if (usesTimer) lines.push("Engine.T=0;");
      const body = [];
      if (usesTimer) body.push("Engine.T++");
      body.push(...loopActions.map((action) => actionCode(action)), ...updateEvents);
      lines.push(`Engine.WhenGameUpdates(function(){${body.join(";")};});`);
    }
    return `${lines.join("\n")}\n`;
  }

  return {COLOR_HEX, SPRITE_IDS, deviceRgb, generate};
});
