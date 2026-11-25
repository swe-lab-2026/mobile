import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { getOrder, OrderDetail } from '../../../api/account';
import { Badge, Card, Screen, statusTone } from '../../../components/Screen';
import { colors } from '../../../constants/theme';
import { useTx } from '../../../store/screen-texts';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tx, formatDateTime } = useTx();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getOrder(id)
      .then((data) => {
        if (active) setOrder(data);
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
  }, [id]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  // A missing route param is an error, not an endless spinner.
  if (!id || loading || error || !order) {
    return (
      <Screen backLabel={tx.backToOrders} onBack={back}>
        {id && loading ? (
          <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
        ) : (
          <Card>
            <Text style={styles.muted}>{tx.loadError}</Text>
          </Card>
        )}
      </Screen>
    );
  }

  const paid = order.status === 'PAID';
  const money = (n: number) => (n === 0 ? tx.free : `${n} ${order.currency}`);
  const eventMeta = [formatDateTime(order.eventStartsAt, order.eventTimeZone), order.eventPlace].filter(Boolean).join(' · ');

  return (
    <Screen backLabel={tx.backToOrders} onBack={back}>
      {paid ? (
        <Card>
          <View style={styles.center}>
            <View style={styles.checkCircle}>
              <Text style={styles.check}>✓</Text>
            </View>
            <Text style={styles.heroTitle}>{tx.registered}</Text>
            <Text style={styles.heroSub}>{tx.registeredSub}</Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={styles.label}>{tx.orderLabel}</Text>
            <Text style={styles.mono}>#{order.number ?? order.id}</Text>
          </View>
          <Badge text={tx.orderStatus[order.status] ?? order.status} tone={statusTone(order.status)} />
        </View>

        <View style={styles.divider} />
        <Text style={styles.label}>{tx.eventLabel}</Text>
        <Text style={styles.eventTitle}>{order.eventTitle || '—'}</Text>
        {eventMeta ? <Text style={styles.muted}>{eventMeta}</Text> : null}

        {order.lines.length > 0 ? (
          <>
            <View style={styles.divider} />
            <Text style={styles.label}>{tx.ticketsLabel}</Text>
            {order.lines.map((l, i) => (
              <View key={i} style={[styles.row, styles.line]}>
                <Text style={styles.lineText}>
                  {l.name} × {l.quantity}
                </Text>
                <Text style={styles.lineText}>{money(l.total)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.divider} />
        <View style={styles.row}>
          <Text style={styles.totalText}>{tx.total}</Text>
          <Text style={styles.totalText}>{money(order.total)}</Text>
        </View>
      </Card>

      {order.tickets.length > 0 ? <Text style={styles.section}>{tx.yourTickets}</Text> : null}

      {order.tickets.map((t) => (
        <Card key={t.id}>
          <View style={styles.qrWrap}>
            {t.qrPayload ? (
              <View style={styles.qrBox}>
                <QRCode value={t.qrPayload} size={190} />
              </View>
            ) : (
              <Text style={styles.muted}>{tx.noQr}</Text>
            )}
          </View>

          <View style={styles.row}>
            <Text style={styles.eventTitle} numberOfLines={2}>
              {order.eventTitle || t.typeName || tx.ticketsLabel}
            </Text>
            <Badge text={tx.ticketStatus[t.status] ?? t.status} tone={statusTone(t.status)} />
          </View>
          {/* Type name goes under the event title; skip it when it is already the title. */}
          {t.typeName && order.eventTitle ? <Text style={styles.muted}>{t.typeName}</Text> : null}

          {t.attendeeName ? (
            <View style={styles.field}>
              <Text style={styles.label}>{tx.participant}</Text>
              <Text style={styles.value}>{t.attendeeName}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>{tx.ticketId}</Text>
            <Text style={styles.mono}>{t.id}</Text>
          </View>

          <Text style={styles.hint}>{tx.showQr}</Text>
        </Card>
      ))}

      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/')} style={styles.button}>
        <Text style={styles.buttonText}>{tx.otherEvents}</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },

  checkCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  check: { fontSize: 32, fontWeight: '800', color: colors.brandDark },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  heroSub: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.muted, textAlign: 'center' },

  label: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  mono: { fontSize: 13, color: colors.ink, fontFamily: 'Courier' },
  value: { fontSize: 15, fontWeight: '600', color: colors.ink },
  eventTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#f0f1f5', marginVertical: 14 },
  line: { marginTop: 6 },
  lineText: { fontSize: 15, color: colors.text },
  totalText: { fontSize: 16, fontWeight: '800', color: colors.ink },

  section: { marginTop: 8, marginBottom: 12, fontSize: 20, fontWeight: '800', color: colors.ink },
  qrWrap: { alignItems: 'center', marginBottom: 18 },
  qrBox: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.line,
  },
  field: { marginTop: 12 },
  hint: { marginTop: 14, fontSize: 13, lineHeight: 19, color: colors.muted },

  button: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});