import client from './client';

export const getProjects = () => client.get('/projects');

export const createProject = (name) => client.post('/projects', { name });

export const deleteProject = (id) => client.delete(`/projects/${id}`);
