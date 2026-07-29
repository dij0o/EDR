import { SafeAreaView, View, Text, ScrollView, Alert } from 'react-native'
import React from 'react'
import { Brief, Information, PageHeader, CustomButton } from '../../components'
import { useUser } from '../../Context/UserContext'

const Settings = () => {
  const { user, signOut } = useUser()

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView className="bg-white flex-1">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="flex flex-col items-center">
          <PageHeader headerText={'Info'} />
          <View className="w-full px-6 flex flex-col gap-y-6">
            <Brief
              name={`${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Patient'}
              id={user?.emiratesID || user?.blockchainID || 'N/A'}
            />
            
            <Information data={user} />

            <CustomButton
              text="Log out"
              handleClick={handleLogout}
              classes="w-full mt-4"
              containerClasses="bg-red-600 p-4 rounded-xl items-center justify-center"
              textClasses="text-white font-bold text-lg text-center"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

export default Settings