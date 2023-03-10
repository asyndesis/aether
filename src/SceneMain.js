import Phaser from "phaser";
import { addPlayer, getPlayer, resetEntities, removePlayer, getNpc, addNpc } from "./utils";
import Door from "./Door";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
const SI = new SnapshotInterpolation(process.env.SERVER_FPS); // the server's fps is 15

class SceneMain extends Phaser.Scene {
  constructor(socket) {
    super({ key: "SceneMain" });
    this.socket = socket;
  }

  preload() {
    this.cursorKeys = this.input.keyboard.createCursorKeys();
  }

  create() {
    const scene = this;
    const socket = scene?.socket;

    socket.on("update", (snapshot) => {
      SI.snapshot.add(snapshot);
    });

    socket.on("heroInit", ({ socketId, players = [], npcs = [] }) => {
      /* Delete everything in the scene */
      resetEntities(scene);
      /* Add players that don't exist */
      for (const player of players) {
        if (getPlayer(scene, player.socketId)) continue;
        if (socketId === player.socketId) {
          scene.hero = addPlayer(scene, { ...player, isHero: true });
        } else {
          addPlayer(scene, player);
        }
      }
      for (const npc of npcs) {
        if (getNpc(scene, npc.id)) continue;
        addNpc(scene, npc);
      }
      const { collideLayer } = changeMap(scene, scene.hero.roomName);
      setPlayerCollision(scene, scene.hero, [collideLayer]);
      setCamera(scene, scene.hero);
    });

    socket.on("playerJoin", (user) => {
      const player = getPlayer(scene, user.socketId);
      if (player) {
        /* TODO: Maybe update the entire player here too */
        return (player.state.lastTeleport = Date.now());
      }
      addPlayer(scene, user);
    });

    socket.on("playerAttack", ({ socketId, count, direction }) => {
      const p = getPlayer(scene, socketId);
      p.direction = direction;
      p.doAttack(count);
    });

    socket.on("assignDamage", ({ socketId, npcHitList, playerHitList }) => {
      for (const hit of npcHitList) {
        getNpc(scene, hit?.to)?.takeHit?.(hit);
      }
      for (const hit of playerHitList) {
        getPlayer(scene, hit?.to)?.takeHit?.(hit);
      }
    });

    socket.on("respawnNpc", (id) => {
      getNpc(scene, id)?.respawn();
    });

    socket.on("remove", (socketId) => removePlayer(scene, socketId));

    socket.emit("login");
  }

  update(time, delta) {
    const playerSnapshot = SI.calcInterpolation("x y", "players");
    const npcSnapshot = SI.calcInterpolation("x y", "npcs");

    if (!this.socket || !this?.hero?.body || !playerSnapshot) return;
    /* Update Player x and y */
    for (const s of playerSnapshot?.state) {
      const player = getPlayer(this, s.socketId);
      if (!player || player?.state?.isDead) continue;

      if (!player.isHero) {
        /* Don't interpolate users who are going through a door */
        const latestSnap = SI.vault.getById(playerSnapshot?.older);
        if (player?.state?.lastTeleport >= latestSnap?.time) continue;
        /* Update other player movements */
        player.setPosition(s.x, s.y);
      }
      player.vx = s.vx;
      player.vy = s.vy;
      player.setBubbleMessage(s?.bubbleMessage);
    }
    /* Update NPC x and y */
    for (const s of npcSnapshot?.state) {
      const npc = getNpc(this, s.id);
      if (!npc || npc?.state?.isDead) continue;
      npc.setPosition(s.x, s.y);
      npc.vx = s.vx;
      npc.vy = s.vy;
      npc.setBubbleMessage(s?.bubbleMessage);
    }
    moveHero(this, time);
    enableDoors(this);
  }
}

function enableDoors(scene) {
  let coords = {};
  scene?.hero?.body?.getBounds(coords);
  for (const door of scene.doors.getChildren()) {
    if (!Phaser.Geom.Intersects.RectangleToRectangle(coords, door.getBounds()))
      door.isEnabled = true;
  }
}

