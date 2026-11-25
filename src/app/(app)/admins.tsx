import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Text, View } from 'react-native';
import { EventAdmin, eventAdmins } from '../../api/organizer';
import {
  Action,
  Busy,
  Card,
  Field,
  Notice,
  Page,
} from '../../components/organizer-ui';
import { SafeAreaView } from 'react-native-safe-area-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function AdminsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [admins, setAdmins] = useState<EventAdmin[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAdmins = useCallback(async () => {
    try {
      const list = await eventAdmins.list(eventId);
      setAdmins(list);
      setError('');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not load admins'));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadAdmins();
    }, [loadAdmins])
  );

  async function handleAssign() {
    const trimmedEmail = email.trim();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setError('');
    try {
      await eventAdmins.assign(eventId, trimmedEmail);
      setEmail('');
      await loadAdmins();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not assign admin'));
    }
  }

  async function handleRemove(admin: EventAdmin) {
    setError('');
    try {
      await eventAdmins.remove(eventId, admin.user_id);
      await loadAdmins();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not remove admin'));
    }
  }

  function confirmRemove(admin: EventAdmin) {
    Alert.alert(
      'Remove administrator?',
      `Remove ${admin.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void handleRemove(admin);
          },
        },
      ]
    );
  }

  function renderAdminItem({ item }: { item: EventAdmin }) {
    const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ');
    const assignedDate = new Date(item.assigned_at).toLocaleDateString();

    return (
      <Card>
        <Text className="font-bold">{fullName || item.email}</Text>
        <Text className="mt-1 text-sm text-slate-500">
          {item.email} · {item.role}
        </Text>
        <Text className="mt-1 text-xs text-slate-400">
          Assigned {assignedDate}
        </Text>

        <View className="mt-3">
          <Action
            label="Remove admin"
            kind="danger"
            onPress={() => confirmRemove(item)}
          />
        </View>
      </Card>
    );
  }

  if (loading) {
    return <Busy />;
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={['top', 'bottom']}>
    <Page
      title="Event administrators"
      subtitle="People allowed to manage check-in for this event"
    >
      <FlatList
        data={admins}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        ListHeaderComponent={
          <View>
            {error ? <Notice>{error}</Notice> : null}

            <Card>
              <Text className="mb-2 text-lg font-bold">
                Assign administrator
              </Text>
              <Field
                label="Account email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Action label="Assign admin" onPress={handleAssign} />
            </Card>

            <Text className="mb-2 text-lg font-bold">Assigned admins</Text>
          </View>
        }
        ListEmptyComponent={
          <Text className="py-6 text-center text-slate-500">
            No additional admins assigned.
          </Text>
        }
        renderItem={renderAdminItem}
      />

      <View className="px-4">
        <Action
          label="Back to event"
          kind="secondary"
          onPress={() => router.back()}
        />
      </View>
    </Page>
    </SafeAreaView>
  );
}