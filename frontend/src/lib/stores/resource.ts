import { create } from 'zustand';
import type { Resource } from '../types';

interface ResourceState {
  resources: Resource[];
  isLoading: boolean;
  isUploading: boolean;
  uploadProgress: number;
  error: string | null;

  setResources: (resources: Resource[]) => void;
  addResource: (resource: Resource) => void;
  removeResource: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setUploading: (uploading: boolean, progress?: number) => void;
  setError: (error: string | null) => void;
}

export const useResourceStore = create<ResourceState>((set) => ({
  resources: [],
  isLoading: false,
  isUploading: false,
  uploadProgress: 0,
  error: null,

  setResources: (resources) => set({ resources, isLoading: false }),
  addResource: (resource) => set((s) => ({ resources: [resource, ...s.resources] })),
  removeResource: (id) => set((s) => ({ resources: s.resources.filter((r) => r.id !== id) })),
  setLoading: (isLoading) => set({ isLoading }),
  setUploading: (isUploading, uploadProgress = 0) => set({ isUploading, uploadProgress }),
  setError: (error) => set({ error }),
}));
