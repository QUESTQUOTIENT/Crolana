/**
 * src/services/api/ipfsApiService.ts
 * Frontend service for IPFS uploads and configuration.
 */

import { apiClient } from './apiClient';

export interface IPFSConfig {
  provider: 'pinata' | 'infura' | 'lighthouse' | 'manual';
  apiKey?: string;
  secret?: string;
  jwt?: string;
  gateway?: string;
}

export interface UploadResult {
  cid: string;
  gatewayUrl: string;
  jobId?: string;
  fileCount?: number;
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress?: number;
  cid?: string;
  error?: string;
}

export interface PinStatus {
  pinned: boolean;
  cid: string;
  provider: string;
  size?: number;
}

export const ipfsApiService = {
  /** Save IPFS provider configuration */
  saveConfig(userId: string, config: IPFSConfig): Promise<{ success: boolean; message: string }> {
    return apiClient.post('/api/ipfs/config', { userId, ...config });
  },

  /** Retrieve saved IPFS config for a user */
  getConfig(userId: string): Promise<{ provider: string; gateway: string } | null> {
    return apiClient.get(`/api/ipfs/config?userId=${encodeURIComponent(userId)}`);
  },

  /** Upload a batch of image files — returns jobId for polling */
  uploadImages(userId: string, files: File[]): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('userId', userId);
    files.forEach((f) => form.append('files', f));
    return apiClient.upload('/api/ipfs/upload/images', form);
  },

  /** Upload a batch of metadata JSON files — returns jobId for polling */
  uploadMetadata(userId: string, files: File[]): Promise<{ jobId: string }> {
    const form = new FormData();
    form.append('userId', userId);
    files.forEach((f) => form.append('files', f));
    return apiClient.upload('/api/ipfs/upload/metadata', form);
  },

  /** Upload a single hidden image for unrevealed collections */
  uploadHiddenImage(userId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('userId', userId);
    form.append('file', file);
    return apiClient.upload('/api/ipfs/upload/hidden-image', form);
  },

  /** Upload a single hidden metadata file */
  uploadHiddenMetadata(userId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('userId', userId);
    form.append('file', file);
    return apiClient.upload('/api/ipfs/upload/hidden-metadata', form);
  },

  /** Poll upload job status */
  getJobStatus(jobId: string): Promise<JobStatus> {
    return apiClient.get(`/api/ipfs/job/${encodeURIComponent(jobId)}`);
  },

  /** Check pin status of a CID */
  getPinStatus(cid: string): Promise<PinStatus> {
    return apiClient.get(`/api/ipfs/pin-status/${encodeURIComponent(cid)}`);
  },

  /** Validate a CID is accessible on IPFS */
  validateCID(cid: string): Promise<{ valid: boolean; accessible: boolean }> {
    return apiClient.post('/api/ipfs/validate', { cid });
  },

  /** Get previous uploads for a user */
  getUploads(userId: string): Promise<{ uploads: any[] }> {
    return apiClient.get(`/api/ipfs/uploads?userId=${encodeURIComponent(userId)}`);
  },
};
