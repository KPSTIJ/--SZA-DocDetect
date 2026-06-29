import { create } from 'zustand';
import * as jobsApi from '../api/jobsApi';
import useProjectStore from './projectStore';

const useJobStore = create((set, get) => ({
  jobs: [],
  reviewJobs: { needs_review: [], done: [], failed: [], in_progress: [], stats: {} },
  loading: false,
  pollingInterval: null,
  selectedPages: {},
  pdfViewer: { open: false, jobId: null, filename: null },

  getProgress: () => {
    const jobs = get().jobs;
    const total = jobs.length;
    if (total === 0) return { total: 0, pending: 0, running: 0, done: 0, needs_review: 0, failed: 0, percent: 0 };
    const pending = jobs.filter(j => j.status === 'pending').length;
    const running = jobs.filter(j => j.status === 'running').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const done = jobs.filter(j => j.status === 'done' && (j.error_pages || 0) === 0).length;
    const needs_review = jobs.filter(j => j.status === 'needs_review' || (j.status === 'done' && (j.error_pages || 0) > 0)).length;
    const completed = done + failed + needs_review;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, pending, running, done, needs_review, failed, percent, completed };
  },

  uploadFiles: async (files) => {
    const projectId = useProjectStore.getState().selectedProjectId;
    const batchId = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + Date.now().toString().slice(-12).padStart(12, '0');
    set({ loading: true });
    try {
      for (const file of files) {
        await jobsApi.uploadPdf(file, projectId, batchId);
      }
    } finally {
      set({ loading: false });
    }
  },

  deleteJob: async (jobId) => {
    await jobsApi.deleteJob(jobId);
    await get().fetchJobs();
    await get().fetchReviewJobs();
  },

  startBatch: async () => {
    const projectId = useProjectStore.getState().selectedProjectId;
    try {
      await jobsApi.startBatch(projectId);
    } finally {
      get().startPolling();
    }
  },

  fetchJobs: async () => {
    const projectId = useProjectStore.getState().selectedProjectId;
    const params = { limit: 100 };
    if (projectId) params.project_id = projectId;
    const res = await jobsApi.getJobs(params);
    const next = res.data.items;
    const prev = get().jobs;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      set({ jobs: next });
    }
  },

  fetchReviewJobs: async (projectId) => {
    const res = await jobsApi.getReviewJobs(projectId || undefined);
    const next = res.data;
    const prev = get().reviewJobs;
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      set({ reviewJobs: next });
    }
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

  openPdfViewer: (jobId, filename) => {
    set({ pdfViewer: { open: true, jobId, filename } });
  },

  closePdfViewer: () => {
    set({ pdfViewer: { open: false, jobId: null, filename: null } });
  },
}));

export default useJobStore;
