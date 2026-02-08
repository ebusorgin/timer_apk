"use client";
import React, { useEffect, useState } from 'react';

export default function Dashboard() {
    const [config, setConfig] = useState<any>(null);
    const [apkAvailable, setApkAvailable] = useState<boolean | null>(null);

    useEffect(() => {
        fetch('/api/config').then(r => {
            if (r.ok) {
                r.json().then(setConfig);
            }
        });
    }, []);

    useEffect(() => {
        fetch('/api/apk', { method: 'HEAD' })
            .then(r => setApkAvailable(r.ok))
            .catch(() => setApkAvailable(false));
    }, []);

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <h1 className="text-3xl font-bold mb-8">VPN Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-bold mb-4">Download App</h2>
                    <p className="mb-4 text-gray-400">Download the Android APK to connect. Traffic routes through Tor with selectable exit country.</p>
                    {apkAvailable === true ? (
                        <a href="/api/apk" download="vpn-app.apk" className="block w-full bg-green-600 hover:bg-green-500 text-white text-center py-3 rounded font-bold transition">
                            Download APK
                        </a>
                    ) : apkAvailable === false ? (
                        <div className="bg-amber-900/50 border border-amber-600/50 text-amber-200 px-4 py-3 rounded">
                            <p className="font-medium">APK пока недоступен</p>
                            <p className="text-sm mt-1 text-amber-300/80">Соберите APK локально: <code className="bg-black/30 px-1 rounded">./scripts/build-apk.sh</code> и загрузите в <code className="bg-black/30 px-1 rounded">web/public/</code></p>
                        </div>
                    ) : (
                        <div className="bg-gray-700/50 text-gray-400 py-3 rounded text-center">Проверка...</div>
                    )}
                </div>

                <div className="bg-gray-800 p-6 rounded-lg">
                    <h2 className="text-xl font-bold mb-4">Your Configuration</h2>
                    {config ? (
                        <pre className="bg-gray-900 p-4 rounded overflow-auto text-xs font-mono">
                            {JSON.stringify(config, null, 2)}
                        </pre>
                    ) : (
                        <p>Loading config...</p>
                    )}
                </div>
            </div>
        </div>
    );
}
