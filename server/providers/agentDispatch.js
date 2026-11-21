import { readRequestBody } from './common/request.js';
import { admitSameSite } from './common/same-site.js';

/**
 * Server-Sent Events (SSE) & External Agent Dispatch Provider.
 * Allows authorized local agents and companion clients on the same origin or loopback
 * to dispatch navigation, exploration, cockpit control, and world simulation routes
 * into the running God's Eye View client in the browser.
 */

const clients = new Set();
const recentCommands = [];
const MAX_RECENT_COMMANDS = 20;

function broadcast(command) {
  recentCommands.push({ ...command, timestamp: Date.now() });
  if (recentCommands.length > MAX_RECENT_COMMANDS) {
    recentCommands.shift();
  }

  const payload = `data: ${JSON.stringify(command)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function agentDispatchProxy() {
  function install(middlewares) {
    middlewares.use('/api/agent', async (req, res) => {
      if (admitSameSite(req, res)) return;

      const url = new URL(req.url || '/', 'http://localhost');

      // GET /api/agent/status
      if (url.pathname === '/status' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: true,
            active: true,
            connectedClients: clients.size,
            uptimeSeconds: process.uptime(),
            recentCount: recentCommands.length,
          }),
        );
        return;
      }

      // GET /api/agent/events (Server-Sent Events)
      if (url.pathname === '/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        res.write(': connected to gods-eye-view agent stream\n\n');
        clients.add(res);

        const pingInterval = setInterval(() => {
          try {
            res.write(': ping\n\n');
          } catch {
            clearInterval(pingInterval);
            clients.delete(res);
          }
        }, 25000);

        req.on('close', () => {
          clearInterval(pingInterval);
          clients.delete(res);
        });
        return;
      }

      // POST /api/agent/command
      if (url.pathname === '/command' && req.method === 'POST') {
        try {
          const raw = await readRequestBody(req, 64 * 1024);
          const body = JSON.parse(raw || '{}');
          const action = body.action || (body.query ? 'explore' : null);

          if (!action) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                ok: false,
                error: 'Missing required "action" field in payload',
              }),
            );
            return;
          }

          const command = {
            id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            action,
            args: body.args || {},
            query: body.query || body.args?.query || body.args?.locationQuery,
            origin: body.origin || body.from || body.args?.from,
            destination: body.destination || body.to || body.args?.to,
            raw: body,
          };

          broadcast(command);

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: true,
              dispatched: true,
              commandId: command.id,
              action: command.action,
              connectedClients: clients.size,
            }),
          );
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              ok: false,
              error: err?.message || 'Failed to process command',
            }),
          );
        }
        return;
      }

      // GET /api/agent/recent
      if (url.pathname === '/recent' && req.method === 'GET') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, commands: recentCommands }));
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Agent endpoint not found' }));
    });
  }

  return {
    name: 'agent-dispatch-proxy',
    configureServer(server) {
      install(server.middlewares);
    },
    configurePreviewServer(server) {
      install(server.middlewares);
    },
  };
}
