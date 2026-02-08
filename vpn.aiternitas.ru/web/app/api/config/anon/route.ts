import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { generateKeys, addPeer } from '@/lib/wg';

async function getServerPublicKey(): Promise<string> {
    if (process.env.SERVER_PUBLIC_KEY) return process.env.SERVER_PUBLIC_KEY;
    const url = process.env.WG_MANAGER_URL;
    if (url) {
        try {
            const res = await fetch(`${url.replace(/\/$/, '')}/server-key`, { cache: 'no-store' });
            if (res.ok) {
                const { publicKey } = await res.json();
                if (publicKey) return publicKey;
            }
        } catch (e) {
            console.warn('Failed to fetch server key from wg-manager:', e);
        }
    }
    return '';
}

export async function POST() {
    try {
        const count = await prisma.config.count();
        const ipSuffix = count + 2;
        const address = `10.0.0.${ipSuffix}`;
        const keys = await generateKeys();

        const user = await prisma.user.create({
            data: {
                username: `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                password: crypto.randomBytes(32).toString('hex'),
            },
        });

        await prisma.config.create({
            data: {
                userId: user.id,
                privateKey: keys.privateKey,
                publicKey: keys.publicKey,
                address,
            },
        });

        await addPeer(keys.publicKey, address);

        const token = signToken({ id: user.id });
        const serverPublicKey = await getServerPublicKey();
        const endpoint = process.env.SERVER_ENDPOINT || 'vpn.aiternitas.ru:51820';
        const [serverAddress, serverPortStr] = endpoint.split(':');
        const serverPort = parseInt(serverPortStr || '51820', 10);
        const dns = process.env.TOR_ENABLED === '1' ? '10.0.0.1' : '1.1.1.1';

        return NextResponse.json({
            token,
            interface: {
                privateKey: keys.privateKey,
                address: `${address}/32`,
                dns,
            },
            peer: {
                publicKey: serverPublicKey,
                endpoint,
                allowedIps: '0.0.0.0/0',
            },
            serverAddress,
            serverPort,
            allowedIPs: ['0.0.0.0/0'],
            dns: [dns],
            exitCountry: 'de',
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}
