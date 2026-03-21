/**
 * src/hooks/useUnifiedWallet.ts
 * ─────────────────────────────────────────────────────────────
 * UNIFIED WALLET STATE SYNCHRONIZATION  (Fix #4)
 *
 * Manages both MetaMask (Cronos/EVM) and Phantom (Solana) sessions
 * with a single consistent interface.
 *
 * Features:
 *  - Auto-detects installed wallets
 *  - Chain-specific connection flows
 *  - Shared auth token storage
 *  - Account & chain change listeners
 *  - Session persistence across page refreshes
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStoredAuthToken, saveAuthToken, clearAuthToken } from '../wallet/walletManager';
import type { SupportedChain } from '../lib/chainAdapter';

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletType = 'metamask' | 'cryptocom' | 'coinbase' | 'phantom' | 'solflare' | 'injected';

export interface ConnectedWallet {
  address: string;
  chain: SupportedChain;
  walletType: WalletType;
  chainId?: number;       // EVM only
  cluster?: string;       // Solana only
  balance?: string;
  isAuthenticated: boolean;
}

export interface WalletSessionState {
  // Connected wallets (can have both EVM + Solana at the same time)
  evmWallet: ConnectedWallet | null;
  solanaWallet: ConnectedWallet | null;

  // Currently active chain for UI
  activeChain: SupportedChain;

  // Loading states
  isConnectingEVM: boolean;
  isConnectingSolana: boolean;

  // Auth state
  authToken: string | null;

  // Availability
  hasMetaMask: boolean;
  hasPhantom: boolean;

  // Actions
  connectEVM(preferredType?: WalletType): Promise<ConnectedWallet>;
  connectSolana(): Promise<ConnectedWallet>;
  disconnectEVM(): void;
  disconnectSolana(): void;
  disconnectAll(): void;
  setActiveChain(chain: SupportedChain): void;
  authenticateWallet(chain: SupportedChain): Promise<string>;
  getActiveWallet(): ConnectedWallet | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useUnifiedWallet(): WalletSessionState {
  const [evmWallet, setEvmWallet] = useState<ConnectedWallet | null>(null);
  const [solanaWallet, setSolanaWallet] = useState<ConnectedWallet | null>(null);
  const [activeChain, setActiveChain] = useState<SupportedChain>('cronos');
  const [isConnectingEVM, setIsConnectingEVM] = useState(false);
  const [isConnectingSolana, setIsConnectingSolana] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(getStoredAuthToken());

  const evmListenerRef = useRef<(() => void) | null>(null);
  const solanaListenerRef = useRef<(() => void) | null>(null);

  const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum;
  const hasPhantom = typeof window !== 'undefined' && !!(window as any).solana?.isPhantom;

  // ── EVM Wallet ────────────────────────────────────────────────────────────

  const connectEVM = useCallback(async (preferredType?: WalletType): Promise<ConnectedWallet> => {
    if (!window.ethereum) throw new Error('No EVM wallet detected. Please install MetaMask.');
    setIsConnectingEVM(true);

    try {
      const { ethers } = await import('ethers');
      let provider = window.ethereum;

      // Multi-provider: pick preferred wallet if available
      if (window.ethereum.providers && Array.isArray(window.ethereum.providers)) {
        const providers: any[] = window.ethereum.providers;
        if (preferredType === 'metamask') provider = providers.find((p) => p.isMetaMask) ?? provider;
        else if (preferredType === 'cryptocom') provider = providers.find((p) => p.isCryptoCom) ?? provider;
        else if (preferredType === 'coinbase') provider = providers.find((p) => p.isCoinbaseWallet) ?? provider;
      }

      const browserProvider = new ethers.BrowserProvider(provider);
      await browserProvider.send('eth_requestAccounts', []);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const network = await browserProvider.getNetwork();
      const chainId = Number(network.chainId);
      const balanceWei = await browserProvider.getBalance(address);
      const balance = ethers.formatEther(balanceWei);
      const walletType = detectEVMType(provider);

      const wallet: ConnectedWallet = {
        address,
        chain: 'cronos',
        walletType,
        chainId,
        balance,
        isAuthenticated: false,
      };
      setEvmWallet(wallet);
      setActiveChain('cronos');

      // Set up account/chain listeners
      if (evmListenerRef.current) evmListenerRef.current();
      const onAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setEvmWallet(null);
        } else {
          setEvmWallet((prev) => prev ? { ...prev, address: accounts[0] } : null);
        }
      };
      const onChainChanged = (chainId: string) => {
        setEvmWallet((prev) => prev ? { ...prev, chainId: parseInt(chainId, 16) } : null);
      };
      provider.on('accountsChanged', onAccountsChanged);
      provider.on('chainChanged', onChainChanged);
      evmListenerRef.current = () => {
        provider.removeListener('accountsChanged', onAccountsChanged);
        provider.removeListener('chainChanged', onChainChanged);
      };

      return wallet;
    } finally {
      setIsConnectingEVM(false);
    }
  }, []);

  const disconnectEVM = useCallback(() => {
    if (evmListenerRef.current) { evmListenerRef.current(); evmListenerRef.current = null; }
    setEvmWallet(null);
    if (activeChain === 'cronos') {
      clearAuthToken();
      setAuthToken(null);
    }
  }, [activeChain]);

  // ── Solana Wallet ─────────────────────────────────────────────────────────

  const connectSolana = useCallback(async (): Promise<ConnectedWallet> => {
    const solana = (window as any).solana;
    if (!solana?.isPhantom && !solana) {
      throw new Error('Phantom wallet not found. Please install Phantom from https://phantom.app');
    }
    setIsConnectingSolana(true);

    try {
      const resp = await solana.connect();
      const address = resp.publicKey.toString();

      const wallet: ConnectedWallet = {
        address,
        chain: 'solana',
        walletType: 'phantom',
        cluster: 'mainnet-beta',
        isAuthenticated: false,
      };
      setSolanaWallet(wallet);
      setActiveChain('solana');

      // Account change listener
      if (solanaListenerRef.current) solanaListenerRef.current();
      const onAccountChanged = (publicKey: any) => {
        if (!publicKey) {
          setSolanaWallet(null);
        } else {
          setSolanaWallet((prev) => prev ? { ...prev, address: publicKey.toString() } : null);
        }
      };
      solana.on('accountChanged', onAccountChanged);
      const onDisconnect = () => setSolanaWallet(null);
      solana.on('disconnect', onDisconnect);
      solanaListenerRef.current = () => {
        solana.off('accountChanged', onAccountChanged);
        solana.off('disconnect', onDisconnect);
      };

      return wallet;
    } finally {
      setIsConnectingSolana(false);
    }
  }, []);

  const disconnectSolana = useCallback(async () => {
    if (solanaListenerRef.current) { solanaListenerRef.current(); solanaListenerRef.current = null; }
    const solana = (window as any).solana;
    if (solana) { try { await solana.disconnect(); } catch {} }
    setSolanaWallet(null);
    if (activeChain === 'solana') {
      clearAuthToken();
      setAuthToken(null);
    }
  }, [activeChain]);

  const disconnectAll = useCallback(() => {
    disconnectEVM();
    disconnectSolana();
    clearAuthToken();
    setAuthToken(null);
  }, [disconnectEVM, disconnectSolana]);

  // ── Authentication ────────────────────────────────────────────────────────

  /**
   * Authenticate the connected wallet for `chain`.
   * - EVM: signs a SIWE-style message, server verifies with ethers.verifyMessage
   * - Solana: signs a UTF-8 nonce, server verifies with @solana/web3.js
   * Returns the JWT token on success.
   */
  const authenticateWallet = useCallback(async (chain: SupportedChain): Promise<string> => {
    if (chain === 'cronos') {
      const wallet = evmWallet;
      if (!wallet) throw new Error('No EVM wallet connected');

      const { ethers } = await import('ethers');
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();

      // 1. Get nonce from server
      const nonceRes = await fetch(`/api/auth/nonce?address=${wallet.address}`);
      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const { message } = await nonceRes.json();

      // 2. Sign
      const signature = await signer.signMessage(message);

      // 3. Verify on server
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature, message, chainId: wallet.chainId }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'EVM auth failed');
      }
      const { token } = await verifyRes.json();
      saveAuthToken(token);
      setAuthToken(token);
      setEvmWallet((prev) => prev ? { ...prev, isAuthenticated: true } : null);
      return token;

    } else {
      // Solana auth
      const wallet = solanaWallet;
      if (!wallet) throw new Error('No Solana wallet connected');
      const solana = (window as any).solana;
      if (!solana) throw new Error('Phantom not available');

      // 1. Get nonce
      const nonceRes = await fetch(`/api/auth/solana/nonce?address=${wallet.address}`);
      if (!nonceRes.ok) throw new Error('Failed to get Solana nonce');
      const { message } = await nonceRes.json();

      // 2. Sign bytes
      const encoded = new TextEncoder().encode(message);
      const { signature } = await solana.signMessage(encoded, 'utf8');
      const signatureBase64 = btoa(String.fromCharCode(...signature));

      // 3. Verify
      const verifyRes = await fetch('/api/auth/solana/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet.address, signature: signatureBase64, message }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        throw new Error(err.error ?? 'Solana auth failed');
      }
      const { token } = await verifyRes.json();
      saveAuthToken(token);
      setAuthToken(token);
      setSolanaWallet((prev) => prev ? { ...prev, isAuthenticated: true } : null);
      return token;
    }
  }, [evmWallet, solanaWallet]);

  const getActiveWallet = useCallback((): ConnectedWallet | null => {
    return activeChain === 'solana' ? solanaWallet : evmWallet;
  }, [activeChain, solanaWallet, evmWallet]);

  // ── Auto-reconnect on refresh ────────────────────────────────────────────

  useEffect(() => {
    // Silently try to reconnect EVM wallet if previously connected
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then(async (accounts: string[]) => {
          if (accounts.length > 0) {
            try { await connectEVM(); } catch {}
          }
        })
        .catch(() => {});
    }

    // Silently try to reconnect Phantom
    const solana = (window as any).solana;
    if (solana?.isPhantom) {
      solana.connect({ onlyIfTrusted: true })
        .then(async (resp: any) => {
          if (resp?.publicKey) {
            const address = resp.publicKey.toString();
            setSolanaWallet({ address, chain: 'solana', walletType: 'phantom', cluster: 'mainnet-beta', isAuthenticated: false });
          }
        })
        .catch(() => {});
    }

    return () => {
      if (evmListenerRef.current) evmListenerRef.current();
      if (solanaListenerRef.current) solanaListenerRef.current();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    evmWallet,
    solanaWallet,
    activeChain,
    isConnectingEVM,
    isConnectingSolana,
    authToken,
    hasMetaMask,
    hasPhantom,
    connectEVM,
    connectSolana,
    disconnectEVM,
    disconnectSolana,
    disconnectAll,
    setActiveChain,
    authenticateWallet,
    getActiveWallet,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectEVMType(provider: any): WalletType {
  if (provider.isMetaMask) return 'metamask';
  if (provider.isCryptoCom || provider.isCDCWallet) return 'cryptocom';
  if (provider.isCoinbaseWallet || provider.isCoinbaseBrowser) return 'coinbase';
  return 'injected';
}
