const { ethers } = require("ethers");
const axios = require("axios");

const WETH = "0x4200000000000000000000000000000000000006";
const KEY = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";
const RPC = "http://localhost:8545";

// ALL MAJOR ROUTERS ON BASE
const ALL_ROUTERS = {
    // UNISWAP ROUTERS
    "UNISWAP_V2": "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
    "UNISWAP_V3": "0x2626664c2603336E57B271c5C0b26F421741e481",
    "UNISWAP_UNIVERSAL": "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    "UNISWAP_UNIVERSAL_2": "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC",
    "UNISWAP_V4_ROUTER": "0x64e8802FE490fa7cc61d3463958199161Bb608A7",
    
    // OTHER MAJOR DEX ROUTERS
    "BASESWAP": "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
    "SWAPBASED": "0xaaa3b1f1bd7bcc97fd1917c18ade665c5d31f066",
    "SUSHISWAP_V2": "0x1b02da8cb0d097eb8d57a175b88c7d8b47997506",
    "SUSHISWAP_V3": "0x80c7dd17b01855a6d2347444a0fcc36136a314de",
    "AERODROME": "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    "BALANCER": "0xba12222222228d8ba445958a75a0704d566bf2c8",
    "CURVE": "0x4f37A9d177470499A2dD084621020b023fcffc1F"
};

const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const KNOWN = new Set([
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913".toLowerCase(), // USDC
    "0x4200000000000000000000000000000000000006".toLowerCase(), // WETH
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb".toLowerCase(), // DAI
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca".toLowerCase(), // USDbC
]);

