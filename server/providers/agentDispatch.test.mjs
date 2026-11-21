import test from 'node:test';
import assert from 'node:assert/strict';
import { agentDispatchProxy } from './agentDispatch.js';
import { EventEmitter } from 'node:events';

function createMockServer() {
  const middlewares = [];
  return {
    middlewares: {
      use(path, handler) {
        middlewares.push({ path, handler });
      },
    },
    async dispatch(method, url, body = null, extraHeaders = {}) {
      const parsedUrl = new URL(url, 'http://localhost');
      for (const { path, handler } of middlewares) {
        if (parsedUrl.pathname.startsWith(path)) {
          const req = new EventEmitter();
          req.method = method;
          req.url = parsedUrl.pathname.slice(path.length) + parsedUrl.search;
          req.socket = { remoteAddress: '127.0.0.1' };
          req.headers = {
            host: 'localhost:4173',
            origin: 'http://localhost:4173',
            'content-type': 'application/json',
            ...extraHeaders,
          };

          let statusCode = 200;
          let responseBody = '';
          const headers = {};

          const res = {
            setHeader(k, v) {
              headers[k.toLowerCase()] = v;
            },
            writeHead(code, h) {
              statusCode = code;
              Object.assign(headers, h);
            },
            set statusCode(code) {
              statusCode = code;
            },
            get statusCode() {
              return statusCode;
            },
            write(chunk) {
              responseBody += chunk;
            },
            end(chunk) {
              if (chunk) responseBody += chunk;
            },
          };

          const p = handler(req, res);
          if (body) {
            req.emit('data', Buffer.from(JSON.stringify(body)));
          }
          req.emit('end');
          await p;
          return { statusCode, headers, body: responseBody };
        }
      }
      return { statusCode: 404, body: 'Not found' };
    },
  };
}

test('agentDispatchProxy provides status and command endpoints', async () => {
  const plugin = agentDispatchProxy();
  const server = createMockServer();
  plugin.configureServer(server);

  // Status check
  const statusRes = await server.dispatch('GET', '/api/agent/status');
  assert.equal(statusRes.statusCode, 200);
  const statusData = JSON.parse(statusRes.body);
  assert.equal(statusData.ok, true);
  assert.equal(statusData.active, true);

  // Command submission: explore
  const cmdRes = await server.dispatch('POST', '/api/agent/command', {
    action: 'explore',
    query: 'Savannah Historic District',
  });
  assert.equal(cmdRes.statusCode, 200);
  const cmdData = JSON.parse(cmdRes.body);
  assert.equal(cmdData.ok, true);
  assert.equal(cmdData.dispatched, true);
  assert.equal(cmdData.action, 'explore');

  // Command submission: fly_route
  const routeRes = await server.dispatch('POST', '/api/agent/command', {
    action: 'fly_route',
    from: 'Atlanta',
    to: 'Savannah',
  });
  assert.equal(routeRes.statusCode, 200);
  const routeData = JSON.parse(routeRes.body);
  assert.equal(routeData.ok, true);
  assert.equal(routeData.action, 'fly_route');

  // Recent commands verification
  const recentRes = await server.dispatch('GET', '/api/agent/recent');
  assert.equal(recentRes.statusCode, 200);
  const recentData = JSON.parse(recentRes.body);
  assert.equal(recentData.ok, true);
  assert.equal(recentData.commands.length, 2);
  assert.equal(recentData.commands[0].action, 'explore');
  assert.equal(recentData.commands[1].action, 'fly_route');

  // Security gate: refuse cross-origin & proxied requests with 403
  const crossOriginRes = await server.dispatch(
    'POST',
    '/api/agent/command',
    { action: 'explore', query: 'Austin' },
    { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
  );
  assert.equal(crossOriginRes.statusCode, 403);
  assert.equal(crossOriginRes.headers['access-control-allow-origin'], undefined);

  const proxiedRes = await server.dispatch('GET', '/api/agent/status', null, {
    'x-forwarded-for': '203.0.113.10',
  });
  assert.equal(proxiedRes.statusCode, 403);
});
