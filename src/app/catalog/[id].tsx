import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createOrder } from '../../api/account';
import { ApiError, apiRequest } from '../../api/client';
import { CatalogEvent, getCatalogEvents } from '../../api/events';
import type { TicketType } from '../../api/organizer';
import { AppHeader } from '../../components/AppHeader';
import { BRAND } from '../../components/Logo';
import { useAuth } from '../../store/auth-context';
import { useLanguage } from '../../store/language-context';

type QuantityMap = Record<string, number>;

const DATE_LOCALE = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' } as const;

function dateTime(value: string | null | undefined, locale: string) {
  if (!value) return locale.startsWith('ru') ? 'Дата не указана' : locale.startsWith('kk') ? 'Күні көрсетілмеген' : 'Date not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale.startsWith('ru') ? 'Дата не указана' : locale.startsWith('kk') ? 'Күні көрсетілмеген' : 'Date not available';
  return date.toLocaleString(locale, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function money(value: number, currency = 'KZT', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(value);
}

function numericPrice(ticket: TicketType) {
  const value = Number(ticket.price);
  return Number.isFinite(value) ? value : 0;
}

export default function CatalogEventDetailsScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const eventId = Array.isArray(params.id) ? params.id[0] : params.id;
  const auth: any = useAuth();
  const { lang } = useLanguage();
  const locale = DATE_LOCALE[lang];
  const text = {
    ru: { back: 'Все мероприятия', notFound: 'Мероприятие не найдено', unavailable: 'Возможно, это мероприятие больше недоступно в афише.', when: 'Когда', where: 'Где', about: 'О мероприятии', noDescription: 'Описание мероприятия не добавлено.', organizer: 'Связаться с организатором', tickets: 'Билеты', closes: 'Регистрация закрывается', selectTickets: 'Выберите количество билетов', ticketLoadError: 'Не удалось загрузить билеты. Возможно, публичному каталогу нужен доступ к типам билетов.', noTickets: 'Для этого мероприятия пока нет доступных билетов.', free: 'Бесплатно', perOrder: 'за заказ', promo: 'Промокод', optional: 'необязательно', promoPlaceholder: 'Введите промокод', apply: 'Применить', total: 'Итого', continue: 'Продолжить', signIn: 'Войти для регистрации', accountNote: 'Для получения билета нужна учётная запись BiletFlow.', create: 'Создать аккаунт', dateUnavailable: 'Дата не указана', organizerTitle: 'Организатор', organizerUnavailable: 'Контактные данные организатора не указаны в публичном каталоге.', promoUnavailable: 'Проверка промокода пока не подключена к серверу.', registrationTitle: 'Регистрация', checkoutUnavailable: 'Оформление билетов пока не подключено. Заказ не создан.', backToEvents: 'К мероприятиям', locationUnavailable: 'Место не указано', eventCategory: 'МЕРОПРИЯТИЕ', perOrderPrefix: 'за заказ', remove: 'Уменьшить количество', add: 'Увеличить количество', orderErrorTitle: 'Ошибка', orderError: 'Не удалось оформить заказ. Попробуйте ещё раз.' },
    kk: { back: 'Барлық іс-шаралар', notFound: 'Іс-шара табылмады', unavailable: 'Бұл іс-шара афишада енді қолжетімсіз болуы мүмкін.', when: 'Қашан', where: 'Қайда', about: 'Іс-шара туралы', noDescription: 'Іс-шара сипаттамасы қосылмаған.', organizer: 'Ұйымдастырушымен байланысу', tickets: 'Билеттер', closes: 'Тіркелу аяқталады', selectTickets: 'Билет санын таңдаңыз', ticketLoadError: 'Билеттерді жүктеу мүмкін болмады. Ашық каталогқа билет түрлеріне рұқсат қажет болуы мүмкін.', noTickets: 'Бұл іс-шараға әзірге қолжетімді билеттер жоқ.', free: 'Тегін', perOrder: 'бір тапсырысқа', promo: 'Промокод', optional: 'міндетті емес', promoPlaceholder: 'Промокодты енгізіңіз', apply: 'Қолдану', total: 'Барлығы', continue: 'Жалғастыру', signIn: 'Тіркелу үшін кіріңіз', accountNote: 'Билет алу үшін BiletFlow аккаунты қажет.', create: 'Аккаунт құру', dateUnavailable: 'Күні көрсетілмеген', organizerTitle: 'Ұйымдастырушы', organizerUnavailable: 'Ашық каталогта ұйымдастырушының байланыс ақпараты жоқ.', promoUnavailable: 'Промокодты тексеру серверге әлі қосылмаған.', registrationTitle: 'Тіркелу', checkoutUnavailable: 'Билет рәсімдеу әлі қосылмаған. Тапсырыс жасалған жоқ.', backToEvents: 'Іс-шараларға оралу', locationUnavailable: 'Өтетін орны көрсетілмеген', eventCategory: 'ІС-ШАРА', perOrderPrefix: 'бір тапсырысқа', remove: 'Санын азайту', add: 'Санын көбейту', orderErrorTitle: 'Қате', orderError: 'Тапсырысты рәсімдеу мүмкін болмады. Қайталап көріңіз.' },
    en: { back: 'All events', notFound: 'Event not found', unavailable: 'This event may no longer be available in the catalog.', when: 'When', where: 'Where', about: 'About the event', noDescription: 'No event description has been provided.', organizer: 'Ask the organizer', tickets: 'Tickets', closes: 'Registration closes', selectTickets: 'Select the number of tickets you want', ticketLoadError: 'Ticket options could not be loaded. The public ticket-types endpoint may require backend access changes.', noTickets: 'No tickets are currently available for this event.', free: 'Free', perOrder: 'per order', promo: 'Promo code', optional: 'optional', promoPlaceholder: 'Enter promo code', apply: 'Apply', total: 'Total', continue: 'Continue', signIn: 'Sign in to register', accountNote: 'You need a BiletFlow account to get a ticket.', create: 'Create one', dateUnavailable: 'Date not available', organizerTitle: 'Organizer', organizerUnavailable: 'Organizer contact information is not included in the current public catalog response.', promoUnavailable: 'Promo-code validation is not connected to the backend yet.', registrationTitle: 'Registration', checkoutUnavailable: 'Ticket checkout is not connected yet. No order has been created.', backToEvents: 'Back to events', locationUnavailable: 'Location not specified', eventCategory: 'EVENT', perOrderPrefix: 'per order', remove: 'Decrease quantity', add: 'Increase quantity', orderErrorTitle: 'Error', orderError: 'Could not place the order. Please try again.' },
  }[lang];
  const isAuthenticated = Boolean(auth.isAuthenticated || auth.user || auth.accessToken || auth.token);

  const [event, setEvent] = useState<CatalogEvent | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [quantities, setQuantities] = useState<QuantityMap>({});
  const [loading, setLoading] = useState(true);
  const [ticketError, setTicketError] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const events = await getCatalogEvents();
      setEvent(events.find((item) => item.id === eventId) ?? null);
    } catch {
      setEvent(null);
    }

    try {
      const rows = await apiRequest<TicketType[]>(
        `/events/${encodeURIComponent(eventId)}/ticket-types`,
        { skipAuth: true },
      );
      const publicRows = (Array.isArray(rows) ? rows : []).filter((ticket) => !ticket.is_hidden);
      setTicketTypes(publicRows);
      setTicketError(false);
    } catch {
      setTicketTypes([]);
      setTicketError(true);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const total = useMemo(() => ticketTypes.reduce((sum, ticket) => {
    return sum + numericPrice(ticket) * (quantities[ticket.id] ?? 0);
  }, 0), [ticketTypes, quantities]);

  const selectedItems = useMemo(
    () =>
      ticketTypes
        .filter((ticket) => (quantities[ticket.id] ?? 0) > 0)
        .map((ticket) => ({ ticketTypeId: ticket.id, quantity: quantities[ticket.id] })),
    [ticketTypes, quantities],
  );
  const hasSelection = selectedItems.length > 0;

  function changeQuantity(ticket: TicketType, delta: number) {
    setQuantities((current) => {
      const next = { ...current };
      const old = next[ticket.id] ?? 0;
      const min = Math.max(1, ticket.min_per_order || 1);
      const max = Math.max(1, ticket.max_per_order || 10);
      const proposed = old + delta;
      if (proposed < min) {
        if (delta < 0) delete next[ticket.id]; // dropping below the minimum clears it
        else next[ticket.id] = min;            // first tap jumps to the minimum
      } else {
        next[ticket.id] = Math.min(max, proposed);
      }
      return next;
    });
  }

  function applyPromo() {
    if (!promoCode.trim()) return;
    setPromoMessage(text.promoUnavailable);
  }

  async function continueToRegister() {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!eventId || !hasSelection || submitting) return;

    setSubmitting(true);
    try {
      const order = await createOrder({
        eventId,
        items: selectedItems,
        promoCode: promoCode.trim() || undefined,
      });
      setQuantities({});
      if (order.paymentUrl) {
        await Linking.openURL(order.paymentUrl).catch(() => {});
      }
      router.replace({ pathname: '/orders/[id]', params: { id: order.id } });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        router.push('/login');
      } else {
        Alert.alert(
          text.orderErrorTitle,
          e instanceof ApiError && e.message ? e.message : text.orderError,
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <AppHeader />
        <View style={styles.center}><ActivityIndicator size="large" color={BRAND} /></View>
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <AppHeader />
        <View style={styles.center}>
          <Text style={styles.notFoundTitle}>{text.notFound}</Text>
          <Text style={styles.muted}>{text.unavailable}</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/')}>
            <Text style={styles.primaryButtonText}>{text.backToEvents}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const location = [event.venueName, event.venueAddress, event.city].filter(Boolean).join(', ') || text.locationUnavailable;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable style={styles.backLink} onPress={() => router.replace('/')}>
          <Text style={styles.backText}>‹  {text.back}</Text>
        </Pressable>

        <View style={styles.columns}>
          <View style={styles.eventCard}>
            <Text style={styles.category}>{event.category?.toUpperCase() || text.eventCategory}</Text>
            <Text style={styles.eventTitle}>{event.title}</Text>

            <View style={styles.infoRow}>
              <View style={styles.infoColumn}>
                <Text style={styles.infoLabel}>{text.when}</Text>
                <Text style={styles.infoValue}>{dateTime(event.startsAt, locale)} — {dateTime(event.endsAt, locale)}</Text>
              </View>
              <View style={styles.infoColumn}>
                <Text style={styles.infoLabel}>{text.where}</Text>
                <Text style={styles.infoValue}>{location}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{text.about}</Text>
            <Text style={styles.description}>{event.description?.trim() || text.noDescription}</Text>
            <Pressable onPress={() => Alert.alert(text.organizerTitle, text.organizerUnavailable)}>
              <Text style={styles.organizerLink}>{text.organizer}</Text>
            </Pressable>
          </View>

          <View style={styles.ticketCard}>
            <Text style={styles.ticketHeading}>{text.tickets}</Text>
            <Text style={styles.muted}>{event.registrationEndsAt ? `${text.closes} ${dateTime(event.registrationEndsAt, locale)}` : text.selectTickets}</Text>
            {ticketError ? (
              <Text style={styles.inlineNotice}>{text.ticketLoadError}</Text>
            ) : ticketTypes.length === 0 ? (
              <Text style={styles.inlineNotice}>{text.noTickets}</Text>
            ) : ticketTypes.map((ticket) => {
              const quantity = quantities[ticket.id] ?? 0;
              const price = numericPrice(ticket);
              const currency = ticket.currency || 'KZT';
              return (
                <View key={ticket.id} style={styles.ticketType}>
                  <View style={styles.ticketTopLine}>
                    <Text style={styles.ticketName}>{ticket.name}</Text>
                    <Text style={styles.ticketPrice}>{ticket.is_free || price === 0 ? text.free : money(price, currency, locale)}</Text>
                  </View>
                  {ticket.description ? <Text style={styles.ticketDescription}>{ticket.description}</Text> : null}
                  <View style={styles.ticketBottomLine}>
                    <Text style={styles.limitText}>0–{ticket.max_per_order || 10} {text.perOrder}</Text>
                    <View style={styles.quantityControl}>
                      <Pressable accessibilityLabel={`${text.remove} ${ticket.name}`} style={styles.quantityButton} onPress={() => changeQuantity(ticket, -1)} disabled={quantity <= 0}>
                        <Text style={[styles.quantityButtonText, quantity <= 0 && styles.disabledText]}>−</Text>
                      </Pressable>
                      <Text style={styles.quantityValue}>{quantity}</Text>
                      <Pressable accessibilityLabel={`${text.add} ${ticket.name}`} style={styles.quantityButton} onPress={() => changeQuantity(ticket, 1)} disabled={quantity >= (ticket.max_per_order || 10)}>
                        <Text style={styles.quantityButtonText}>＋</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={styles.separator} />
            <Text style={styles.promoLabel}>{text.promo} <Text style={styles.muted}>· {text.optional}</Text></Text>
            <View style={styles.promoRow}>
              <TextInput
                value={promoCode}
                onChangeText={(value) => { setPromoCode(value); setPromoMessage(''); }}
                placeholder={text.promoPlaceholder}
                autoCapitalize="characters"
                style={styles.promoInput}
              />
              <Pressable onPress={applyPromo} disabled={!promoCode.trim()} style={[styles.applyButton, !promoCode.trim() && styles.applyDisabled]}>
                <Text style={styles.applyText}>{text.apply}</Text>
              </Pressable>
            </View>
            {promoMessage ? <Text style={styles.inlineNotice}>{promoMessage}</Text> : null}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{text.total}</Text>
              <Text style={styles.totalValue}>{money(total, ticketTypes[0]?.currency || 'KZT', locale)}</Text>
            </View>
            <Pressable
              style={[styles.primaryButton, isAuthenticated && (!hasSelection || submitting) && styles.buttonDisabled]}
              onPress={continueToRegister}
              disabled={isAuthenticated && (!hasSelection || submitting)}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>{isAuthenticated ? text.continue : text.signIn}</Text>
              )}
            </Pressable>
            <Text style={styles.accountNote}>
              {text.accountNote}{' '}
              <Text style={styles.createLink} onPress={() => router.push('/register')}>{text.create}</Text>
            </Text>
          </View>
        </View>
        <Text style={styles.footer}>© 2026 BiletFlow · CSCI 361</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28 },
  backLink: { alignSelf: 'flex-start', paddingVertical: 10, marginBottom: 12 },
  backText: { color: '#64748b', fontSize: 15, fontWeight: '600' },
  columns: { gap: 16 },
  eventCard: { backgroundColor: '#fff', borderRadius: 22, padding: 22 },
  category: { color: '#166534', fontSize: 13, fontWeight: '700', marginBottom: 14 },
  eventTitle: { color: '#171717', fontSize: 30, lineHeight: 36, fontWeight: '800', marginBottom: 28 },
  infoRow: { gap: 18, marginBottom: 28 },
  infoColumn: { flex: 1 },
  infoLabel: { color: '#64748b', fontSize: 14, marginBottom: 6 },
  infoValue: { color: '#171717', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  sectionTitle: { color: '#171717', fontSize: 20, fontWeight: '800', marginBottom: 12 },
  description: { color: '#475569', fontSize: 15, lineHeight: 23, marginBottom: 28 },
  organizerLink: { color: '#166534', fontWeight: '700', fontSize: 15 },
  ticketCard: { backgroundColor: '#fff', borderRadius: 22, padding: 22 },
  ticketHeading: { color: '#171717', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  muted: { color: '#64748b', fontSize: 14, lineHeight: 20 },
  ticketType: { paddingTop: 22, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  ticketTopLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  ticketName: { color: '#171717', fontSize: 16, fontWeight: '700', flex: 1 },
  ticketPrice: { color: '#171717', fontSize: 16, fontWeight: '800' },
  ticketDescription: { color: '#64748b', fontSize: 14, marginTop: 6 },
  ticketBottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 12 },
  limitText: { color: '#64748b', fontSize: 13, flex: 1 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quantityButton: { width: 46, height: 46, borderRadius: 13, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  quantityButtonText: { color: '#171717', fontSize: 22, fontWeight: '600' },
  disabledText: { color: '#9ca3af' },
  quantityValue: { minWidth: 18, textAlign: 'center', color: '#171717', fontSize: 16, fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 22 },
  promoLabel: { color: '#171717', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  promoRow: { flexDirection: 'row', gap: 8 },
  promoInput: { flex: 1, height: 48, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 12, color: '#171717' },
  applyButton: { height: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  applyDisabled: { opacity: 0.55 },
  applyText: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  inlineNotice: { color: '#64748b', fontSize: 13, lineHeight: 19, marginTop: 12 },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 18 },
  totalLabel: { color: '#64748b', fontSize: 15 },
  totalValue: { color: '#171717', fontSize: 22, fontWeight: '800' },
  primaryButton: { backgroundColor: '#18783b', borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 2 },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  accountNote: { color: '#64748b', fontSize: 13, lineHeight: 21, marginTop: 18 },
  createLink: { color: '#166534', fontWeight: '800' },
  footer: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 44, marginBottom: 8 },
  notFoundTitle: { color: '#171717', fontSize: 22, fontWeight: '800' },
});
