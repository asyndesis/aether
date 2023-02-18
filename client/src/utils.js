const Player = require("./Player");

function addPlayer(scene, user) {
  const player = new Player(scene, user);
  scene.add.existing(player);
  scene.players.add(player);

  return player;
}

function setPlayerCollision(scene, player, colliders = []) {
  colliders.forEach((c) => {
    scene.physics.add.collider(player, c);
  });
}

function removePlayer(scene, socketId) {
  if (!scene.players) return;
  scene.players.getChildren().forEach((player) => {
    if (socketId === player.socketId) {
      player.destroy();
    }
  });
}

function removeAllPlayers(scene, socketId) {
  if (!scene.players) return;
  scene.players.getChildren().forEach((player) => {
    player.destroy();
  });
}

function getPlayer(scene, socketId) {
  if (!scene.players) return;
  const player = scene.players
    .getChildren()
    .find((player) => socketId === player.socketId);
  return player;
}

// Ensures sprite speed doesnt exceed maxVelocity while update is called (from Phaser example)
function constrainVelocity(sprite, maxVelocity) {
  if (!sprite || !sprite.body) return;

  var angle, currVelocitySqr, vx, vy;
  vx = sprite.body.velocity.x;
  vy = sprite.body.velocity.y;
  currVelocitySqr = vx * vx + vy * vy;

  if (currVelocitySqr > maxVelocity * maxVelocity) {
    angle = Math.atan2(vy, vx);
    vx = Math.cos(angle) * maxVelocity;
    vy = Math.sin(angle) * maxVelocity;
    sprite.body.velocity.x = vx;
    sprite.body.velocity.y = vy;
  }
}

const isMobile =
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

module.exports = {
  addPlayer,
  removePlayer,
  getPlayer,
  setPlayerCollision,
  removeAllPlayers,
  constrainVelocity,
  isMobile,
};
