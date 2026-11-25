import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    getMe,
    getOrganizer,
    saveOrganizer,
    savePayoutAccount,
    updateMe,
} from '../../api/account';
import { authErrorMessage, Field, Notice, PrimaryButton } from '../../components/AuthUI';
import { Badge, Card, Screen, statusTone } from '../../components/Screen';
import { colors } from '../../constants/theme';
import { useLanguage } from '../../store/language-context';
import { useTx } from '../../store/screen-texts';

type Msg = { kind: 'error' | 'info'; text: string } | null;

export default function ProfileScreen() {
  const { t } = useLanguage();
  const { tx } = useTx();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(false);
  const [accountMsg, setAccountMsg] = useState<Msg>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [orgExists, setOrgExists] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [verification, setVerification] = useState('NOT_SUBMITTED');
  const [orgMsg, setOrgMsg] = useState<Msg>(null);
  const [savingOrg, setSavingOrg] = useState(false);
  const [provider, setProvider] = useState('demo-bank');
  const [accountRef, setAccountRef] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [payoutMsg, setPayoutMsg] = useState<Msg>(null);
  const [savingPayout, setSavingPayout] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await getMe();
      setFirstName(me.firstName);
      setLastName(me.lastName);
      setEmail(me.email);
      setVerified(me.verified);

      const org = await getOrganizer();
      setOrgExists(!!org);
      if (org) {
        setDisplayName(org.displayName);
        setLegalName(org.legalName);
        setContactEmail(org.contactEmail);
        setContactPhone(org.contactPhone);
        setVerification(org.verificationStatus);
      }
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
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

  async function submitAccount() {
    setAccountMsg(null);
    if (!firstName.trim() || !lastName.trim()) {
      setAccountMsg({ kind: 'error', text: t.errFields });
      return;
    }
    setSavingAccount(true);
    try {
      await updateMe({ firstName: firstName.trim(), lastName: lastName.trim() });
      setAccountMsg({ kind: 'info', text: tx.saved });
    } catch (e) {
      setAccountMsg({ kind: 'error', text: authErrorMessage(e, t) });
    } finally {
      setSavingAccount(false);
    }
  }

  async function submitOrganizer() {
    setOrgMsg(null);
    if (!displayName.trim()) {
      setOrgMsg({ kind: 'error', text: t.errFields });
      return;
    }
    setSavingOrg(true);
    try {
      await saveOrganizer(orgExists, {
        displayName: displayName.trim(),
        legalName: legalName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
      });
      setOrgExists(true);
      setOrgMsg({ kind: 'info', text: tx.saved });
    } catch (e) {
      setOrgMsg({ kind: 'error', text: authErrorMessage(e, t) });
    } finally {
      setSavingOrg(false);
    }
  }

  async function submitPayout() {
    setPayoutMsg(null);
    if (!accountRef.trim()) {
      setPayoutMsg({ kind: 'error', text: t.errFields });
      return;
    }
    setSavingPayout(true);
    try {
      await savePayoutAccount({ provider, ref: accountRef.trim(), isDefault });
      setAccountRef('');
      setPayoutMsg({ kind: 'info', text: tx.saved });
    } catch (e) {
      setPayoutMsg({ kind: 'error', text: authErrorMessage(e, t) });
    } finally {
      setSavingPayout(false);
    }
  }

  if (loading) {
    return (
      <Screen title={tx.profileTitle}>
        <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 40 }} />
      </Screen>
    );
  }

  return (
    <Screen title={tx.profileTitle} refreshing={refreshing} onRefresh={onRefresh}>
      {loadFailed ? <Notice kind="error" text={tx.loadError} /> : null}

      <Card
        title={tx.account}
        subtitle={tx.accountSub}
        badge={
          <Badge
            text={verified ? `✓ ${tx.emailVerified}` : tx.emailNotVerified}
            tone={verified ? 'green' : 'amber'}
          />
        }
      >
        <Field label={t.firstName} value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
        <Field label={t.lastName} value={lastName} onChangeText={setLastName} autoCapitalize="words" />
        <Field label={t.email} value={email} editable={false} />
        {accountMsg ? <Notice kind={accountMsg.kind} text={accountMsg.text} /> : null}
        <PrimaryButton label={tx.save} onPress={submitAccount} loading={savingAccount} />
      </Card>

      <Card
        title={tx.organizer}
        subtitle={tx.organizerSub}
        badge={
          <Badge
            text={`${tx.verification}: ${tx.verStatus[verification] ?? verification}`}
            tone={statusTone(verification)}
          />
        }
      >
        <Field label={tx.displayName} value={displayName} onChangeText={setDisplayName} />
        <Field
          label={`${tx.legalName} · ${tx.optional}`}
          value={legalName}
          onChangeText={setLegalName}
        />
        <Field
          label={`${tx.contactEmail} · ${tx.optional}`}
          value={contactEmail}
          onChangeText={setContactEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Field
          label={`${tx.contactPhone} · ${tx.optional}`}
          placeholder="+7 7XX XXX XX XX"
          value={contactPhone}
          onChangeText={setContactPhone}
          keyboardType="phone-pad"
        />
        {orgMsg ? <Notice kind={orgMsg.kind} text={orgMsg.text} /> : null}
        <PrimaryButton label={tx.save} onPress={submitOrganizer} loading={savingOrg} />
      </Card>

      <Card title={tx.payout} subtitle={tx.payoutSub} badge={<Badge text={tx.demo} tone="gray" />}>
        <Field label={tx.provider} value={provider} onChangeText={setProvider} autoCapitalize="none" />
        <Field
          label={tx.accountRef}
          placeholder="KZ00 0000 0000 0000 0000"
          value={accountRef}
          onChangeText={setAccountRef}
          autoCapitalize="characters"
        />

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setIsDefault((v) => !v)}
          style={styles.checkRow}
        >
          <View style={[styles.box, isDefault && styles.boxOn]}>
            {isDefault ? <Text style={styles.tick}>✓</Text> : null}
          </View>
          <Text style={styles.checkText}>{tx.useDefault}</Text>
        </TouchableOpacity>

        {!orgExists ? <Notice kind="info" text={tx.needOrganizer} /> : null}
        {payoutMsg ? <Notice kind={payoutMsg.kind} text={payoutMsg.text} /> : null}
        <PrimaryButton label={tx.saveAccount} onPress={submitPayout} loading={savingPayout} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: '#fff', fontWeight: '800', fontSize: 14 },
  checkText: { fontSize: 15, color: colors.text },
});