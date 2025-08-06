const { ethers } = require("ethers");
const axios = require("axios");

const WETH = "0x4200000000000000000000000000000000000006";
const KEY = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";
const RPC = "http://localhost:8545";

// EXACT ROUTER FROM YOUR EXAMPLE
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

// Transfer signature
const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const KNOWN = new Set([
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913".toLowerCase(), // USDC
    "0x4200000000000000000000000000000000000006".toLowerCase(), // WETH
]);

class ReverseEngineeredHunter {
    constructor() {
        this.wallet = new ethers.Wallet(KEY);
        this.seenPools = new Set();
        this.last = 0;
        
        console.log("🔍 REVERSE ENGINEERED HUNTER");
        console.log("============================");
        console.log("🔑 Wallet:", this.wallet.address);
        console.log("🎯 TARGET: Uniswap V2 Router addLiquidity transactions");
        console.log("📊 PATTERN: WETH + Token → New Pool (like your CAT example)");
        console.log("🚀 Router:", UNISWAP_V2_ROUTER);
    }
    
    async rpc(method, params = []) {
        try {
            const res = await axios.post(RPC, {
                jsonrpc: "2.0", method, params, id: 1
            });
            return res.data.result;
        } catch (e) {
            return null;
        }
    }
    
    async huntLiquidityCreation(block) {
        console.log(`🔍 HUNTING LIQUIDITY - Block ${block}`);
        
        // Get all transactions TO the Uniswap V2 Router
        const block_data = await this.rpc("eth_getBlockByNumber", [`0x${block.toString(16)}`, true]);
        
        if (!block_data || !block_data.transactions) return [];
        
        const newPools = [];
        
        for (const tx of block_data.transactions) {
            // Check if transaction is TO our router
            if (tx.to && tx.to.toLowerCase() === UNISWAP_V2_ROUTER.toLowerCase()) {
                console.log(`   📡 Router TX: ${tx.hash.slice(0,12)}...`);
                
                // Analyze this router transaction for liquidity creation
                const poolData = await this.analyzeLiquidityTx(tx.hash);
                if (poolData) {
                    newPools.push(poolData);
                }
            }
        }
        
        if (newPools.length > 0) {
            console.log(`   🔍 FOUND ${newPools.length} NEW LIQUIDITY POOLS!`);
        }
        
        return newPools;
    }
    
    async analyzeLiquidityTx(txHash) {
        // Get transaction receipt to see all transfers
        const receipt = await this.rpc("eth_getTransactionReceipt", [txHash]);
        
        if (!receipt || !receipt.logs) return null;
        
        // Look for the pattern: WETH transfer + Token transfer to same address
        const transfers = {};
        const poolCandidates = new Set();
        
        for (const log of receipt.logs) {
            // Only look at Transfer events
            if (log.topics[0] === TRANSFER_SIG && log.topics.length >= 3) {
                const tokenAddress = log.address.toLowerCase();
                const to = "0x" + log.topics[2].slice(26).toLowerCase();
                
                // Group transfers by destination address
                if (!transfers[to]) {
                    transfers[to] = [];
                }
                
                transfers[to].push({
                    token: tokenAddress,
                    from: "0x" + log.topics[1].slice(26).toLowerCase(),
                    to: to,
                    data: log.data
                });
                
                // If WETH is being transferred, this address could be a new pool
                if (tokenAddress === WETH.toLowerCase()) {
                    poolCandidates.add(to);
                }
            }
        }
        
        // Check each pool candidate for the pattern
        for (const poolAddr of poolCandidates) {
            if (this.seenPools.has(poolAddr)) continue;
            
            const poolTransfers = transfers[poolAddr] || [];
            
            // Look for WETH + another token going to same address
            let hasWeth = false;
            let newTokens = [];
            
            for (const transfer of poolTransfers) {
                if (transfer.token === WETH.toLowerCase()) {
                    hasWeth = true;
                } else if (!KNOWN.has(transfer.token)) {
                    newTokens.push(transfer.token);
                }
            }
            
            // Found liquidity creation pattern!
            if (hasWeth && newTokens.length > 0) {
                for (const newToken of newTokens) {
                    console.log(`      🎯 LIQUIDITY PATTERN: WETH + ${newToken.slice(0,12)}... → ${poolAddr.slice(0,12)}...`);
                    
                    const tokenInfo = await this.validateToken(newToken);
                    if (tokenInfo) {
                        this.seenPools.add(poolAddr);
                        
                        return {
                            type: "REVERSE_ENGINEERED",
                            token: newToken,
                            info: tokenInfo,
                            poolAddress: poolAddr,
                            txHash: txHash,
                            hasWethPair: true
                        };
                    }
                }
            }
        }
        
        return null;
    }
    
