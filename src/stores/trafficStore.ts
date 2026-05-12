import { defineStore } from 'pinia';
import { ref, computed, shallowRef, markRaw } from 'vue';
import type { CapturedRequest, FilterOptions } from '@shared/types';

export const useTrafficStore = defineStore('traffic', () => {
  // State
  const requests = shallowRef<CapturedRequest[]>([]);
  const selectedRequest = ref<CapturedRequest | null>(null);
  const isLoading = ref(false);
  const totalCount = ref(0);
  
  const filter = ref<FilterOptions>({
    searchQuery: '',
    methods: [],
    statusCodes: [],
    hosts: [],
    contentTypes: [],
    limit: 500,
    offset: 0,
    useRegex: false,
    searchInBody: false,
    searchInHeaders: false,
  });

  // Internal cache for searchable text to avoid repeated stringification
  const searchableCache = new Map<number, string>();

  // Getters
  const requestCount = computed(() => requests.value.length);
  
  const uniqueHosts = computed(() => {
    const hosts = new Set(requests.value.map(r => r.host));
    return Array.from(hosts).sort();
  });
  
  const uniqueMethods = computed(() => {
    const methods = new Set(requests.value.map(r => r.method));
    return Array.from(methods).sort();
  });
  
  const uniqueContentTypes = computed(() => {
    const types = new Set(
      requests.value
        .map(r => r.contentType)
        .filter(Boolean)
        .map(ct => ct.split(';')[0].trim())
    );
    return Array.from(types).sort();
  });

  const filteredRequests = computed(() => {
    const allRequests = requests.value;
    if (allRequests.length === 0) return [];

    let result = [...allRequests];
    const { searchQuery, useRegex, searchInBody, searchInHeaders, methods, statusCodes, minSize, maxSize, minDuration, maxDuration, hosts, contentTypes, dateRange } = filter.value;
    
    // Search query
    if (searchQuery) {
      if (useRegex) {
        try {
          const regex = new RegExp(searchQuery, 'i');
          result = result.filter(r => {
            if (regex.test(r.url) || regex.test(r.host) || regex.test(r.path)) return true;
            
            if (searchInBody) {
              if (r.requestBody && regex.test(r.requestBody)) return true;
              if (r.responseBody && regex.test(r.responseBody)) return true;
            }
            
            if (searchInHeaders) {
              let headerText = searchableCache.get(r.id);
              if (headerText === undefined) {
                headerText = JSON.stringify(r.requestHeaders) + JSON.stringify(r.responseHeaders);
                searchableCache.set(r.id, headerText);
              }
              if (regex.test(headerText)) return true;
            }
            
            return false;
          });
        } catch (e) {
          console.warn('Invalid regex:', e);
        }
      } else {
        const lowerQuery = searchQuery.toLowerCase();
        result = result.filter(r => {
          if (r.url.toLowerCase().includes(lowerQuery) || 
              r.host.toLowerCase().includes(lowerQuery) || 
              r.path.toLowerCase().includes(lowerQuery)) {
            return true;
          }
          
          if (searchInBody) {
            if (r.requestBody && r.requestBody.toLowerCase().includes(lowerQuery)) return true;
            if (r.responseBody && r.responseBody.toLowerCase().includes(lowerQuery)) return true;
          }
          
          if (searchInHeaders) {
            let headerText = searchableCache.get(r.id);
            if (headerText === undefined) {
              headerText = (JSON.stringify(r.requestHeaders) + JSON.stringify(r.responseHeaders)).toLowerCase();
              searchableCache.set(r.id, headerText);
            }
            if (headerText.includes(lowerQuery)) return true;
          }
          
          return false;
        });
      }
    }
    
    // Methods
    if (methods && methods.length > 0) {
      result = result.filter(r => methods.includes(r.method));
    }
    
    // Status codes
    if (statusCodes?.length) {
      result = result.filter(r => statusCodes.some(code => r.status.toString().startsWith(code[0])));
    }
    
    // Size filtering
    if (minSize !== null && minSize !== undefined) result = result.filter(r => r.size >= minSize);
    if (maxSize !== null && maxSize !== undefined) result = result.filter(r => r.size <= maxSize);
    
    // Duration filtering
    if (minDuration !== null && minDuration !== undefined) result = result.filter(r => r.duration >= minDuration);
    if (maxDuration !== null && maxDuration !== undefined) result = result.filter(r => r.duration <= maxDuration);
    
    // Hosts
    if (hosts && hosts.length > 0) result = result.filter(r => hosts.includes(r.host));
    
    // Content types
    if (contentTypes && contentTypes.length > 0) {
      result = result.filter(r => {
        const ct = r.contentType.split(';')[0].trim();
        return contentTypes.includes(ct);
      });
    }
    
    // Date range
    if (dateRange) {
      result = result.filter(r => 
        r.timestamp >= dateRange.start &&
        r.timestamp <= dateRange.end
      );
    }
    
    return result;
  });

  // Actions
  async function loadRequests(filterOptions?: FilterOptions) {
    isLoading.value = true;
    try {
      // Strip Vue reactivity proxies — IPC structured clone can't handle them
      const plainFilter = JSON.parse(JSON.stringify(filterOptions || filter.value));
      const result = await window.electronAPI.getRequests(plainFilter);
      requests.value = result.map(r => markRaw(r));
      totalCount.value = await window.electronAPI.getRequestCount();
      searchableCache.clear();
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      isLoading.value = false;
    }
  }

  function addRequest(request: CapturedRequest | CapturedRequest[]) {
    const newRequests = Array.isArray(request) ? request.map(r => markRaw(r)) : [markRaw(request)];
    
    // Update shallow array by creating a new reference
    const updated = [...newRequests, ...requests.value];
    
    // Limit array size for performance
    if (updated.length > 5000) {
      requests.value = updated.slice(0, 5000);
      // Clean cache for old requests
      if (searchableCache.size > 6000) searchableCache.clear();
    } else {
      requests.value = updated;
    }
    
    totalCount.value += newRequests.length;
  }

  function updateRequest(request: CapturedRequest) {
    const rawRequest = markRaw(request);
    const index = requests.value.findIndex(r => r.id === rawRequest.id);
    if (index !== -1) {
      const updated = [...requests.value];
      updated[index] = rawRequest;
      requests.value = updated;
      
      // Update selected if it's the same
      if (selectedRequest.value?.id === rawRequest.id) {
        selectedRequest.value = rawRequest;
      }
    } else {
      addRequest(rawRequest);
    }
  }

  function setSelectedRequest(request: CapturedRequest | null) {
    selectedRequest.value = request ? markRaw(request) : null;
  }

  function updateFilter(newFilter: Partial<FilterOptions>) {
    filter.value = { ...filter.value, ...newFilter };
  }

  function clearFilter() {
    filter.value = {
      searchQuery: '',
      methods: [],
      statusCodes: [],
      hosts: [],
      contentTypes: [],
      limit: 500,
      offset: 0,
      useRegex: false,
      searchInBody: false,
      searchInHeaders: false,
    };
  }

  async function clearAll() {
    try {
      await window.electronAPI.clearRequests();
      requests.value = [];
      selectedRequest.value = null;
      totalCount.value = 0;
      searchableCache.clear();
    } catch (error) {
      console.error('Failed to clear requests:', error);
    }
  }

  async function deleteRequest(id: number) {
    try {
      await window.electronAPI.deleteRequest(id);
      requests.value = requests.value.filter(r => r.id !== id);
      if (selectedRequest.value?.id === id) {
        selectedRequest.value = null;
      }
      totalCount.value--;
      searchableCache.delete(id);
    } catch (error) {
      console.error('Failed to delete request:', error);
    }
  }

  async function refreshRequestById(id: number) {
    try {
      const request = await window.electronAPI.getRequestById(id);
      if (request) {
        updateRequest(request);
        return request;
      }
    } catch (error) {
      console.error('Failed to refresh request:', error);
    }
    return null;
  }

  return {
    // State
    requests,
    selectedRequest,
    isLoading,
    totalCount,
    filter,
    
    // Getters
    requestCount,
    uniqueHosts,
    uniqueMethods,
    uniqueContentTypes,
    filteredRequests,
    
    // Actions
    loadRequests,
    addRequest,
    updateRequest,
    setSelectedRequest,
    updateFilter,
    clearFilter,
    clearAll,
    deleteRequest,
    refreshRequestById,
  };
});
