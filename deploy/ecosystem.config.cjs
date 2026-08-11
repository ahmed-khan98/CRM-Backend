// PM2 process manager config.
// IMPORTANT: keep `instances: 1` (fork mode) — Socket.IO in-memory state (active calls,
// presence, rooms) is NOT shared across PM2 cluster workers without a Redis adapter.
// Running >1 instance without socket.io-redis will randomly drop chat/call events.
//
// Usage on the VPS:
//   pm2 start deploy/ecosystem.config.cjs
//   pm2 save
//   pm2 startup   (enables auto-start on server reboot)

module.exports = {
  apps: [
    {
      name: "cms-backend",
      script: "src/index.js",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "500M",
      autorestart: true,
      watch: false,
    },
  ],
};
