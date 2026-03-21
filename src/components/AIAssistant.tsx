/**
 * AIAssistant.tsx — Crolana AI Assistant
 *
 * Uses Puter's OpenAI-compatible REST API directly via fetch().
 * No puter.js CDN script. No auth popups. No SDK.
 *
 * API: POST https://api.puter.com/puterai/openai/v1/chat/completions
 * Docs: https://developer.puter.com/tutorials/access-gemini-using-openai-compatible-api/
 *
 * User pastes their Puter auth token once → stored in localStorage → all done.
 * Supports system messages, all 14 Gemini models, streaming-ready format.
 */

import React, {
  useState, useRef, useEffect, useCallback, useLayoutEffect,
} from 'react';
import ReactDOM from 'react-dom';

// ── Constants ─────────────────────────────────────────────────────────────────

const PUTER_API_URL = 'https://api.puter.com/puterai/openai/v1/chat/completions';
const TOKEN_KEY = 'crolana_puter_token';

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode   = 'app' | 'price' | 'news' | 'contract';
interface Msg { id: string; role: 'user' | 'assistant'; text: string; time: string; mode: Mode; }

// ── Models ────────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 'gemini-3.1-pro-preview',                label: 'Gemini 3.1 Pro Preview',        tag: '🚀 Latest', tc: '#a855f7' },
  { id: 'gemini-3-flash-preview',                label: 'Gemini 3 Flash Preview',         tag: '⚡ New',    tc: '#06b6d4' },
  { id: 'gemini-3-pro-preview',                  label: 'Gemini 3 Pro Preview',           tag: '💎 New',    tc: '#8b5cf6' },
  { id: 'gemini-2.5-flash-preview-09-2025',      label: 'Gemini 2.5 Flash Preview',       tag: '🆕',        tc: '#3b82f6' },
  { id: 'gemini-2.5-flash-lite-preview-09-2025', label: 'Gemini 2.5 Flash Lite Preview',  tag: '🆕 Lite',   tc: '#3b82f6' },
  { id: 'gemini-2.5-flash-lite',                 label: 'Gemini 2.5 Flash Lite',          tag: '🪶 Lite',   tc: '#64748b' },
  { id: 'gemini-2.5-pro-preview',                label: 'Gemini 2.5 Pro Preview',         tag: '🔬',        tc: '#7c3aed' },
  { id: 'gemini-2.5-pro-preview-05-06',          label: 'Gemini 2.5 Pro Preview (May)',   tag: '📅',        tc: '#7c3aed' },
  { id: 'gemini-2.5-flash',                      label: 'Gemini 2.5 Flash',               tag: '⚡ Fast',   tc: '#0ea5e9' },
  { id: 'gemini-2.5-pro',                        label: 'Gemini 2.5 Pro',                 tag: '🔥 Smart',  tc: '#f59e0b' },
  { id: 'gemini-2.0-flash-001',                  label: 'Gemini 2.0 Flash 001',           tag: '',          tc: '' },
  { id: 'gemini-2.0-flash-lite-001',             label: 'Gemini 2.0 Flash Lite 001',      tag: '',          tc: '' },
  { id: 'gemini-2.0-flash',                      label: 'Gemini 2.0 Flash',               tag: '',          tc: '' },
  { id: 'gemini-2.0-flash-lite',                 label: 'Gemini 2.0 Flash Lite',          tag: '🪶',        tc: '' },
];

const DEFAULT_MODEL = 'gemini-2.5-flash';

// ── Modes ─────────────────────────────────────────────────────────────────────

const MODES: { id: Mode; label: string; icon: string; accent: string }[] = [
  { id: 'app',      label: 'App Help',  icon: '🏗️', accent: '#3b82f6' },
  { id: 'price',    label: 'Prices',    icon: '💰', accent: '#10b981' },
  { id: 'news',     label: 'News',      icon: '📰', accent: '#8b5cf6' },
  { id: 'contract', label: 'Contracts', icon: '🔍', accent: '#f59e0b' },
];

// ── System prompts (proper system role — OpenAI API supports it fully) ────────

