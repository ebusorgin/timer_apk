import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';

const SECRET = process.env.JWT_SECRET || 'secret';

export function signToken(payload: any) {
    return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export async function getSession() {
    try {
        const cookieStore = await cookies();
        let token = cookieStore.get('token')?.value;

        if (!token) {
            const headersList = await headers();
            const authHeader = headersList.get('authorization');
            if (authHeader?.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
        }

        if (!token) return null;
        return jwt.verify(token, SECRET) as any;
    } catch {
        return null;
    }
}
