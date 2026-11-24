import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

export interface PageProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function Page({ children, title, subtitle }: PageProps) {
  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-5 pt-5 pb-3">
        <Text className="text-2xl font-bold text-slate-900">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-sm text-slate-500">{subtitle}</Text>
        ) : null}
      </View>

      <View className="flex-1">{children}</View>
    </View>
  );
}

export interface FieldProps extends TextInputProps {
  label: string;
}

export function Field({ label, ...props }: FieldProps) {
  return (
    <View className="mb-3">
      <Text className="mb-1.5 text-sm font-semibold text-slate-700">
        {label}
      </Text>

      <TextInput
        placeholderTextColor="#94a3b8"
        className="min-h-12 rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900"
        {...props}
      />
    </View>
  );
}

export type ActionKind = 'primary' | 'secondary' | 'danger';

export interface ActionProps {
  label: string;
  onPress: () => void;
  kind?: ActionKind;
  disabled?: boolean;
}

const ACTION_STYLES: Record<ActionKind, { container: string; text: string }> = {
  primary: {
    container: 'bg-blue-600',
    text: 'text-white',
  },
  secondary: {
    container: 'border border-slate-300 bg-white',
    text: 'text-slate-800',
  },
  danger: {
    container: 'bg-red-600',
    text: 'text-white',
  },
};

export function Action({
  label,
  onPress,
  kind = 'primary',
  disabled = false,
}: ActionProps) {
  const variant = ACTION_STYLES[kind];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`mb-2 items-center rounded-xl px-4 py-3 ${variant.container} ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      <Text className={`font-semibold ${variant.text}`}>{label}</Text>
    </Pressable>
  );
}

export interface NoticeProps {
  children: React.ReactNode;
}

export function Notice({ children }: NoticeProps) {
  return (
    <View className="mb-3 rounded-xl bg-amber-50 p-3">
      <Text className="text-sm text-amber-900">{children}</Text>
    </View>
  );
}

export function Busy() {
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

export interface CardProps {
  children: React.ReactNode;
}

export function Card({ children }: CardProps) {
  return (
    <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4">
      {children}
    </View>
  );
}