import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';

describe('server HTTP endpoints', () => {
  let app;
  let server;
  let io;
  let request;

  beforeAll(() => {
    ({ app, server, io } = createServerApp({ corsOrigin: '*' }));
    request = supertest(app);
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    io.close();
  });

  it('serves the web client index page', async () => {
    const response = await request.get('/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<!DOCTYPE html>');
    expect(response.text).toContain('<div id="app">');
  });

  it('provides a placeholder cordova.js file', async () => {
    const response = await request.get('/cordova.js');
    expect(response.status).toBe(200);
    expect(response.type).toBe('application/javascript');
    expect(response.text.trim()).toBe('// Cordova.js placeholder');
  });

  it('configures socket.io with the expected path', () => {
    expect(io.opts.path).toBe('/socket.io/');
  });

  it('reports server health status via /api/health', async () => {
    const response = await request.get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 'ok',
    });
    expect(typeof response.body.uptimeSeconds).toBe('number');
    expect(typeof response.body.connections).toBe('number');
  });
});
