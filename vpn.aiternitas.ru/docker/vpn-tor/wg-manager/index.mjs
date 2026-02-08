#!/usr/bin/env node
import { createServer } from 'http';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);
const PEERS_FILE = '/config/peers.json';

async function addPeer(publicKey, address) {
    await execAsync(`wg set wg0 peer ${publicKey} allowed-ips ${address}/32`);
    const peers = await loadPeers();
    peers.push({ publicKey, address });
    await savePeers(peers);
}

async function loadPeers() {
    try {
        if (existsSync(PEERS_FILE)) {
            const data = await readFile(PEERS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('Could not load peers:', e.message);
    }
    return [];
}

async function savePeers(peers) {
    await mkdir('/config', { recursive: true });
    await writeFile(PEERS_FILE, JSON.stringify(peers, null, 2));
}

async function restorePeers() {
    const peers = await loadPeers();
    for (const { publicKey, address } of peers) {
        try {
            await execAsync(`wg set wg0 peer ${publicKey} allowed-ips ${address}/32`);
            console.log(`Restored peer ${address}`);
        } catch (e) {
            console.warn(`Failed to restore peer ${address}:`, e.message);
        }
    }
}

const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.url === '/health') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'ok' }));
        return;
    }
    if (req.url === '/server-key' && req.method === 'GET') {
        const pub = process.env.SERVER_PUBLIC_KEY || '';
        res.writeHead(200);
        res.end(JSON.stringify({ publicKey: pub }));
        return;
    }
    if (req.method === 'POST' && req.url === '/peers') {
        let body = '';
        for await (const chunk of req) body += chunk;
        try {
            const { publicKey, address } = JSON.parse(body);
            if (!publicKey || !address) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'publicKey and address required' }));
                return;
            }
            await addPeer(publicKey.trim(), address.trim());
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: e.message }));
        }
        return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(9999, '0.0.0.0', () => {
    console.log('wg-manager listening on 9999');
});

export { restorePeers };
