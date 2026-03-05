import { useState, useCallback, useRef, useEffect } from 'react';
import apiService from '../services/apiService';

export const useMyPublications = () => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  
  const pageRef = useRef(0);
  const PAGE_SIZE = 12;

  const loadPublications = useCallback(async (pageNum = 1) => {
    if (pageNum === 1) setLoading(true);
    if (pageNum > 1) setLoadingMore(true);
    
    try {
      const offset = (pageNum - 1) * PAGE_SIZE;
      const data = await apiService.getMyPublications(PAGE_SIZE, offset);
      
      if (pageNum === 1) {
        setVehicles(data);
      } else {
        setVehicles(prev => [...prev, ...data]);
      }
      
      setHasMore(data.length === PAGE_SIZE);
      pageRef.current = pageNum;
      
    } catch (error) {
      console.error('Error loading my publications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setIsInitialized(true);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    pageRef.current = 0;
    loadPublications(1);
  }, [loadPublications]);

  const loadMore = useCallback(() => {
    // Load first page if not initialized yet
    if (!isInitialized) {
      loadPublications(1);
    } else if (!loading && !loadingMore && hasMore) {
      loadPublications(pageRef.current + 1);
    }
  }, [loading, loadingMore, hasMore, isInitialized, loadPublications]);

  return {
    vehicles,
    loading,
    refreshing,
    loadingMore,
    onRefresh,
    loadMore,
    hasMore,
  };
};
