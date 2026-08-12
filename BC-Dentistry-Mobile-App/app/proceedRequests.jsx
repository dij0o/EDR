import { View, Text, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native'
import React, { useEffect, useState } from 'react'

import { DataRequest, NoRequests } from '../components'
import { fetchPatientRequests, getPatientBlockchainID } from '../services/apiClient';
import { useUser } from '../Context/UserContext';

const ProceedRequests = () => {
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
    fetchPatientRequests(patientID)
      .then((list) => {
        setRequests(list);
      })
      .catch((error) => {
        console.error("[ProceedRequests] Error:", error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [patientID]);

  const handleStatusChange = (requestId, newStatus) => {
    if (newStatus === 'REVOKED' || newStatus === 'REJECTED') {
      setRequests((prev) => prev.filter((r) => r.requestID !== requestId));
    }
  };

  const activeGrantedRequests = reqests.filter((request) => request.status === 'CONSENT_GRANTED');

  return (
    <SafeAreaView className="bg-white flex-1">
      <View className='flex flex-col gap-4 p-6'>
        <View>
          <Text className='text-2xl font-semibold'>Approved Requests</Text>
          <Text className='text-lg font-light leading-6 text-gray-500'>
            Here you can find all the requests that you have agreed to share information for.
          </Text>
        </View>

        <ScrollView className='pb-4 h-[82vh]'>
          <View className="flex flex-col gap-y-4">
            {
              isLoading ? (
                <ActivityIndicator size="large" color="#1E3A8A" className="mt-8" />
              ) : !patientID ? (
                <NoRequests text={"Unable to load your data. Patient account ID is missing."} />
              ) : activeGrantedRequests.length === 0 ? (
                <NoRequests text={"You haven't approved any active data requests yet."} />
              ) : (
                activeGrantedRequests.map((request) => {
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
                      showRevoke={true}
                      onStatusChange={handleStatusChange}
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

export default ProceedRequests;