    async validateToken(addr) {
        try {
            const sym = await this.rpc("eth_call", [{
                to: addr,
                data: "0x95d89b41" // symbol()
            }, "latest"]);
            
            if (!sym || sym === "0x") return null;
            
            let symbol = "";
            try {
                symbol = ethers.utils.toUtf8String("0x" + sym.slice(130)).replace(/\0/g, "");
            } catch (e) {
                // Try alternative decoding
                try {
                    const hex = sym.slice(2);
                    symbol = Buffer.from(hex, "hex").toString("utf8").replace(/\0/g, "");
                } catch (e2) {
                    return null;
                }
            }
            
            return symbol.length > 0 ? { symbol: symbol.trim() } : null;
        } catch (e) {
            return null;
        }
    }
    
    async trade(poolData) {
        console.log("\n🔍 REVERSE ENGINEERED TRADE");
        console.log("===========================");
        console.log("🎯 Pattern: WETH + Token → Pool (like CAT example)");
        console.log("🪙 Token:", poolData.token.slice(0, 12) + "...");
        console.log("✅ Symbol:", poolData.info.symbol);
        console.log("🏊 Pool:", poolData.poolAddress.slice(0, 12) + "...");
        console.log("🔄 WETH Pair: YES");
        
        const nonce = await this.rpc("eth_getTransactionCount", [this.wallet.address, "latest"]);
        const gas = await this.rpc("eth_gasPrice", []);
        
        if (!nonce || !gas) {
            console.log("❌ Cannot get tx params");
            return;
        }
        
        const tx = {
            to: UNISWAP_V2_ROUTER,
            value: "0x38d7ea4c68000", // 0.001 ETH
            gas: "0x7a120",
            gasPrice: "0x" + (parseInt(gas, 16) * 4).toString(16),
            nonce,
            data: "0x7ff36ab5" + // swapExactETHForTokensSupportingFeeOnTransferTokens
                  "0000000000000000000000000000000000000000000000000000000000000001" + // minOut
                  "0000000000000000000000000000000000000000000000000000000000000080" + // path offset
                  this.wallet.address.slice(2).padStart(64, "0") + // to
                  Math.floor(Date.now() / 1000 + 300).toString(16).padStart(64, "0") + // deadline
                  "0000000000000000000000000000000000000000000000000000000000000002" + // path length
                  WETH.slice(2).padStart(64, "0") + // WETH
                  poolData.token.slice(2).padStart(64, "0"), // new token
            chainId: 8453
        };
        
        console.log("🚀 EXECUTING REVERSE ENGINEERED SWAP...");
        
        try {
            const signed = await this.wallet.signTransaction(tx);
            const hash = await this.rpc("eth_sendRawTransaction", [signed]);
            
            if (hash) {
                console.log("✅ REVERSE ENGINEERED SUCCESS!");
                console.log("   TX:", hash);
                console.log("   🪙 Token:", poolData.info.symbol);
                console.log("   🔍 Pattern: WETH + Token → Pool");
                console.log("   🎯 Just like your CAT example!");
                
                setTimeout(async () => {
                    const receipt = await this.rpc("eth_getTransactionReceipt", [hash]);
                    if (receipt && receipt.status === "0x1") {
                        console.log("🎉 REVERSE ENGINEERED CONFIRMED!");
                        console.log("   🏆 ACQUIRED:", poolData.info.symbol);
                        console.log("   💪 PATTERN MATCHING SUCCESS!");
                    }
                }, 3000);
            }
        } catch (e) {
            console.log("❌ Reverse engineered swap failed:", e.message);
        }
    }
    
    async run() {
        console.log("\n🔍 REVERSE ENGINEERED HUNTER ACTIVE");
        console.log("===================================");
        console.log("🎯 STRATEGY: Monitor Uniswap V2 Router transactions");
        console.log("📊 PATTERN: WETH + Token → New Pool (like CAT)");
        console.log("🚀 ROUTER: " + UNISWAP_V2_ROUTER);
        console.log("✅ EXAMPLE: TX 0x72f37430... (CAT liquidity creation)");
        console.log("");
        
        const current = await this.rpc("eth_blockNumber", []);
        this.last = parseInt(current, 16);
        
        console.log("📊 Starting reverse engineered hunt from block:", this.last);
        
        while (true) {
            try {
                const latest = await this.rpc("eth_blockNumber", []);
                const block = parseInt(latest, 16);
                
                if (block > this.last) {
                    for (let b = this.last + 1; b <= block; b++) {
                        console.log("📡 RE Block:", b);
                        
                        const pools = await this.huntLiquidityCreation(b);
                        
                        for (const pool of pools) {
                            console.log("🚨 REVERSE ENGINEERED PATTERN MATCH!");
                            await this.trade(pool);
                        }
                    }
                    
                    this.last = block;
                }
                
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {
                console.log("❌ RE Hunt error:", e.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
}

console.log("🔍 REVERSE ENGINEERED HUNTER");
console.log("============================");
console.log("STRATEGY: Replicate exact pattern from CAT example");
console.log("PATTERN: Monitor Uniswap V2 Router for WETH + Token → Pool");
console.log("TARGET: Transactions like 0x72f37430... (CAT liquidity)");
console.log("");

const hunter = new ReverseEngineeredHunter();
hunter.run().catch(console.error); 