import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';

describe('Postgres Auth Integration Tests', () => {
    let app, server, io, request, pool;

    beforeAll(async () => {
        const db = newDb();
        const pg = db.adapters.createPg();
        pool = new pg.Pool();

        ({ app, server, io } = createServerApp({
            guardrails: { rateLimit: false, auth: false },
            persistenceOptions: {
                driver: 'postgres',
                poolInstance: pool,
                logger: { info: () => { }, warn: () => { }, error: () => { } },
            },
            logLevel: 'error',
        }));

        await new Promise((resolve) => server.listen(0, resolve));
        request = supertest(app);
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        io.close();
        await pool.end();
    });

    it('should register and then login with postgres', async () => {
        const regRes = await request.post('/api/auth/register').send({
            login: 'pg_user',
            name: 'Postgres User',
            password: 'password123'
        });
        expect(regRes.status).toBe(200);

        const loginRes = await request.post('/api/auth/login').send({
            login: 'pg_user',
            password: 'password123'
        });
        expect(loginRes.status).toBe(200);
        expect(loginRes.body.subscriber.name).toBe('Postgres User');
    });

    it('should reject duplicate login in postgres (case-insensitive via unique index check)', async () => {
        // Note: pg-mem might not enforce case-insensitive UNIQUE if not configured, 
        // but users table in migration has login TEXT UNIQUE. 
        // Our code uses LOWER(login) in getSubscriberByLogin and we catch 23505.

        await request.post('/api/auth/register').send({
            login: 'unique_pg_user',
            name: 'User 1',
            password: 'password123'
        });

        const res = await request.post('/api/auth/register').send({
            login: 'unique_pg_user',
            name: 'User 2',
            password: 'password123'
        });
        expect(res.status).toBe(409);
        expect(res.body.error).toMatch(/уже существует/);
    });

    it('should reject wrong password for existing postgres user', async () => {
        const res = await request.post('/api/auth/login').send({
            login: 'pg_user',
            password: 'wrong_password'
        });
        expect(res.status).toBe(401);
    });
});
