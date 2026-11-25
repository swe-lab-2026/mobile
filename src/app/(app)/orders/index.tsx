import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getOrders, OrderSummary } from '../../../api/account';
import { Badge, Card, Screen, statusTone } from '../../../components/Screen';
import { colors, shadow } from '../../../constants/theme';
import { useTx } from '../../../store/screen-texts';

export default function OrdersScreen() {
  const { tx, formatDateTime } = useTx();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await getOrders());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getOrders()
      .then((data) => {
        if (!active) return;
        setOrders(data);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <Screen
      title={tx.ordersTitle}
      subtitle={tx.ordersSubtitle}
      refreshing={refreshing}
      onRefresh={onRefresh}
    >
      {loading ? (
        <ActivityIndicator size="large" color={colors.brand} style={styles.loader} />
      ) : error ? (
        <Card>
          <Text style={styles.empty}>{tx.loadError}</Text>
        </Card>
      ) : orders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>{tx.noOrders}</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/')} style={styles.button}>
            <Text style={styles.buttonText}>{tx.browse}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        orders.map((o) => {
          const meta = [
            o.number ? `${tx.orderLabel} №${o.number}` : '',
            formatDateTime(o.createdAt),
            o.ticketCount != null ? `${tx.ticketsShort}: ${o.ticketCount}` : '',
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <TouchableOpacity
              key={o.id}
              activeOpacity={0.8}
              onPress={() => router.push({ pathname: '/orders/[id]', params: { id: o.id } })}
              style={styles.card}
            >
              <View style={styles.row}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {o.eventTitle}
                </Text>
                <Badge text={tx.orderStatus[o.status] ?? o.status} tone={statusTone(o.status)} />
              </View>
              <Text style={styles.meta}>{meta}</Text>
              <Text style={styles.price}>
                {o.total === 0 ? tx.free : `${o.total} ${o.currency}`}
              </Text>
            </TouchableOpacity>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 40 },
  emptyBox: { alignItems: 'center', marginTop: 32, gap: 16 },
  empty: { fontSize: 16, color: colors.muted, textAlign: 'center' },
  button: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  card: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eef0f3',
    ...shadow,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  eventTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.ink, lineHeight: 22 },
  meta: { marginTop: 8, fontSize: 13, lineHeight: 19, color: colors.muted },
  price: { marginTop: 10, fontSize: 16, fontWeight: '800', color: colors.ink },
});