import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { generateKeys, addPeer } from '@/lib/wg';

export async function POST(req: Request) {
    try {
        const { username, password } = await req.json();

        const exists = await prisma.user.findUnique({ where: { username } });
        if (exists) return NextResponse.json({ error: "User exists" }, { status: 400 });

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.user.create({
            data: { username, password: hashedPassword }
        });

        const count = await prisma.config.count();
        const ipSuffix = count + 2;
        const address = `10.0.0.${ipSuffix}`;

        const keys = await generateKeys();

        await prisma.config.create({
            data: {
                userId: user.id,
                privateKey: keys.privateKey,
                publicKey: keys.publicKey,
                address
            }
        });

        await addPeer(keys.publicKey, address);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
