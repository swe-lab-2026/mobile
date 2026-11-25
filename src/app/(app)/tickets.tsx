import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { organizerEvents, ticketTypes } from '../../api/organizer';
import type { Inventory, TicketPayload, TicketType } from '../../api/organizer';
import { describeError } from '../../api/errors';
import { Action, Busy, Card, Field, Notice, Page } from '../../components/organizer-ui';
import { Ox, useOx, wallTimeLabel } from '../../store/organizer-texts';

type TicketForm = {
  name: string;
  description: string;
  price: string;
  capacity: string;
  min_per_order: string;
  max_per_order: string;
  sales_starts_at: string;
  sales_ends_at: string;
  is_hidden: boolean;
};

type DateField = 'sales_starts_at' | 'sales_ends_at';
const CURRENCY = 'KZT';
const EMPTY_FORM: TicketForm = {
  name: '', description: '', price: '', capacity: '', min_per_order: '1',
  max_per_order: '10', sales_starts_at: '', sales_ends_at: '', is_hidden: false,
};

function pad(value: number) { return String(value).padStart(2, '0'); }

// Convert an ISO timestamp to the event's wall-clock time, not the phone's timezone.
function isoToLocalInput(iso: string | null | undefined, timeZone: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const values: Record<string, string> = {};
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = part.value; });
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function zoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const values: Record<string, number> = {};
  parts.forEach((part) => { if (part.type !== 'literal') values[part.type] = Number(part.value); });
  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

function localInputToIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  const year = Number(y), month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMinutes(new Date(naiveUtc), timeZone);
  offset = zoneOffsetMinutes(new Date(naiveUtc - offset * 60000), timeZone);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${y}-${mo}-${d}T${h}:${mi}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function parseWallTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date();
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
}

function formatWallTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ticketPrice(item: TicketType, ox: Ox) {
  if (item.is_free) return ox.free;
  return `${Number(item.price).toLocaleString()} ${item.currency}`;
}

function DateFieldButton({ label, value, onPress, ox }: { label: string; value: string; onPress: () => void; ox: Ox }) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-sm font-semibold text-slate-700">{label} <Text className="font-normal text-slate-400">({ox.optional})</Text></Text>
      <Pressable onPress={onPress} className="min-h-12 justify-center rounded-xl border border-slate-200 bg-white px-3">
        <Text className={value ? 'text-base text-slate-900' : 'text-base text-slate-400'}>{wallTimeLabel(value, ox)}</Text>
      </Pressable>
    </View>
  );
}

