import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect } from 'react';

import { RequestsHeader, DataRequest, NoRequests } from '../../components';
import apiClient, { blockchainUrl, getPatientBlockchainID } from '../../services/apiClient';
import { useUser } from '../../Context/UserContext';

const Requests = () => {
    const { user } = useUser();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const patientID = getPatientBlockchainID(user);

    useEffect(() => {
        const fetchRequests = async () => {
            if (!patientID) {
                setLoading(false);
                return;
            }

            try {
                const response = await apiClient.get(blockchainUrl(`/getAllRequestsForPatient/${patientID}`));
                if (response.data?.length > 0) {
                    setRequests(response.data.filter((request) => request.status == 'PENDING_PATIENT_CONSENT'));
                } else {
                    setRequests([]);
                }
            } catch (error) {
                console.error("API Error:", error.response?.data || error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchRequests();
    }, [patientID]);

    return (
        <View>
            <StatusBar style='light' />
            <RequestsHeader requests={requests} />
            <ScrollView className='px-8 flex flex-col gap-y-8 h-[60vh]'>
                <View className="flex flex-col gap-6 py-10">
                    {loading ? (
                        <Text className="text-center text-gray-500">Loading requests...</Text>
                    ) : !patientID ? (
                        <NoRequests text={"Unable to load your data. Patient account ID is missing."} />
                    ) : requests.length === 0 ? (
                        <NoRequests text={"All done, you don't have any pending requests!"} />
                    ) : (
                        requests.filter((request) => request.status == 'PENDING_PATIENT_CONSENT').map((request) => (
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
                            />
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );
};

export default Requests;