const SYSTEM_PROMPTS: Record<Mode, string> = {
  app: `You are the AI assistant embedded in Crolana, a professional NFT & DeFi platform on the Cronos blockchain. You have expert knowledge of every platform feature:

FEATURES:
- Asset Creation: upload and manage NFT artwork
- Metadata Builder: create ERC-721/1155 JSON metadata with traits and rarity
- IPFS Manager: upload to Pinata/IPFS, manage CIDs and pin metadata  
- Contract Builder: configure ERC-721, ERC-721A, ERC-1155, ERC-20 contracts
- Deploy Wizard: compile Solidity with solc, deploy to mainnet/testnet, estimate gas
- Minting Dashboard: manage mint phases (public/allowlist/free), pricing, supply
- NFT Gallery: browse minted tokens, view metadata on-chain
- Marketplace Prep: prepare listings for OpenSea, EbisusBay
- Analytics: on-chain stats, holder analytics, volume data
- Launchpad: featured NFT project launches
- Token Builder: create custom ERC-20 tokens (mintable, burnable, pausable, transfer tax)
- Token Swap: swap tokens via VVS Finance DEX
- Liquidity Manager: add/remove liquidity pools on VVS Finance

CRONOS NETWORK:
- Mainnet: Chain ID 25 | RPC: https://evm.cronos.org | Explorer: https://explorer.cronos.org
- Testnet: Chain ID 338 | RPC: https://evm-t3.cronos.org | Faucet: https://cronos.org/faucet

KEY CONTRACT ADDRESSES:
- VVS Finance Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae
- WCRO (mainnet): 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23
- WCRO (testnet): 0x6a3173618859C7cd40fAF6921b5E9eB6A76f1fD

Be concise, practical, and step-by-step. Always give actionable guidance specific to Crolana.`,

  price: `You are a crypto market analyst specializing in the Cronos blockchain ecosystem.

Provide educational context on:
- CRO (Cronos token): crypto.com ecosystem, staking, burn mechanics, utility
- VVS Finance (VVS): DEX governance, crystal farming, liquidity incentives  
- WCRO, USDC, USDT on Cronos chain
- NFT floor prices and collection metrics on Cronos
- DeFi TVL and protocol metrics

For real-time prices, always direct users to:
- https://crypto.com (CRO official price)
- https://vvs.finance (Cronos DEX)
- https://dexscreener.com/cronos (on-chain charts)
- https://coinmarketcap.com / https://coingecko.com

Always end price discussions with: "This is educational context only, not financial advice."`,

  news: `You are a Web3 and crypto news analyst. Cover these topics:

- Cronos blockchain: protocol upgrades, new dApps, ecosystem grants, partnerships
- Crypto.com: product launches, CRO utility updates, exchange news
- NFT market: major collection launches, volume trends, marketplace developments
- DeFi: new protocols, TVL changes, governance votes, exploits/hacks
- Broader crypto: BTC/ETH major moves, regulatory developments, institutional adoption
- Blockchain infrastructure: L2 scaling, bridges, interoperability
- AI x Crypto trends

Recommend these for latest news:
- https://cronos.org/blog (Cronos official)
- https://crypto.com/news
- https://decrypt.co
- https://theblock.co
- https://defillama.com

Note your knowledge cutoff (early 2025) when discussing recent events.`,

  contract: `You are an expert EVM smart contract security analyst for the Cronos blockchain.

When given a contract address or asked about a contract:
1. Identify the contract type (ERC-20 token, ERC-721 NFT, DEX router, staking, etc.)
2. Explain what the contract does and its key functions
3. Identify security risk factors:
   - Owner privileges (can they drain funds, pause trading, change fees?)
   - Mint functions (unlimited minting risk?)
   - Blacklist/whitelist functions
   - Fee manipulation vectors
   - Proxy/upgradeability patterns
   - Honeypot indicators (can users sell freely?)
4. Rug pull risk assessment
5. Tokenomics analysis if applicable

KNOWN CRONOS CONTRACTS (trusted):
- VVS Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae
- VVS Factory: 0x3B44B2a187a7b3824131F8db5a74194D0a42Fc15  
- WCRO: 0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23
- USDC: 0xc21223249CA28397B4B6541dfFaEcC539BfF0c59
- USDT: 0x66e428c3f67a68878562e79A0234c1F83c208770

For verification: https://explorer.cronos.org
Always conclude: "Always DYOR and never invest more than you can afford to lose."`,
};

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICKS: Record<Mode, string[]> = {
  app:      ['How do I deploy my first NFT collection?', 'How to connect MetaMask to Cronos?', 'ERC-721 vs ERC-1155 — which to use?', 'How to upload metadata to IPFS?', 'How does the Token Builder work?'],
  price:    ['What drives CRO token price?', 'What is VVS Finance & the VVS token?', 'Top Cronos tokens by market cap', 'Where to track Cronos DeFi TVL?', 'What is WCRO and how is it used?'],
  news:     ['Latest Cronos ecosystem updates', 'Recent major NFT market news', "What's happening in DeFi this week?", 'Cronos new partnerships', 'Major crypto regulatory news'],
  contract: ['Analyze VVS Router: 0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae', 'What is the WCRO contract?', 'How to spot a honeypot token?', 'Red flags in an ERC-20 contract', 'What is ERC-20 approval risk?'],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const uid  = () => Math.random().toString(36).slice(2, 9);
const tnow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function renderMd(txt: string): string {
  return txt
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g,
      '<code style="background:rgba(0,0,0,.45);padding:1px 5px;border-radius:4px;font-size:10.5px;color:#93c5fd;font-family:\'JetBrains Mono\',monospace">$1</code>')
    .replace(/^#{1,3}\s+(.+)$/gm,
      '<strong style="display:block;color:#e2e8f0;font-size:13px;margin:6px 0 3px">$1</strong>')
    .replace(/^[-•*]\s+(.+)$/gm,
      '<span style="display:block;padding-left:10px;margin:2px 0;color:#cbd5e1">• $1</span>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ── Puter API call via fetch (OpenAI-compatible) ──────────────────────────────

interface PuterMessage { role: 'system' | 'user' | 'assistant'; content: string; }

async function callPuterAPI(
  messages: PuterMessage[],
  model: string,
  token: string
): Promise<string> {
  const res = await fetch(PUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error('AUTH_EXPIRED');
    }
    throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API. Try again.');
  return content;
}

// ── Portal model dropdown ─────────────────────────────────────────────────────

interface DropProps {
  anchorEl: HTMLButtonElement | null;
  selected: string;
  onSelect: (id: string) => void;
  onClose:  () => void;
}

function ModelDropPortal({ anchorEl, selected, onSelect, onClose }: DropProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (anchorEl) setRect(anchorEl.getBoundingClientRect());
  }, [anchorEl]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const el = document.getElementById('csai-mdrop');
      if (!el?.contains(e.target as Node) && !anchorEl?.contains(e.target as Node)) {
        onClose();
      }
    };
    // Small delay so the click that opened the menu doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 10);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn); };
  }, [anchorEl, onClose]);

  if (!rect) return null;

  const menuW = 290;
  const left  = Math.max(8, rect.right - menuW);

  return ReactDOM.createPortal(
    <div
      id="csai-mdrop"
      style={{
        position:     'fixed',
        top:          rect.top - 6,
        left,
        width:        menuW,
        transform:    'translateY(-100%)',
        zIndex:       999999,
        background:   '#0f172a',
        border:       '1px solid rgba(148,163,184,.18)',
        borderRadius: 14,
        maxHeight:    320,
        overflowY:    'auto',
        boxShadow:    '0 -16px 48px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.05)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(148,163,184,.15) transparent',
      }}
    >
      <div style={{
        padding:      '9px 14px 7px',
        fontSize:     10,
        fontWeight:   700,
        color:        '#475569',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        borderBottom: '1px solid rgba(148,163,184,.07)',
        position:     'sticky',
        top:          0,
        background:   '#0f172a',
      }}>
        Select Gemini Model
      </div>
      {MODELS.map(m => (
        <div
          key={m.id}
          onClick={() => { onSelect(m.id); onClose(); }}
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '9px 14px',
            cursor:         'pointer',
            fontSize:       11.5,
            color:          selected === m.id ? '#c4b5fd' : '#94a3b8',
            background:     selected === m.id ? 'rgba(109,40,217,.2)' : 'transparent',
            borderBottom:   '1px solid rgba(148,163,184,.04)',
          }}
          onMouseEnter={e => {
            if (selected !== m.id) {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,.06)';
              (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
            }
          }}
          onMouseLeave={e => {
            if (selected !== m.id) {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = '#94a3b8';
            }
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {m.label}
          </span>
          {m.tag && (
            <span style={{
              flexShrink:   0,
              marginLeft:   8,
              fontSize:     9.5,
              padding:      '2px 6px',
              borderRadius: 4,
              background:   'rgba(148,163,184,.07)',
              color:        m.tc || '#64748b',
              border:       m.tc ? `1px solid ${m.tc}35` : '1px solid rgba(148,163,184,.1)',
              whiteSpace:   'nowrap',
            }}>
              {m.tag}
            </span>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
}

// ── Token Setup Screen ────────────────────────────────────────────────────────

function TokenSetup({ onSave }: { onSave: (token: string) => void }) {
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    const token = val.trim();
    if (!token) { setErr('Please paste your Puter auth token.'); return; }
    setTesting(true);
    setErr('');
    try {
      // Quick test call to verify token works
      const result = await callPuterAPI(
        [{ role: 'user', content: 'Say "OK" in one word.' }],
        'gemini-2.5-flash-lite',
        token
      );
      if (result) {
        localStorage.setItem(TOKEN_KEY, token);
        onSave(token);
      }
    } catch (e: any) {
      if (e.message === 'AUTH_EXPIRED') {
        setErr('Invalid token — please double-check and try again.');
      } else {
        setErr(`Error: ${e.message}`);
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '20px 18px', overflowY: 'auto',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 8, filter: 'drop-shadow(0 0 16px rgba(109,40,217,.6))' }}>🔑</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Connect Puter AI</div>
        <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>
          Enter your free Puter auth token to unlock<br/>all Gemini models — no Google API key needed.
        </div>
      </div>

      {/* Step-by-step instructions */}
      <div style={{
        background: 'rgba(255,255,255,.03)',
        border: '1px solid rgba(148,163,184,.08)',
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 16,
        fontSize: 11,
        color: '#64748b',
        lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 6, fontSize: 11 }}>
          How to get your token:
        </div>
        {[
          ['1', 'Go to', 'puter.com', 'https://puter.com', 'and create a free account'],
          ['2', 'Open the terminal in Puter (Apps → Terminal)'],
          ['3', 'Run:', 'puter auth token', null, ''],
          ['4', 'Copy the token and paste it below'],
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
            <span style={{
              background: 'rgba(109,40,217,.3)', color: '#c4b5fd',
              width: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 1,
            }}>
              {step[0]}
            </span>
            <span>
              {step[1]}
              {step[2] && (
                <>
                  {' '}
                  <a href={step[3]!} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#60a5fa', textDecoration: 'none' }}>
                    {step[2]}
                  </a>
                  {' '}{step[4]}
                </>
              )}
              {!step[2] && step.slice(2).join(' ')}
            </span>
          </div>
        ))}

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(148,163,184,.07)' }}>
          Or get it from:{' '}
          <a href="https://developer.puter.com/tutorials/access-gemini-using-openai-compatible-api/"
            target="_blank" rel="noopener noreferrer"
            style={{ color: '#60a5fa', textDecoration: 'none', fontSize: 10.5 }}>
            developer.puter.com →
          </a>
        </div>
      </div>

      {/* Token input */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 5, fontWeight: 600 }}>
          Puter Auth Token
        </div>
        <input
          type="password"
          value={val}
          onChange={e => { setVal(e.target.value); setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Paste your Puter auth token here..."
          style={{
            width: '100%',
            background: 'rgba(255,255,255,.05)',
            border: err ? '1px solid rgba(239,68,68,.5)' : '1px solid rgba(148,163,184,.12)',
            borderRadius: 10,
            color: '#e2e8f0',
            fontSize: 12,
            fontFamily: "'JetBrains Mono', monospace",
            padding: '9px 12px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color .2s',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(109,40,217,.5)'; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = err ? 'rgba(239,68,68,.5)' : 'rgba(148,163,184,.12)'; }}
          autoComplete="off"
          spellCheck={false}
        />
        {err && (
          <div style={{ fontSize: 10.5, color: '#f87171', marginTop: 5 }}>⚠ {err}</div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={testing || !val.trim()}
        style={{
          background: testing ? 'rgba(109,40,217,.3)' : 'linear-gradient(135deg, #1d4ed8, #6d28d9)',
          border: 'none',
          borderRadius: 10,
          color: '#e2e8f0',
          cursor: testing || !val.trim() ? 'not-allowed' : 'pointer',
          fontSize: 12.5,
          fontWeight: 600,
          padding: '10px 0',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transition: 'all .2s',
          opacity: !val.trim() ? .4 : 1,
          boxShadow: testing || !val.trim() ? 'none' : '0 4px 16px rgba(109,40,217,.4)',
        }}
      >
        {testing ? (
          <>
            <svg style={{ animation: 'csai-spin .7s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-6.2-8.56"/>
            </svg>
            Verifying token…
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Connect & Verify Token
          </>
        )}
      </button>

      <div style={{ fontSize: 9.5, color: '#1e293b', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
        Your token is stored locally in your browser only.<br/>
        Never shared with any third party.
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function AIAssistant() {
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<Mode>('app');
  const [modelId,    setModelId]    = useState(DEFAULT_MODEL);
  const [msgs,       setMsgs]       = useState<Msg[]>([]);
  const [input,      setInput]      = useState('');
  const [busy,       setBusy]       = useState(false);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [token,      setToken]      = useState<string | null>(() => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  });
  const [pulse,      setPulse]      = useState(true);
  const [showQuicks, setShowQuicks] = useState(true);

  const endRef      = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setPulse(false);
      if (token) setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, token]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, busy, open]);

  const modeInfo  = MODES.find(m => m.id === mode)!;
  const modelInfo = MODELS.find(m => m.id === modelId) ?? MODELS[9];
  const modeMsgs  = msgs.filter(m => m.mode === mode);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || busy || !token) return;

    setInput('');
    setShowQuicks(false);
    setMsgs(p => [...p, { id: uid(), role: 'user', text: content, time: tnow(), mode }]);
    setBusy(true);

    try {
      // Build history for this mode
      const history = msgs
        .filter(m => m.mode === mode)
        .slice(-10)
        .map(m => ({ role: m.role, content: m.text }));

      // Full payload with proper system message (OpenAI API supports it)
      const payload: PuterMessage[] = [
        { role: 'system', content: SYSTEM_PROMPTS[mode] },
        ...history,
        { role: 'user', content },
      ];

      const responseText = await callPuterAPI(payload, modelId, token);

      setMsgs(p => [...p, { id: uid(), role: 'assistant', text: responseText, time: tnow(), mode }]);
    } catch (err: any) {
      if (err.message === 'AUTH_EXPIRED') {
        // Token expired — clear it and show setup screen
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        return;
      }
      setMsgs(p => [...p, {
        id: uid(), role: 'assistant', time: tnow(), mode,
        text: `❌ **Error:** ${err.message}`,
      }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, msgs, mode, modelId, token]);

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleTokenSaved = (t: string) => {
    setToken(t);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setMsgs([]);
  };

  return (
    <>
      <style>{`
        @keyframes csai-pulse{0%,100%{box-shadow:0 4px 20px rgba(109,40,217,.55),0 0 0 0 rgba(109,40,217,.4)}50%{box-shadow:0 4px 20px rgba(109,40,217,.55),0 0 0 14px rgba(109,40,217,0)}}
        @keyframes csai-up{from{opacity:0;transform:translateY(20px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes csai-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes csai-blink{0%,100%{opacity:1}50%{opacity:.3}}
        @keyframes csai-bounce{0%,60%,100%{transform:translateY(0);background:#334155}30%{transform:translateY(-7px);background:#6d28d9}}
        @keyframes csai-spin{to{transform:rotate(360deg)}}

        .csai-fab{position:fixed;bottom:24px;right:24px;z-index:9900;width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(145deg,#1e40af 0%,#6d28d9 55%,#0ea5e9 100%);box-shadow:0 4px 20px rgba(109,40,217,.55),0 1px 3px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;color:white}
        .csai-fab:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(109,40,217,.7)}
        .csai-fab-pulse{animation:csai-pulse 2.2s ease-in-out infinite}
        .csai-fab-notch{position:fixed;bottom:66px;right:20px;z-index:9899;background:#10b981;width:10px;height:10px;border-radius:50%;border:2px solid #020817;animation:csai-blink 2.5s infinite}

        .csai-panel{position:fixed;bottom:92px;right:24px;z-index:9901;width:400px;height:600px;display:flex;flex-direction:column;background:#080f1e;border:1px solid rgba(148,163,184,.1);border-radius:20px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.03);animation:csai-up .28s cubic-bezier(.34,1.56,.64,1)}
        @media(max-width:480px){.csai-panel{width:calc(100vw - 16px);right:8px;bottom:80px;height:75vh}}

        .csai-hdr{flex-shrink:0;background:linear-gradient(160deg,#0c1628 0%,#12082e 100%);border-bottom:1px solid rgba(148,163,184,.07);padding:12px 14px 10px}
        .csai-hdr-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
        .csai-brand{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:#e2e8f0;letter-spacing:.03em}
        .csai-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .csai-ok{background:#10b981;box-shadow:0 0 6px #10b981;animation:csai-blink 2.5s infinite}
        .csai-busy{background:#f59e0b;box-shadow:0 0 6px #f59e0b;animation:csai-blink .55s infinite}
        .csai-off{background:#475569}
        .csai-hbtns{display:flex;gap:4px;align-items:center}
        .csai-sbtn{background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.1);border-radius:7px;color:#64748b;cursor:pointer;font-size:10.5px;padding:3px 8px;transition:all .15s;line-height:1.5;white-space:nowrap}
        .csai-sbtn:hover{background:rgba(255,255,255,.09);color:#94a3b8}
        .csai-sbtn-warn:hover{background:rgba(239,68,68,.12);color:#f87171;border-color:rgba(239,68,68,.25)}
        .csai-tabs{display:flex;gap:3px;background:rgba(255,255,255,.03);border-radius:10px;padding:3px}
        .csai-tab{flex:1;padding:5px 2px;border:none;border-radius:7px;font-size:10.5px;font-weight:600;cursor:pointer;transition:all .15s;background:transparent;color:#475569;white-space:nowrap}
        .csai-tab-on{color:#fff!important;box-shadow:0 2px 8px rgba(0,0,0,.35)}
        .csai-tab:not(.csai-tab-on):hover{background:rgba(255,255,255,.05);color:#94a3b8}

        .csai-mbar{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:5px 14px;background:rgba(255,255,255,.015);border-bottom:1px solid rgba(148,163,184,.05);gap:8px}
        .csai-mbtn{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.1);border-radius:8px;color:#94a3b8;cursor:pointer;font-size:11px;font-weight:600;padding:5px 10px;max-width:235px;transition:all .15s;overflow:hidden}
        .csai-mbtn:hover,.csai-mbtn.open{background:rgba(109,40,217,.12);border-color:rgba(109,40,217,.4);color:#c4b5fd}
        .csai-mbtn-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1}
        .csai-mbtn-caret{font-size:8px;opacity:.5;flex-shrink:0}
        .csai-status{font-size:10px;color:#334155;display:flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0}
        .csai-spip{width:5px;height:5px;border-radius:50%;flex-shrink:0}

        .csai-scroll{flex:1;overflow-y:auto;padding:12px 13px;display:flex;flex-direction:column;gap:10px;scrollbar-width:thin;scrollbar-color:rgba(148,163,184,.1) transparent}
        .csai-scroll::-webkit-scrollbar{width:3px}
        .csai-scroll::-webkit-scrollbar-thumb{background:rgba(148,163,184,.12);border-radius:2px}

        .csai-welcome{display:flex;flex-direction:column;align-items:center;text-align:center;padding:12px 6px}
        .csai-wicon{font-size:38px;margin-bottom:8px;filter:drop-shadow(0 0 14px rgba(109,40,217,.55))}
        .csai-wtitle{font-size:14px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
        .csai-wsub{font-size:11px;color:#334155;line-height:1.55;margin-bottom:14px;max-width:280px}
        .csai-quicks{display:flex;flex-direction:column;gap:5px;width:100%;text-align:left}
        .csai-qbtn{background:rgba(255,255,255,.03);border:1px solid rgba(148,163,184,.07);border-radius:8px;color:#475569;cursor:pointer;font-size:11px;padding:7px 10px;text-align:left;line-height:1.35;transition:all .15s;width:100%}
        .csai-qbtn:hover{background:rgba(255,255,255,.06);color:#94a3b8;border-color:rgba(148,163,184,.15)}

        .csai-msg{display:flex;gap:7px;animation:csai-in .2s ease}
        .csai-msg-u{flex-direction:row-reverse}
        .csai-av{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:12px;margin-top:2px}
        .csai-av-u{background:linear-gradient(135deg,#1d4ed8,#6d28d9)}
        .csai-av-b{background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.12)}
        .csai-mbody{max-width:88%;display:flex;flex-direction:column}
        .csai-msg-u .csai-mbody{align-items:flex-end}
        .csai-bbl{padding:9px 12px;border-radius:14px;font-size:12.5px;line-height:1.58;word-break:break-word}
        .csai-bbl-u{background:linear-gradient(135deg,#1d4ed8,#6d28d9);color:#e2e8f0;border-radius:14px 14px 4px 14px}
        .csai-bbl-b{background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.08);color:#cbd5e1;border-radius:14px 14px 14px 4px}
        .csai-ts{font-size:9px;color:#1e293b;margin-top:3px;padding:0 2px}
        .csai-msg-u .csai-ts{text-align:right}

        .csai-typing{background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.08);border-radius:14px 14px 14px 4px;padding:11px 15px;display:flex;gap:4px;align-items:center}
        .csai-typing span{width:6px;height:6px;background:#334155;border-radius:50%;animation:csai-bounce 1.3s infinite ease-in-out}
        .csai-typing span:nth-child(2){animation-delay:.2s}
        .csai-typing span:nth-child(3){animation-delay:.4s}

        .csai-iarea{flex-shrink:0;border-top:1px solid rgba(148,163,184,.07);background:rgba(255,255,255,.015);padding:10px 12px 8px;display:flex;gap:8px;align-items:flex-end}
        .csai-ta{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(148,163,184,.1);border-radius:12px;color:#e2e8f0;font-size:12.5px;line-height:1.5;font-family:inherit;min-height:38px;max-height:100px;outline:none;padding:9px 12px;resize:none;transition:border-color .2s}
        .csai-ta::placeholder{color:#1e293b}
        .csai-ta:focus{border-color:rgba(109,40,217,.45)}
        .csai-ta:disabled{opacity:.4}
        .csai-send{width:38px;height:38px;flex-shrink:0;border-radius:10px;background:linear-gradient(135deg,#1d4ed8,#6d28d9);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
        .csai-send:hover:not(:disabled){transform:scale(1.07);box-shadow:0 2px 14px rgba(109,40,217,.55)}
        .csai-send:disabled{opacity:.35;cursor:not-allowed}
        .csai-foot{text-align:center;font-size:9px;color:#1e293b;padding-bottom:7px;flex-shrink:0}

        #csai-mdrop::-webkit-scrollbar{width:4px}
        #csai-mdrop::-webkit-scrollbar-thumb{background:rgba(148,163,184,.15);border-radius:2px}
      `}</style>

      {/* ── FAB — bottom right ── */}
      {token && open && <div className="csai-fab-notch" />}
      <button
        className={`csai-fab${pulse ? ' csai-fab-pulse' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Cronos AI Assistant"
        aria-label={open ? 'Close' : 'Open AI Assistant'}
      >
        {open
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <circle cx="9" cy="11" r="1" fill="currentColor" stroke="none"/>
              <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none"/>
              <circle cx="15" cy="11" r="1" fill="currentColor" stroke="none"/>
            </svg>
        }
      </button>

      {/* ── Chat panel ── */}
      {open && (
        <div className="csai-panel" role="dialog" aria-label="Cronos AI Assistant">

          {/* Header */}
          <div className="csai-hdr">
            <div className="csai-hdr-row">
              <div className="csai-brand">
                <div className={`csai-dot ${!token ? 'csai-off' : busy ? 'csai-busy' : 'csai-ok'}`} />
                Cronos AI Assistant
              </div>
              <div className="csai-hbtns">
                {token && (
                  <>
                    <button className="csai-sbtn" onClick={() => { setMsgs([]); setShowQuicks(true); }}>
                      Clear
                    </button>
                    <button className="csai-sbtn csai-sbtn-warn" onClick={handleDisconnect} title="Change token">
                      Disconnect
                    </button>
                  </>
                )}
                <button className="csai-sbtn" onClick={() => setOpen(false)}>✕</button>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="csai-tabs">
              {MODES.map(m => (
                <button
                  key={m.id}
                  className={`csai-tab${mode === m.id ? ' csai-tab-on' : ''}`}
                  style={mode === m.id ? { background: m.accent } : {}}
                  onClick={() => { setMode(m.id); setShowQuicks(true); }}
                >
                  {m.icon} {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model bar — only when connected */}
          {token && (
            <div className="csai-mbar">
              <button
                ref={modelBtnRef}
                className={`csai-mbtn${menuOpen ? ' open' : ''}`}
                onClick={() => setMenuOpen(v => !v)}
                title="Choose Gemini model"
              >
                <span>🤖</span>
                <span className="csai-mbtn-lbl">{modelInfo.label}</span>
                <span className="csai-mbtn-caret">{menuOpen ? '▴' : '▾'}</span>
              </button>
              <div className="csai-status">
                <div className="csai-spip" style={{ background: busy ? '#f59e0b' : '#10b981' }} />
                {busy ? 'Generating…' : 'Puter API ready'}
              </div>
            </div>
          )}

          {/* Portal dropdown */}
          {menuOpen && token && (
            <ModelDropPortal
              anchorEl={modelBtnRef.current}
              selected={modelId}
              onSelect={id => setModelId(id)}
              onClose={() => setMenuOpen(false)}
            />
          )}

          {/* Token setup OR chat */}
          {!token ? (
            <TokenSetup onSave={handleTokenSaved} />
          ) : (
            <>
              {/* Messages */}
              <div className="csai-scroll">
                {modeMsgs.length === 0 ? (
                  <div className="csai-welcome">
                    <div className="csai-wicon">{modeInfo.icon}</div>
                    <div className="csai-wtitle">{modeInfo.label}</div>
                    <div className="csai-wsub">
                      {mode === 'app'      && 'Ask anything about Crolana — deploying NFTs, building tokens, swaps, IPFS, and more.'}
                      {mode === 'price'    && 'Get context on CRO, VVS Finance, and Cronos ecosystem token prices.'}
                      {mode === 'news'     && 'Stay informed on Cronos updates, NFT market trends, and major crypto news.'}
                      {mode === 'contract' && 'Paste a contract address or ask about smart contract security on Cronos.'}
                    </div>
                    {showQuicks && (
                      <div className="csai-quicks">
                        {QUICKS[mode].map((q, i) => (
                          <button key={i} className="csai-qbtn" onClick={() => send(q)}>{q}</button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {modeMsgs.map(msg => (
                      <div key={msg.id} className={`csai-msg${msg.role === 'user' ? ' csai-msg-u' : ''}`}>
                        <div className={`csai-av ${msg.role === 'user' ? 'csai-av-u' : 'csai-av-b'}`}>
                          {msg.role === 'user' ? '👤' : '✨'}
                        </div>
                        <div className="csai-mbody">
                          <div
                            className={`csai-bbl ${msg.role === 'user' ? 'csai-bbl-u' : 'csai-bbl-b'}`}
                            dangerouslySetInnerHTML={{
                              __html: msg.role === 'assistant'
                                ? renderMd(msg.text)
                                : msg.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
                            }}
                          />
                          <div className="csai-ts">{msg.time}</div>
                        </div>
                      </div>
                    ))}
                    {busy && (
                      <div className="csai-msg">
                        <div className="csai-av csai-av-b">✨</div>
                        <div className="csai-mbody">
                          <div className="csai-typing"><span/><span/><span/></div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={endRef} />
              </div>

              {/* Input */}
              <div className="csai-iarea">
                <textarea
                  ref={inputRef}
                  className="csai-ta"
                  rows={1}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={onKey}
                  disabled={busy}
                  placeholder={
                    mode === 'app'      ? 'Ask about Crolana…' :
                    mode === 'price'    ? 'Ask about token prices…' :
                    mode === 'news'     ? 'Ask about crypto news…' :
                                          'Paste contract address or ask…'
                  }
                />
                <button
                  className="csai-send"
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  title="Send (Enter)"
                >
                  {busy
                    ? <svg style={{ animation: 'csai-spin .7s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>
                    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </button>
              </div>
              <div className="csai-foot">
                {modelInfo.label} via Puter API · Enter to send · Shift+Enter for newline
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
