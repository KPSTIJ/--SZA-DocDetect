import { create } from 'zustand';
import * as jobsApi from '../api/jobsApi';

const useJobStore = create((set, get) => ({
  jobs: [],
  reviewJobs: { needs_review: [], done: [], failed: [], stats: {} },
  loading: false,
  pollingInterval: null,
  selectedPages: {},

  uploadFiles: async (files) => {
    set({ loading: true });
    for (const file of files) {
      await jobsApi.uploadPdf(file);
    }
    set({ loading: false });
  },

  startBatch: async () => {
    await jobsApi.startBatch();
    get().startPolling();
  },

  fetchJobs: async () => {
    const res = await jobsApi.getJobs({ limit: 100 });
    set({ jobs: res.data.items });
  },

  fetchReviewJobs: async () => {
    const res = await jobsApi.getReviewJobs();
    set({ reviewJobs: res.data });
  },

  startPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) return;
    const interval = setInterval(async () => {
      try {
        await get().fetchJobs();
        await get().fetchReviewJobs();
      } catch {
        // ignore
      }
    }, 3000);
    set({ pollingInterval: interval });
  },

  stopPolling: () => {
    const { pollingInterval } = get();
    if (pollingInterval) {
      clearInterval(pollingInterval);
      set({ pollingInterval: null });
    }
  },

  togglePageSelection: (jobId, pageNum) => {
    set((state) => {
      const current = new Set(state.selectedPages[jobId] || []);
      if (current.has(pageNum)) {
        current.delete(pageNum);
      } else {
        current.add(pageNum);
      }
      return { selectedPages: { ...state.selectedPages, [jobId]: current } };
    });
  },

  clearSelection: (jobId) => {
    set((state) => {
      const updated = { ...state.selectedPages };
      delete updated[jobId];
      return { selectedPages: updated };
    });
  },

  patchPages: async (jobId, assignments) => {
    await jobsApi.patchReviewPages(jobId, assignments);
    get().clearSelection(jobId);
    await get().fetchReviewJobs();
  },

  confirmJob: async (jobId) => {
    await jobsApi.confirmReview(jobId);
    await get().fetchReviewJobs();
  },
}));

export default useJobStore;