class AllRoutersHunter {
    constructor() {
        this.wallet = new ethers.Wallet(KEY);
        this.seenPools = new Set();
        this.last = 0;
        
        console.log("🌍 ALL ROUTERS HUNTER");
        console.log("=====================");
        console.log("🔑 Wallet:", this.wallet.address);
        console.log("🎯 MONITORING", Object.keys(ALL_ROUTERS).length, "ROUTERS:");
        
        for (const [name, addr] of Object.entries(ALL_ROUTERS)) {
            console.log(`   ${name}: ${addr.slice(0,12)}...`);
        }
        
        console.log("🚀 STRATEGY: WETH + Token → Pool across ALL DEXes");
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
    
    async huntAllRouters(block) {
        console.log(`🌍 ALL ROUTERS HUNT - Block ${block}`);
        
        // Get all transactions in the block
        const blockData = await this.rpc("eth_getBlockByNumber", [`0x${block.toString(16)}`, true]);
        
        if (!blockData || !blockData.transactions) return [];
        
        const allPools = [];
        let routerStats = {};
        
        // Initialize router stats
        for (const name of Object.keys(ALL_ROUTERS)) {
            routerStats[name] = 0;
        }
        
        for (const tx of blockData.transactions) {
            if (!tx.to) continue;
            
            const txTo = tx.to.toLowerCase();
            
            // Check if transaction is to ANY of our routers
            for (const [routerName, routerAddr] of Object.entries(ALL_ROUTERS)) {
                if (txTo === routerAddr.toLowerCase()) {
                    routerStats[routerName]++;
                    
                    console.log(`   📡 ${routerName} TX: ${tx.hash.slice(0,12)}...`);
                    
                    // Analyze this router transaction
                    const poolData = await this.analyzeLiquidityTx(tx.hash, routerName);
                    if (poolData) {
                        allPools.push(poolData);
                    }
                }
            }
        }
        
        // Show router activity stats
        console.log("   📊 Router Activity:");
        for (const [name, count] of Object.entries(routerStats)) {
            if (count > 0) {
                console.log(`      ${name}: ${count} transactions`);
            }
        }
        
        if (allPools.length > 0) {
            console.log(`   🌍 FOUND ${allPools.length} NEW POOLS ACROSS ALL ROUTERS!`);
        }
        
        return allPools;
    }
    
    async analyzeLiquidityTx(txHash, routerName) {
        // Get transaction receipt to see all transfers
        const receipt = await this.rpc("eth_getTransactionReceipt", [txHash]);
        
        if (!receipt || !receipt.logs) return null;
        
        // Group transfers by destination address
        const transfers = {};
        const poolCandidates = new Set();
        
        for (const log of receipt.logs) {
            // Only look at Transfer events
            if (log.topics[0] === TRANSFER_SIG && log.topics.length >= 3) {
                const tokenAddress = log.address.toLowerCase();
                const to = "0x" + log.topics[2].slice(26).toLowerCase();
                
                // Skip zero address
                if (to === "0x0000000000000000000000000000000000000000") continue;
                
                // Group transfers by destination
                if (!transfers[to]) {
                    transfers[to] = [];
                }
                
                transfers[to].push({
                    token: tokenAddress,
                    from: "0x" + log.topics[1].slice(26).toLowerCase(),
                    to: to,
                    router: routerName
                });
                
                // If WETH is being transferred, this could be a new pool
                if (tokenAddress === WETH.toLowerCase()) {
                    poolCandidates.add(to);
                }
            }
        }
        
        // Check each pool candidate for the liquidity pattern
        for (const poolAddr of poolCandidates) {
            if (this.seenPools.has(poolAddr)) continue;
            
            const poolTransfers = transfers[poolAddr] || [];
            
            // Look for WETH + new token going to same address
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
                    console.log(`      🎯 ${routerName} PATTERN: WETH + ${newToken.slice(0,12)}... → ${poolAddr.slice(0,12)}...`);
                    
                    const tokenInfo = await this.validateToken(newToken);
                    if (tokenInfo) {
                        this.seenPools.add(poolAddr);
                        
                        return {
                            type: `ALL_ROUTERS_${routerName}`,
                            token: newToken,
                            info: tokenInfo,
                            poolAddress: poolAddr,
                            router: routerName,
                            routerAddress: ALL_ROUTERS[routerName],
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
        console.log("\n🌍 ALL ROUTERS TRADE");
        console.log("====================");
        console.log("🎯 Router:", poolData.router);
        console.log("🚀 Address:", poolData.routerAddress);
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
        
        // Use the same router that created the liquidity
        const routerAddress = poolData.routerAddress;
        
        const tx = {
            to: routerAddress,
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
        
        console.log("🚀 EXECUTING ALL ROUTERS SWAP...");
        
        try {
            const signed = await this.wallet.signTransaction(tx);
            const hash = await this.rpc("eth_sendRawTransaction", [signed]);
            
            if (hash) {
                console.log("✅ ALL ROUTERS SUCCESS!");
                console.log("   TX:", hash);
                console.log("   🪙 Token:", poolData.info.symbol);
                console.log("   🎯 Router:", poolData.router);
                console.log("   🌍 COMPREHENSIVE MONITORING WORKS!");
                
                setTimeout(async () => {
                    const receipt = await this.rpc("eth_getTransactionReceipt", [hash]);
                    if (receipt && receipt.status === "0x1") {
                        console.log("🎉 ALL ROUTERS CONFIRMED!");
                        console.log("   🏆 ACQUIRED:", poolData.info.symbol);
                        console.log("   💪 MULTI-ROUTER SUCCESS!");
                    }
                }, 3000);
            }
        } catch (e) {
            console.log("❌ All routers swap failed:", e.message);
        }
    }
    
    async run() {
        console.log("\n🌍 ALL ROUTERS HUNTER ACTIVE");
        console.log("============================");
        console.log("🎯 MONITORING:", Object.keys(ALL_ROUTERS).length, "routers");
        console.log("📊 COVERAGE: Uniswap V2/V3/V4 + BaseSwap + SushiSwap + More");
        console.log("🚀 STRATEGY: WETH + Token → Pool across ALL DEXes");
        console.log("");
        
        const current = await this.rpc("eth_blockNumber", []);
        this.last = parseInt(current, 16);
        
        console.log("📊 Starting all-router hunt from block:", this.last);
        
        while (true) {
            try {
                const latest = await this.rpc("eth_blockNumber", []);
                const block = parseInt(latest, 16);
                
                if (block > this.last) {
                    for (let b = this.last + 1; b <= block; b++) {
                        console.log("📡 All Routers Block:", b);
                        
                        const pools = await this.huntAllRouters(b);
                        
                        for (const pool of pools) {
                            console.log("🚨 ALL ROUTERS PATTERN MATCH!");
                            await this.trade(pool);
                        }
                    }
                    
                    this.last = block;
                }
                
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {
                console.log("❌ All routers hunt error:", e.message);
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
}

console.log("🌍 ALL ROUTERS HUNTER");
console.log("=====================");
console.log("STRATEGY: Monitor ALL major DEX routers on Base");
console.log("COVERAGE: Uniswap V2/V3/V4, BaseSwap, SushiSwap, Aerodrome, etc.");
console.log("PATTERN: WETH + Token → Pool across ALL DEXes");
console.log("");

const hunter = new AllRoutersHunter();
hunter.run().catch(console.error); 