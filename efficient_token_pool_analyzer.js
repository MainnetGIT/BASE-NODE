#!/usr/bin/env node

/**
 * Efficient Token vs Pool Analyzer
 * Handles large datasets by breaking up queries
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class EfficientTokenPoolAnalyzer {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        
        this.signatures = {
            poolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        };
        
        this.erc20Selectors = {
            symbol: '0x95d89b41',
            name: '0x06fdde03',
            decimals: '0x313ce567',
            totalSupply: '0x18160ddd'
        };
    }

    async initialize() {
        console.log('🔍 EFFICIENT TOKEN vs POOL ANALYZER');
        console.log('====================================');
        
        try {
            const [network, blockNumber] = await Promise.all([
                this.provider.getNetwork(),
                this.provider.getBlockNumber()
            ]);
            
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);
            console.log(`✅ Current Block: ${blockNumber}`);
            console.log(`✅ Current Time: ${new Date().toISOString()}`);
            
            return blockNumber;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return null;
        }
    }

    async getTokenInfo(address) {
        try {
            const [symbol, name] = await Promise.all([
                this.provider.call({ to: address, data: this.erc20Selectors.symbol })
                    .then(result => {
                        if (result === '0x' || result.length <= 2) return 'UNKNOWN';
                        try {
                            return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                        } catch {
                            return 'UNKNOWN';
                        }
                    })
                    .catch(() => 'ERROR'),
                this.provider.call({ to: address, data: this.erc20Selectors.name })
                    .then(result => {
                        if (result === '0x' || result.length <= 2) return 'Unknown';
                        try {
                            return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                        } catch {
                            return 'Unknown';
                        }
                    })
                    .catch(() => 'Unknown')
            ]);

            return { address, symbol, name };
        } catch {
            return { address, symbol: 'ERROR', name: 'Failed' };
        }
    }

    async scanPoolsInChunks(fromBlock, toBlock, chunkSize = 100) {
        console.log(`\n🏊 SCANNING POOLS IN CHUNKS (${chunkSize} blocks each)`);
        console.log('================================================');
        
        const allPools = [];
        
        for (let start = fromBlock; start <= toBlock; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, toBlock);
            
            try {
                console.log(`   📦 Scanning blocks ${start} to ${end}...`);
                
                const logs = await this.provider.getLogs({
                    fromBlock: start,
                    toBlock: end,
                    topics: [this.signatures.poolCreated]
                });
                
                console.log(`      Found ${logs.length} pools`);
                
                for (const log of logs) {
                    const token0 = '0x' + log.topics[1].slice(26);
                    const token1 = '0x' + log.topics[2].slice(26);
                    const fee = parseInt(log.topics[3], 16);
                    const poolAddress = '0x' + log.data.slice(90, 130);
                    const blockNumber = parseInt(log.blockNumber, 16);
                    
                    allPools.push({
                        poolAddress,
                        blockNumber,
                        transactionHash: log.transactionHash,
                        fee,
                        token0Address: token0,
                        token1Address: token1
                    });
                }
                
                // Small delay to avoid overwhelming the RPC
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log(`      ❌ Chunk failed: ${error.message}`);
            }
        }
        
        return allPools.sort((a, b) => b.blockNumber - a.blockNumber);
    }

    async scanTokenCreationsInChunks(fromBlock, toBlock, chunkSize = 50) {
        console.log(`\n🪙 SCANNING TOKEN CREATIONS IN CHUNKS (${chunkSize} blocks each)`);
        console.log('=======================================================');
        
        const newTokens = new Map();
        
        for (let start = fromBlock; start <= toBlock; start += chunkSize) {
            const end = Math.min(start + chunkSize - 1, toBlock);
            
            try {
                console.log(`   📦 Scanning blocks ${start} to ${end}...`);
                
                const logs = await this.provider.getLogs({
                    fromBlock: start,
                    toBlock: end,
                    topics: [
                        this.signatures.transfer,
                        '0x0000000000000000000000000000000000000000000000000000000000000000'
                    ]
                });
                
                console.log(`      Found ${logs.length} minting events`);
                
                // Process only first 20 unique tokens per chunk to avoid overload
                const uniqueAddresses = [...new Set(logs.map(log => log.address.toLowerCase()))];
                
                for (const address of uniqueAddresses.slice(0, 20)) {
                    if (!newTokens.has(address)) {
                        const firstLog = logs.find(log => log.address.toLowerCase() === address);
                        const blockNumber = parseInt(firstLog.blockNumber, 16);
                        
                        newTokens.set(address, {
                            address: firstLog.address,
                            blockNumber,
                            transactionHash: firstLog.transactionHash
                        });
                    }
                }
                
                // Small delay
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                console.log(`      ❌ Chunk failed: ${error.message}`);
            }
        }
        
        return Array.from(newTokens.values()).sort((a, b) => b.blockNumber - a.blockNumber);
    }

    async analyzeRecentActivity(blocks = 200) {
        const currentBlock = await this.initialize();
        if (!currentBlock) return;

        const fromBlock = currentBlock - blocks;
        
        console.log(`\n🔍 ANALYZING LAST ${blocks} BLOCKS`);
        console.log(`📡 Blocks ${fromBlock} to ${currentBlock}`);

        // Scan in parallel with smaller chunks
        const [newTokens, newPools] = await Promise.all([
            this.scanTokenCreationsInChunks(fromBlock, currentBlock, 50),
            this.scanPoolsInChunks(fromBlock, currentBlock, 100)
        ]);

        // Display results
        console.log(`\n📊 SUMMARY`);
        console.log('='.repeat(50));
        console.log(`New Tokens Found: ${newTokens.length}`);
        console.log(`New Pools Found: ${newPools.length}`);

        if (newTokens.length > 0) {
            console.log(`\n🆕 TOP 10 NEW TOKENS:`);
            console.log('='.repeat(30));
            
            for (let i = 0; i < Math.min(newTokens.length, 10); i++) {
                const token = newTokens[i];
                const tokenInfo = await this.getTokenInfo(token.address);
                
                console.log(`${i + 1}. ${tokenInfo.symbol} (${tokenInfo.name})`);
                console.log(`   Address: ${token.address}`);
                console.log(`   Block: ${token.blockNumber}`);
                console.log(`   TX: ${token.transactionHash}`);
                console.log('');
            }
        }

        if (newPools.length > 0) {
            console.log(`\n🏊 TOP 10 NEW POOLS:`);
            console.log('='.repeat(30));
            
            for (let i = 0; i < Math.min(newPools.length, 10); i++) {
                const pool = newPools[i];
                
                // Get token info
                const [token0Info, token1Info] = await Promise.all([
                    this.getTokenInfo(pool.token0Address),
                    this.getTokenInfo(pool.token1Address)
                ]);
                
                console.log(`${i + 1}. ${token0Info.symbol}/${token1Info.symbol}`);
                console.log(`   Pool: ${pool.poolAddress}`);
                console.log(`   Block: ${pool.blockNumber}`);
                console.log(`   Fee: ${pool.fee / 10000}%`);
                
                // Check if tokens are new (within our scan range)
                const token0IsNew = newTokens.some(t => t.address.toLowerCase() === pool.token0Address.toLowerCase());
                const token1IsNew = newTokens.some(t => t.address.toLowerCase() === pool.token1Address.toLowerCase());
                
                if (token0IsNew || token1IsNew) {
                    console.log(`   🔥 CONTAINS NEW TOKEN!`);
                    if (token0IsNew) console.log(`      -> ${token0Info.symbol} is new`);
                    if (token1IsNew) console.log(`      -> ${token1Info.symbol} is new`);
                } else {
                    console.log(`   📜 Pool for existing tokens`);
                }
                
                // Check WETH pair
                const wethAddress = '0x4200000000000000000000000000000000000006';
                const isWETHPair = pool.token0Address.toLowerCase() === wethAddress.toLowerCase() || 
                                 pool.token1Address.toLowerCase() === wethAddress.toLowerCase();
                console.log(`   WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
                console.log('');
            }
        }

        // Cross-analysis summary
        const poolsWithNewTokens = newPools.filter(pool => {
            return newTokens.some(token => 
                token.address.toLowerCase() === pool.token0Address.toLowerCase() ||
                token.address.toLowerCase() === pool.token1Address.toLowerCase()
            );
        });

        console.log(`\n🎯 CROSS-ANALYSIS SUMMARY:`);
        console.log('='.repeat(40));
        console.log(`Total New Tokens: ${newTokens.length}`);
        console.log(`Total New Pools: ${newPools.length}`);
        console.log(`Pools with New Tokens: ${poolsWithNewTokens.length}`);
        console.log(`Pure Pool Creation (existing tokens): ${newPools.length - poolsWithNewTokens.length}`);

        if (poolsWithNewTokens.length > 0) {
            console.log(`\n🔥 FRESH TOKEN LAUNCHES (New Token + New Pool):`);
            poolsWithNewTokens.slice(0, 5).forEach((pool, i) => {
                console.log(`${i + 1}. Block ${pool.blockNumber} - Pool ${pool.poolAddress}`);
            });
        }

        return { newTokens, newPools, poolsWithNewTokens };
    }
}

// Main execution
async function main() {
    const analyzer = new EfficientTokenPoolAnalyzer();
    const blocks = parseInt(process.argv[2]) || 200;
    
    console.log('🎯 STARTING EFFICIENT TOKEN vs POOL ANALYSIS');
    console.log('============================================\n');
    
    await analyzer.analyzeRecentActivity(blocks);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = EfficientTokenPoolAnalyzer; 