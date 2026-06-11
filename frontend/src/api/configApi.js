import client from './client';

export const getDocumentTypes = () => client.get('/config/document-types');

export const createDocumentType = (data) => client.post('/config/document-types', data);

export const updateDocumentType = (id, data) => client.put(`/config/document-types/${id}`, data);

export const deleteDocumentType = (id) => client.delete(`/config/document-types/${id}`);
