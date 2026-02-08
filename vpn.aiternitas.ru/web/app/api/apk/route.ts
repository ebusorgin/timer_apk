import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const apkPath = () => join(process.cwd(), 'public', 'vpn-app.apk');

// HEAD: quick availability check without downloading
export async function HEAD() {
    return existsSync(apkPath())
        ? new NextResponse(null, { status: 200, headers: { 'Content-Type': 'application/vnd.android.package-archive' } })
        : new NextResponse(null, { status: 404 });
}

// GET: serve APK file
export async function GET() {
    const path = apkPath();
    if (!existsSync(path)) {
        return new NextResponse('APK not found', { status: 404 });
    }
    const buffer = await readFile(path);
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.android.package-archive',
            'Content-Disposition': 'attachment; filename="vpn-app.apk"',
        },
    });
}
