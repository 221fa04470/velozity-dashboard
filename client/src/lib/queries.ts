import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Client, DirectoryUser, Project } from '../types';

export const useDevelopers = (enabled = true) =>
  useQuery({
    queryKey: ['users', 'developers'],
    enabled,
    queryFn: async () => (await api<{ data: DirectoryUser[] }>('/users', { query: { role: 'DEVELOPER', active: true } })).data,
    staleTime: 60_000,
  });

export const useClients = (enabled = true) =>
  useQuery({
    queryKey: ['clients'],
    enabled,
    queryFn: async () => (await api<{ data: Client[] }>('/clients')).data,
  });

export const useProjects = () =>
  useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api<{ data: Project[] }>('/projects')).data,
  });
