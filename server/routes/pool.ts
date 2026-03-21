/**
 * server/routes/pool.ts
 * Liquidity pool info routes — backed by packages/liquidity-engine via adapter.
 *
 * GET  /api/pool/info?tokenA=&tokenB=&chainId=   → pool reserves + pair address
 * GET  /api/pool/position?pair=&wallet=&chainId= → LP position for a wallet
 */

import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import {
  getServerPoolInfo,
  getServerLiquidityPosition,
} from '../services/engines/liquidityEngineAdapter.js';

const router = Router();

/**
 * GET /api/pool/info?tokenA=0x...&tokenB=0x...&chainId=25
 * Returns: pool reserves, pair address, token ordering
 */
router.get('/info', async (req: Request, res: Response) => {
  const { tokenA, tokenB, chainId = '25' } = req.query as Record<string, string>;

  if (!tokenA || !tokenB) {
    return res.status(400).json({ error: 'tokenA and tokenB are required' });
  }

  const cid = parseInt(chainId, 10);

  try {
    const info = await getServerPoolInfo(tokenA, tokenB, cid);

    res.json({
      exists:       info.exists,
      pairAddress:  info.exists ? info.pairAddress : null,
      token0:       info.token0,
      token1:       info.token1,
      reserve0:     info.reserve0.toString(),
      reserve1:     info.reserve1.toString(),
      totalSupply:  info.totalSupply.toString(),
      chainId:      cid,
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message ?? 'Pool info lookup failed' });
  }
});

/**
 * GET /api/pool/position?pair=0x...&wallet=0x...&chainId=25
 * Returns: LP token balance, pool share percentage, underlying token amounts
 */
router.get('/position', async (req: Request, res: Response) => {
  const { pair, wallet, chainId = '25' } = req.query as Record<string, string>;

  if (!pair || !wallet) {
    return res.status(400).json({ error: 'pair and wallet are required' });
  }

  if (!ethers.isAddress(pair))   return res.status(400).json({ error: 'Invalid pair address' });
  if (!ethers.isAddress(wallet)) return res.status(400).json({ error: 'Invalid wallet address' });

  const cid = parseInt(chainId, 10);

  try {
    const position = await getServerLiquidityPosition(pair, wallet, cid);

    if (!position) {
      return res.json({ lpBalance: '0', share: 0, token0Amount: '0', token1Amount: '0' });
    }

    res.json({
      pairAddress:  position.pairAddress,
      lpBalance:    position.lpBalance.toString(),
      share:        position.share,
      sharePercent: (position.share * 100).toFixed(4),
      token0Amount: position.token0Amount.toString(),
      token1Amount: position.token1Amount.toString(),
    });
  } catch (err: any) {
    res.status(503).json({ error: err.message ?? 'Position lookup failed' });
  }
});

export default router;
