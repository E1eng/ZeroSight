/**
 * PM2 process manager config for the ZeroSight keeper.
 *
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs zerosight-keeper
 *   pm2 restart zerosight-keeper
 *   pm2 save && pm2 startup   # survive reboots
 *
 * PM2 auto-restarts the keeper on crash. Combined with the /health endpoint
 * (KEEPER_HEALTH_PORT) an external monitor can also detect a *hung* (not
 * crashed) process and bounce it.
 */
module.exports = {
  apps: [
    {
      name: "zerosight-keeper",
      script: "npx",
      args: "tsx script/markets/keeper-bot.ts",
      interpreter: "none",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: "500M",
      kill_timeout: 12000, // give graceful shutdown time to settle in-flight tick
      env: {
        NODE_ENV: "production",
        KEEPER_HEALTH_PORT: "8787"
      }
    }
  ]
};
