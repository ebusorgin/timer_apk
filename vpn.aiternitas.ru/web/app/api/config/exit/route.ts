import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

const VALID_COUNTRIES = ['de', 'nl', 'us', 'gb', 'fr', 'ch', 'se', 'no', 'ca', 'au', 'ru', 'pl', 'ro', 'at', 'fi'];

export async function PUT(req: Request) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { country } = await req.json();
    if (!country || typeof country !== 'string') {
        return NextResponse.json({ error: "country required" }, { status: 400 });
    }
    const code = country.toLowerCase().slice(0, 2);
    if (!VALID_COUNTRIES.includes(code)) {
        return NextResponse.json({ error: "Invalid country code" }, { status: 400 });
    }

    await prisma.config.update({
        where: { userId: session.id },
        data: { exitCountry: code }
    });

    return NextResponse.json({ success: true, exitCountry: code });
}
