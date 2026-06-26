import client from './client';

export const uploadPdf = (file, projectId, batchId) => {
  const formData = new FormData();
  formData.append('file', file);
  if (projectId) formData.append('project_id', projectId);
  if (batchId) formData.append('batch_id', batchId);
  return client.post('/jobs/upload', formData);
};

export const deleteJob = (jobId) => client.delete(`/jobs/${jobId}`);

export const startBatch = (projectId) => {
  const formData = new FormData();
  if (projectId) formData.append('project_id', projectId);
  return client.post('/jobs/start-batch', formData);
};

export const getJobs = (params) => client.get('/jobs', { params });

export const getJobDetail = (jobId) => client.get(`/jobs/${jobId}`);

export const getJobPages = (jobId) => client.get(`/jobs/${jobId}/pages`);

export const getPagePreview = (jobId, pageNum) =>
  client.get(`/jobs/${jobId}/page/${pageNum}/preview`, { responseType: 'blob' });

export const getSourcePdf = (jobId) =>
  client.get(`/jobs/${jobId}/source`, { responseType: 'blob' });

export const getOutputPdf = (jobId, docId) =>
  client.get(`/jobs/${jobId}/output/${docId}`, { responseType: 'blob' });

export const getReviewJobs = (projectId) =>
  client.get('/review/jobs', { params: projectId ? { project_id: projectId } : {} });

export const patchReviewPages = (jobId, assignments) =>
  client.patch(`/review/jobs/${jobId}/pages`, { assignments });

export const confirmReview = (jobId) => client.post(`/review/jobs/${jobId}/confirm`);
