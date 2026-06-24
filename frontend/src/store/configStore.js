import { create } from 'zustand';
import * as configApi from '../api/configApi';
import useProjectStore from './projectStore';

const useConfigStore = create((set, get) => ({
  documentTypes: [],
  loading: false,

  fetchDocumentTypes: async () => {
    const projectId = useProjectStore.getState().selectedProjectId;
    if (!projectId) {
      set({ documentTypes: [], loading: false });
      return;
    }
    set({ loading: true });
    try {
      const res = await configApi.getDocumentTypes(projectId);
      set({ documentTypes: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createDocumentType: async (data) => {
    const projectId = useProjectStore.getState().selectedProjectId;
    const payload = { ...data, project_id: projectId };
    await configApi.createDocumentType(payload);
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
