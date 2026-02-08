import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

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

export async function GET(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const config = await prisma.config.findUnique({ where: { userId: session.id } });
    if (!config) return NextResponse.json({ error: "No config" }, { status: 404 });

    const serverPublicKey = await getServerPublicKey();
    const endpoint = process.env.SERVER_ENDPOINT || 'vpn.aiternitas.ru:51820';
    const [serverAddress, serverPortStr] = endpoint.split(':');
    const serverPort = parseInt(serverPortStr || '51820', 10);

    const dns = process.env.TOR_ENABLED === '1' ? '10.0.0.1' : '1.1.1.1';
    return NextResponse.json({
        interface: {
            privateKey: config.privateKey,
            address: `${config.address}/32`,
            dns
        },
        peer: {
            publicKey: serverPublicKey,
            endpoint,
            allowedIps: "0.0.0.0/0"
        },
        serverAddress,
        serverPort,
        allowedIPs: ["0.0.0.0/0"],
        dns: [dns],
        exitCountry: config.exitCountry
    });
}
