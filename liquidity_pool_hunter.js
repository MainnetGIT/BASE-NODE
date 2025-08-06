const { ethers } = require("ethers");
const axios = require("axios");

const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const PRIVATE_KEY = "406e6fb72c2f904a1fd9a23d4ac0cb6b80c19f2abfc63646cb9358711204c11d";
const RPC_URL = "http://localhost:8545";
const UNISWAP_V2_ROUTER = "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24";

// SPECIFIC LIQUIDITY POOL DETECTION (not token minting)
const LIQUIDITY_SIGNATURES = {
    // Uniswap V2 PairCreated
    UNISWAP_V2_PAIR: "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9",
    // Uniswap V3 PoolCreated  
    UNISWAP_V3_POOL: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118",
    // Generic Pool/Pair creation patterns
    POOL_CREATED: "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f",
    PAIR_CREATED: "0x2da466a7b24304f47e87fa2e1e5a81b9831ce54fec19055ce277ca2f39ba42c4"
};

// BASE DEX Factory addresses (where pools are created)
const BASE_FACTORIES = [
    "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", // Uniswap V2 Factory
    "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", // Uniswap V3 Factory
    "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // BaseSwap Factory
];

const KNOWN_TOKENS = new Set([
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913".toLowerCase(), // USDC
    "0x4200000000000000000000000000000000000006".toLowerCase(), // WETH
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb".toLowerCase(), // DAI
]);

class LiquidityPoolHunter {
    constructor() {
        this.wallet = new ethers.Wallet(PRIVATE_KEY);
        this.seenPools = new Set();
        this.lastBlock = 0;
        
        console.log("🏊 LIQUIDITY POOL HUNTER");
        console.log("========================");
        console.log("🔑 Wallet:", this.wallet.address);
        console.log("🎯 TARGET: NEW LIQUIDITY POOLS (not token minting)");
        console.log("🏭 Monitoring", BASE_FACTORIES.length, "BASE factories");
        console.log("📊 Pool signatures:", Object.keys(LIQUIDITY_SIGNATURES).length);
    }
    
    async rpcCall(method, params = []) {
        try {
            const response = await axios.post(RPC_URL, {
                jsonrpc: "2.0",
                method: method,
                params: params,
                id: 1
            });
            return response.data.result;
        } catch (error) {
            console.log("❌ RPC error:", error.message);
            return null;
        }
    }
    
    async huntLiquidityPools(blockNumber) {
        console.log(`🏊 LIQUIDITY POOL HUNT - Block ${blockNumber}`);
        
        const newPools = [];
        
        // METHOD 1: Monitor factory contracts for pool creation events
        for (const factory of BASE_FACTORIES) {
            const factoryPools = await this.scanFactoryPools(factory, blockNumber);
            newPools.push(...factoryPools);
        }
        
        // METHOD 2: Scan for specific pool creation signatures
        for (const [sigName, signature] of Object.entries(LIQUIDITY_SIGNATURES)) {
            const signaturePools = await this.scanPoolSignature(signature, sigName, blockNumber);
            newPools.push(...signaturePools);
        }
        
        // METHOD 3: Detect WETH pairing in same transaction (immediate liquidity)
        const wethPairs = await this.detectWethPairing(blockNumber);
        newPools.push(...wethPairs);
        
        // Remove duplicates
        const uniquePools = this.deduplicatePools(newPools);
        
        if (uniquePools.length > 0) {
            console.log(`   🏊 FOUND ${uniquePools.length} NEW LIQUIDITY POOLS!`);
        }
        
        return uniquePools;
    }
    
