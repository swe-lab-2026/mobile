import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { ApiError } from '../api/client';
import { organizerEvents } from '../api/organizer';
import type { EventPayload, EventRecord, EventVisibility } from '../api/organizer';
import { Action, Busy, Card, Field, Notice, Page } from './organizer-ui';
import { SafeAreaView } from 'react-native-safe-area-context';

type ImageDraft = { object_key: string; alt_text: string };
type DateField =
  | 'starts_at'
  | 'ends_at'
  | 'registration_starts_at'
  | 'registration_ends_at';
type FormState = {
  title: string;
  description: string;
  category: string;
  visibility: EventVisibility;
  venue_name: string;
  venue_address: string;
  city: string;
  country_code: string;
  timezone: string;
  starts_at: string;
  ends_at: string;
  registration_starts_at: string;
  registration_ends_at: string;
  capacity: string;
  refund_policy: string;
  images: ImageDraft[];
};
type Choice = { value: string; label: string; description?: string };
type PickerState = { field: DateField; mode: 'date' | 'time'; value: Date };

const DEFAULT_TIMEZONE = 'Asia/Almaty';
const TIMEZONES = [
  'Asia/Almaty',
  'Asia/Aqtobe',
  'Asia/Aqtau',
  'Asia/Atyrau',
  'Asia/Oral',
  'Asia/Qostanay',
  'Asia/Qyzylorda',
  'Europe/Moscow',
  'Asia/Tashkent',
  'Asia/Bishkek',
  'UTC',
];
const CATEGORIES = [
  'education',
  'concert',
  'theatre',
  'sport',
  'comedy',
  'exhibition',
  'conference',
  'other',
];
const VISIBILITIES: Choice[] = [
  {
    value: 'PUBLIC',
    label: 'Public',
    description: 'Anyone can discover this event in the public catalog.',
  },
  {
    value: 'UNLISTED',
    label: 'Unlisted',
    description: 'People can access the event with its direct link.',
  },
  {
    value: 'PRIVATE',
    label: 'Private',
    description: 'Keep the event private and restrict public discovery.',
  },
];

const blankForm: FormState = {
  title: '',
  description: '',
  category: '',
  visibility: 'PUBLIC',
  venue_name: '',
  venue_address: '',
  city: '',
  country_code: 'KZ',
  timezone: DEFAULT_TIMEZONE,
  starts_at: '',
  ends_at: '',
  registration_starts_at: '',
  registration_ends_at: '',
  capacity: '',
  refund_policy: '',
  images: [],
};

// Convert an ISO timestamp into wall-clock input in the selected event timezone.
function isoToLocalInput(iso: string | null | undefined, timeZone: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function zoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values: Record<string, number> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  });
  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

// Convert a wall-clock value in an IANA timezone into an ISO timestamp with offset.
function localInputToIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let offset = zoneOffsetMinutes(new Date(naiveUtc), timeZone);
  offset = zoneOffsetMinutes(new Date(naiveUtc - offset * 60000), timeZone);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${sign}${hh}:${mm}`;
}

function parseWallTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date();
  const [, year, month, day, hour, minute] = match.map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function formatWallTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function timezoneLabel(timeZone: string) {
  try {
    const offset = zoneOffsetMinutes(new Date(), timeZone);
    const sign = offset >= 0 ? '+' : '−';
    const abs = Math.abs(offset);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `${timeZone} (UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''})`;
  } catch {
    return timeZone;
  }
}

function dateLabel(value: string) {
  if (!value) return 'Select date and time';
  const [date, time] = value.split('T');
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year} at ${time}`;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <Text className="-mt-2 mb-3 text-xs text-red-600">{message}</Text>;
}

