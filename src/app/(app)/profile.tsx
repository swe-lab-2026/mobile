import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { OrganizerProfile, profileApi } from '../../api/organizer';
import {
  Action,
  Busy,
  Card,
  Field,
  Notice,
  Page,
} from '../../components/organizer-ui';
import { useAuth } from '../../store/auth-context';

export default function ProfileScreen() {
  const { user } = useAuth();

  // Account state
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');

  // Organizer profile state
  const [profile, setProfile] = useState<OrganizerProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [contactPhone, setContactPhone] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const loadOrganizerProfile = useCallback(async () => {
    try {
      const organizer = await profileApi.getOrganizer();
      setProfile(organizer);
      setDisplayName(organizer.display_name);
      setLegalName(organizer.legal_name ?? '');
      setContactEmail(organizer.contact_email ?? user?.email ?? '');
      setContactPhone(organizer.contact_phone ?? '');
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err.status !== 404) {
        setNotice(err.message ?? 'Could not load organizer profile');
      }
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useFocusEffect(
    useCallback(() => {
      loadOrganizerProfile();
    }, [loadOrganizerProfile])
  );

  async function saveAccount() {
    setNotice('');
    try {
      await profileApi.updateUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      setNotice('Account details saved.');
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not save account');
    }
  }

  async function saveOrganizer() {
    if (!profile && !termsAccepted) {
      setNotice('Please accept the organizer terms before creating your profile.');
      return;
    }

    setNotice('');
    try {
      const payload = {
        display_name: displayName.trim(),
        legal_name: legalName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
      };

      const updatedProfile = profile
        ? await profileApi.updateOrganizer(payload)
        : await profileApi.createOrganizer({ ...payload, terms_accepted: true });

      setProfile(updatedProfile);
      setNotice('Organizer profile saved.');
    } catch (e: unknown) {
      setNotice(
        e instanceof Error ? e.message : 'Could not save organizer profile'
      );
    }
  }

  if (loading) {
    return <Busy />;
  }

  return (
    <Page title="Profile" subtitle="Account and organizer information">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {notice ? <Notice>{notice}</Notice> : null}

        <Card>
          <Text className="mb-3 text-lg font-bold">Account</Text>

          <Field label="Email" value={user?.email ?? ''} editable={false} />
          <Field label="First name" value={firstName} onChangeText={setFirstName} />
          <Field label="Last name" value={lastName} onChangeText={setLastName} />

          <Text className="mb-3 text-xs text-slate-500">
            Email verification: {user?.emailVerifiedAt ? 'Verified' : 'Not verified'}
          </Text>

          <Action label="Save account" onPress={saveAccount} />
        </Card>

        <Card>
          <Text className="mb-1 text-lg font-bold">Organizer profile</Text>
          <Text className="mb-3 text-xs text-slate-500">
            Status: {profile?.verification_status ?? 'Not created'}
          </Text>

          <Field
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Field
            label="Legal name"
            value={legalName}
            onChangeText={setLegalName}
          />
          <Field
            label="Contact email"
            value={contactEmail}
            onChangeText={setContactEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Field
            label="Contact phone"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
          />

          {!profile ? (
            <Pressable
              onPress={() => setTermsAccepted((prev) => !prev)}
              className="mb-3 rounded-lg bg-slate-100 p-3"
            >
              <Text className="text-sm text-slate-800">
                {termsAccepted ? '☑' : '□'} I accept the organizer terms
              </Text>
            </Pressable>
          ) : null}

          <Action
            label={
              profile ? 'Save organizer profile' : 'Create organizer profile'
            }
            onPress={saveOrganizer}
          />
        </Card>
      </ScrollView>
    </Page>
  );
}