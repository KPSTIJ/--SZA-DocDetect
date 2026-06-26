import { create } from 'zustand';
import * as projectApi from '../api/projectApi';

const STORAGE_KEY = 'sza_selected_project';

const useProjectStore = create((set, get) => ({
  projects: [],
  selectedProjectId: localStorage.getItem(STORAGE_KEY) || null,
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const res = await projectApi.getProjects();
      const projects = res.data;
      const currentId = get().selectedProjectId;
      if (currentId && !projects.find(p => String(p.id) === String(currentId))) {
        set({ projects, loading: false, selectedProjectId: null });
        localStorage.removeItem(STORAGE_KEY);
      } else {
        set({ projects, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  createProject: async (name) => {
    const res = await projectApi.createProject(name);
    const project = res.data;
    set((s) => ({
      projects: [project, ...s.projects],
      selectedProjectId: project.id,
    }));
    localStorage.setItem(STORAGE_KEY, project.id);
    return project;
  },

  deleteProject: async (id) => {
    const wasSelected = get().selectedProjectId === id;
    await projectApi.deleteProject(id);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      selectedProjectId: wasSelected ? null : s.selectedProjectId,
    }));
    if (wasSelected) localStorage.removeItem(STORAGE_KEY);
  },

  setSelectedProject: (id) => {
    set({ selectedProjectId: id });
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  },
}));

export default useProjectStore;