export default function EventFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const [form, setForm] = useState<FormState>(blankForm);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [choiceModal, setChoiceModal] = useState<{
    title: string;
    options: Choice[];
    onSelect: (value: string) => void;
  } | null>(null);
  const [iosPicker, setIosPicker] = useState<PickerState | null>(null);

  useEffect(() => {
    // `loading` starts as `editing` (i.e. !!id), so there is nothing to reset when creating.
    if (!id) return;
    let active = true;
    organizerEvents
      .get(id)
      .then((event: EventRecord) => {
        if (!active) return;
        const timezone = event.timezone || DEFAULT_TIMEZONE;
        setForm({
          title: event.title ?? '',
          description: event.description ?? '',
          category: event.category ?? '',
          visibility: event.visibility ?? 'PUBLIC',
          venue_name: event.venue_name ?? '',
          venue_address: event.venue_address ?? '',
          city: event.city ?? '',
          country_code: event.country_code ?? 'KZ',
          timezone,
          starts_at: isoToLocalInput(event.starts_at, timezone),
          ends_at: isoToLocalInput(event.ends_at, timezone),
          registration_starts_at: isoToLocalInput(event.registration_starts_at, timezone),
          registration_ends_at: isoToLocalInput(event.registration_ends_at, timezone),
          capacity: event.capacity == null ? '' : String(event.capacity),
          refund_policy: event.refund_policy ?? '',
          images: (event.images ?? []).map((image) => ({
            object_key: image.object_key,
            alt_text: image.alt_text ?? '',
          })),
        });
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : 'Could not load event.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  function setText(key: Exclude<keyof FormState, 'visibility' | 'images'>, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => ({ ...previous, [key]: '' }));
  }

  function openDateTimePicker(field: DateField) {
    const current = form[field] ? parseWallTime(form[field]) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        is24Hour: true,
        onChange: (dateEvent, selectedDate) => {
          if (dateEvent.type !== 'set' || !selectedDate) return;
          const dateOnly = new Date(current);
          dateOnly.setFullYear(
            selectedDate.getFullYear(),
            selectedDate.getMonth(),
            selectedDate.getDate(),
          );
          DateTimePickerAndroid.open({
            value: dateOnly,
            mode: 'time',
            is24Hour: true,
            onChange: (timeEvent, selectedTime) => {
              if (timeEvent.type !== 'set' || !selectedTime) return;
              const result = new Date(dateOnly);
              result.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              setText(field, formatWallTime(result));
            },
          });
        },
      });
      return;
    }
    setIosPicker({ field, mode: 'date', value: current });
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Event title is required.';
    if (!form.starts_at) next.starts_at = 'Start date and time are required.';
    if (!form.ends_at) next.ends_at = 'End date and time are required.';
    if (form.starts_at && form.ends_at && form.ends_at <= form.starts_at) {
      next.ends_at = 'End date and time must be after the start.';
    }
    if (
      form.registration_starts_at &&
      form.registration_ends_at &&
      form.registration_ends_at <= form.registration_starts_at
    ) {
      next.registration_ends_at = 'Registration end must be after registration start.';
    }
    if (form.capacity && !(Number.isInteger(Number(form.capacity)) && Number(form.capacity) > 0)) {
      next.capacity = 'Capacity must be a positive whole number.';
    }
    if (form.country_code && !/^[A-Za-z]{2}$/.test(form.country_code)) {
      next.country_code = 'Enter a two-letter country code, for example KZ.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    setError('');
    if (!validate()) {
      setError('Please correct the highlighted fields.');
      return;
    }

    const startsAt = localInputToIso(form.starts_at, form.timezone);
    const endsAt = localInputToIso(form.ends_at, form.timezone);
    if (!startsAt || !endsAt) {
      setError('Could not convert the event date and time. Check the selected timezone.');
      return;
    }

    const payload: EventPayload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category || null,
      visibility: form.visibility,
      venue_name: form.venue_name.trim() || null,
      venue_address: form.venue_address.trim() || null,
      city: form.city.trim() || null,
      country_code: form.country_code.trim().toUpperCase() || null,
      timezone: form.timezone,
      starts_at: startsAt,
      ends_at: endsAt,
      registration_starts_at: localInputToIso(form.registration_starts_at, form.timezone),
      registration_ends_at: localInputToIso(form.registration_ends_at, form.timezone),
      capacity: form.capacity ? Number(form.capacity) : null,
      refund_policy: form.refund_policy.trim() || null,
      images: form.images
        .filter((image) => image.object_key.trim())
        .map((image, index) => ({
          object_key: image.object_key.trim(),
          alt_text: image.alt_text.trim() || null,
          sort_order: index,
        })),
    };

    setSaving(true);
    try {
      const result = editing
        ? await organizerEvents.update(id!, payload)
        : await organizerEvents.create(payload);
      router.replace({ pathname: '/events/[id]', params: { id: result.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save event.');
    } finally {
      setSaving(false);
    }
  }

  function showCategoryPicker() {
    setChoiceModal({
      title: 'Choose category',
      options: [
        { value: '', label: 'No category' },
        ...CATEGORIES.map((category) => ({
          value: category,
          label: category.charAt(0).toUpperCase() + category.slice(1),
        })),
      ],
      onSelect: (value) => setText('category', value),
    });
  }

  function showTimezonePicker() {
    setChoiceModal({
      title: 'Choose event timezone',
      options: TIMEZONES.map((timezone) => ({
        value: timezone,
        label: timezoneLabel(timezone),
      })),
      onSelect: (value) => setText('timezone', value),
    });
  }

  function addImage() {
    setForm((previous) => ({
      ...previous,
      images: [...previous.images, { object_key: '', alt_text: '' }],
    }));
  }

  if (loading) return <Busy />;

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
    <Page
      title={editing ? 'Edit event' : 'Create event'}
      subtitle="Add event details, venue, schedule and registration settings"
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        >
          {error ? <Notice>{error}</Notice> : null}

          {/* Event basics */}
          <Card>
            <Text className="mb-4 text-lg font-bold text-slate-900">Event basics</Text>
            <Field
              label="Event title *"
              value={form.title}
              onChangeText={(value) => setText('title', value)}
              placeholder="Enter your event name"
              maxLength={200}
            />
            <FieldError message={fieldErrors.title} />
            <Field
              label="Description"
              value={form.description}
              onChangeText={(value) => setText('description', value)}
              placeholder="Describe what attendees can expect"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={10000}
              style={{ minHeight: 112, paddingTop: 12 }}
            />
            <Text className="mb-1.5 text-sm font-semibold text-slate-700">Category</Text>
            <Pressable
              onPress={showCategoryPicker}
              className="mb-4 min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3"
            >
              <Text className={form.category ? 'text-base text-slate-900' : 'text-base text-slate-400'}>
                {form.category
                  ? form.category.charAt(0).toUpperCase() + form.category.slice(1)
                  : 'Choose a category'}
              </Text>
              <Text className="text-slate-500">⌄</Text>
            </Pressable>

            <Text className="mb-2 text-sm font-semibold text-slate-700">Event visibility</Text>
            {VISIBILITIES.map((visibility) => {
              const selected = form.visibility === visibility.value;
              return (
                <Pressable
                  key={visibility.value}
                  onPress={() =>
                    setForm((previous) => ({
                      ...previous,
                      visibility: visibility.value as EventVisibility,
                    }))
                  }
                  className={`mb-2 rounded-xl border p-3 ${
                    selected ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <View className="flex-row items-center">
                    <View className={`mr-3 h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-blue-600' : 'border-slate-400'}`}>
                      {selected ? <View className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
                    </View>
                    <Text className="font-semibold text-slate-900">{visibility.label}</Text>
                  </View>
                  <Text className="ml-8 mt-1 text-xs leading-5 text-slate-500">
                    {visibility.description}
                  </Text>
                </Pressable>
              );
            })}
          </Card>

          {/* Venue */}
          <Card>
            <Text className="mb-4 text-lg font-bold text-slate-900">Venue</Text>
            <Field
              label="Venue name"
              value={form.venue_name}
              onChangeText={(value) => setText('venue_name', value)}
              placeholder="Venue or location name"
              maxLength={200}
            />
            <Field
              label="City"
              value={form.city}
              onChangeText={(value) => setText('city', value)}
              placeholder="City"
              maxLength={120}
            />
            <Field
              label="Venue address"
              value={form.venue_address}
              onChangeText={(value) => setText('venue_address', value)}
              placeholder="Street, building, room..."
              maxLength={2000}
            />
            <Field
              label="Country code"
              value={form.country_code}
              onChangeText={(value) => setText('country_code', value.toUpperCase())}
              placeholder="KZ"
              maxLength={2}
              autoCapitalize="characters"
            />
            <FieldError message={fieldErrors.country_code} />
          </Card>

          {/* Schedule */}
          <Card>
            <Text className="mb-2 text-lg font-bold text-slate-900">Schedule</Text>
            <Text className="mb-2 text-sm text-slate-500">All event times are interpreted in the selected event timezone.</Text>
            <Text className="mb-1.5 text-sm font-semibold text-slate-700">Timezone</Text>
            <Pressable
              onPress={showTimezonePicker}
              className="mb-4 min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3"
            >
              <Text className="flex-1 text-base text-slate-900">{timezoneLabel(form.timezone)}</Text>
              <Text className="ml-2 text-slate-500">⌄</Text>
            </Pressable>

            {([
              ['starts_at', 'Event starts *'],
              ['ends_at', 'Event ends *'],
              ['registration_starts_at', 'Registration opens (optional)'],
              ['registration_ends_at', 'Registration closes (optional)'],
            ] as [DateField, string][]).map(([field, label]) => (
              <View key={field} className="mb-3">
                <Text className="mb-1.5 text-sm font-semibold text-slate-700">{label}</Text>
                <Pressable
                  onPress={() => openDateTimePicker(field)}
                  className="min-h-12 flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3"
                >
                  <Text className={form[field] ? 'text-base text-slate-900' : 'text-base text-slate-400'}>
                    {dateLabel(form[field])}
                  </Text>
                  <Text className="text-lg text-slate-500">▦</Text>
                </Pressable>
                <FieldError message={fieldErrors[field]} />
              </View>
            ))}
            <Text className="text-xs leading-5 text-slate-500">
              The selected timezone and its UTC offset will be sent to the backend automatically.
            </Text>
          </Card>

          {/* Capacity and refund policy */}
          <Card>
            <Text className="mb-4 text-lg font-bold text-slate-900">Capacity and policies</Text>
            <Field
              label="Capacity (leave empty for unlimited)"
              value={form.capacity}
              onChangeText={(value) => setText('capacity', value.replace(/[^0-9]/g, ''))}
              placeholder="e.g. 250"
              keyboardType="number-pad"
            />
            <FieldError message={fieldErrors.capacity} />
            <Field
              label="Refund policy"
              value={form.refund_policy}
              onChangeText={(value) => setText('refund_policy', value)}
              placeholder="Explain your refund conditions"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={10000}
              style={{ minHeight: 96, paddingTop: 12 }}
            />
          </Card>

          {/* Event images */}
          <Card>
            <Text className="mb-1 text-lg font-bold text-slate-900">Event images</Text>
            <Text className="mb-4 text-sm leading-5 text-slate-500">
              Add image URLs or storage object keys. This matches the web form; it does not upload image files from the phone.
            </Text>
            {form.images.map((image, index) => (
              <View key={`${index}`} className="mb-3 rounded-xl border border-slate-200 p-3">
                <Field
                  label={`Image URL or object key ${index + 1}`}
                  value={image.object_key}
                  onChangeText={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      images: previous.images.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, object_key: value } : item,
                      ),
                    }))
                  }
                  placeholder="https://..."
                  autoCapitalize="none"
                  keyboardType="url"
                  maxLength={512}
                />
                <Field
                  label="Image alt text"
                  value={image.alt_text}
                  onChangeText={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      images: previous.images.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, alt_text: value } : item,
                      ),
                    }))
                  }
                  placeholder="Short image description"
                  maxLength={240}
                />
                <Action
                  label="Remove image"
                  kind="danger"
                  onPress={() =>
                    setForm((previous) => ({
                      ...previous,
                      images: previous.images.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                />
              </View>
            ))}
            <Action label="＋ Add image" kind="secondary" onPress={addImage} />
          </Card>

          {/* Form actions */}
          <Action
            label={saving ? 'Saving...' : editing ? 'Save changes' : 'Create event'}
            onPress={save}
            disabled={saving}
          />
          <Action label="Cancel" kind="secondary" onPress={() => router.back()} />
          <Text className="mt-1 text-center text-xs leading-5 text-slate-500">
            You can manage ticket types and publish the event after creating it.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category and timezone selection */}
      <Modal
        visible={Boolean(choiceModal)}
        transparent
        animationType="slide"
        onRequestClose={() => setChoiceModal(null)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[75%] rounded-t-3xl bg-white p-5">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-lg font-bold text-slate-900">{choiceModal?.title}</Text>
              <Pressable onPress={() => setChoiceModal(null)}>
                <Text className="px-2 py-1 text-base font-semibold text-blue-600">Close</Text>
              </Pressable>
            </View>
            <ScrollView>
              {choiceModal?.options.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    choiceModal.onSelect(option.value);
                    setChoiceModal(null);
                  }}
                  className="border-b border-slate-100 py-3"
                >
                  <Text className="text-base font-medium text-slate-900">{option.label}</Text>
                  {option.description ? (
                    <Text className="mt-1 text-xs text-slate-500">{option.description}</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* iOS date and time picker */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={Boolean(iosPicker)}
          transparent
          animationType="slide"
          onRequestClose={() => setIosPicker(null)}
        >
          <View className="flex-1 justify-end bg-black/40">
            <View className="rounded-t-3xl bg-white p-4">
              <View className="mb-2 flex-row items-center justify-between">
                <Pressable onPress={() => setIosPicker(null)}>
                  <Text className="px-2 py-2 text-base text-slate-600">Cancel</Text>
                </Pressable>
                <Text className="text-base font-semibold text-slate-900">
                  {iosPicker?.mode === 'date' ? 'Choose date' : 'Choose time'}
                </Text>
                <Pressable
                  onPress={() => {
                    if (!iosPicker) return;
                    if (iosPicker.mode === 'date') {
                      setIosPicker({ ...iosPicker, mode: 'time' });
                    } else {
                      setText(iosPicker.field, formatWallTime(iosPicker.value));
                      setIosPicker(null);
                    }
                  }}
                >
                  <Text className="px-2 py-2 text-base font-semibold text-blue-600">
                    {iosPicker?.mode === 'date' ? 'Next' : 'Done'}
                  </Text>
                </Pressable>
              </View>
              {iosPicker ? (
                <DateTimePicker
                  value={iosPicker.value}
                  mode={iosPicker.mode}
                  display="spinner"
                  is24Hour
                  onChange={(_, selectedDate) => {
                    if (selectedDate) {
                      setIosPicker((previous) =>
                        previous ? { ...previous, value: selectedDate } : previous,
                      );
                    }
                  }}
                />
              ) : null}
            </View>
          </View>
        </Modal>
      ) : null}
    </Page>
    </SafeAreaView>
  );
}
