#!/usr/bin/env node

/**
 * Detailed Pool Data Analyzer
 * Shows comprehensive pool information to identify new vs existing pools
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class DetailedPoolAnalyzer {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.chainId = 8453; // BASE Mainnet
        
        // Event signatures
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        
        // ABIs
        this.abis = {
            erc20: [
                'function name() view returns (string)',
                'function symbol() view returns (string)',
                'function decimals() view returns (uint8)',
                'function totalSupply() view returns (uint256)'
            ],
            pool: [
                'function token0() view returns (address)',
                'function token1() view returns (address)',
                'function fee() view returns (uint24)',
                'function liquidity() view returns (uint128)',
                'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'
            ]
        };
    }

    async initialize() {
        console.log('🔍 DETAILED POOL DATA ANALYZER');
        console.log('==============================');
        
        try {
            const [network, blockNumber] = await Promise.all([
                this.provider.getNetwork(),
                this.provider.getBlockNumber()
            ]);
            
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);
            console.log(`✅ Current Block: ${blockNumber}`);
            console.log(`✅ Current Time: ${new Date().toISOString()}`);
            
            return { currentBlock: blockNumber, currentTime: Date.now() };
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return null;
        }
    }

    async getTokenInfo(address) {
        try {
            const token = new ethers.Contract(address, this.abis.erc20, this.provider);
            
            const [name, symbol, decimals, totalSupply] = await Promise.all([
                token.name().catch(() => 'Unknown'),
                token.symbol().catch(() => 'UNKNOWN'),
                token.decimals().catch(() => 18),
                token.totalSupply().catch(() => 0n)
            ]);
            
            return { 
                address, 
                name, 
                symbol, 
                decimals, 
                totalSupply: totalSupply.toString(),
                formattedSupply: ethers.formatUnits(totalSupply, decimals)
            };
        } catch (error) {
            return {
                address,
                name: 'Failed to load',
                symbol: 'ERROR',
                decimals: 18,
                totalSupply: '0',
                formattedSupply: '0'
            };
        }
    }

    async getPoolState(poolAddress) {
        try {
            const pool = new ethers.Contract(poolAddress, this.abis.pool, this.provider);
            
            const [liquidity, slot0] = await Promise.all([
                pool.liquidity().catch(() => 0n),
                pool.slot0().catch(() => [0n, 0, 0, 0, 0, 0, false])
            ]);
            
            return {
                liquidity: liquidity.toString(),
                sqrtPriceX96: slot0[0].toString(),
                tick: slot0[1],
                observationIndex: slot0[2],
                observationCardinality: slot0[3],
                observationCardinalityNext: slot0[4],
                feeProtocol: slot0[5],
                unlocked: slot0[6]
            };
        } catch (error) {
            return {
                liquidity: '0',
                sqrtPriceX96: '0',
                tick: 0,
                error: error.message
            };
        }
    }

    async analyzePoolInDetail(log, index, currentTime) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🏊 POOL ${index + 1} - DETAILED ANALYSIS`);
        console.log(`${'='.repeat(60)}`);
        
        try {
            // Parse pool data
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            const fee = parseInt(log.topics[3], 16);
            const poolAddress = '0x' + log.data.slice(90, 130);
            const blockNumber = parseInt(log.blockNumber, 16);
            
            // Get block details
            const block = await this.provider.getBlock(blockNumber);
            const blockTime = new Date(block.timestamp * 1000);
            const ageMinutes = Math.floor((currentTime - block.timestamp * 1000) / 60000);
            const ageHours = Math.floor(ageMinutes / 60);
            const ageDays = Math.floor(ageHours / 24);
            
            console.log(`📦 BLOCK INFORMATION:`);
            console.log(`   Block Number: ${blockNumber}`);
            console.log(`   Block Hash: ${block.hash}`);
            console.log(`   Block Time: ${blockTime.toISOString()}`);
            console.log(`   Age: ${ageDays}d ${ageHours % 24}h ${ageMinutes % 60}m ago`);
            
            console.log(`\n🏊 POOL INFORMATION:`);
            console.log(`   Pool Address: ${poolAddress}`);
            console.log(`   Transaction: ${log.transactionHash}`);
            console.log(`   Fee Tier: ${fee / 10000}% (${fee} basis points)`);
            
            // Get token information
            console.log(`\n🪙 TOKEN ANALYSIS:`);
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0),
                this.getTokenInfo(token1)
            ]);
            
            console.log(`   Token 0:`);
            console.log(`     Address: ${token0Info.address}`);
            console.log(`     Symbol: ${token0Info.symbol}`);
            console.log(`     Name: ${token0Info.name}`);
            console.log(`     Decimals: ${token0Info.decimals}`);
            console.log(`     Total Supply: ${token0Info.formattedSupply}`);
            
            console.log(`   Token 1:`);
            console.log(`     Address: ${token1Info.address}`);
            console.log(`     Symbol: ${token1Info.symbol}`);
            console.log(`     Name: ${token1Info.name}`);
            console.log(`     Decimals: ${token1Info.decimals}`);
            console.log(`     Total Supply: ${token1Info.formattedSupply}`);
            
            // Get current pool state
            console.log(`\n📊 CURRENT POOL STATE:`);
            const poolState = await this.getPoolState(poolAddress);
            
            console.log(`   Liquidity: ${poolState.liquidity}`);
            console.log(`   Price (sqrtPriceX96): ${poolState.sqrtPriceX96}`);
            console.log(`   Current Tick: ${poolState.tick}`);
            console.log(`   Unlocked: ${poolState.unlocked}`);
            
            if (poolState.error) {
                console.log(`   ⚠️  Error getting pool state: ${poolState.error}`);
            }
            
            // Determine if this is truly a "new" pool
            console.log(`\n🎯 NEWNESS ASSESSMENT:`);
            
            let isNew = false;
            let newnessFactor = '';
            
            if (ageMinutes < 30) {
                isNew = true;
                newnessFactor = '🔥 BRAND NEW (< 30 minutes)';
            } else if (ageHours < 2) {
                isNew = true;
                newnessFactor = '🆕 VERY NEW (< 2 hours)';
            } else if (ageHours < 24) {
                newnessFactor = '⭐ RECENT (< 24 hours)';
            } else if (ageDays < 7) {
                newnessFactor = '📅 THIS WEEK (< 7 days)';
            } else {
                newnessFactor = '📜 OLDER (> 7 days)';
            }
            
            console.log(`   ${newnessFactor}`);
            console.log(`   Liquidity Status: ${poolState.liquidity === '0' ? '🔴 EMPTY' : '🟢 HAS LIQUIDITY'}`);
            
            // Check if tokens are known/established
            const isWETHPair = token0Info.address.toLowerCase() === '0x4200000000000000000000000000000000000006' || 
                              token1Info.address.toLowerCase() === '0x4200000000000000000000000000000000000006';
            
            const hasValidTokens = token0Info.symbol !== 'ERROR' && token1Info.symbol !== 'ERROR';
            
            console.log(`   WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
            console.log(`   Valid Tokens: ${hasValidTokens ? '✅ YES' : '❌ NO'}`);
            
            return {
                poolAddress,
                blockNumber,
                blockTime,
                ageMinutes,
                ageHours,
                ageDays,
                isNew,
                newnessFactor,
                token0Info,
                token1Info,
                poolState,
                fee,
                transactionHash: log.transactionHash,
                isWETHPair,
                hasValidTokens
            };
            
        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
            return null;
        }
    }

    async scanAndAnalyzePools(blocks = 1000) {
        const init = await this.initialize();
        if (!init) return;
        
        console.log(`\n🔍 SCANNING LAST ${blocks} BLOCKS FOR POOLS`);
        console.log('==========================================');
        
        try {
            const fromBlock = init.currentBlock - blocks;
            
            console.log(`📡 Scanning blocks ${fromBlock} to ${init.currentBlock}`);
            
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock: 'latest',
                topics: [this.poolCreatedSignature]
            });
            
            if (logs.length === 0) {
                console.log('❌ No pools found in the specified range');
                return;
            }
            
            // Sort by block number (most recent first)
            const sortedLogs = logs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));
            
            console.log(`📦 Found ${logs.length} pool creation events`);
            console.log(`🎯 Analyzing in chronological order (newest first)...`);
            
            const analyzedPools = [];
            
            // Analyze each pool
            for (let i = 0; i < Math.min(sortedLogs.length, 10); i++) {
                const poolData = await this.analyzePoolInDetail(sortedLogs[i], i, init.currentTime);
                if (poolData) {
                    analyzedPools.push(poolData);
                }
            }
            
            // Summary
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📋 SUMMARY OF ${analyzedPools.length} POOLS`);
            console.log(`${'='.repeat(60)}`);
            
            analyzedPools.forEach((pool, i) => {
                console.log(`${i + 1}. ${pool.token0Info.symbol}/${pool.token1Info.symbol} - ${pool.newnessFactor}`);
                console.log(`   Created: ${pool.blockTime.toISOString()}`);
                console.log(`   Liquidity: ${pool.poolState.liquidity === '0' ? 'EMPTY' : 'HAS LIQUIDITY'}`);
                console.log(`   Pool: ${pool.poolAddress}`);
                console.log('');
            });
            
            return analyzedPools;
            
        } catch (error) {
            console.error('❌ Scanning failed:', error.message);
        }
    }
}

// Main execution
async function main() {
    const analyzer = new DetailedPoolAnalyzer();
    const blocks = parseInt(process.argv[2]) || 500;
    
    console.log('🎯 STARTING DETAILED POOL ANALYSIS');
    console.log('==================================\n');
    
    await analyzer.scanAndAnalyzePools(blocks);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DetailedPoolAnalyzer; 