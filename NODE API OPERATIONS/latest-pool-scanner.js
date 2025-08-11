#!/usr/bin/env node
/**
 * Latest Liquidity Pool Scanner for BASE Network
 * Finds the most recently created liquidity pools across all major DEXes
 */

const axios = require('axios');

class LatestPoolScanner {
    constructor() {
        // Use multiple RPC endpoints for reliability
        this.rpcEndpoints = [
            'https://mainnet.base.org',
            'https://base-mainnet.g.alchemy.com/v2/demo',
            'https://base.meowrpc.com',
            'https://base.drpc.org'
        ];
        this.currentEndpointIndex = 0;
        this.requestId = 1;
        
        // Major DEX factory contracts on BASE
        this.factories = {
            'Uniswap V2': {
                address: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
                topic: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9', // PairCreated
                abi: 'PairCreated(address indexed token0, address indexed token1, address pair, uint)'
            },
            'Uniswap V3': {
                address: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
                topic: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', // PoolCreated
                abi: 'PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
            },
            'Aerodrome': {
                address: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
                topic: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9', // PairCreated
                abi: 'PairCreated(address indexed token0, address indexed token1, bool indexed stable, address pair, uint)'
            },
            'BaseSwap': {
                address: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
                topic: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9', // PairCreated
                abi: 'PairCreated(address indexed token0, address indexed token1, address pair, uint)'
            }
        };

        // Common token addresses for identification
        this.knownTokens = {
            '0x4200000000000000000000000000000000000006': { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
            '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
            '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb': { symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
            '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22': { symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
            '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf': { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', decimals: 8 },
            '0x27D2DECb4bFC9C76F0309b8E88dec3a601Fe25a8': { symbol: 'BALD', name: 'Bald', decimals: 18 }
        };
    }

    /**
     * Make RPC call with failover
     */
    async rpcCall(method, params = []) {
        let lastError;
        
        // Try each endpoint
        for (let i = 0; i < this.rpcEndpoints.length; i++) {
            const endpoint = this.rpcEndpoints[this.currentEndpointIndex];
            
            try {
                const payload = {
                    jsonrpc: '2.0',
                    method: method,
                    params: params,
                    id: this.requestId++
                };

                const response = await axios.post(endpoint, payload, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.error) {
                    throw new Error(response.data.error.message);
                }

                return response.data.result;
            } catch (error) {
                lastError = error;
                console.warn(`   ⚠️ RPC endpoint ${endpoint} failed: ${error.message}`);
                
                // Try next endpoint
                this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.rpcEndpoints.length;
            }
        }
        
        throw new Error(`All RPC endpoints failed. Last error: ${lastError.message}`);
    }

    /**
     * Get current block number
     */
    async getBlockNumber() {
        return parseInt(await this.rpcCall('eth_blockNumber'), 16);
    }

    /**
     * Get block by number
     */
    async getBlockByNumber(blockNumber, includeTransactions = false) {
        return await this.rpcCall('eth_getBlockByNumber', [blockNumber, includeTransactions]);
    }

    /**
     * Get logs
     */
    async getLogs(filter) {
        return await this.rpcCall('eth_getLogs', [filter]);
    }

    /**
     * Make contract call
     */
    async call(callData) {
        return await this.rpcCall('eth_call', [callData, 'latest']);
    }

    /**
     * Get latest liquidity pools from all major DEXes
     */
    async getLatestPools(blocksToScan = 1000) {
        console.log('🔍 SCANNING FOR LATEST LIQUIDITY POOLS ON BASE');
        console.log('==============================================');
        console.log(`📊 Scanning last ${blocksToScan} blocks across all major DEXes...`);
        
        try {
            // Get current block number
            const currentBlock = await this.getBlockNumber();
            const fromBlock = currentBlock - blocksToScan;
            
            console.log(`📦 Current block: ${currentBlock}`);
            console.log(`🔍 Scanning from block: ${fromBlock} to ${currentBlock}`);
            console.log('');

            const allPools = [];

            // Scan each DEX factory
            for (const [dexName, factory] of Object.entries(this.factories)) {
                try {
                    console.log(`🔄 Scanning ${dexName}...`);
                    
                    const logs = await this.getLogs({
                        fromBlock: `0x${fromBlock.toString(16)}`,
                        toBlock: `0x${currentBlock.toString(16)}`,
                        address: factory.address,
                        topics: [factory.topic]
                    });

                    console.log(`   Found ${logs.length} pool creation events`);

                    for (const log of logs) {
                        const poolData = await this.parsePoolCreationLog(log, dexName);
                        if (poolData) {
                            allPools.push(poolData);
                        }
                    }
                } catch (error) {
                    console.warn(`   ⚠️ Error scanning ${dexName}: ${error.message}`);
                }
            }

            // Sort by block number (most recent first)
            allPools.sort((a, b) => b.blockNumber - a.blockNumber);

            console.log(`\n✅ Found ${allPools.length} total pools in last ${blocksToScan} blocks`);
            
            if (allPools.length === 0) {
                console.log('❌ No pools found in recent blocks. Try increasing scan range.');
                return null;
            }

            // Get the latest pool
            const latestPool = allPools[0];
            
            // Get additional details
            await this.enrichPoolData(latestPool);
            
            console.log('\n🏆 LATEST LIQUIDITY POOL FOUND:');
            console.log('===============================');
            this.displayPoolInfo(latestPool);
            
            // Show recent pools summary
            if (allPools.length > 1) {
                console.log(`\n📋 RECENT POOLS SUMMARY (Last ${Math.min(10, allPools.length)} pools):`);
                console.log('================================================');
                
                for (let i = 0; i < Math.min(10, allPools.length); i++) {
                    const pool = allPools[i];
                    const timeAgo = this.getTimeAgo(pool.timestamp);
                    console.log(`${i + 1}. ${pool.token0Symbol}/${pool.token1Symbol} on ${pool.dex} - ${timeAgo} ago`);
                }
            }

            return latestPool;

        } catch (error) {
            console.error('❌ Error scanning for pools:', error.message);
            return null;
        }
    }

    /**
     * Parse pool creation log
     */
    async parsePoolCreationLog(log, dexName) {
        try {
            const blockNumber = parseInt(log.blockNumber, 16);
            const logIndex = parseInt(log.logIndex, 16);
            
            // Get block timestamp
            const block = await this.getBlockByNumber(`0x${blockNumber.toString(16)}`, false);
            const timestamp = parseInt(block.timestamp, 16);

            let poolData = {
                dex: dexName,
                blockNumber,
                logIndex,
                timestamp,
                transactionHash: log.transactionHash,
                factoryAddress: log.address
            };

            // Parse based on DEX type
            if (dexName === 'Uniswap V3') {
                // Uniswap V3: token0, token1, fee, tickSpacing, pool
                poolData.token0 = '0x' + log.topics[1].slice(26);
                poolData.token1 = '0x' + log.topics[2].slice(26);
                poolData.fee = parseInt(log.topics[3], 16);
                
                // Parse pool address from data
                const poolAddress = '0x' + log.data.slice(154, 194);
                poolData.poolAddress = poolAddress;
                
                poolData.poolType = `V3 (${poolData.fee / 10000}% fee)`;
            } else {
                // Uniswap V2, Aerodrome, BaseSwap: token0, token1, pair, index
                poolData.token0 = '0x' + log.topics[1].slice(26);
                poolData.token1 = '0x' + log.topics[2].slice(26);
                
                // Parse pool address from data
                const poolAddress = '0x' + log.data.slice(26, 66);
                poolData.poolAddress = poolAddress;
                
                if (dexName === 'Aerodrome') {
                    // Aerodrome has stable flag
                    const stable = log.topics[3] === '0x0000000000000000000000000000000000000000000000000000000000000001';
                    poolData.poolType = stable ? 'Stable' : 'Volatile';
                } else {
                    poolData.poolType = 'V2';
                }
            }

            return poolData;
        } catch (error) {
            console.warn(`   ⚠️ Failed to parse log: ${error.message}`);
            return null;
        }
    }

    /**
     * Enrich pool data with token information
     */
    async enrichPoolData(pool) {
        try {
            // Get token information
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(pool.token0),
                this.getTokenInfo(pool.token1)
            ]);

            pool.token0Symbol = token0Info.symbol;
            pool.token0Name = token0Info.name;
            pool.token0Decimals = token0Info.decimals;

            pool.token1Symbol = token1Info.symbol;
            pool.token1Name = token1Info.name;
            pool.token1Decimals = token1Info.decimals;

            // Try to get pool reserves/liquidity
            try {
                const poolInfo = await this.getPoolLiquidity(pool);
                if (poolInfo) {
                    pool.reserve0 = poolInfo.reserve0;
                    pool.reserve1 = poolInfo.reserve1;
                    pool.totalValueLocked = poolInfo.tvl;
                }
            } catch (error) {
                console.warn(`   ⚠️ Could not get pool liquidity: ${error.message}`);
            }

        } catch (error) {
            console.warn(`   ⚠️ Could not enrich pool data: ${error.message}`);
        }
    }

    /**
     * Get token information
     */
    async getTokenInfo(tokenAddress) {
        // Check if it's a known token
        if (this.knownTokens[tokenAddress]) {
            return this.knownTokens[tokenAddress];
        }

        try {
            // Try to get token info from contract
            const [symbol, name, decimals] = await Promise.all([
                this.call({
                    to: tokenAddress,
                    data: '0x95d89b41' // symbol()
                }).then(result => this.decodeString(result)).catch(() => 'UNKNOWN'),
                
                this.call({
                    to: tokenAddress,
                    data: '0x06fdde03' // name()
                }).then(result => this.decodeString(result)).catch(() => 'Unknown Token'),
                
                this.call({
                    to: tokenAddress,
                    data: '0x313ce567' // decimals()
                }).then(result => parseInt(result, 16)).catch(() => 18)
            ]);

            const tokenInfo = { symbol, name, decimals };
            
            // Cache the result
            this.knownTokens[tokenAddress] = tokenInfo;
            
            return tokenInfo;
        } catch (error) {
            return {
                symbol: tokenAddress.slice(0, 8) + '...',
                name: 'Unknown Token',
                decimals: 18
            };
        }
    }

    /**
     * Get pool liquidity information
     */
    async getPoolLiquidity(pool) {
        try {
            if (pool.dex.includes('V3')) {
                // Uniswap V3 pool
                const slot0 = await this.call({
                    to: pool.poolAddress,
                    data: '0x3850c7bd' // slot0()
                });
                
                // TODO: Decode V3 liquidity properly
                return null;
            } else {
                // V2-style pool
                const reserves = await this.call({
                    to: pool.poolAddress,
                    data: '0x0902f1ac' // getReserves()
                });
                
                if (reserves && reserves !== '0x') {
                    const reserve0 = BigInt('0x' + reserves.slice(2, 66));
                    const reserve1 = BigInt('0x' + reserves.slice(66, 130));
                    
                    return {
                        reserve0: reserve0.toString(),
                        reserve1: reserve1.toString(),
                        tvl: null // Would need price data to calculate
                    };
                }
            }
        } catch (error) {
            // Pool might not exist yet or might be different interface
            return null;
        }
    }

    /**
     * Decode string from contract call result
     */
    decodeString(hexData) {
        if (!hexData || hexData === '0x') return 'UNKNOWN';
        
        try {
            // Remove 0x prefix
            const data = hexData.slice(2);
            
            // Skip offset and length (first 64 chars)
            const stringData = data.slice(128);
            
            // Convert hex to string
            let result = '';
            for (let i = 0; i < stringData.length; i += 2) {
                const byte = parseInt(stringData.substr(i, 2), 16);
                if (byte === 0) break;
                result += String.fromCharCode(byte);
            }
            
            return result || 'UNKNOWN';
        } catch (error) {
            return 'UNKNOWN';
        }
    }

    /**
     * Display pool information
     */
    displayPoolInfo(pool) {
        const timeAgo = this.getTimeAgo(pool.timestamp);
        const date = new Date(pool.timestamp * 1000);
        
        console.log(`🏊 Pool: ${pool.token0Symbol}/${pool.token1Symbol}`);
        console.log(`🏢 DEX: ${pool.dex} (${pool.poolType})`);
        console.log(`📍 Pool Address: ${pool.poolAddress}`);
        console.log(`⏰ Created: ${date.toISOString()} (${timeAgo} ago)`);
        console.log(`📦 Block: ${pool.blockNumber}`);
        console.log(`🔗 Transaction: ${pool.transactionHash}`);
        console.log('');
        
        console.log('💰 Token Details:');
        console.log(`   Token 0: ${pool.token0Symbol} (${pool.token0Name})`);
        console.log(`           Address: ${pool.token0}`);
        console.log(`           Decimals: ${pool.token0Decimals}`);
        console.log(`   Token 1: ${pool.token1Symbol} (${pool.token1Name})`);
        console.log(`           Address: ${pool.token1}`);
        console.log(`           Decimals: ${pool.token1Decimals}`);
        
        if (pool.reserve0 && pool.reserve1) {
            console.log('');
            console.log('💧 Initial Liquidity:');
            const reserve0Formatted = this.formatTokenAmount(pool.reserve0, pool.token0Decimals);
            const reserve1Formatted = this.formatTokenAmount(pool.reserve1, pool.token1Decimals);
            console.log(`   ${pool.token0Symbol}: ${reserve0Formatted}`);
            console.log(`   ${pool.token1Symbol}: ${reserve1Formatted}`);
        }
        
        if (pool.fee) {
            console.log(`💸 Fee Tier: ${pool.fee / 10000}%`);
        }
    }

    /**
     * Format token amount with decimals
     */
    formatTokenAmount(amount, decimals) {
        const divisor = BigInt(10 ** decimals);
        const whole = BigInt(amount) / divisor;
        const fraction = BigInt(amount) % divisor;
        
        if (fraction === 0n) {
            return whole.toString();
        }
        
        const fractionStr = fraction.toString().padStart(decimals, '0');
        const trimmed = fractionStr.replace(/0+$/, '');
        
        if (trimmed === '') {
            return whole.toString();
        }
        
        return `${whole.toString()}.${trimmed}`;
    }

    /**
     * Get human-readable time ago
     */
    getTimeAgo(timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - timestamp;
        
        if (diff < 60) return `${diff} seconds`;
        if (diff < 3600) return `${Math.floor(diff / 60)} minutes`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours`;
        return `${Math.floor(diff / 86400)} days`;
    }

    /**
     * Scan for pools continuously
     */
    async startContinuousScanning(intervalSeconds = 30) {
        console.log(`🔄 Starting continuous pool scanning (every ${intervalSeconds}s)...`);
        
        let lastCheckedBlock = await this.getBlockNumber();
        
        setInterval(async () => {
            try {
                const currentBlock = await this.getBlockNumber();
                
                if (currentBlock > lastCheckedBlock) {
                    console.log(`\n🔍 Scanning new blocks ${lastCheckedBlock + 1} to ${currentBlock}...`);
                    
                    const pools = await this.getLatestPools(currentBlock - lastCheckedBlock);
                    
                    if (pools && pools.length > 0) {
                        console.log(`🎉 Found ${pools.length} new pools!`);
                    }
                    
                    lastCheckedBlock = currentBlock;
                }
            } catch (error) {
                console.error('❌ Error in continuous scanning:', error.message);
            }
        }, intervalSeconds * 1000);
    }
}

// Run if called directly
if (require.main === module) {
    const scanner = new LatestPoolScanner();
    
    const args = process.argv.slice(2);
    const blocksToScan = args[0] ? parseInt(args[0]) : 1000;
    const continuous = args.includes('--continuous') || args.includes('-c');
    
    if (continuous) {
        scanner.startContinuousScanning();
    } else {
        scanner.getLatestPools(blocksToScan).then(pool => {
            if (pool) {
                console.log('\n🎯 Latest pool scan completed successfully!');
                console.log(`💡 To scan more blocks: node latest-pool-scanner.js 5000`);
                console.log(`🔄 For continuous monitoring: node latest-pool-scanner.js --continuous`);
            }
            process.exit(0);
        }).catch(error => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
    }
}

module.exports = LatestPoolScanner;