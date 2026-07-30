import { View, Text, ScrollView, SafeAreaView } from 'react-native'
import React, { useEffect, useState } from 'react'

import { DataRequest, NoRequests } from '../components'
import apiClient, { blockchainUrl, getPatientBlockchainID } from '../services/apiClient';
import { useUser } from '../Context/UserContext';

const proceedRequests = () => {
  const { user } = useUser();
  const [reqests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const patientID = getPatientBlockchainID(user);

  useEffect(() => {
    if (!patientID) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    apiClient.get(blockchainUrl(`/getAllRequestsForPatient/${patientID}`))
      .then((response) => {
        setRequests(response.data || [])
      })
      .catch((error) => {
        console.error("API error", error.message);
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [patientID])

  return (
    <SafeAreaView>
        <View className='flex flex-col gap-4 p-6'>
          <View>
            <Text className='text-2xl font-semibold'>Proceed Requests</Text>
            <Text className='text-lg font-light leading-2x'>here you can find all the request that you have agreed to share information about</Text>
          </View>

          <ScrollView className='pb-4 h-[82vh]'>
            <View className="flex flex-col gap-y-4">
              {
                isLoading ? (
                  <View><Text>it is loading</Text></View>
                ) : !patientID ? (
                  <NoRequests text={"Unable to load your data. Patient account ID is missing."} />
                ) : reqests.filter((request) => request.status == 'CONSENT_GRANTED').length === 0 ? (
                  <NoRequests text={"You haven't approved any data requests yet."} />
                ) : (
                  reqests.filter((request) => request.status == 'CONSENT_GRANTED').map((request) => {
                    return (
                      <DataRequest
                          key={request.requestID}
                          type={request.type || "on-chain"}  
                          from={request.doctorID}
                          to={request.patientID}
                          status={request.status}
                          id={request.requestID}
                          about={request.about || "N/A"}
                          date={request.date || "N/A"}
                          time={request.time || "N/A"}
                          optionsVisible={false}
                      />
                    )
                  })
                )
              }
            </View>
          </ScrollView>
        </View>
    </SafeAreaView>
  )
}

export default proceedRequests
