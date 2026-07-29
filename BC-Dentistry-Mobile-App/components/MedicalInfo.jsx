import { View, Text } from 'react-native'
import React from 'react'
import Field from './Field';

const MedicalInfo = ({ mdata }) => {
  const record = mdata?.medicalRecords?.[0] ?? null;
  const allergy = record?.allergies?.[0] ?? null;
  const medication = record?.medications?.[0] ?? null;

  return (
    <View>
      <Text className="text-2xl font-bold bg-gray-200 rounded-lg p-3">Medical Info</Text>
      <View className='mb-4 p-2 gap-5'>
        {!record ? (
          <Text className="text-gray-500 italic">No medical records available.</Text>
        ) : (
          <>
            <View className='flex flex-row gap-x-8'>
              <Field fieldTitle={'Allergies'} fieldText={allergy?.name ?? 'Not provided'} />
              <Field fieldTitle={'Allergies Description'} fieldText={allergy?.description ?? 'Not provided'} textClasses={'text-xl'} />
            </View>

            <View className='flex flex-row gap-x-8'>
              <Field fieldTitle={'Medication'} fieldText={medication?.drugName ?? 'Not provided'} />
              <Field fieldTitle={'Doses'} fieldText={medication?.doses ?? 'Not provided'} textClasses={'text-xl'} />
              <Field fieldTitle={'Strength'} fieldText={medication?.strength ?? 'Not provided'} textClasses={'text-xl'} />
            </View>
          </>
        )}
      </View>
    </View>
  )
}

export default MedicalInfo