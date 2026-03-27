/**
 * src/services/api/contractService.ts
 * Frontend service for contract generation, compilation, and deployment.
 * Repaired: added buildDeployTx endpoint connection.
 */

import { apiClient } from './apiClient';

export interface CompileResult {
  abi: any[];
  bytecode: string;
  source: string;
}

export interface DeployTxResult {
  tx: {
    data: string;
    gasLimit: string;
    gasPrice: string;
    nonce: number;
    chainId: number;
    value?: string;
  };
  abi: any[];
  bytecode: string;
  contractName: string;
  constructorArgs: any[];
}

export interface GasEstimate {
  gasEstimate: string;
  gasPriceGwei: string;
  totalCRO: string;
  note?: string;
}

export interface Deployment {
  id: string;
  contractAddress: string;
  contractType: string;
  name: string;
  symbol: string;
  networkId: number;
  txHash: string;
  deployedAt: string;
}

export const contractService = {
  /** Generate Solidity source code from config. */
  generateSource(config: any): Promise<{ source: string }> {
    return apiClient.post('/api/contract/generate', config);
  },

  /** Compile Solidity source and return ABI + bytecode. */
  compile(config: any): Promise<CompileResult> {
    return apiClient.post('/api/contract/compile', { config });
  },

  /**
   * Build an unsigned deploy transaction.
   * The frontend wallet signer submits it on-chain.
   */
  buildDeployTx(config: any, deployerAddress: string, chainId = 25): Promise<DeployTxResult> {
    return apiClient.post('/api/contract/build-deploy-tx', { config, deployerAddress, chainId });
  },

  /** Estimate gas cost for deployment. */
  estimateGas(bytecode: string, abi: any[], constructorArgs: any[], networkId: number): Promise<GasEstimate> {
    return apiClient.post('/api/contract/estimate-gas', { bytecode, abi, constructorArgs, networkId });
  },

  /** Record a completed deployment in the DB. */
  saveDeployment(data: {
    userId: string;
    networkId: number;
    contractAddress: string;
    contractType?: string;
    name?: string;
    symbol?: string;
    txHash?: string;
  }): Promise<{ deployment: Deployment }> {
    return apiClient.post('/api/contract/deployments', data);
  },

  /** Get all deployments for a user. */
  getDeployments(userId: string): Promise<{ deployments: Deployment[] }> {
    return apiClient.get('/api/contract/deployments?userId=' + userId);
  },

  /** Check Cronoscan verification status. */
  verify(address: string, network: number): Promise<{ verified: boolean; explorerUrl: string }> {
    return apiClient.post('/api/contract/verify', { address, network });
  },
};