    async scanFactoryPools(factory, blockNumber) {
        console.log(`   🏭 Scanning factory: ${factory.slice(0, 12)}...`);
        
        const logs = await this.rpcCall("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            address: factory
        }]);
        
        if (!logs) return [];
        
        const pools = [];
        for (const log of logs) {
            const pool = await this.analyzeFactoryEvent(log, factory);
            if (pool) {
                pools.push(pool);
            }
        }
        
        if (pools.length > 0) {
            console.log(`      🎯 Factory pools: ${pools.length}`);
        }
        
        return pools;
    }
    
    async scanPoolSignature(signature, sigName, blockNumber) {
        const logs = await this.rpcCall("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            topics: [signature]
        }]);
        
        if (!logs || logs.length === 0) return [];
        
        console.log(`   📊 ${sigName}: ${logs.length} events`);
        
        const pools = [];
        for (const log of logs) {
            const pool = await this.analyzePoolEvent(log, sigName);
            if (pool) {
                pools.push(pool);
            }
        }
        
        return pools;
    }
    
    async detectWethPairing(blockNumber) {
        // Look for transactions that create WETH transfers alongside new token transfers
        const transferSig = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
        
        const wethLogs = await this.rpcCall("eth_getLogs", [{
            fromBlock: `0x${blockNumber.toString(16)}`,
            toBlock: `0x${blockNumber.toString(16)}`,
            address: WETH_ADDRESS,
            topics: [transferSig]
        }]);
        
        if (!wethLogs) return [];
        
        const pools = [];
        
        for (const wethLog of wethLogs) {
            // Get all other token transfers in the same transaction
            const allLogs = await this.rpcCall("eth_getTransactionReceipt", [wethLog.transactionHash]);
            
            if (allLogs && allLogs.logs) {
                for (const otherLog of allLogs.logs) {
                    if (otherLog.topics[0] === transferSig && 
                        otherLog.address.toLowerCase() !== WETH_ADDRESS.toLowerCase() &&
                        !KNOWN_TOKENS.has(otherLog.address.toLowerCase())) {
                        
                        const tokenInfo = await this.validateToken(otherLog.address);
                        if (tokenInfo) {
                            pools.push({
                                type: "WETH_PAIRING",
                                token: otherLog.address.toLowerCase(),
                                info: tokenInfo,
                                txHash: wethLog.transactionHash,
                                blockNumber: parseInt(wethLog.blockNumber, 16)
                            });
                        }
                    }
                }
            }
        }
        
        if (pools.length > 0) {
            console.log(`   🔄 WETH pairings: ${pools.length}`);
        }
        
        return pools;
    }
    
    async analyzeFactoryEvent(log, factory) {
        // Extract token addresses from factory pool creation event
        if (log.topics.length >= 3) {
            const token0 = "0x" + log.topics[1].slice(26).toLowerCase();
            const token1 = "0x" + log.topics[2].slice(26).toLowerCase();
            
            // Look for NEW token paired with WETH
            let newToken = null;
            if (token0 === WETH_ADDRESS.toLowerCase() && !KNOWN_TOKENS.has(token1)) {
                newToken = token1;
            } else if (token1 === WETH_ADDRESS.toLowerCase() && !KNOWN_TOKENS.has(token0)) {
                newToken = token0;
            }
            
            if (newToken && !this.seenPools.has(log.address)) {
                const tokenInfo = await this.validateToken(newToken);
                if (tokenInfo) {
                    this.seenPools.add(log.address);
                    
                    return {
                        type: "FACTORY_POOL",
                        token: newToken,
                        info: tokenInfo,
                        poolAddress: log.address,
                        factory: factory,
                        txHash: log.transactionHash,
                        blockNumber: parseInt(log.blockNumber, 16)
                    };
                }
            }
        }
        
        return null;
    }
    
    async analyzePoolEvent(log, sigName) {
        // Similar logic for signature-based pool detection
        if (log.topics.length >= 3) {
            const token0 = "0x" + log.topics[1].slice(26).toLowerCase();
            const token1 = "0x" + log.topics[2].slice(26).toLowerCase();
            
            let newToken = null;
            if (token0 === WETH_ADDRESS.toLowerCase() && !KNOWN_TOKENS.has(token1)) {
                newToken = token1;
            } else if (token1 === WETH_ADDRESS.toLowerCase() && !KNOWN_TOKENS.has(token0)) {
                newToken = token0;
            }
            
            if (newToken && !this.seenPools.has(log.address)) {
                const tokenInfo = await this.validateToken(newToken);
                if (tokenInfo) {
                    this.seenPools.add(log.address);
                    
                    return {
                        type: sigName,
                        token: newToken,
                        info: tokenInfo,
                        poolAddress: log.address,
                        txHash: log.transactionHash,
                        blockNumber: parseInt(log.blockNumber, 16)
                    };
                }
            }
        }
        
        return null;
    }
    
    async validateToken(tokenAddress) {
        try {
            // Validate this is a real ERC20 token
            const symbolData = await this.rpcCall("eth_call", [{
                to: tokenAddress,
                data: "0x95d89b41" // symbol()
            }, "latest"]);
            
            const nameData = await this.rpcCall("eth_call", [{
                to: tokenAddress,
                data: "0x06fdde03" // name()
            }, "latest"]);
            
            if (!symbolData || symbolData === "0x" || !nameData || nameData === "0x") {
                return null;
            }
            
            let symbol = "";
            let name = "";
            
            try {
                symbol = ethers.utils.toUtf8String("0x" + symbolData.slice(130)).replace(/\0/g, "");
                name = ethers.utils.toUtf8String("0x" + nameData.slice(130)).replace(/\0/g, "");
            } catch (e) {
                return null;
            }
            
            if (symbol.length > 0 && name.length > 0) {
                return { symbol, name };
            }
            
            return null;
        } catch (error) {
            return null;
        }
    }
    
    deduplicatePools(pools) {
        const seen = new Set();
        return pools.filter(pool => {
            const key = pool.token + pool.poolAddress;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    
    async executeLiquidityPoolSwap(poolData) {
        const start = Date.now();
        
        console.log("\n🏊 EXECUTING LIQUIDITY POOL SWAP");
        console.log("=================================");
        console.log("🏊 Pool Type:", poolData.type);
        console.log("🪙 Token:", poolData.token.slice(0, 12) + "...");
        console.log("✅ Symbol:", poolData.info.symbol);
        console.log("📝 Name:", poolData.info.name);
        console.log("🏭 Pool:", poolData.poolAddress);
        
        // Get transaction parameters
        const nonce = await this.rpcCall("eth_getTransactionCount", [this.wallet.address, "latest"]);
        const gasPrice = await this.rpcCall("eth_gasPrice", []);
        
        if (!nonce || !gasPrice) {
            console.log("❌ Could not get transaction parameters");
            return;
        }
        
        const boostedGasPrice = "0x" + (parseInt(gasPrice, 16) * 4).toString(16);
        const swapAmount = "0x38d7ea4c68000"; // 0.001 ETH
        
        console.log("💰 Liquidity pool swap parameters:");
        console.log("   Amount: 0.001 ETH");
        console.log("   Token:", poolData.info.symbol);
        console.log("   Pool Type:", poolData.type);
        console.log("   Gas:", ethers.utils.formatUnits(boostedGasPrice, "gwei"), "Gwei");
        
        // Build swap transaction
        const tx = {
            to: UNISWAP_V2_ROUTER,
            value: swapAmount,
            gas: "0x7a120", // 500,000
            gasPrice: boostedGasPrice,
            nonce: nonce,
            data: "0x7ff36ab5" + // swapExactETHForTokensSupportingFeeOnTransferTokens
                  "0000000000000000000000000000000000000000000000000000000000000001" + // minOut
                  "0000000000000000000000000000000000000000000000000000000000000080" + // path offset
                  this.wallet.address.slice(2).padStart(64, "0") + // to
                  Math.floor(Date.now() / 1000 + 300).toString(16).padStart(64, "0") + // deadline
                  "0000000000000000000000000000000000000000000000000000000000000002" + // path length
                  WETH_ADDRESS.slice(2).padStart(64, "0") + // WETH
                  poolData.token.slice(2).padStart(64, "0"), // new token
            chainId: 8453
        };
        
        console.log("🚀 EXECUTING LIQUIDITY POOL SWAP...");
        
        try {
            const signedTx = await this.wallet.signTransaction(tx);
            const txHash = await this.rpcCall("eth_sendRawTransaction", [signedTx]);
            
            if (txHash) {
                const broadcastTime = Date.now() - start;
                console.log("✅ LIQUIDITY POOL SWAP SUCCESS!");
                console.log("   TX:", txHash);
                console.log("   Time:", broadcastTime + "ms");
                console.log("   🏊 Pool Type:", poolData.type);
                console.log("   🏆 REAL LIQUIDITY POOL TRADING!");
                
                // Monitor confirmation
                setTimeout(async () => {
                    const receipt = await this.rpcCall("eth_getTransactionReceipt", [txHash]);
                    if (receipt && receipt.status === "0x1") {
                        console.log("🎉 LIQUIDITY POOL SWAP CONFIRMED!");
                        console.log("   🪙 ACQUIRED:", poolData.info.symbol);
                        console.log("   💪 LIQUIDITY POOL HUNTER SUCCESS!");
                    }
                }, 3000);
                
            } else {
                console.log("❌ Transaction failed");
            }
            
        } catch (error) {
            console.log("❌ Swap failed:", error.message);
        }
    }
    
    async run() {
        console.log("\n🏊 LIQUIDITY POOL HUNTER ACTIVE");
        console.log("===============================");
        console.log("✅ Factory monitoring (real pool creation)");
        console.log("✅ Pool signature detection");
        console.log("✅ WETH pairing detection");
        console.log("🎯 TARGET: NEW LIQUIDITY POOLS (tradeable tokens)");
        console.log("❌ EXCLUDED: Token minting (non-tradeable)");
        console.log("");
        
        const currentBlock = await this.rpcCall("eth_blockNumber", []);
        this.lastBlock = parseInt(currentBlock, 16);
        
        console.log("📊 Starting liquidity hunt from block:", this.lastBlock);
        
        while (true) {
            try {
                const latestBlock = await this.rpcCall("eth_blockNumber", []);
                const blockNumber = parseInt(latestBlock, 16);
                
                if (blockNumber > this.lastBlock) {
                    for (let block = this.lastBlock + 1; block <= blockNumber; block++) {
                        console.log("📡 Hunting Liquidity Block:", block);
                        
                        const liquidityPools = await this.huntLiquidityPools(block);
                        
                        for (const poolData of liquidityPools) {
                            console.log("🚨 NEW LIQUIDITY POOL FOUND!");
                            await this.executeLiquidityPoolSwap(poolData);
                        }
                    }
                    
                    this.lastBlock = blockNumber;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log("❌ Hunt error:", error.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

console.log("🏊 LIQUIDITY POOL HUNTER");
console.log("========================");
console.log("STRATEGY: Hunt NEW LIQUIDITY POOLS, not token minting");
console.log("TARGET: Tokens with actual WETH liquidity (tradeable)");
console.log("MISSION: Find and swap tokens with REAL liquidity pools");
console.log("");

const hunter = new LiquidityPoolHunter();
hunter.run().catch(console.error); 