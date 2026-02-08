import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';

export async function POST(req: Request) {
    const { username, password } = await req.json();
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !await bcrypt.compare(password, user.password)) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signToken({ id: user.id, username: user.username });
    const response = NextResponse.json({ success: true, token });
    response.cookies.set('token', token, { httpOnly: true, path: '/' });
    return response;
}
