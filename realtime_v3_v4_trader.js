#!/usr/bin/env node

/**
 * Real-Time V3 + V4 Fresh Launch Trader
 * Monitors for BRAND NEW liquidity creation events on BOTH Uniswap V3 AND V4
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const { ethers } = require('ethers');

class RealtimeV3V4Trader {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.wethAddress = '0x4200000000000000000000000000000000000006';
        
        // Contract addresses
        this.contracts = {
            v3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD', // Base V3 Factory
            v4PoolManager: '0x7Da1D65F8B249183667cdE74C5CBD46dD38AA829', // Base V4 PoolManager (example)
            v3Quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
            v4Quoter: '0x64e8802FE490fa7cc61d3463958199161Bb608A7' // Base V4 Quoter (example)
        };
        
        // Event signatures for both V3 and V4
        this.signatures = {
            // Common events
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            
            // V3 events
            v3PoolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
            
            // V4 events (different signature)
            v4PoolInitialized: '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95',
            v4PoolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', // Similar to V3
            v4Initialize: '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95'
        };
        
        // Performance tracking
        this.stats = {
            totalDetected: 0,
            v3Pools: 0,
            v4Pools: 0,
            freshLaunches: 0,
            successfulSwaps: 0,
            failedSwaps: 0,
            avgDetectionTime: 0,
            avgAnalysisTime: 0,
            avgSwapTime: 0
        };
        
        this.startTime = Date.now();
        this.isRunning = false;
    }

    benchmark(label) {
        const start = process.hrtime.bigint();
        return {
            end: () => {
                const end = process.hrtime.bigint();
                const duration = Number(end - start) / 1000000; // Convert to milliseconds
                console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
                return duration;
            }
        };
    }

    async initialize() {
        console.log('🚀 REAL-TIME V3 + V4 FRESH LAUNCH TRADER');
        console.log('========================================');
        
        try {
            const [network, blockNumber] = await Promise.all([
                this.provider.getNetwork(),
                this.provider.getBlockNumber()
            ]);
            
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);
            console.log(`✅ Current Block: ${blockNumber}`);
            console.log(`✅ Start Time: ${new Date().toISOString()}`);
            console.log(`✅ WETH Address: ${this.wethAddress}`);
            console.log(`✅ V3 Factory: ${this.contracts.v3Factory}`);
            console.log(`✅ V4 PoolManager: ${this.contracts.v4PoolManager}`);
            console.log('');
            
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }

    async getTokenInfo(address) {
        const bench = this.benchmark('Token Info Retrieval');
        
        try {
            const [symbol, name, decimals] = await Promise.all([
                this.provider.call({ to: address, data: '0x95d89b41' }) // symbol()
                    .then(result => {
                        if (result === '0x' || result.length <= 2) return 'UNKNOWN';
                        try {
                            return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                        } catch {
                            return 'UNKNOWN';
                        }
                    })
                    .catch(() => 'ERROR'),
                this.provider.call({ to: address, data: '0x06fdde03' }) // name()
                    .then(result => {
                        if (result === '0x' || result.length <= 2) return 'Unknown';
                        try {
                            return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                        } catch {
                            return 'Unknown';
                        }
                    })
                    .catch(() => 'Unknown'),
                this.provider.call({ to: address, data: '0x313ce567' }) // decimals()
                    .then(result => result !== '0x' ? parseInt(result, 16) : 18)
                    .catch(() => 18)
            ]);

            bench.end();
            return { address, symbol, name, decimals };
        } catch (error) {
            bench.end();
            return { address, symbol: 'ERROR', name: 'Failed', decimals: 18 };
        }
    }

    determinePoolVersion(log) {
        // Check source contract to determine version
        const logAddress = log.address.toLowerCase();
        
        if (logAddress === this.contracts.v3Factory.toLowerCase()) {
            return 'V3';
        } else if (logAddress === this.contracts.v4PoolManager.toLowerCase()) {
            return 'V4';
        }
        
        // Fallback: check by event signature
        if (log.topics[0] === this.signatures.v3PoolCreated) {
            return 'V3';
        } else if (log.topics[0] === this.signatures.v4PoolInitialized || 
                  log.topics[0] === this.signatures.v4Initialize) {
            return 'V4';
        }
        
        return 'UNKNOWN';
    }

    parsePoolData(log, version) {
        try {
            if (version === 'V3') {
                const token0 = '0x' + log.topics[1].slice(26);
                const token1 = '0x' + log.topics[2].slice(26);
                const fee = parseInt(log.topics[3], 16);
                const poolAddress = '0x' + log.data.slice(90, 130);
                
                return { token0, token1, fee, poolAddress, version: 'V3' };
            } 
            else if (version === 'V4') {
                // V4 has different structure - adapt based on actual V4 events
                // This is a placeholder structure - update based on actual V4 events
                const token0 = log.topics[1] ? '0x' + log.topics[1].slice(26) : null;
                const token1 = log.topics[2] ? '0x' + log.topics[2].slice(26) : null;
                const fee = log.topics[3] ? parseInt(log.topics[3], 16) : 3000; // Default fee
                const poolAddress = log.address; // V4 uses different addressing
                
                return { token0, token1, fee, poolAddress, version: 'V4' };
            }
            
            return null;
        } catch (error) {
            console.error(`❌ Pool data parsing failed: ${error.message}`);
            return null;
        }
    }

    async analyzeFreshness(tx, receipt, poolLog) {
        const bench = this.benchmark('Freshness Analysis');
        
        try {
            console.log(`🔍 ANALYZING TRANSACTION FRESHNESS`);
            console.log(`Transaction: ${tx.hash}`);
            
            let tokenMintingFound = false;
            let poolCreationFound = false;
            const mintedTokens = new Set();
            
            // Check all events in the transaction
            for (const log of receipt.logs) {
                // Check for token minting (Transfer from 0x0)
                if (log.topics[0] === this.signatures.transfer) {
                    const from = log.topics[1];
                    if (from === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                        tokenMintingFound = true;
                        mintedTokens.add(log.address.toLowerCase());
                        console.log(`🪙 Token minting detected: ${log.address}`);
                    }
                }
                
                // Check for pool creation (V3 or V4)
                if (log.topics[0] === this.signatures.v3PoolCreated || 
                    log.topics[0] === this.signatures.v4PoolInitialized ||
                    log.topics[0] === this.signatures.v4Initialize) {
                    poolCreationFound = true;
                    console.log(`🏊 Pool creation detected`);
                }
            }
            
            // Parse pool data to check token freshness
            const version = this.determinePoolVersion(poolLog);
            const poolData = this.parsePoolData(poolLog, version);
            
            if (!poolData) {
                bench.end();
                return { isFreshLaunch: false };
            }
            
            // Check if any pool tokens were just minted
            const token0Minted = poolData.token0 ? mintedTokens.has(poolData.token0.toLowerCase()) : false;
            const token1Minted = poolData.token1 ? mintedTokens.has(poolData.token1.toLowerCase()) : false;
            
            const duration = bench.end();
            this.stats.avgAnalysisTime = (this.stats.avgAnalysisTime + duration) / 2;
            
            return {
                isFreshLaunch: tokenMintingFound && poolCreationFound,
                token0Minted,
                token1Minted,
                mintedTokens: Array.from(mintedTokens),
                poolData,
                version
            };
            
        } catch (error) {
            bench.end();
            console.error(`❌ Freshness analysis failed: ${error.message}`);
            return { isFreshLaunch: false, version: 'UNKNOWN' };
        }
    }

    async getSwapQuote(tokenIn, tokenOut, amountIn, poolData) {
        const bench = this.benchmark(`${poolData.version} Swap Quote`);
        
        try {
            if (poolData.version === 'V3') {
                // Use V3 Quoter
                const quoterAddress = this.contracts.v3Quoter;
                
                const quoteParams = ethers.AbiCoder.defaultAbiCoder().encode(
                    ['address', 'address', 'uint24', 'uint256', 'uint160'],
                    [tokenIn, tokenOut, poolData.fee, amountIn, 0]
                );
                
                const result = await this.provider.call({
                    to: quoterAddress,
                    data: '0xf7729d43' + quoteParams.slice(2) // quoteExactInputSingle
                });
                
                const duration = bench.end();
                
                if (result !== '0x' && result.length > 2) {
                    const amountOut = BigInt(result);
                    console.log(`💱 V3 Quote: ${ethers.formatEther(amountIn)} → ${ethers.formatEther(amountOut)}`);
                    return { success: true, amountOut, duration, version: 'V3' };
                }
            } 
            else if (poolData.version === 'V4') {
                // Use V4 Quoter (different interface)
                const quoterAddress = this.contracts.v4Quoter;
                
                // V4 has different quote structure - this is a placeholder
                // Update based on actual V4 quoter interface
                try {
                    const result = await this.provider.call({
                        to: quoterAddress,
                        data: '0x' // V4 quote method selector
                    });
                    
                    const duration = bench.end();
                    
                    if (result !== '0x' && result.length > 2) {
                        const amountOut = BigInt(result);
                        console.log(`💱 V4 Quote: ${ethers.formatEther(amountIn)} → ${ethers.formatEther(amountOut)}`);
                        return { success: true, amountOut, duration, version: 'V4' };
                    }
                } catch (v4Error) {
                    console.log(`⚠️  V4 quote not available, simulating...`);
                    // Simulate quote for V4
                    const simulatedOut = amountIn * 990n / 1000n; // Simulate 1% fee
                    const duration = bench.end();
                    return { success: true, amountOut: simulatedOut, duration, version: 'V4_SIMULATED' };
                }
            }
            
            const duration = bench.end();
            console.log(`❌ Quote failed: No liquidity`);
            return { success: false, duration };
            
        } catch (error) {
            const duration = bench.end();
            console.error(`❌ Quote failed: ${error.message}`);
            return { success: false, error: error.message, duration };
        }
    }

    async executeSwap(tokenIn, tokenOut, amountIn, poolData, targetToken) {
        const bench = this.benchmark(`${poolData.version} Swap Execution`);
        
        try {
            console.log(`🔄 ATTEMPTING ${poolData.version} SWAP EXECUTION`);
            console.log(`From: ${tokenIn === this.wethAddress ? 'WETH' : targetToken.symbol}`);
            console.log(`To: ${tokenOut === this.wethAddress ? 'WETH' : targetToken.symbol}`);
            console.log(`Amount: ${ethers.formatEther(amountIn)} tokens`);
            console.log(`Pool: ${poolData.poolAddress} (${poolData.version})`);
            
            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Get quote first
            const quote = await this.getSwapQuote(tokenIn, tokenOut, amountIn, poolData);
            
            if (!quote.success) {
                const duration = bench.end();
                this.stats.failedSwaps++;
                return { success: false, reason: 'Quote failed', duration };
            }
            
            // Simulate successful swap
            const duration = bench.end();
            this.stats.successfulSwaps++;
            this.stats.avgSwapTime = (this.stats.avgSwapTime + duration) / 2;
            
            console.log(`✅ ${poolData.version} SWAP SIMULATED SUCCESSFULLY`);
            console.log(`Expected Output: ${ethers.formatEther(quote.amountOut)} tokens`);
            
            return {
                success: true,
                amountOut: quote.amountOut,
                duration,
                version: poolData.version,
                simulatedTxHash: '0x' + Math.random().toString(16).substr(2, 64)
            };
            
        } catch (error) {
            const duration = bench.end();
            this.stats.failedSwaps++;
            console.error(`❌ Swap execution failed: ${error.message}`);
            return { success: false, error: error.message, duration };
        }
    }

    async processPoolCreation(log) {
        const totalBench = this.benchmark('Total Pool Processing');
        
        try {
            const version = this.determinePoolVersion(log);
            
            console.log(`\n${'='.repeat(80)}`);
            console.log(`🚨 NEW ${version} POOL CREATION DETECTED!`);
            console.log(`${'='.repeat(80)}`);
            console.log(`Block: ${parseInt(log.blockNumber, 16)}`);
            console.log(`Transaction: ${log.transactionHash}`);
            console.log(`Time: ${new Date().toISOString()}`);
            console.log(`Version: Uniswap ${version}`);
            
            this.stats.totalDetected++;
            if (version === 'V3') this.stats.v3Pools++;
            if (version === 'V4') this.stats.v4Pools++;
            
            // Get transaction details
            const txBench = this.benchmark('Transaction Retrieval');
            const [tx, receipt] = await Promise.all([
                this.provider.getTransaction(log.transactionHash),
                this.provider.getTransactionReceipt(log.transactionHash)
            ]);
            txBench.end();
            
            if (!tx || !receipt) {
                console.log(`❌ Could not retrieve transaction details`);
                return;
            }
            
            // Analyze freshness
            const freshness = await this.analyzeFreshness(tx, receipt, log);
            
            if (!freshness.isFreshLaunch) {
                console.log(`📈 SECONDARY POOL CREATION - Skipping (existing tokens)`);
                totalBench.end();
                return;
            }
            
            console.log(`🔥🔥 FRESH TOKEN LAUNCH DETECTED ON ${version}!`);
            this.stats.freshLaunches++;
            
            const poolData = freshness.poolData;
            
            console.log(`\n📊 POOL DETAILS:`);
            console.log(`Pool Address: ${poolData.poolAddress}`);
            console.log(`Fee Tier: ${poolData.fee / 10000}%`);
            console.log(`Version: Uniswap ${version}`);
            
            if (!poolData.token0 || !poolData.token1) {
                console.log(`❌ Could not parse token addresses`);
                totalBench.end();
                return;
            }
            
            // Get token information
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(poolData.token0),
                this.getTokenInfo(poolData.token1)
            ]);
            
            console.log(`\n🪙 TOKEN DETAILS:`);
            console.log(`Token 0: ${token0Info.symbol} (${token0Info.name})`);
            console.log(`  Address: ${poolData.token0}`);
            console.log(`  Minted: ${freshness.token0Minted ? '🔥 YES' : '📜 NO'}`);
            console.log(`Token 1: ${token1Info.symbol} (${token1Info.name})`);
            console.log(`  Address: ${poolData.token1}`);
            console.log(`  Minted: ${freshness.token1Minted ? '🔥 YES' : '📜 NO'}`);
            
            // Determine if it's a WETH pair
            const isWETHPair = poolData.token0.toLowerCase() === this.wethAddress.toLowerCase() || 
                             poolData.token1.toLowerCase() === this.wethAddress.toLowerCase();
            
            if (!isWETHPair) {
                console.log(`❌ NOT A WETH PAIR - Skipping swap attempt`);
                totalBench.end();
                return;
            }
            
            // Determine swap direction
            const isToken0WETH = poolData.token0.toLowerCase() === this.wethAddress.toLowerCase();
            const tokenIn = isToken0WETH ? poolData.token0 : poolData.token1;
            const tokenOut = isToken0WETH ? poolData.token1 : poolData.token0;
            const targetToken = isToken0WETH ? token1Info : token0Info;
            
            console.log(`\n💎 WETH PAIR CONFIRMED!`);
            console.log(`Target Token: ${targetToken.symbol} (${targetToken.name})`);
            console.log(`Strategy: BUY ${targetToken.symbol} with WETH on ${version}`);
            
            // Execute swap
            const swapAmount = ethers.parseEther('0.0001');
            console.log(`\n🔄 EXECUTING IMMEDIATE ${version} SWAP`);
            console.log(`Amount: ${ethers.formatEther(swapAmount)} WETH → ${targetToken.symbol}`);
            
            const swapResult = await this.executeSwap(tokenIn, tokenOut, swapAmount, poolData, targetToken);
            
            if (swapResult.success) {
                console.log(`\n🎉 FRESH LAUNCH TRADE COMPLETED ON ${version}!`);
                console.log(`Simulated TX: ${swapResult.simulatedTxHash}`);
                console.log(`Output: ${ethers.formatUnits(swapResult.amountOut, targetToken.decimals)} ${targetToken.symbol}`);
            } else {
                console.log(`\n❌ TRADE FAILED: ${swapResult.reason || swapResult.error}`);
            }
            
            const totalDuration = totalBench.end();
            
            console.log(`\n📊 PERFORMANCE METRICS:`);
            console.log(`Total Processing Time: ${totalDuration.toFixed(2)}ms`);
            console.log(`Swap Success Rate: ${((this.stats.successfulSwaps / (this.stats.successfulSwaps + this.stats.failedSwaps)) * 100 || 0).toFixed(1)}%`);
            
        } catch (error) {
            totalBench.end();
            console.error(`❌ Pool processing failed: ${error.message}`);
        }
    }

    async startMonitoring() {
        const initialized = await this.initialize();
        if (!initialized) return;
        
        this.isRunning = true;
        
        console.log(`🎯 STARTING REAL-TIME V3 + V4 MONITORING`);
        console.log(`Watching for: PoolCreated events on BOTH V3 AND V4`);
        console.log(`Target: FRESH TOKEN LAUNCHES (new token + new pool)`);
        console.log(`Action: Immediate swap execution with benchmarking`);
        console.log(`Press Ctrl+C to stop\n`);
        
        // Set up event listeners for BOTH V3 and V4
        const v3Filter = {
            address: this.contracts.v3Factory,
            topics: [this.signatures.v3PoolCreated]
        };
        
        const v4Filter = {
            address: this.contracts.v4PoolManager,
            topics: [this.signatures.v4PoolInitialized]
        };
        
        // Additional broad filter to catch any pool creation events
        const broadFilter = {
            topics: [
                [this.signatures.v3PoolCreated, this.signatures.v4PoolInitialized, this.signatures.v4Initialize]
            ]
        };
        
        this.provider.on(v3Filter, (log) => {
            console.log(`📡 V3 Pool Creation Event Detected`);
            this.processPoolCreation(log).catch(console.error);
        });
        
        this.provider.on(v4Filter, (log) => {
            console.log(`📡 V4 Pool Creation Event Detected`);
            this.processPoolCreation(log).catch(console.error);
        });
        
        this.provider.on(broadFilter, (log) => {
            console.log(`📡 General Pool Creation Event Detected from ${log.address}`);
            this.processPoolCreation(log).catch(console.error);
        });
        
        // Periodic status updates
        const statusInterval = setInterval(() => {
            const uptime = Math.floor((Date.now() - this.startTime) / 1000);
            console.log(`\n📈 STATUS UPDATE (${uptime}s uptime):`);
            console.log(`Total Pools Detected: ${this.stats.totalDetected} (V3: ${this.stats.v3Pools}, V4: ${this.stats.v4Pools})`);
            console.log(`Fresh Launches: ${this.stats.freshLaunches}`);
            console.log(`Successful Swaps: ${this.stats.successfulSwaps}`);
            console.log(`Failed Swaps: ${this.stats.failedSwaps}`);
            console.log(`Avg Analysis Time: ${this.stats.avgAnalysisTime.toFixed(2)}ms`);
            console.log(`Avg Swap Time: ${this.stats.avgSwapTime.toFixed(2)}ms`);
            console.log(`Waiting for next pool creation...\n`);
        }, 30000);
        
        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log(`\n🛑 STOPPING MONITORING...`);
            clearInterval(statusInterval);
            this.provider.removeAllListeners();
            this.isRunning = false;
            
            console.log(`\n📊 FINAL STATISTICS:`);
            console.log(`Runtime: ${Math.floor((Date.now() - this.startTime) / 1000)}s`);
            console.log(`Total Pools: ${this.stats.totalDetected} (V3: ${this.stats.v3Pools}, V4: ${this.stats.v4Pools})`);
            console.log(`Fresh Launches: ${this.stats.freshLaunches}`);
            console.log(`Success Rate: ${((this.stats.successfulSwaps / (this.stats.successfulSwaps + this.stats.failedSwaps)) * 100 || 0).toFixed(1)}%`);
            
            process.exit(0);
        });
        
        console.log(`✅ V3 + V4 MONITORING ACTIVE - Watching for fresh token launches on BOTH protocols...`);
    }
}

// Main execution
async function main() {
    const trader = new RealtimeV3V4Trader();
    await trader.startMonitoring();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RealtimeV3V4Trader; 