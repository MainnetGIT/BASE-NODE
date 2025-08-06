#!/usr/bin/env node

/**
 * Token vs Pool Creation Analyzer
 * Distinguishes between NEW TOKEN CREATION and NEW POOL CREATION
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class TokenVsPoolAnalyzer {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        
        // Event signatures
        this.signatures = {
            poolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', // PoolCreated
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',     // Transfer
            contractCreation: null // We'll detect this differently
        };
        
        // ERC-20 function selectors
        this.erc20Selectors = {
            name: '0x06fdde03',
            symbol: '0x95d89b41',
            decimals: '0x313ce567',
            totalSupply: '0x18160ddd',
            balanceOf: '0x70a08231',
            transfer: '0xa9059cbb'
        };
    }

    async initialize() {
        console.log('🔍 TOKEN vs POOL CREATION ANALYZER');
        console.log('===================================');
        
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

    async isERC20Contract(address) {
        try {
            // Test multiple ERC-20 functions to confirm it's a token
            const calls = [
                this.provider.call({ to: address, data: this.erc20Selectors.symbol }),
                this.provider.call({ to: address, data: this.erc20Selectors.name }),
                this.provider.call({ to: address, data: this.erc20Selectors.decimals }),
                this.provider.call({ to: address, data: this.erc20Selectors.totalSupply })
            ];
            
            const results = await Promise.allSettled(calls);
            
            // If at least 3 out of 4 calls succeed, it's likely an ERC-20
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== '0x').length;
            return successCount >= 3;
        } catch {
            return false;
        }
    }

    async getTokenInfo(address) {
        try {
            const [symbol, name, decimals, totalSupply] = await Promise.all([
                this.provider.call({ to: address, data: this.erc20Selectors.symbol })
                    .then(result => result !== '0x' ? ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0] : 'UNKNOWN')
                    .catch(() => 'UNKNOWN'),
                this.provider.call({ to: address, data: this.erc20Selectors.name })
                    .then(result => result !== '0x' ? ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0] : 'Unknown')
                    .catch(() => 'Unknown'),
                this.provider.call({ to: address, data: this.erc20Selectors.decimals })
                    .then(result => result !== '0x' ? parseInt(result, 16) : 18)
                    .catch(() => 18),
                this.provider.call({ to: address, data: this.erc20Selectors.totalSupply })
                    .then(result => result !== '0x' ? BigInt(result) : 0n)
                    .catch(() => 0n)
            ]);

            return {
                address,
                symbol,
                name,
                decimals,
                totalSupply: totalSupply.toString(),
                formattedSupply: ethers.formatUnits(totalSupply, decimals)
            };
        } catch {
            return { address, symbol: 'ERROR', name: 'Failed', decimals: 18, totalSupply: '0', formattedSupply: '0' };
        }
    }

    async findNewTokenCreations(fromBlock, toBlock) {
        console.log('\n🪙 SCANNING FOR NEW TOKEN CREATIONS');
        console.log('====================================');
        
        try {
            // Look for Transfer events from 0x0 (minting events)
            const mintingLogs = await this.provider.getLogs({
                fromBlock,
                toBlock,
                topics: [
                    this.signatures.transfer,
                    '0x0000000000000000000000000000000000000000000000000000000000000000' // from 0x0
                ]
            });

            console.log(`📦 Found ${mintingLogs.length} potential minting events`);

            const newTokens = new Map();

            for (const log of mintingLogs) {
                const tokenAddress = log.address.toLowerCase();
                
                // Skip if we've already analyzed this token
                if (newTokens.has(tokenAddress)) continue;

                // Check if it's an ERC-20 contract
                if (await this.isERC20Contract(log.address)) {
                    const tokenInfo = await this.getTokenInfo(log.address);
                    const blockNumber = parseInt(log.blockNumber, 16);
                    
                    newTokens.set(tokenAddress, {
                        ...tokenInfo,
                        blockNumber,
                        mintingTx: log.transactionHash,
                        firstMintBlock: blockNumber
                    });
                }
            }

            return Array.from(newTokens.values()).sort((a, b) => b.blockNumber - a.blockNumber);
        } catch (error) {
            console.error('❌ Token creation scan failed:', error.message);
            return [];
        }
    }

    async findNewPoolCreations(fromBlock, toBlock) {
        console.log('\n🏊 SCANNING FOR NEW POOL CREATIONS');
        console.log('===================================');
        
        try {
            const poolLogs = await this.provider.getLogs({
                fromBlock,
                toBlock,
                topics: [this.signatures.poolCreated]
            });

            console.log(`📦 Found ${poolLogs.length} pool creation events`);

            const pools = [];

            for (const log of poolLogs) {
                const token0 = '0x' + log.topics[1].slice(26);
                const token1 = '0x' + log.topics[2].slice(26);
                const fee = parseInt(log.topics[3], 16);
                const poolAddress = '0x' + log.data.slice(90, 130);
                const blockNumber = parseInt(log.blockNumber, 16);

                const [token0Info, token1Info] = await Promise.all([
                    this.getTokenInfo(token0),
                    this.getTokenInfo(token1)
                ]);

                pools.push({
                    poolAddress,
                    blockNumber,
                    transactionHash: log.transactionHash,
                    fee,
                    token0: token0Info,
                    token1: token1Info
                });
            }

            return pools.sort((a, b) => b.blockNumber - a.blockNumber);
        } catch (error) {
            console.error('❌ Pool creation scan failed:', error.message);
            return [];
        }
    }

    async analyzeTokenAge(tokenAddress, currentBlock) {
        try {
            // Look for the first Transfer event from 0x0 to estimate creation time
            const firstMint = await this.provider.getLogs({
                fromBlock: Math.max(0, currentBlock - 50000), // Look back ~50k blocks
                toBlock: 'latest',
                address: tokenAddress,
                topics: [
                    this.signatures.transfer,
                    '0x0000000000000000000000000000000000000000000000000000000000000000'
                ]
            });

            if (firstMint.length > 0) {
                const firstBlock = parseInt(firstMint[0].blockNumber, 16);
                const blockDiff = currentBlock - firstBlock;
                return {
                    firstMintBlock: firstBlock,
                    blocksOld: blockDiff,
                    isVeryNew: blockDiff < 1000, // Less than ~1000 blocks old
                    estimatedAge: `~${blockDiff} blocks ago`
                };
            }

            return {
                firstMintBlock: null,
                blocksOld: null,
                isVeryNew: false,
                estimatedAge: 'Unknown (older than scan range)'
            };
        } catch {
            return {
                firstMintBlock: null,
                blocksOld: null,
                isVeryNew: false,
                estimatedAge: 'Analysis failed'
            };
        }
    }

    async crossAnalyzeTokensAndPools(tokens, pools, currentBlock) {
        console.log('\n🔍 CROSS-ANALYSIS: TOKEN AGE vs POOL CREATION');
        console.log('==============================================');

        for (let i = 0; i < Math.min(pools.length, 10); i++) {
            const pool = pools[i];
            
            console.log(`\n📋 POOL ${i + 1}: ${pool.token0.symbol}/${pool.token1.symbol}`);
            console.log('='.repeat(60));
            console.log(`🏊 Pool Address: ${pool.poolAddress}`);
            console.log(`📦 Pool Created: Block ${pool.blockNumber}`);
            console.log(`🔗 Transaction: ${pool.transactionHash}`);
            console.log(`💰 Fee Tier: ${pool.fee / 10000}%`);

            console.log(`\n🪙 TOKEN ANALYSIS:`);
            
            // Analyze Token 0
            const token0Age = await this.analyzeTokenAge(pool.token0.address, currentBlock);
            console.log(`   Token 0: ${pool.token0.symbol} (${pool.token0.name})`);
            console.log(`     Address: ${pool.token0.address}`);
            console.log(`     Age: ${token0Age.estimatedAge}`);
            console.log(`     Status: ${token0Age.isVeryNew ? '🔥 VERY NEW TOKEN' : '📜 EXISTING TOKEN'}`);
            
            if (token0Age.firstMintBlock) {
                const blocksSinceToken = pool.blockNumber - token0Age.firstMintBlock;
                console.log(`     Pool vs Token: Pool created ${blocksSinceToken} blocks after token mint`);
            }

            // Analyze Token 1
            const token1Age = await this.analyzeTokenAge(pool.token1.address, currentBlock);
            console.log(`   Token 1: ${pool.token1.symbol} (${pool.token1.name})`);
            console.log(`     Address: ${pool.token1.address}`);
            console.log(`     Age: ${token1Age.estimatedAge}`);
            console.log(`     Status: ${token1Age.isVeryNew ? '🔥 VERY NEW TOKEN' : '📜 EXISTING TOKEN'}`);
            
            if (token1Age.firstMintBlock) {
                const blocksSinceToken = pool.blockNumber - token1Age.firstMintBlock;
                console.log(`     Pool vs Token: Pool created ${blocksSinceToken} blocks after token mint`);
            }

            // Overall assessment
            console.log(`\n🎯 POOL ASSESSMENT:`);
            const hasNewToken = token0Age.isVeryNew || token1Age.isVeryNew;
            const bothNew = token0Age.isVeryNew && token1Age.isVeryNew;
            
            if (bothNew) {
                console.log(`   🔥🔥 BRAND NEW TOKENS + NEW POOL - FRESH LAUNCH!`);
            } else if (hasNewToken) {
                console.log(`   🔥 NEW TOKEN + NEW POOL - RECENT LAUNCH!`);
            } else {
                console.log(`   📈 NEW POOL for EXISTING TOKENS - Secondary Market`);
            }

            // Check if it's a WETH pair
            const wethAddress = '0x4200000000000000000000000000000000000006';
            const isWETHPair = pool.token0.address.toLowerCase() === wethAddress.toLowerCase() || 
                             pool.token1.address.toLowerCase() === wethAddress.toLowerCase();
            
            console.log(`   WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
            console.log(`   Tradeable: ${isWETHPair ? '✅ READY' : '⚠️ NEEDS ANALYSIS'}`);
        }
    }

    async runFullAnalysis(blocks = 1000) {
        const currentBlock = await this.initialize();
        if (!currentBlock) return;

        const fromBlock = currentBlock - blocks;
        
        console.log(`\n🔍 FULL ANALYSIS: LAST ${blocks} BLOCKS`);
        console.log(`📡 Scanning blocks ${fromBlock} to ${currentBlock}`);

        // Run parallel scans
        const [newTokens, newPools] = await Promise.all([
            this.findNewTokenCreations(fromBlock, currentBlock),
            this.findNewPoolCreations(fromBlock, currentBlock)
        ]);

        // Display new tokens
        if (newTokens.length > 0) {
            console.log(`\n🆕 NEW TOKENS FOUND: ${newTokens.length}`);
            console.log('='.repeat(50));
            newTokens.slice(0, 5).forEach((token, i) => {
                console.log(`${i + 1}. ${token.symbol} (${token.name})`);
                console.log(`   Address: ${token.address}`);
                console.log(`   First Mint: Block ${token.firstMintBlock}`);
                console.log(`   Supply: ${token.formattedSupply}`);
                console.log('');
            });
        } else {
            console.log('\n❌ No new token creations found in range');
        }

        // Cross-analyze tokens and pools
        if (newPools.length > 0) {
            await this.crossAnalyzeTokensAndPools(newTokens, newPools, currentBlock);
        } else {
            console.log('\n❌ No new pools found in range');
        }

        return { newTokens, newPools };
    }
}

// Main execution
async function main() {
    const analyzer = new TokenVsPoolAnalyzer();
    const blocks = parseInt(process.argv[2]) || 1000;
    
    console.log('🎯 STARTING TOKEN vs POOL ANALYSIS');
    console.log('==================================\n');
    
    await analyzer.runFullAnalysis(blocks);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = TokenVsPoolAnalyzer; 