import { View, Text, Alert, Animated } from 'react-native';
import React, { useState } from 'react';
import CustomButton from './CustomButton';
import apiClient, { blockchainUrl } from '../services/apiClient';

const AccesptReject = ({ requestID, patientID, updateStatus, setCardStatus, requestLoadingStatus, setrequestLoadingFunc, expandCardFunc }) => {
    const [loading, setLoading] = useState(false);

    const handleAccept = async () => {
        setLoading(true);
        console.log('Accept');

        try {
            setrequestLoadingFunc(true)
            const response = await apiClient.post(blockchainUrl('/provideConsent'), {
                patientID,
                requestID,
            });
            console.log("Consent Granted:", response.data);
            Alert.alert("Success", "Request accepted successfully!");
            updateStatus("CONSENT_GRANTED");
        } catch (error) {
            setTimeout(() => {
                console.error("Error Accepting Request:", error.response?.data || error.message);
            }, 5000)
        } finally {
            setTimeout(() => {
                setrequestLoadingFunc(false)
                expandCardFunc()
            }, 5000)
            setLoading(false);
            setCardStatus(false)
        }
    };

    const handleReject = async () => {
        setLoading(true);
        console.log('Reject');
        try {
            setrequestLoadingFunc(true)
            const response = await apiClient.post(blockchainUrl('/rejectRequest'), {
                patientID,
                requestID,
                rejectionReason: "Not authorized",
            });
            console.log("Request Rejected:", response.data);
            Alert.alert("Success", "Request rejected successfully!");
            updateStatus("REQUEST_REJECTED");
        } catch (error) {
            setTimeout(() => {
                console.error("Error Accepting Request:", error.response?.data || error.message);
            }, 5000)
        } finally {
            setTimeout(() => {
                setrequestLoadingFunc(false)
                expandCardFunc()
            }, 5000)
            setLoading(false);
            setCardStatus(false)
        }
    };

    return (
        <View className="flex flex-row gap-x-4">
            <CustomButton
                key="reject"
                classes={"grow"}
                containerClasses={"border border-red-500 p-2 rounded-xl bg-red-500"}
                text={"Reject"}
                textClasses={"text-center text-white font-semibold text-lg"}
                handleClick={handleReject}
                disabled={loading}
            />

            <CustomButton
                key="accept"
                classes={"grow"}
                containerClasses={"border border-green-500 p-2 rounded-xl bg-green-500"}
                text={"Accept"}
                textClasses={"text-center text-white font-semibold text-lg"}
                handleClick={handleAccept}
                disabled={loading}
            />
        </View>
    );
};

export default AccesptReject;
