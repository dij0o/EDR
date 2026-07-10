// import { View, Text } from 'react-native'
// import React from 'react'

// import { CustomButton } from './index'

// const AccesptReject = ({func}) => {
//   return (
//     <View className="flex flex-row gap-x-4">
//             <CustomButton
//                 key={2}
//                 classes={"grow"}
//                 containerClasses={"border border-red-500 p-2 rounded-xl bg-red-500"}
//                 text={'Reject'}
//                 textClasses={"text-center text-white font-semibold text-lg"}
//                 handleClick={func}
//             />

//             <CustomButton
//                 key={4}
//                 classes={"grow"}
//                 containerClasses={"border border-green-500 p-2 rounded-xl bg-green-500"}
//                 text={'Accept'}
//                 textClasses={"text-center text-white font-semibold text-lg"}
//                 handleClick={func}
//             />

//         </View>

//   )
// }

// export default AccesptReject
import { View, Text, Alert, Animated } from 'react-native';
import React, { useState } from 'react';
import axios from 'axios';
import { CustomButton } from './index';
import { authHeaders, blockchainUrl } from '../utils/api';
import { useUser } from '../Context/UserContext';

const AccesptReject = ({ requestID, patientID, updateStatus, setCardStatus, requestLoadingStatus, setrequestLoadingFunc, expandCardFunc }) => {
    const [loading, setLoading] = useState(false);
    const { token } = useUser();

    const handleAccept = async () => {
      if (!token) {
          Alert.alert("Login required", "Please sign in again before approving requests.");
          return;
      }

      setLoading(true);
      console.log('Accept');
      
      try {
          setrequestLoadingFunc(true)
          const response = await axios.post(blockchainUrl('/provideConsent'), {
              patientID,
              requestID,
            }, {
              headers: authHeaders(token),
            });
            console.log("Consent Granted:", response.data);
            Alert.alert("Success", "Request accepted successfully!");
            updateStatus("CONSENT_GRANTED"); // 🔥 UI will update dynamically
        } catch (error) {
            setTimeout(()=>{
                console.error("Error Accepting Request:", error.response?.data || error.message);
                //   Alert.alert("Error", "Failed to accept request.");
                
            }, 5000)
        } finally {
            setTimeout(()=>{
                setrequestLoadingFunc(false)
                expandCardFunc()
            }, 5000)
            setLoading(false);
            setCardStatus(false)
            
        }
    };
    
    const handleReject = async () => {
        if (!token) {
            Alert.alert("Login required", "Please sign in again before rejecting requests.");
            return;
        }

        setLoading(true);
        console.log('Reject');
        try {
            setrequestLoadingFunc(true)
            const response = await axios.post(blockchainUrl('/rejectRequest'), {
              patientID,
              requestID,
              rejectionReason: "Not authorized", // You can modify this
            }, {
              headers: authHeaders(token),
            });
            console.log("Request Rejected:", response.data);
            Alert.alert("Success", "Request rejected successfully!");
            updateStatus("REQUEST_REJECTED"); // 🔥 UI will update dynamically
        } catch (error) {
            setTimeout(()=>{
                console.error("Error Accepting Request:", error.response?.data || error.message);
                //   Alert.alert("Error", "Failed to accept request.");
                // Alert.alert("Error", "Failed to reject request.");
                
            }, 5000)
            // console.error("Error Rejecting Request:", error.response?.data || error.message);
      } finally {
            setTimeout(()=>{
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
