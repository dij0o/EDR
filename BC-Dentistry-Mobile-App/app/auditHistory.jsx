import { View, Text, SafeAreaView, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import React, { useEffect, useState, useCallback } from 'react';
import apiClient, { databaseUrl, getPatientBlockchainID } from '../services/apiClient';
import { useUser } from '../Context/UserContext';
import { NoRequests } from '../components';

const AuditHistoryScreen = () => {
  const { user } = useUser();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const patientID = getPatientBlockchainID(user);

  const fetchAuditLogs = useCallback(async () => {
    if (!patientID) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiClient.get(databaseUrl(`/audit/clinical-access/${patientID}`));
      const list = Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : response.data?.logs || [];

      setLogs(list);
    } catch (error) {
      console.error('[AuditHistory] Error fetching clinical access logs:', error.response?.data || error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientID]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  return (
    <SafeAreaView className="bg-white flex-1">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1E3A8A']} tintColor="#1E3A8A" />
        }
      >
        <View className="flex flex-col gap-4 p-6">
          <Text className="text-2xl font-bold">Access Audit History</Text>
          <Text className="text-sm text-gray-500 mb-2 leading-5">
            Immutable log of clinical record access events for your patient account.
          </Text>

          {loading ? (
            <ActivityIndicator size="large" color="#1E3A8A" className="mt-8" />
          ) : !patientID ? (
            <NoRequests text="Unable to load audit history. Patient account ID is missing." />
          ) : logs.length === 0 ? (
            <NoRequests text="No record access events recorded yet." />
          ) : (
            logs.map((log, index) => {
              const dateStr = log.timestamp || log.Date || log.createdAt ? new Date(log.timestamp || log.Date || log.createdAt).toLocaleString() : 'N/A';
              const actorName = log.actorName || log.Doctor_Name || log.actorID || log.doctorID || 'Clinical Provider';
              const action = log.action || log.Action || log.type || 'RECORD_ACCESSED';
              const purpose = log.purpose || log.Purpose || log.Meeting_For || log.about || 'Clinical Review';

              return (
                <View
                  key={log.id || log.logID || index}
                  className="bg-gray-50 p-4 rounded-2xl border border-gray-200 flex flex-col gap-y-2"
                >
                  <View className="flex flex-row justify-between items-center">
                    <Text className="text-base font-bold text-gray-900">{actorName}</Text>
                    <View className="bg-blue-100 px-2 py-1 rounded-md">
                      <Text className="text-blue-900 text-xs font-bold uppercase">{action}</Text>
                    </View>
                  </View>

                  <Text className="text-sm text-gray-600">
                    <Text className="font-semibold text-gray-800">Purpose: </Text>
                    {purpose}
                  </Text>

                  <Text className="text-xs text-gray-400 font-light mt-1">{dateStr}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AuditHistoryScreen;
