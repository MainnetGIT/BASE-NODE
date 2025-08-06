#!/usr/bin/env node

/**
 * Latest Pool Finder
 * Finds the most recent pool creation event
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class LatestPoolFinder {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
    }

    async initialize() {
        console.log('🔍 LATEST POOL FINDER');
        console.log('====================');
        
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
                    .catch(() => 'Unknown')
            ]);

            return { address, symbol, name };
        } catch {
            return { address, symbol: 'ERROR', name: 'Failed' };
        }
    }

    async findLatestPool() {
        const currentBlock = await this.initialize();
        if (!currentBlock) return;

        console.log(`\n🎯 SEARCHING FOR LATEST POOL CREATION`);
        console.log('====================================');

        // Search backwards in small chunks (10 blocks at a time)
        const chunkSize = 10;
        let found = false;
        let latestPool = null;

        for (let offset = 0; offset < 500 && !found; offset += chunkSize) {
            const fromBlock = currentBlock - offset - chunkSize + 1;
            const toBlock = currentBlock - offset;

            try {
                console.log(`🔍 Scanning blocks ${fromBlock} to ${toBlock}...`);

                const logs = await this.provider.getLogs({
                    fromBlock,
                    toBlock,
                    topics: [this.poolCreatedSignature]
                });

                if (logs.length > 0) {
                    // Found pools! Get the most recent one
                    const sortedLogs = logs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));
                    latestPool = sortedLogs[0];
                    found = true;
                    
                    console.log(`✅ FOUND ${logs.length} pools in this range!`);
                    break;
                }

                console.log(`   No pools found, checking earlier blocks...`);
                
            } catch (error) {
                console.log(`   ❌ Error scanning: ${error.message}`);
            }
        }

        if (!latestPool) {
            console.log('❌ No pools found in the last 500 blocks');
            return;
        }

        await this.analyzeLatestPool(latestPool, currentBlock);
    }

    async analyzeLatestPool(log, currentBlock) {
        console.log(`\n🏊 LATEST POOL ANALYSIS`);
        console.log('='.repeat(60));

        try {
            // Parse pool data
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            const fee = parseInt(log.topics[3], 16);
            const poolAddress = '0x' + log.data.slice(90, 130);
            const blockNumber = parseInt(log.blockNumber, 16);

            console.log(`🏊 Pool Address: ${poolAddress}`);
            console.log(`📦 Block Number: ${blockNumber}`);
            console.log(`🔗 Transaction: ${log.transactionHash}`);
            console.log(`💰 Fee Tier: ${fee / 10000}% (${fee} basis points)`);
            console.log(`⏰ Blocks ago: ${currentBlock - blockNumber}`);

            // Get block timestamp
            try {
                const block = await this.provider.getBlock(blockNumber);
                if (block && block.timestamp) {
                    const blockTime = new Date(block.timestamp * 1000);
                    const now = new Date();
                    const ageMs = now.getTime() - blockTime.getTime();
                    const ageMinutes = Math.floor(ageMs / 60000);
                    const ageHours = Math.floor(ageMinutes / 60);

                    console.log(`📅 Created: ${blockTime.toISOString()}`);
                    console.log(`⏱️  Age: ${ageHours}h ${ageMinutes % 60}m ago`);

                    if (ageMinutes < 30) {
                        console.log(`🔥 STATUS: BRAND NEW (< 30 minutes)`);
                    } else if (ageHours < 2) {
                        console.log(`🆕 STATUS: VERY NEW (< 2 hours)`);
                    } else if (ageHours < 24) {
                        console.log(`⭐ STATUS: RECENT (< 24 hours)`);
                    } else {
                        console.log(`📜 STATUS: OLDER (${Math.floor(ageHours / 24)} days)`);
                    }
                }
            } catch (error) {
                console.log(`⚠️  Could not get block timestamp: ${error.message}`);
            }

            // Get token information
            console.log(`\n🪙 TOKEN ANALYSIS:`);
            console.log('='.repeat(30));

            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0),
                this.getTokenInfo(token1)
            ]);

            console.log(`Token 0: ${token0Info.symbol} (${token0Info.name})`);
            console.log(`   Address: ${token0}`);

            console.log(`Token 1: ${token1Info.symbol} (${token1Info.name})`);
            console.log(`   Address: ${token1}`);

            // Check if it's a WETH pair
            const wethAddress = '0x4200000000000000000000000000000000000006';
            const isWETHPair = token0.toLowerCase() === wethAddress.toLowerCase() || 
                             token1.toLowerCase() === wethAddress.toLowerCase();

            console.log(`\n🎯 ASSESSMENT:`);
            console.log('='.repeat(20));
            console.log(`WETH Pair: ${isWETHPair ? '✅ YES' : '❌ NO'}`);
            console.log(`Token Pair: ${token0Info.symbol}/${token1Info.symbol}`);

            if (isWETHPair) {
                const targetToken = token0.toLowerCase() === wethAddress.toLowerCase() ? token1Info : token0Info;
                console.log(`🎯 Target Token: ${targetToken.symbol} (${targetToken.name})`);
                console.log(`✅ TRADEABLE: Ready for swap execution`);
            } else {
                console.log(`⚠️  NON-WETH PAIR: Requires further analysis for trading`);
            }

            // Check if tokens might be new by looking for recent minting
            console.log(`\n🔍 TOKEN AGE CHECK:`);
            console.log('='.repeat(25));

            await this.checkTokenAge(token0Info, blockNumber, currentBlock);
            await this.checkTokenAge(token1Info, blockNumber, currentBlock);

        } catch (error) {
            console.error(`❌ Analysis failed: ${error.message}`);
        }
    }

    async checkTokenAge(tokenInfo, poolBlockNumber, currentBlock) {
        try {
            // Look for first Transfer from 0x0 (minting) in recent blocks
            const searchBlocks = Math.min(1000, poolBlockNumber); // Don't go too far back
            const fromBlock = Math.max(0, currentBlock - searchBlocks);

            const mintLogs = await this.provider.getLogs({
                fromBlock,
                toBlock: 'latest',
                address: tokenInfo.address,
                topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer
                    '0x0000000000000000000000000000000000000000000000000000000000000000' // from 0x0
                ]
            });

            if (mintLogs.length > 0) {
                const firstMintBlock = parseInt(mintLogs[0].blockNumber, 16);
                const blocksSinceFirstMint = poolBlockNumber - firstMintBlock;

                if (blocksSinceFirstMint < 100) {
                    console.log(`🔥 ${tokenInfo.symbol}: VERY NEW TOKEN (minted ${blocksSinceFirstMint} blocks before pool)`);
                } else if (blocksSinceFirstMint < 1000) {
                    console.log(`🆕 ${tokenInfo.symbol}: NEW TOKEN (minted ${blocksSinceFirstMint} blocks before pool)`);
                } else {
                    console.log(`📜 ${tokenInfo.symbol}: EXISTING TOKEN (minted >1000 blocks ago)`);
                }
            } else {
                console.log(`📜 ${tokenInfo.symbol}: EXISTING TOKEN (no recent minting found)`);
            }

        } catch (error) {
            console.log(`⚠️  ${tokenInfo.symbol}: Could not determine age - ${error.message}`);
        }
    }
}

// Main execution
async function main() {
    const finder = new LatestPoolFinder();
    
    console.log('🎯 FINDING LATEST POOL CREATION');
    console.log('===============================\n');
    
    await finder.findLatestPool();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = LatestPoolFinder; 