import { create } from 'zustand';
import * as configApi from '../api/configApi';

const useConfigStore = create((set, get) => ({
  documentTypes: [],
  loading: false,

  fetchDocumentTypes: async () => {
    set({ loading: true });
    try {
      const res = await configApi.getDocumentTypes();
      set({ documentTypes: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createDocumentType: async (data) => {
    await configApi.createDocumentType(data);
    await get().fetchDocumentTypes();
  },

  updateDocumentType: async (id, data) => {
    await configApi.updateDocumentType(id, data);
    await get().fetchDocumentTypes();
  },

  deleteDocumentType: async (id) => {
    await configApi.deleteDocumentType(id);
    await get().fetchDocumentTypes();
  },
}));

export default useConfigStore;
