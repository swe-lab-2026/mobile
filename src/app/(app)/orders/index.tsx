import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getOrders, OrderSummary } from '../../../api/account';
import { Badge, Card, Screen, statusTone } from '../../../components/Screen';
import { useTx } from '../../../store/screen-texts';

const C = {
  brand: '#1a7a3c',
  brandDark: '#166534',
  brandSoft: '#e8f3ec',
  ink: '#111827',
  text: '#374151',
  muted: '#6b7280',
  card: '#ffffff',
};

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
    load().finally(() => setLoading(false));
  }, [load]);

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
        <ActivityIndicator size="large" color={C.brand} style={styles.loader} />
      ) : error ? (
        <Card>
          <Text style={styles.empty}>{tx.loadError}</Text>
        </Card>
      ) : orders.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.empty}>{tx.noOrders}</Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/')}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{tx.browse}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        orders.map((o) => {
          const title = o.eventTitle || (o.number ? `${tx.orderLabel} №${o.number}` : tx.orderLabel);

          const meta = [
            o.eventTitle && o.number ? `${tx.orderLabel} №${o.number}` : '',
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
                  {title}
                </Text>
                <Badge text={tx.orderStatus[o.status] ?? o.status} tone={statusTone(o.status)} />
              </View>

              {o.ticketNames ? (
                <View style={styles.ticketChip}>
                  <Text style={styles.ticketChipText} numberOfLines={2}>
                    🎟 {o.ticketNames}
                  </Text>
                </View>
              ) : null}

              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
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
  empty: { fontSize: 16, color: C.muted, textAlign: 'center' },
  button: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  card: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eef0f3',
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  eventTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: C.ink, lineHeight: 22 },
  ticketChip: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: C.brandSoft,
  },
  ticketChipText: { fontSize: 13, fontWeight: '600', color: C.brandDark },
  meta: { marginTop: 10, fontSize: 13, lineHeight: 19, color: C.muted },
  price: { marginTop: 10, fontSize: 16, fontWeight: '800', color: C.ink },
});