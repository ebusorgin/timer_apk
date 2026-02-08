import { StyleSheet, Button, View, Text, Alert, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://vpn.aiternitas.ru/api';

let WireGuardVpnModule: any;
if (Platform.OS !== 'web') {
  try {
    WireGuardVpnModule = require('react-native-wireguard-vpn').default;
  } catch {
    WireGuardVpnModule = null;
  }
}

export default function HomeScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [config, setConfig] = useState<any>(null);
  const [exits, setExits] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [vpnStatus, setVpnStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  useEffect(() => {
    (async () => {
      const stored = await SecureStore.getItemAsync('token');
      if (stored) {
        setToken(stored);
      } else {
        try {
          const res = await axios.post(`${API_URL}/config/anon`);
          const t = res.data.token;
          if (t) {
            await SecureStore.setItemAsync('token', t);
            setToken(t);
            const { token: _, ...cfg } = res.data;
            setConfig(cfg);
          }
        } catch (e) {
          Alert.alert('Ошибка', 'Не удалось подключиться к серверу');
        } finally {
          setLoading(false);
        }
      }
    })();
  }, []);

  useEffect(() => {
    if (token && !config) {
      fetchConfig();
    } else if (token && config) {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (Platform.OS !== 'web' && WireGuardVpnModule) {
      const interval = setInterval(async () => {
        try {
          const status = await WireGuardVpnModule.getStatus();
          setVpnStatus(status?.isConnected ? 'connected' : 'disconnected');
        } catch {
          setVpnStatus('disconnected');
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, []);

  const fetchExits = () => {
    axios.get(`${API_URL}/exits`).then((res) => setExits(res.data || [])).catch(() => setExits([]));
  };

  const fetchConfig = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/config`, { headers: { Authorization: `Bearer ${token}` } });
      setConfig(res.data);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось получить конфигурацию');
    } finally {
      setLoading(false);
    }
  };

  const setExitCountry = async (code: string) => {
    if (!token) return;
    try {
      await axios.put(`${API_URL}/config/exit`, { country: code }, { headers: { Authorization: `Bearer ${token}` } });
      setConfig((c: any) => (c ? { ...c, exitCountry: code } : null));
    } catch {
      Alert.alert('Ошибка', 'Не удалось сменить страну');
    }
  };

  const connectVpn = async () => {
    if (!config || Platform.OS === 'web') {
      Alert.alert('Инфо', 'Соберите APK для подключения. Expo Go не поддерживает VPN.');
      return;
    }
    if (!WireGuardVpnModule) {
      Alert.alert('Ошибка', 'Модуль WireGuard недоступен. Соберите APK.');
      return;
    }
    setConnecting(true);
    try {
      await WireGuardVpnModule.initialize();
      const wgConfig = {
        privateKey: config.interface.privateKey,
        publicKey: config.peer.publicKey,
        serverAddress: config.serverAddress || config.peer.endpoint?.split(':')[0],
        serverPort: config.serverPort || 51820,
        allowedIPs: config.allowedIPs || ['0.0.0.0/0'],
        dns: config.dns || ['1.1.1.1'],
      };
      await WireGuardVpnModule.connect(wgConfig);
      setVpnStatus('connected');
    } catch (e: any) {
      Alert.alert('Ошибка подключения', e?.message || 'Неизвестная ошибка');
      setVpnStatus('error');
    } finally {
      setConnecting(false);
    }
  };

  const disconnectVpn = async () => {
    if (Platform.OS === 'web' || !WireGuardVpnModule) return;
    setConnecting(true);
    try {
      await WireGuardVpnModule.disconnect();
      setVpnStatus('disconnected');
    } catch {
      setVpnStatus('disconnected');
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (token) fetchExits();
  }, [token]);

  if (loading && !config) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>VPN</Text>

        <View style={styles.card}>
          <Text style={styles.statusLabel}>
            {vpnStatus === 'connected' ? 'Подключено' : vpnStatus === 'connecting' ? 'Подключение...' : 'Отключено'}
          </Text>
          <View style={styles.buttonRow}>
            <Button
              title={vpnStatus === 'connected' ? 'Выключить' : 'Включить'}
              onPress={vpnStatus === 'connected' ? disconnectVpn : connectVpn}
              disabled={connecting || !config}
            />
          </View>
        </View>

        {exits.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Страна выхода</Text>
            <View style={styles.exitGrid}>
              {exits.slice(0, 8).map(({ code, name }) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.exitChip, config?.exitCountry === code && styles.exitChipActive]}
                  onPress={() => setExitCountry(code)}
                >
                  <Text style={styles.exitChipText}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {config && (
          <View style={styles.config}>
            <Text style={styles.label}>Сервер: {config.peer?.endpoint}</Text>
            <Text style={styles.label}>Выход: {config.exitCountry?.toUpperCase() || '-'}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 16, color: '#666' },
  title: { fontSize: 22, marginBottom: 24, textAlign: 'center', fontWeight: 'bold', marginTop: 8 },
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, marginBottom: 16 },
  statusLabel: { fontSize: 16, marginBottom: 12, fontWeight: '600' },
  buttonRow: { marginTop: 8 },
  sectionTitle: { fontSize: 16, marginBottom: 12, fontWeight: '600' },
  exitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exitChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#e0e0e0', borderRadius: 20 },
  exitChipActive: { backgroundColor: '#4CAF50' },
  exitChipText: { fontSize: 14 },
  config: { marginTop: 8, padding: 15, backgroundColor: '#e8f5e9', borderRadius: 8 },
  label: { fontSize: 14, marginBottom: 4 },
});
