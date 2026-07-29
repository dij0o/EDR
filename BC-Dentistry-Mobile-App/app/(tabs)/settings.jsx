import { SafeAreaView, View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Brief, Information, PageHeader } from '../../components'
import { useUser } from '../../Context/UserContext'

const Settings = () => {
  const { user, logout } = useUser()
  const router = useRouter()

  return (
    <SafeAreaView accessibilityLabel="Patient account information">
      <View className="flex flex-col items-center">
        <PageHeader headerText="Account information" />
        <View className="bg-white-off p-6 flex flex-col gap-y-8">
          {!user ? (
            <Text accessibilityRole="alert">Your session has expired. Please sign in again.</Text>
          ) : (
            <>
              <Brief
                name={`${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Patient'}
                id={user.emiratesID || user.blockchainID || 'Not available'}
              />
              <Information data={user} />
              <TouchableOpacity
                accessibilityRole="button"
                className="rounded-xl bg-red-700 p-4"
                onPress={async () => { await logout(); router.replace('/sign-in') }}
              >
                <Text className="text-center font-semibold text-white">Log out</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

export default Settings
