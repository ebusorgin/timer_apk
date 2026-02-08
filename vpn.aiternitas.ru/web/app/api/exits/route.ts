import { NextResponse } from 'next/server';

const EXIT_COUNTRIES: { code: string; name: string }[] = [
    { code: 'de', name: 'Germany' },
    { code: 'nl', name: 'Netherlands' },
    { code: 'us', name: 'United States' },
    { code: 'gb', name: 'United Kingdom' },
    { code: 'fr', name: 'France' },
    { code: 'ch', name: 'Switzerland' },
    { code: 'se', name: 'Sweden' },
    { code: 'no', name: 'Norway' },
    { code: 'ca', name: 'Canada' },
    { code: 'au', name: 'Australia' },
    { code: 'ru', name: 'Russia' },
    { code: 'pl', name: 'Poland' },
    { code: 'ro', name: 'Romania' },
    { code: 'at', name: 'Austria' },
    { code: 'fi', name: 'Finland' },
];

export async function GET() {
    return NextResponse.json(EXIT_COUNTRIES);
}
