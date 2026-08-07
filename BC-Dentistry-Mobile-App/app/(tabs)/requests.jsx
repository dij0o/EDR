import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect } from 'react';
import axios from 'axios';

import { RequestsHeader, DataRequest, NoRequests } from '../../components';
import { authHeaders, databaseUrl, getPatientBlockchainID } from '../../utils/api';

import { useUser } from '../../Context/UserContext';
import { useRouter } from 'expo-router';


const Requests = () => {

    const { user, token } = useUser()
    const router = useRouter();
    const patientID = getPatientBlockchainID(user);


    // useEffect(() => {
    //     console.log('====================================');
    //     console.log(user);
    //     console.log('====================================');
    // }, [])





    const [requests, setRequests] = useState([]); // Store API response
    const [loading, setLoading] = useState(true);

    const fetchRequests = async () => {
            if (!token || !patientID) {
                console.warn("Missing authenticated patient identity. Cannot fetch requests.");
                setLoading(false);
                return;
            }

            try {
                const response = await axios.get(databaseUrl(`/getAllRequestsForPatient/${patientID}`), {
                    headers: authHeaders(token),
                });
                // console.log("Fetched Requests:", response.data);
                
                const payload = response.data?.data || response.data || [];
                setRequests(Array.isArray(payload) ? payload : []);
            } catch (error) {
                console.error("API Error:", error.response?.data || error.message);
            } finally {
                setLoading(false);
            }
    };

    useEffect(() => {
        fetchRequests();
    }, [token, patientID]);

    const pendingRequests = requests.filter((request) => request.status === 'PENDING_PATIENT_CONSENT');
    const grantedRequests = requests.filter((request) => request.status === 'CONSENT_GRANTED' || request.lifecycleStatus === 'ACTIVE');
    const rejectedRequests = requests.filter((request) => request.status === 'REJECTED' || request.status === 'REVOKED');

    return (
        <View>
            <StatusBar style='light' />

            {/* Requests Header */}
            <RequestsHeader requests={pendingRequests} />

            <View className="mx-8 mt-6 flex-row gap-3">
                <TouchableOpacity accessibilityRole="button" className="flex-1 rounded-xl bg-green-700 p-4" onPress={() => router.push('/proceedRequests')}>
                    <Text className="text-center font-semibold text-white">Granted consent ({grantedRequests.length})</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" className="flex-1 rounded-xl bg-slate-700 p-4" onPress={() => router.push('/rejectedRequests')}>
                    <Text className="text-center font-semibold text-white">Closed requests ({rejectedRequests.length})</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className='px-8 flex flex-col gap-y-8 h-[60vh]'>

                <View className="flex flex-col gap-6 py-10">
                    {/* <DataRequest
                        key={101}  // Use API ID
                        type={"on-chain"}  
                        from={"Ali"}
                        to={"Ahmad"}
                        status={'PENDING_PATIENT_CONSENT'}
                        id={'017a2f8212e23b45eadf4a519460434b40a23eee754a48b5e0625bba9dc5c086'}
                        about={ "N/A"}
                        date={ "N/A"}
                        time={ "N/A"}
                    /> */}
                    {loading ? (
                        <Text>Loading requests...</Text>
                    ) : !token || !patientID ? (
                        <NoRequests text={"Patient blockchain identity is not linked to this account yet."} />
                    ) : pendingRequests.length === 0 ? (
                        <NoRequests text={"All done, you don't have any pending requests!"} />
                    ) : (
                        pendingRequests.map((request) => (
                            <DataRequest
                                key={request.requestID}  // Use API ID
                                type={request.type || "on-chain"}  
                                from={request.doctorID}
                                to={request.patientID}
                                status={request.status}
                                id={request.requestID}
                                about={request.purpose || request.reason || request.dataType || "N/A"}
                                date={request.requestedAt ? request.requestedAt.slice(0, 10) : "N/A"}
                                time={request.requestedAt ? request.requestedAt.slice(11, 16) : "N/A"}
                                onStatusChanged={fetchRequests}
                            />
                        ))
                    )}
                </View>

            </ScrollView>
        </View>
    );
};

export default Requests;
