import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function generateKeys() {
    try {
        const { stdout: privateKey } = await execPromise('wg genkey');
        const { stdout: publicKey } = await execPromise(`echo '${privateKey.trim()}' | wg pubkey`);
        return { privateKey: privateKey.trim(), publicKey: publicKey.trim() };
    } catch (e) {
        console.warn("WG command failed, using mock keys (for local dev)");
        return { privateKey: "MOCK_PRIV", publicKey: "MOCK_PUB" };
    }
}

export async function addPeer(publicKey: string, ip: string) {
    const url = process.env.WG_MANAGER_URL;
    if (url) {
        try {
            const res = await fetch(`${url.replace(/\/$/, '')}/peers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ publicKey, address: ip })
            });
            if (!res.ok) {
                const err = await res.text();
                console.warn("wg-manager addPeer failed:", err);
            }
        } catch (e) {
            console.warn("Failed to add peer via wg-manager:", e);
        }
        return;
    }
    try {
        await execPromise(`wg set wg0 peer ${publicKey} allowed-ips ${ip}/32`);
    } catch (e) {
        console.warn("Failed to add peer to wg0 (expected locally):", e);
    }
}
