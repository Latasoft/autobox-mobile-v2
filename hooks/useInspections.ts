import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import apiService from '../services/apiService';
import authService from '../services/authService';
import { Inspection } from '../types';

export function useInspections() {
  const params = useLocalSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [myInspections, setMyInspections] = useState<Inspection[]>([]);
  const [myPublicationInspections, setMyPublicationInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'requests' | 'publications'>('requests');

  useEffect(() => {
    if (params.tab && (params.tab === 'requests' || params.tab === 'publications')) {
      setActiveTab(params.tab as 'requests' | 'publications');
    }
  }, [params.tab]);

  const checkAuth = async () => {
    const auth = await authService.isAuthenticated();
    setIsAuthenticated(auth);
    return auth;
  };

  const loadInspections = async () => {
    try {
      setLoading(true);
      const [requests, publications] = await Promise.all([
        apiService.getMyInspections({ order: 'DESC', sortBy: 'updatedAt' }),
        apiService.getMyPublicationsInspections({ order: 'DESC', sortBy: 'updatedAt' })
      ]);
      setMyInspections(Array.isArray(requests) ? requests : []);
      setMyPublicationInspections(Array.isArray(publications) ? publications : []);
    } catch (error) {
      console.error('Error loading inspections:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      let timer: any;

      checkAuth().then((auth) => {
        if (auth && isMounted) {
          loadInspections();
          timer = setInterval(() => {
            loadInspections();
          }, 15000);
        }
      });

      return () => {
        isMounted = false;
        if (timer) clearInterval(timer);
      };
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadInspections();
  };

  return {
    isAuthenticated,
    myInspections,
    myPublicationInspections,
    loading,
    refreshing,
    onRefresh,
    activeTab,
    setActiveTab
  };
}
