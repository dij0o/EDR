import { View, Text, SafeAreaView, ScrollView } from 'react-native'
import { useEffect, useState } from 'react';
import React from 'react'
import { NoRequests, Document } from '../components';
import apiClient, { blockchainUrl, getPatientBlockchainID } from '../services/apiClient';
import { useUser } from '../Context/UserContext';

const documents = () => {
    const { user } = useUser();
    const [ documents, setDocuments ] = useState([])
    const [ loading, setIsLoading ] = useState(true)

    const patientID = getPatientBlockchainID(user);

    useEffect(() => {
        const fetchDoucments = async () => {
            if (!patientID) {
                setIsLoading(false);
                return;
            }

            try{
                setIsLoading(true)
                const response = await apiClient.get(blockchainUrl(`/getAllRequestsForPatient/${patientID}`));
                const uploadedDocuments = await response.data?.filter((data) => {data.documents})
                uploadedDocuments == undefined ? setDocuments([]) : setDocuments(uploadedDocuments)
            }catch(error){
                console.error("API error", error.message)
            }
            finally{
                setIsLoading(false)
            }
        }

        fetchDoucments()
    }, [patientID])

  return (
    <SafeAreaView>
        <View className='flex flex-col gap-4 p-6'>
            {!patientID ? (
                <NoRequests text={"Unable to load your data. Patient account ID is missing."} />
            ) : (
                <>
                    <Document
                        key={1}
                        title='Terms & Conditions policies'
                        type={'pdf'}
                        size={'1.2 MB'}
                        content={''}
                    />
                    <Document
                        key={2}
                        title='Sharing data Consent'
                        type={'pdf'}
                        size={'1.2 MB'}
                        content={''}
                    />
                    <Document
                        key={4}
                        title='DICOM Image'
                        type={'dicom'}
                        size={'1.2 MB'}
                        content={''}
                    />
                    <Document
                        key={3}
                        title='Personal Photo'
                        type={'jpeg'}
                        size={'1.2 MB'}
                        content={''}
                    />
                </>
            )}
        </View>
    </SafeAreaView>
  )
}

export default documents
