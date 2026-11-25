import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { describeError } from '../../api/errors';
import { EventAdmin, eventAdmins } from '../../api/organizer';
import { confirmAction } from '../../components/dialogs';
import { Action, Busy, Card, Field, Notice, Page } from '../../components/organizer-ui';
import { useOx } from '../../store/organizer-texts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOCALES = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' } as const;

export default function AdminsScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const { ox, t, lang } = useOx();

  const [admins, setAdmins] = useState<EventAdmin[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    if (!eventId) return;
    try {
      setAdmins(await eventAdmins.list(eventId));
      setError('');
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setLoading(false);
    }
  }, [eventId, t]);

  useFocusEffect(
    useCallback(() => {
      void loadAdmins();
    }, [loadAdmins]),
  );

  async function handleAssign() {
    if (!eventId || assigning) return;
    const trimmedEmail = email.trim();
    setInfo('');
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError(ox.invalidEmail);
      return;
    }

    setError('');
    setAssigning(true);
    try {
      await eventAdmins.assign(eventId, trimmedEmail);
      setEmail('');
      setInfo(ox.adminAssigned);
      await loadAdmins();
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(admin: EventAdmin) {
    if (!eventId || removingId) return;
    setError('');
    setInfo('');
    setRemovingId(admin.user_id);
    try {
      await eventAdmins.remove(eventId, admin.user_id);
      await loadAdmins();
    } catch (e) {
      setError(describeError(e, t));
    } finally {
      setRemovingId(null);
    }
  }

  function confirmRemove(admin: EventAdmin) {
    confirmAction({
      title: ox.removeConfirmTitle,
      message: `${ox.removeConfirmBody} ${admin.email}`,
      confirmLabel: ox.removeAction,
      cancelLabel: ox.cancel,
      onConfirm: () => void handleRemove(admin),
    });
  }

  function renderAdminItem({ item }: { item: EventAdmin }) {
    const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ');
    const assignedDate = new Date(item.assigned_at).toLocaleDateString(LOCALES[lang]);

    return (
      <Card>
        <Text className="font-bold">{fullName || item.email}</Text>
        <Text className="mt-1 text-sm text-slate-500">
          {item.email} · {ox.roles[item.role] ?? item.role}
        </Text>
        <Text className="mt-1 text-xs text-slate-400">
          {ox.assignedOn} {assignedDate}
        </Text>

        <View className="mt-3">
          <Action
            label={ox.removeBtn}
            kind="danger"
            loading={removingId === item.user_id}
            disabled={!!removingId}
            onPress={() => confirmRemove(item)}
          />
        </View>
      </Card>
    );
  }

  if (!eventId) {
    return (
      <Page title={ox.adminsTitle}>
        <View className="p-4">
          <Notice>{ox.noEvent}</Notice>
          <Action label={ox.backToEvent} kind="secondary" onPress={() => router.back()} />
        </View>
      </Page>
    );
  }

  if (loading) {
    return <Busy />;
  }

  return (
    <Page title={ox.adminsTitle} subtitle={ox.adminsSubtitle}>
      <FlatList
        data={admins}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {error ? <Notice>{error}</Notice> : null}
            {info ? <Notice>{info}</Notice> : null}

            <Card>
              <Text className="mb-2 text-lg font-bold">{ox.assignTitle}</Text>
              <Field
                label={ox.accountEmail}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleAssign}
              />
              <Action label={ox.assignBtn} onPress={handleAssign} loading={assigning} />
            </Card>

            <Text className="mb-2 text-lg font-bold">{ox.assignedTitle}</Text>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-6 text-center text-slate-500">{ox.noAdmins}</Text>
        }
        renderItem={renderAdminItem}
      />

      <View className="px-4 pb-4">
        <Action label={ox.backToEvent} kind="secondary" onPress={() => router.back()} />
      </View>
    </Page>
  );
}
