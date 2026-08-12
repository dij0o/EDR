import { View, Text, SafeAreaView, ScrollView, Image, Alert, Platform } from 'react-native';
import React, { useState } from 'react';
import { Link, useRouter } from 'expo-router';
import * as Device from 'expo-device';

import { icons, Images } from '../../constants';
import { CustomInput, CustomButton } from '../../components';

import { useUser } from '../../Context/UserContext';
import apiClient, { databaseUrl } from '../../services/apiClient';

const SignIn = () => {
  const { setSession } = useUser();
  const router = useRouter();

  const [form, setForm] = useState({ email: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignIn = async () => {
    const { email, password } = form;

    if (!email || !password) {
      Alert.alert("All fields are required");
      return;
    }

    setIsSubmitting(true);
    setIsLoading(true);

    try {
      const clientType = Platform.OS === 'ios' ? 'ios' : 'android';
      const deviceLabel = `${Device.modelName || Device.deviceName || 'Mobile Device'} (${Platform.OS})`;

      const response = await apiClient.post(
        databaseUrl('/login'),
        { email, password, clientType, deviceLabel },
        { skipAuth: true }
      );

      const payload = response.data?.data || response.data;
      const { token, accessToken, refreshToken, user } = payload;
      const finalToken = token || accessToken;

      if (user?.role?.toLowerCase() !== 'patient') {
        Alert.alert("Patient account required", "Please sign in with a patient account to use the mobile app.");
        return;
      }

      await setSession({ accessToken: finalToken, refreshToken, user });
      router.replace('/(tabs)/home');
    } catch (error) {
      Alert.alert("Login failed", error.response?.data?.error || error.message || "Something went wrong.");
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setIsSubmitting(false);
      }, 1000);
    }
  };

  return (
    <SafeAreaView className="bg-dblue h-full">
      <Image source={Images.LogoShadow} resizeMode="contain" className="h-[32em] w-[32em] absolute -right-10 bottom-0 opacity-5" />

      <ScrollView>
        <View className="flex min-h-full px-8 py-16">
          <View className="flex gap-4 mb-10">
            <Image source={icons.Logo} resizeMode='cover' className="w-16 h-16" />
            <Text className="text-white text-3xl font-bold">BC Dentistry</Text>
          </View>

          <View className="flex flex-col gap-y-8">
            <CustomInput
              handleChange={(text) => setForm({ ...form, email: text })}
              type="email-address"
              value={form.email}
              label='Email'
              placeHolder="user@example.com"
            />
            <CustomInput
              handleChange={(text) => setForm({ ...form, password: text })}
              type="password"
              value={form.password}
              label='Password'
              placeHolder="password"
            />
          </View>

          <CustomButton
            text={isSubmitting ? 'Logging in...' : 'Login'}
            handleClick={handleSignIn}
            style='mt-12'
            disabled={isSubmitting}
          />

          <View className="mt-4 px-2">
            <Text className="text-gray-400 text-xs text-center leading-4">
              Need an account? Contact your registered dental clinic for patient onboarding credentials.
            </Text>
          </View>
        </View>

        {isLoading && (
          <View className="w-60 h-52 flex flex-col gap-3 absolute top-60 left-[22vw] items-center justify-center bg-gray-800 p-4 rounded-xl shadow-lg shadow-black/20">
            <Image source={icons.Loading} resizeMode='contain' className='w-14 h-14' />
            <Text className="text-center text-white text-2xl">Loading ⏳</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SignIn;
