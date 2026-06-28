import http from 'node:http';
import { logger } from '../utils/logger.js';

/**
 * Minimal HTTP server to keep the Replit container alive.
 * Replit's free tier puts the container to sleep after inactivity.
 * This server responds to pings from uptime monitors (e.g., UptimeRobot).
 */
const PORT = process.env.PORT ?? 3000;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
});

export function startKeepAlive(): void {
  server.listen(PORT, () => {
    logger.info(`Keep-alive server listening on port ${PORT}`);
  });
}
