import client from './client';

export const uploadPdf = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return client.post('/jobs/upload', formData);
};

export const startBatch = () => client.post('/jobs/start-batch');

export const getJobs = (params) => client.get('/jobs', { params });

export const getJobDetail = (jobId) => client.get(`/jobs/${jobId}`);

export const getJobPages = (jobId) => client.get(`/jobs/${jobId}/pages`);

export const getPagePreview = (jobId, pageNum) =>
  client.get(`/jobs/${jobId}/page/${pageNum}/preview`, { responseType: 'blob' });

export const getSourcePdf = (jobId) =>
  client.get(`/jobs/${jobId}/source`, { responseType: 'blob' });

export const getOutputPdf = (jobId, docId) =>
  client.get(`/jobs/${jobId}/output/${docId}`, { responseType: 'blob' });

export const getReviewJobs = () => client.get('/review/jobs');

export const patchReviewPages = (jobId, assignments) =>
  client.patch(`/review/jobs/${jobId}/pages`, { assignments });

export const confirmReview = (jobId) => client.post(`/review/jobs/${jobId}/confirm`);