export default function TicketsScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const { ox, t } = useOx();
  const [rows, setRows] = useState<TicketType[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [timeZone, setTimeZone] = useState('Asia/Almaty');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState<TicketType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const [form, setForm] = useState<TicketForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dateModal, setDateModal] = useState<{ field: DateField; value: Date } | null>(null);

  const load = useCallback(async () => {
    if (!eventId) { setError(ox.noEvent); setLoading(false); return; }
    try {
      const [types, stock, event] = await Promise.all([
        ticketTypes.list(eventId), organizerEvents.inventory(eventId), organizerEvents.get(eventId),
      ]);
      setRows(types);
      setInventory(stock);
      setTimeZone(event.timezone || 'Asia/Almaty');
      setError('');
    } catch (e) {
      setError(describeError(e, t));
    } finally { setLoading(false); }
  }, [eventId, ox.noEvent, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stockByType = useMemo(() => new Map((inventory?.ticket_types ?? []).map((item) => [item.ticket_type_id, item])), [inventory]);

  function updateForm<K extends keyof TicketForm>(key: K, value: TicketForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({ ...previous, [key]: '' }));
  }

  function startCreate() {
    setEditing(null); setForm(EMPTY_FORM); setPaid(false); setFieldErrors({}); setFormError(''); setFormOpen(true);
  }

  function startEdit(item: TicketType) {
    setEditing(item);
    setPaid(!item.is_free);
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: item.is_free ? '' : String(Number(item.price)),
      capacity: String(item.capacity),
      min_per_order: String(item.min_per_order),
      max_per_order: String(item.max_per_order),
      sales_starts_at: isoToLocalInput(item.sales_starts_at, timeZone),
      sales_ends_at: isoToLocalInput(item.sales_ends_at, timeZone),
      is_hidden: item.is_hidden,
    });
    setFieldErrors({}); setFormError(''); setFormOpen(true);
  }

  function openDatePicker(field: DateField) {
    const current = form[field] ? parseWallTime(form[field]) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode: 'date', onChange: (dateEvent, selectedDate) => {
          if (dateEvent.type !== 'set' || !selectedDate) return;
          DateTimePickerAndroid.open({
            value: selectedDate, mode: 'time', onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type !== 'set' || !selectedTime) return;
              const combined = new Date(selectedDate);
              combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              updateForm(field, formatWallTime(combined));
            },
          });
        },
      });
    } else setDateModal({ field, value: current });
  }

  function validate() {
    const next: Record<string, string> = {};
    const positiveInteger = (value: string) => /^\d+$/.test(value) && Number(value) > 0;
    if (!form.name.trim()) next.name = ox.errName;
    if (paid && (!/^\d+(\.\d{1,2})?$/.test(form.price.replace(',', '.')) || Number(form.price.replace(',', '.')) <= 0)) {
      next.price = ox.errPrice;
    }
    if (!positiveInteger(form.capacity)) next.capacity = ox.errPositive;
    if (!positiveInteger(form.min_per_order)) next.min_per_order = ox.errPositive;
    if (!positiveInteger(form.max_per_order)) next.max_per_order = ox.errPositive;
    else if (Number(form.max_per_order) < Number(form.min_per_order)) next.max_per_order = ox.errMaxMin;
    if (form.sales_starts_at && form.sales_ends_at && form.sales_ends_at <= form.sales_starts_at) {
      next.sales_ends_at = ox.errSalesEnd;
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function saveTicket() {
    if (saving) return;
    setFormError('');
    if (!validate() || !eventId) return;
    const body: TicketPayload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: paid ? form.price.replace(',', '.') : '0',
      currency: CURRENCY,
      capacity: Number(form.capacity),
      min_per_order: Number(form.min_per_order),
      max_per_order: Number(form.max_per_order),
      sales_starts_at: localInputToIso(form.sales_starts_at, timeZone),
      sales_ends_at: localInputToIso(form.sales_ends_at, timeZone),
      is_hidden: form.is_hidden,
    };
    setSaving(true);
    try {
      if (editing) await ticketTypes.update(eventId, editing.id, body);
      else await ticketTypes.create(eventId, body);
      setFormOpen(false); setEditing(null); setForm(EMPTY_FORM); await load();
    } catch (e) {
      setFormError(describeError(e, t));
    } finally { setSaving(false); }
  }

  async function toggleHidden(item: TicketType) {
    if (!eventId) return;
    try {
      // The API uses DELETE to hide; PATCH is used to make a hidden type visible again.
      if (item.is_hidden) await ticketTypes.update(eventId, item.id, { is_hidden: false });
      else await ticketTypes.hide(eventId, item.id);
      await load();
    } catch (e) { setError(describeError(e, t)); }
  }

  if (loading) return <Busy />;

  return (
    <Page title={ox.ticketsTitle} subtitle={ox.ticketsSubtitle}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 36 }} keyboardShouldPersistTaps="handled">
        {error ? <Notice>{error}</Notice> : null}

        {inventory ? (
          <Card>
            <Text className="mb-3 text-lg font-bold text-slate-900">{ox.inventory}</Text>
            <View className="flex-row flex-wrap">
              {[
                { label: ox.eventCapacity, value: inventory.event_capacity ?? '—' },
                { label: ox.sold, value: inventory.total_sold },
                { label: ox.reserved, value: inventory.total_reserved },
                { label: ox.available, value: inventory.total_available },
              ].map((item) => (
                <View key={item.label} className="w-1/2 py-2">
                  <Text className="text-xs text-slate-500">{item.label}</Text>
                  <Text className="text-2xl font-bold text-slate-900">{item.value}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-lg font-bold text-slate-900">{ox.ticketsTitle}</Text>
            <Text className="text-xs text-slate-500">{ox.hiddenHint}</Text>
          </View>
          <View className="w-32"><Action label={ox.addTicket} onPress={startCreate} /></View>
        </View>

        {formOpen ? (
          <Card>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="flex-1 text-lg font-bold text-slate-900">{editing ? ox.editTicket : ox.createTicket}</Text>
              <Pressable onPress={() => setFormOpen(false)} hitSlop={10}><Text className="text-2xl text-slate-500">×</Text></Pressable>
            </View>
            {formError ? <Notice>{formError}</Notice> : null}

            <Field label={ox.name} value={form.name} onChangeText={(value) => updateForm('name', value)} maxLength={120} />
            {fieldErrors.name ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.name}</Text> : null}
            <Field label={ox.descriptionOptional} value={form.description} onChangeText={(value) => updateForm('description', value)} maxLength={2000} />

            <Text className="mb-2 text-sm font-semibold text-slate-700">{ox.price}</Text>
            <View className="mb-4 flex-row rounded-xl bg-slate-100 p-1">
              <Pressable onPress={() => { setPaid(false); updateForm('price', ''); }} className={`flex-1 items-center rounded-lg py-3 ${!paid ? 'bg-white' : ''}`}>
                <Text className={`font-semibold ${!paid ? 'text-slate-900' : 'text-slate-500'}`}>{ox.free}</Text>
              </Pressable>
              <Pressable onPress={() => setPaid(true)} className={`flex-1 items-center rounded-lg py-3 ${paid ? 'bg-white' : ''}`}>
                <Text className={`font-semibold ${paid ? 'text-slate-900' : 'text-slate-500'}`}>{ox.paid}</Text>
              </Pressable>
            </View>
            {paid ? (
              <>
                <View className="flex-row items-end gap-2">
                  <View className="flex-1"><Field label={ox.priceLabel} value={form.price} onChangeText={(value) => updateForm('price', value)} keyboardType="decimal-pad" placeholder="0.00" /></View>
                  <View className="mb-3 rounded-xl bg-slate-100 px-4 py-4"><Text className="font-semibold text-slate-700">{CURRENCY}</Text></View>
                </View>
                {fieldErrors.price ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.price}</Text> : null}
                <Notice>{ox.paidNotice}</Notice>
              </>
            ) : null}

            <Field label={ox.capacity} value={form.capacity} onChangeText={(value) => updateForm('capacity', value)} keyboardType="number-pad" placeholder={ox.capacityPh} />
            {fieldErrors.capacity ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.capacity}</Text> : null}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label={ox.minPerOrder} value={form.min_per_order} onChangeText={(value) => updateForm('min_per_order', value)} keyboardType="number-pad" />
                {fieldErrors.min_per_order ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.min_per_order}</Text> : null}
              </View>
              <View className="flex-1">
                <Field label={ox.maxPerOrder} value={form.max_per_order} onChangeText={(value) => updateForm('max_per_order', value)} keyboardType="number-pad" />
                {fieldErrors.max_per_order ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.max_per_order}</Text> : null}
              </View>
            </View>

            <DateFieldButton ox={ox} label={ox.salesStart} value={form.sales_starts_at} onPress={() => openDatePicker('sales_starts_at')} />
            <DateFieldButton ox={ox} label={ox.salesEnd} value={form.sales_ends_at} onPress={() => openDatePicker('sales_ends_at')} />
            {fieldErrors.sales_ends_at ? <Text className="-mt-2 mb-3 text-xs text-red-600">{fieldErrors.sales_ends_at}</Text> : null}
            <Text className="-mt-1 mb-3 text-xs text-slate-500">{ox.tzNote} {timeZone}.</Text>

            <Pressable onPress={() => updateForm('is_hidden', !form.is_hidden)} className="mb-4 flex-row items-center">
              <View className={`mr-3 h-5 w-5 items-center justify-center rounded border ${form.is_hidden ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'}`}>
                {form.is_hidden ? <Text className="text-xs font-bold text-white">✓</Text> : null}
              </View>
              <Text className="flex-1 text-sm text-slate-700">{ox.hideFromAttendees}</Text>
            </Pressable>

            <Action label={editing ? ox.save : ox.addTicketType} onPress={saveTicket} loading={saving} />
            <Action label={ox.cancel} kind="secondary" onPress={() => setFormOpen(false)} disabled={saving} />
          </Card>
        ) : null}

        {rows.length === 0 ? (
          <Card><Text className="py-5 text-center text-sm text-slate-500">{ox.noTicketTypes}</Text></Card>
        ) : rows.map((item) => {
          const stock = stockByType.get(item.id);
          return (
            <Card key={item.id}>
              <View className="mb-2 flex-row items-start justify-between">
                <View className="mr-3 flex-1">
                  <Text className="text-base font-bold text-slate-900">{item.name}</Text>
                  {item.is_hidden ? <Text className="mt-1 text-xs font-semibold text-amber-700">{ox.hiddenFromAttendees}</Text> : null}
                </View>
                <Text className="font-bold text-slate-900">{ticketPrice(item, ox)}</Text>
              </View>
              {item.description ? <Text className="mb-3 text-sm text-slate-600">{item.description}</Text> : null}
              <View className="mb-3 flex-row flex-wrap">
                <Text className="mr-3 text-xs text-slate-500">{ox.capacityShort}: {item.capacity}</Text>
                <Text className="mr-3 text-xs text-slate-500">{ox.perOrder}: {item.min_per_order}–{item.max_per_order}</Text>
              </View>
              {stock ? (
                <View className="mb-3 rounded-xl bg-slate-50 p-3">
                  <View className="flex-row justify-between"><Text className="text-xs text-slate-500">{ox.reserved}</Text><Text className="text-xs font-semibold">{stock.reserved}</Text></View>
                  <View className="mt-1 flex-row justify-between"><Text className="text-xs text-slate-500">{ox.sold}</Text><Text className="text-xs font-semibold">{stock.sold}</Text></View>
                  <View className="mt-1 flex-row justify-between"><Text className="text-xs text-slate-500">{ox.available}</Text><Text className="text-xs font-semibold">{stock.available}</Text></View>
                </View>
              ) : null}
              <View className="flex-row gap-2">
                <View className="flex-1"><Action label={ox.edit} kind="secondary" onPress={() => startEdit(item)} /></View>
                <View className="flex-1"><Action label={item.is_hidden ? ox.unhideBtn : ox.hideBtn} kind="secondary" onPress={() => toggleHidden(item)} /></View>
              </View>
            </Card>
          );
        })}

        <Action label={ox.backToEvent} kind="secondary" onPress={() => router.back()} />
      </ScrollView>

      {Platform.OS === 'ios' && dateModal ? (
        <Modal transparent animationType="slide" visible onRequestClose={() => setDateModal(null)}>
          <View className="flex-1 justify-end bg-black/40">
            <View className="rounded-t-3xl bg-white p-4">
              <View className="mb-3 flex-row justify-between">
                <Pressable onPress={() => setDateModal(null)}><Text className="font-semibold text-slate-500">{ox.cancel}</Text></Pressable>
                <Pressable onPress={() => { updateForm(dateModal.field, formatWallTime(dateModal.value)); setDateModal(null); }}><Text className="font-bold text-blue-600">{ox.done}</Text></Pressable>
              </View>
              <DateTimePicker value={dateModal.value} mode="datetime" display="spinner" onChange={(_, value) => { if (value) setDateModal((current) => current ? { ...current, value } : null); }} />
            </View>
          </View>
        </Modal>
      ) : null}
    </Page>
  );
}
