require("dotenv").config();
const esbuild = require("esbuild");

console.log(`🛠 DEBUG: ${process.env.DEBUG}`);
console.log(`🛠 SERVER_FPS: ${process.env.SERVER_FPS}`);
console.log(`🛠 SERVER_URL: ${process.env.SERVER_URL}`);

esbuild.build({
  entryPoints: ["./src/index.js"],
  bundle: true,
  outfile: "./public/bundle.min.js",
  loader: {
    ".js": "jsx",
  },
  target: "es2016",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.DEBUG": process.env.DEBUG,
    "process.env.SERVER_FPS": process.env.SERVER_FPS,
    "process.env.SERVER_URL": JSON.stringify(process.env.SERVER_URL),
  },
});
