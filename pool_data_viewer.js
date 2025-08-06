#!/usr/bin/env node

/**
 * Simple Pool Data Viewer
 * Shows pool information with robust error handling
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class PoolDataViewer {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
    }

    async initialize() {
        console.log('🔍 POOL DATA VIEWER');
        console.log('==================');
        
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
            // Basic token info using direct RPC calls
            const symbol = await this.provider.call({
                to: address,
                data: '0x95d89b41' // symbol()
            }).then(result => {
                if (result === '0x') return 'UNKNOWN';
                try {
                    return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                } catch {
                    return 'UNKNOWN';
                }
            }).catch(() => 'ERROR');

            const name = await this.provider.call({
                to: address,
                data: '0x06fdde03' // name()
            }).then(result => {
                if (result === '0x') return 'Unknown';
                try {
                    return ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                } catch {
                    return 'Unknown';
                }
            }).catch(() => 'Unknown');

            return { address, symbol, name };
        } catch (error) {
            return { address, symbol: 'ERROR', name: 'Failed to load' };
        }
    }

    async analyzePool(log, index) {
        console.log(`\n📋 POOL ${index + 1}`);
        console.log('='.repeat(50));
        
        try {
            // Parse basic pool data
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            const fee = parseInt(log.topics[3], 16);
            const poolAddress = '0x' + log.data.slice(90, 130);
            const blockNumber = parseInt(log.blockNumber, 16);
            
            console.log(`🏊 Pool Address: ${poolAddress}`);
            console.log(`📦 Block Number: ${blockNumber} (0x${blockNumber.toString(16)})`);
            console.log(`🔗 Transaction: ${log.transactionHash}`);
            console.log(`💰 Fee Tier: ${fee / 10000}% (${fee} basis points)`);
            
            // Try to get block timestamp
            console.log(`\n⏰ TIMING INFO:`);
            try {
                const block = await this.provider.getBlock(blockNumber);
                if (block && block.timestamp) {
                    const blockTime = new Date(block.timestamp * 1000);
                    const now = new Date();
                    const ageMs = now.getTime() - blockTime.getTime();
                    const ageMinutes = Math.floor(ageMs / 60000);
                    const ageHours = Math.floor(ageMinutes / 60);
                    const ageDays = Math.floor(ageHours / 24);
                    
                    console.log(`   Created: ${blockTime.toISOString()}`);
                    console.log(`   Age: ${ageDays}d ${ageHours % 24}h ${ageMinutes % 60}m`);
                    
                    // Determine newness
                    if (ageMinutes < 30) {
                        console.log(`   Status: 🔥 BRAND NEW (< 30 min)`);
                    } else if (ageHours < 2) {
                        console.log(`   Status: 🆕 VERY NEW (< 2 hours)`);
                    } else if (ageHours < 24) {
                        console.log(`   Status: ⭐ RECENT (< 24 hours)`);
                    } else if (ageDays < 7) {
                        console.log(`   Status: 📅 THIS WEEK`);
                    } else {
                        console.log(`   Status: 📜 OLDER (${ageDays} days)`);
                    }
                } else {
                    console.log(`   ⚠️  Block data not available`);
                }
            } catch (blockError) {
                console.log(`   ❌ Block retrieval failed: ${blockError.message}`);
            }
            
            // Get token information
            console.log(`\n🪙 TOKEN INFO:`);
            
            console.log(`   Token 0: ${token0}`);
            const token0Info = await this.getTokenInfo(token0);
            console.log(`     Symbol: ${token0Info.symbol}`);
            console.log(`     Name: ${token0Info.name}`);
            
            console.log(`   Token 1: ${token1}`);
            const token1Info = await this.getTokenInfo(token1);
            console.log(`     Symbol: ${token1Info.symbol}`);
            console.log(`     Name: ${token1Info.name}`);
            
            // Check if it's a WETH pair
            const wethAddress = '0x4200000000000000000000000000000000000006';
            const isWETHPair = token0.toLowerCase() === wethAddress.toLowerCase() || 
                             token1.toLowerCase() === wethAddress.toLowerCase();
            
            console.log(`\n🎯 ASSESSMENT:`);
            console.log(`   WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
            console.log(`   Token Pair: ${token0Info.symbol}/${token1Info.symbol}`);
            
            if (isWETHPair) {
                const targetToken = token0.toLowerCase() === wethAddress.toLowerCase() ? token1Info : token0Info;
                console.log(`   Target Token: ${targetToken.symbol} (${targetToken.name})`);
            }
            
            return {
                poolAddress,
                blockNumber,
                token0Info,
                token1Info,
                fee,
                isWETHPair,
                transactionHash: log.transactionHash
            };
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            return null;
        }
    }

    async scanPools(blocks = 500) {
        const currentBlock = await this.initialize();
        if (!currentBlock) return;
        
        console.log(`\n🔍 SCANNING LAST ${blocks} BLOCKS FOR POOLS`);
        console.log('==========================================');
        
        try {
            const fromBlock = currentBlock - blocks;
            console.log(`📡 Scanning blocks ${fromBlock} to ${currentBlock}`);
            
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock: 'latest',
                topics: [this.poolCreatedSignature]
            });
            
            if (logs.length === 0) {
                console.log('❌ No pools found in the specified range');
                return;
            }
            
            console.log(`📦 Found ${logs.length} pool creation events`);
            
            // Sort by block number (newest first)
            const sortedLogs = logs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));
            
            const analyzedPools = [];
            
            // Analyze pools (limit to 10 for readability)
            const maxPools = Math.min(sortedLogs.length, 10);
            console.log(`🎯 Analyzing ${maxPools} most recent pools...`);
            
            for (let i = 0; i < maxPools; i++) {
                const poolData = await this.analyzePool(sortedLogs[i], i);
                if (poolData) {
                    analyzedPools.push(poolData);
                }
            }
            
            // Summary
            console.log(`\n📊 SUMMARY`);
            console.log('='.repeat(50));
            console.log(`Total pools found: ${logs.length}`);
            console.log(`Analyzed pools: ${analyzedPools.length}`);
            console.log(`\nPool List:`);
            
            analyzedPools.forEach((pool, i) => {
                const wethStatus = pool.isWETHPair ? '💎' : '⚪';
                console.log(`${i + 1}. ${wethStatus} ${pool.token0Info.symbol}/${pool.token1Info.symbol} (Block ${pool.blockNumber})`);
                console.log(`   Pool: ${pool.poolAddress}`);
            });
            
            return analyzedPools;
            
        } catch (error) {
            console.error('❌ Scanning failed:', error.message);
        }
    }
}

// Main execution
async function main() {
    const viewer = new PoolDataViewer();
    const blocks = parseInt(process.argv[2]) || 500;
    
    console.log('🎯 STARTING POOL DATA ANALYSIS');
    console.log('==============================\n');
    
    await viewer.scanPools(blocks);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PoolDataViewer; 