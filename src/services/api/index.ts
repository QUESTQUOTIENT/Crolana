/**
 * src/services/api/index.ts
 * Central barrel export for all API services.
 *
 * Usage:
 *   import { contractService, mintService, analyticsApiService } from '../services/api';
 */

export { apiClient, ApiError } from './apiClient';
export { contractService }      from './contractService';
export type { CompileResult, GasEstimate, ContractDeployment, VerifyResult } from './contractService';
export { mintService }          from './mintService';
export type { MerkleTreeResult, MerkleProofResult } from './mintService';
export { dashboardService }     from './dashboardService';
export type { HealthStatus, DashboardStats } from './dashboardService';
export { analyticsApiService }  from './analyticsApiService';
export type { AnalyticsData, AnalyticsOverview, MintChartEntry, ActivityEntry } from './analyticsApiService';
export { ipfsApiService }       from './ipfsApiService';
export type { IPFSConfig, UploadResult, JobStatus, PinStatus } from './ipfsApiService';
export { authApiService }       from './authApiService';
export type { NonceResponse, AuthSession, SessionInfo } from './authApiService';
export { nftApiService }        from './nftApiService';
export type { GenerationResult, GeneratedNFTSummary, TraitLayer, TokenTemplate } from './nftApiService';