function moveHero(scene, time) {
  if (scene?.hero?.state?.isDead) return;
  const speed = scene.hero.stats.speed;
  const joystick = scene.game.scene.scenes[2].joystick;
  const left = scene.cursorKeys.left.isDown;
  const right = scene.cursorKeys.right.isDown;
  const up = scene.cursorKeys.up.isDown;
  const down = scene.cursorKeys.down.isDown;

  let vx = 0;
  let vy = 0;

  if (left) vx = -speed;
  if (right) vx = speed;
  if (up) vy = -speed;
  if (down) vy = speed;
  if (left && right) vx = 0;
  if (up && down) vy = 0;
  if (!left && !right && !up && !down) {
    vx = 0;
    vy = 0;
  }

  if (joystick.deltaX || joystick.deltaY) {
    vx = joystick.deltaX * speed;
    vy = joystick.deltaY * speed;
  }

  if (scene.hero.state.isAttacking) {
    vx = 0;
    vy = 0;
  }
  scene.hero.body.setVelocity(vx, vy);

  /* If the hero is standing still do not update the server */
  if (!scene.hero.state.isIdle) {
    //if (time % 2 > 1)
    scene.socket.emit("playerInput", {
      vx,
      vy,
      x: scene.hero.x,
      y: scene.hero.y,
      direction: scene.hero.direction,
    });
  }
  scene.hero.state.isIdle = scene.hero.vx === vx && scene.hero.vy === vy && vx === 0 && vy === 0;
}

function setCamera(scene, hero) {
  scene.cameras.main.setZoom(2);
  scene.cameras.main.startFollow(hero, true);
  scene.cameras.main.setBounds(0, 0, scene.map.widthInPixels, scene.map.heightInPixels);
}

function setPlayerCollision(scene, player, colliders = []) {
  scene.physics.world.colliders.destroy();
  scene.physics.world.setBounds(0, 0, scene.map.widthInPixels, scene.map.heightInPixels);
  player.body.setCollideWorldBounds(true);
  colliders.forEach((c) => {
    scene.physics.add.collider(player, c);
  });

  scene.physics.add.overlap(
    scene.hero,
    scene.doors,
    null,
    (hero, door) => {
      /* If they spawned on the door, ignore it for now */
      const { x, y } = hero.startingCoords;
      if (door.getBounds().contains(x, y)) {
        door.heroSpawn = true;
      }
      /* If the door is not disabled let it teleport */
      if (!door.heroSpawn || door.isEnabled) {
        door.destroy();
        /* Wait for the door to go away before emitting the event */
        setTimeout(() => {
          scene.socket.emit("enterDoor", door.name);
        }, 1);
      }
    },
    scene
  );
}

function changeMap(scene, roomName) {
  const tileSetKey = roomName?.split("-")?.[0];

  scene.map = scene.make.tilemap({
    key: roomName,
  });

  const tileSet = scene.map.addTilesetImage("tileset-" + tileSetKey);
  const tilesetShadows = scene.map.addTilesetImage("tileset-" + tileSetKey + "-shadows");
  const tilesetCollide = scene.map.addTilesetImage("tileset-collide");
  const tilesetExtras = scene.map.addTilesetImage("tileset-extras");
  const collideLayer = scene.map.createLayer("Collide", tilesetCollide).setCollisionByProperty({
    collides: true,
  });

  scene.map.createLayer("Ground", tileSet).setDepth(0);
  scene.map.createLayer("Shadows", tilesetShadows).setDepth(1);
  scene.map.createLayer("Overlay", tileSet).setDepth(2);
  scene.map.createLayer("Extras", tilesetExtras).setDepth(3);
  scene.map.createLayer("Above", tileSet).setDepth(9999);
  if (scene.animatedTiles) scene.animatedTiles.init(scene.map);

  /* Create Doors */
  const mapDoors = scene.map.getObjectLayer("Doors").objects;
  for (const door of mapDoors) {
    const newDoor = new Door(scene, door);
    scene.doors.add(newDoor);
  }

  return { collideLayer };
}

export default SceneMain;
