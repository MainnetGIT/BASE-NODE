#!/usr/bin/env node

/**
 * Detailed Transaction Analyzer
 * Shows exactly how we distinguish new token creation vs new pool creation
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const { ethers } = require('ethers');

class DetailedTxAnalyzer {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        
        this.signatures = {
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            poolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118'
        };
    }

    async analyzeTransaction(txHash) {
        console.log('🔍 DETAILED TRANSACTION ANALYSIS');
        console.log('================================');
        console.log(`Transaction: ${txHash}`);
        console.log('');

        try {
            // Get transaction details
            const [tx, receipt] = await Promise.all([
                this.provider.getTransaction(txHash),
                this.provider.getTransactionReceipt(txHash)
            ]);

            if (!tx || !receipt) {
                console.log('❌ Transaction not found');
                return;
            }

            console.log('📊 TRANSACTION OVERVIEW:');
            console.log('========================');
            console.log(`From: ${tx.from}`);
            console.log(`To: ${tx.to}`);
            console.log(`Block: ${tx.blockNumber}`);
            console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
            console.log(`Status: ${receipt.status === 1 ? '✅ SUCCESS' : '❌ FAILED'}`);
            console.log('');

            // Analyze all logs in the transaction
            console.log('📋 ALL EVENTS IN THIS TRANSACTION:');
            console.log('==================================');

            let poolCreationFound = false;
            let tokenMintingFound = false;
            let tokenDeploymentFound = false;
            const tokenAddresses = new Set();

            for (let i = 0; i < receipt.logs.length; i++) {
                const log = receipt.logs[i];
                console.log(`Event ${i + 1}:`);
                console.log(`  Address: ${log.address}`);
                console.log(`  Topics: ${log.topics.join(', ')}`);

                // Check for Pool Creation
                if (log.topics[0] === this.signatures.poolCreated) {
                    poolCreationFound = true;
                    console.log(`  🏊 TYPE: POOL CREATION EVENT`);
                    
                    const token0 = '0x' + log.topics[1].slice(26);
                    const token1 = '0x' + log.topics[2].slice(26);
                    const fee = parseInt(log.topics[3], 16);
                    const poolAddress = '0x' + log.data.slice(90, 130);
                    
                    console.log(`  Token 0: ${token0}`);
                    console.log(`  Token 1: ${token1}`);
                    console.log(`  Fee: ${fee / 10000}%`);
                    console.log(`  Pool: ${poolAddress}`);
                }

                // Check for Token Transfer (potential minting)
                else if (log.topics[0] === this.signatures.transfer) {
                    const from = log.topics[1];
                    const to = log.topics[2];
                    
                    if (from === '0x0000000000000000000000000000000000000000000000000000000000000000') {
                        tokenMintingFound = true;
                        tokenAddresses.add(log.address);
                        console.log(`  🪙 TYPE: TOKEN MINTING EVENT`);
                        console.log(`  Token: ${log.address}`);
                        console.log(`  To: 0x${to.slice(26)}`);
                        
                        // Decode amount if possible
                        try {
                            const amount = BigInt(log.data);
                            console.log(`  Amount: ${amount.toString()}`);
                        } catch {
                            console.log(`  Amount: ${log.data}`);
                        }
                    } else {
                        console.log(`  📈 TYPE: TOKEN TRANSFER`);
                        console.log(`  From: 0x${from.slice(26)}`);
                        console.log(`  To: 0x${to.slice(26)}`);
                    }
                }

                // Check for contract deployment (if tx.to is null)
                else if (!tx.to && i === 0) {
                    tokenDeploymentFound = true;
                    console.log(`  🚀 TYPE: CONTRACT DEPLOYMENT`);
                    console.log(`  New Contract: ${log.address}`);
                }

                else {
                    console.log(`  ⚪ TYPE: OTHER EVENT`);
                    console.log(`  Signature: ${log.topics[0]}`);
                }

                console.log('');
            }

            // Summary analysis
            console.log('🎯 TRANSACTION ANALYSIS SUMMARY:');
            console.log('================================');

            if (tokenDeploymentFound && tokenMintingFound && poolCreationFound) {
                console.log('🔥🔥 COMPLETE FRESH TOKEN LAUNCH!');
                console.log('   1. ✅ NEW TOKEN DEPLOYED');
                console.log('   2. ✅ INITIAL TOKENS MINTED');
                console.log('   3. ✅ LIQUIDITY POOL CREATED');
                console.log('   This is a BRAND NEW token with immediate liquidity!');
            } 
            else if (tokenMintingFound && poolCreationFound) {
                console.log('🔥 FRESH TOKEN LAUNCH!');
                console.log('   1. ✅ TOKENS MINTED');
                console.log('   2. ✅ LIQUIDITY POOL CREATED');
                console.log('   This is a NEW token getting its first liquidity!');
            }
            else if (poolCreationFound && !tokenMintingFound) {
                console.log('📈 SECONDARY POOL CREATION');
                console.log('   1. ✅ LIQUIDITY POOL CREATED');
                console.log('   2. ❌ NO NEW TOKEN MINTING');
                console.log('   This is a new pool for EXISTING tokens!');
            }
            else if (tokenMintingFound && !poolCreationFound) {
                console.log('🪙 TOKEN MINTING ONLY');
                console.log('   1. ✅ TOKENS MINTED');
                console.log('   2. ❌ NO POOL CREATED');
                console.log('   This is token creation WITHOUT immediate liquidity!');
            }
            else {
                console.log('⚪ OTHER TRANSACTION TYPE');
                console.log('   No pool creation or token minting detected');
            }

            console.log('');
            console.log('📈 DISTINCTION METHODOLOGY:');
            console.log('===========================');
            console.log('✅ NEW TOKEN CREATION = Transfer events FROM 0x0 address');
            console.log('✅ NEW POOL CREATION = PoolCreated event signature');
            console.log('✅ FRESH LAUNCH = Both events in same transaction/block');
            console.log('✅ SECONDARY MARKET = Pool creation without recent token minting');

            return {
                poolCreationFound,
                tokenMintingFound,
                tokenDeploymentFound,
                tokenAddresses: Array.from(tokenAddresses)
            };

        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
        }
    }
}

// Main execution
async function main() {
    const analyzer = new DetailedTxAnalyzer();
    
    // Use the latest transaction we found
    const latestTxHash = process.argv[2] || '0x7f9640258d7655ffc5750df1a2032fe53e56623fd58f7685e125e6a0aa631859';
    
    console.log('🎯 ANALYZING LATEST POOL CREATION TRANSACTION');
    console.log('============================================\n');
    
    await analyzer.analyzeTransaction(latestTxHash);
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DetailedTxAnalyzer; 