# UNIVERSAL POOL DETECTION - REVERSE ENGINEERING APPROACH

## 🎯 **The Challenge**
How to detect NEW liquidity pools without knowing token addresses in advance?

## 💡 **The Solution: Event Signature Monitoring**

Instead of monitoring specific tokens, we monitor **EVENT SIGNATURES** that indicate pool-related activities.

---

## 📋 **KEY EVENT SIGNATURES**

### 1. **Pool Creation** (The Holy Grail)
```
Signature: 0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118
Event: PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
```
**What it captures:**
- ✅ ANY new pool creation (regardless of tokens)
- ✅ Token0 address (extracted from topics[1])
- ✅ Token1 address (extracted from topics[2]) 
- ✅ Fee tier (extracted from topics[3])
- ✅ Pool address (extracted from data field)

### 2. **Pool Initialization**
```
Signature: 0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95
Event: Initialize(uint160 sqrtPriceX96, int24 tick)
```
**What it captures:**
- ✅ When a pool becomes active/tradeable
- ✅ Initial price information

### 3. **First Liquidity Addition**
```
Signature: 0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde
Event: Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)
```
**What it captures:**
- ✅ Liquidity amounts for both tokens
- ✅ Position parameters (tick ranges)
- ✅ Who added the liquidity

### 4. **NFT Position Creation**
```
Signature: 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
Event: Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
```
**What it captures (when from = 0x0):**
- ✅ New position NFT creation
- ✅ Position ID for tracking

---

## 🔍 **Detection Method**

### Step 1: Monitor All Logs for Event Signatures
```bash
# Get all logs from latest block
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"fromBlock":"latest","toBlock":"latest"}],"id":1}' \
  http://localhost:8545
```

### Step 2: Filter for Pool Creation Events
```bash
# Look for PoolCreated signature in logs
grep "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"
```

### Step 3: Extract Token Information
```javascript
// From the topics array:
const token0 = topics[1];  // First token address
const token1 = topics[2];  // Second token address  
const fee = topics[3];     // Fee tier
const poolAddress = data.slice(-40); // Pool address from data field
```

### Step 4: Get Token Metadata Dynamically
```bash
# Get token symbol
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"TOKEN_ADDRESS","data":"0x95d89b41"},"latest"],"id":1}' \
  http://localhost:8545

# Get token name  
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"TOKEN_ADDRESS","data":"0x06fdde03"},"latest"],"id":1}' \
  http://localhost:8545
```

---

## 🏭 **Factory Contract Filtering**

Filter by known factory addresses to avoid false positives:

```javascript
const KNOWN_FACTORIES = {
  "0x33128a8fc17869897dce68ed026d694621f6fdfd": "Uniswap V3 Factory",
  "0x03a520b32c04bf3beef7beb72e919cf822ed34f1": "Uniswap V3 Position Manager"
};
```

---

## ⚡ **Real-Time Monitoring Strategy**

### Option 1: Block-by-Block Scanning
```bash
while true; do
  CURRENT_BLOCK=$(get_latest_block)
  if [ "$CURRENT_BLOCK" != "$LAST_BLOCK" ]; then
    scan_block_for_events $CURRENT_BLOCK
    LAST_BLOCK=$CURRENT_BLOCK
  fi
  sleep 2
done
```

### Option 2: WebSocket Subscriptions
```javascript
// Subscribe to new blocks
ws.send('{"jsonrpc":"2.0","method":"eth_subscribe","params":["newHeads"],"id":1}');

// Subscribe to logs with event filters
ws.send('{"jsonrpc":"2.0","method":"eth_subscribe","params":["logs",{"topics":["0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118"]}],"id":2}');
```

---

## 🔬 **Example: Peplo Escobar Pool Detection**

**Transaction:** `0xd080b1d1319d7356d9a509ff3d9be84be7fddd396bdbc1c8331184a2c83ea92d`

**Raw Event Data:**
```json
{
  "address": "0x33128a8fc17869897dce68ed026d694621f6fdfd",
  "topics": [
    "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
    "0x0000000000000000000000004200000000000000000000000000000000000006", 
    "0x000000000000000000000000f680693647d16b383445881e2f1afcb5634355f2",
    "0x0000000000000000000000000000000000000000000000000000000000002710"
  ],
  "data": "0x00000000000000000000000000000000000000000000000000000000000000c800000000000000000000000083d93cab1d4c6f286d69794f02ace28fad8e383b"
}
```

**Decoded Information:**
- **Factory**: `0x33128a8fc17869897dce68ed026d694621f6fdfd` (Uniswap V3)
- **Token0**: `0x4200000000000000000000000000000000000006` (WETH)
- **Token1**: `0xf680693647d16b383445881e2f1afcb5634355f2` (Unknown - query for metadata)
- **Fee**: `0x2710` = 10,000 basis points = 1.00%
- **Pool**: `0x83d93cab1d4c6f286d69794f02ace28fad8e383b`

**Dynamic Token Discovery:**
```bash
# Query Token1 metadata
Symbol: "Peplo" 
Name: "Peplo Escobar"
Decimals: 18
```

---

## 🎯 **Why This Approach Works**

✅ **Universal Detection**: Catches ALL new pools, not just known tokens  
✅ **Real-Time**: Events are emitted immediately when pools are created  
✅ **Complete Information**: Gets all pool parameters in one event  
✅ **Scalable**: No need to maintain token address lists  
✅ **Future-Proof**: Works for any new token that gets a pool  

---

## 🚀 **Advanced Enhancements**

### 1. **Multiple DEX Support**
Add factory addresses for other DEXs:
- SushiSwap: `0x...`  
- PancakeSwap: `0x...`
- Curve: `0x...`

### 2. **Filter by Token Characteristics**
```javascript
// Skip if token has suspicious characteristics
if (tokenSupply > MAX_SUPPLY) return;
if (tokenName.includes("Test")) return;
if (decimals != 18) flagForReview();
```

### 3. **Liquidity Analysis**
```javascript
// Track initial liquidity amounts
if (initialLiquidity < MIN_LIQUIDITY) flagAsLowLiquidity();
```

### 4. **Historical Backfill**
```bash
# Scan historical blocks for missed pools
for block in $(seq $START_BLOCK $END_BLOCK); do
  scan_block_for_events $block
done
```

---

## 💎 **Key Benefits**

1. **No Token Address Dependencies**: Works for completely unknown tokens
2. **Comprehensive Coverage**: Catches pools from any supported DEX  
3. **Real-Time Alerts**: Immediate notification of new opportunities
4. **Complete Context**: Gets all pool parameters, not just addresses
5. **Extensible**: Easy to add new DEXs and event types

This approach transforms pool discovery from **reactive** (knowing tokens first) to **proactive** (discovering tokens through pool creation)! 