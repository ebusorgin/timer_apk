import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import supertest from 'supertest';
import { createServerApp } from '../../server/app.mjs';
import jwt from 'jsonwebtoken';

const dataDir = path.join(os.tmpdir(), 'conf-auth-all-' + Date.now() + '-' + Math.random().toString(36).slice(2));

describe('Auth Comprehensive Tests', () => {
    let app, server, io, request;

    beforeAll(async () => {
        ({ app, server, io } = createServerApp({
            dataDir,
            guardrails: { rateLimit: false, auth: false },
            logLevel: 'error',
        }));
        await new Promise((resolve) => server.listen(0, resolve));
        request = supertest(app);
    });

    afterAll(async () => {
        await new Promise((resolve) => server.close(resolve));
        io.close();
    });

    describe('Registration Cases', () => {
        it('should register a user successfully', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'valid_user',
                name: 'Valid Name',
                password: 'password123'
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.subscriber).toBeDefined();
            expect(res.body.token).toBeDefined();
        });

        it('should reject duplicate login (exact match)', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'valid_user',
                name: 'Another Name',
                password: 'password_new'
            });
            expect(res.status).toBe(409);
            expect(res.body.error).toMatch(/уже существует/);
        });

        it('should reject duplicate login (case-insensitive)', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'VALID_USER',
                name: 'Another Name',
                password: 'password_new'
            });
            expect(res.status).toBe(409);
        });

        it('should reject registration with missing password', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'no_pass',
                name: 'No Pass'
            });
            expect(res.status).toBe(400);
        });

        it('should reject registration with empty login', async () => {
            const res = await request.post('/api/auth/register').send({
                login: '',
                name: 'Empty Login',
                password: 'password123'
            });
            expect(res.status).toBe(400);
        });

        it('should reject password shorter than 4 characters', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'short_pass',
                name: 'Short Pass',
                password: '123'
            });
            expect(res.status).toBe(400);
        });

        it('should reject name longer than 64 characters', async () => {
            const longName = 'A'.repeat(65);
            const res = await request.post('/api/auth/register').send({
                login: 'long_name',
                name: longName,
                password: 'password123'
            });
            expect(res.status).toBe(400);
        });

        it('should trim whitespace from login and name', async () => {
            const res = await request.post('/api/auth/register').send({
                login: '  trimmed_user  ',
                name: '  Trimmed Name  ',
                password: 'password123'
            });
            expect(res.status).toBe(200);
            expect(res.body.subscriber.login).toBe('trimmed_user');
            expect(res.body.subscriber.name).toBe('Trimmed Name');
        });

        it('should not allow setting role to admin during registration', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'fake_admin',
                name: 'Fake Admin',
                password: 'password123',
                role: 'admin'
            });
            expect(res.status).toBe(200);
            expect(res.body.subscriber.role).not.toBe('admin');
        });

        it('should handle special characters and emojis in name', async () => {
            const res = await request.post('/api/auth/register').send({
                login: 'emoji_user',
                name: '🚀 Star ⭐',
                password: 'password123'
            });
            expect(res.status).toBe(200);
            expect(res.body.subscriber.name).toBe('🚀 Star ⭐');
        });
    });

    describe('Login Cases', () => {
        beforeAll(async () => {
            await request.post('/api/auth/register').send({
                login: 'login_test_user',
                name: 'Login Test',
                password: 'secret_password_123'
            });
        });

        it('should login successfully with correct credentials', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'login_test_user',
                password: 'secret_password_123'
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.subscriber.login).toBe('login_test_user');

            // Verify JWT
            const decoded = jwt.decode(res.body.token);
            expect(decoded.sub).toBe(res.body.subscriber.id);
        });

        it('should login successfully with case-insensitive login', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'LOGIN_TEST_USER',
                password: 'secret_password_123'
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should reject login with wrong password', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'login_test_user',
                password: 'wrong_password'
            });
            expect(res.status).toBe(401);
            expect(res.body.error).toMatch(/Неверный логин или пароль/);
        });

        it('should reject login for non-existent user', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'i_dont_exist',
                password: 'some_password'
            });
            expect(res.status).toBe(401);
        });

        it('should reject login with missing fields', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'login_test_user'
            });
            expect(res.status).toBe(400);
        });

        it('should reject login with empty password', async () => {
            const res = await request.post('/api/auth/login').send({
                login: 'login_test_user',
                password: ''
            });
            expect(res.status).toBe(400);
        });
    });

    describe('Persistence Continuity', () => {
        it('should persist a user and allow login after server "restart"', async () => {
            // Register
            await request.post('/api/auth/register').send({
                login: 'persist_user',
                name: 'Persist',
                password: 'password123'
            });

            // Shutdown
            await new Promise((resolve) => server.close(resolve));
            io.close();

            // Restart
            ({ app, server, io } = createServerApp({
                dataDir,
                guardrails: { rateLimit: false, auth: false },
                logLevel: 'error',
            }));
            await new Promise((resolve) => server.listen(0, resolve));
            const newRequest = supertest(app);

            // Login
            const res = await newRequest.post('/api/auth/login').send({
                login: 'persist_user',
                password: 'password123'
            });
            expect(res.status).toBe(200);
            expect(res.body.subscriber.name).toBe('Persist');
        });
    });
});
