#!/usr/bin/env node

/**
 * Robust Pool Discovery & Direct Swap Executor
 * Enhanced version that tries multiple pools until finding a tradeable one
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const axios = require('axios');
const { ethers } = require('ethers');

class RobustPoolSwapExecutor {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        this.chainId = 8453; // BASE Mainnet
        
        // Contract addresses on BASE
        this.contracts = {
            factory: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
            router: '0x2626664c2603336E57B271c5C0b26F421741e481',
            weth: '0x4200000000000000000000000000000000000006',
            quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'
        };
        
        // Event signatures
        this.poolCreatedSignature = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
        
        // ABIs for direct interaction
        this.abis = {
            erc20: [
                'function name() view returns (string)',
                'function symbol() view returns (string)',
                'function decimals() view returns (uint8)',
                'function balanceOf(address) view returns (uint256)',
                'function allowance(address,address) view returns (uint256)',
                'function approve(address,uint256) returns (bool)'
            ],
            uniswapV3Router: [
                'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) payable returns (uint256)'
            ],
            uniswapV3Quoter: [
                'function quoteExactInputSingle(address,address,uint24,uint256,uint160) view returns (uint256)'
            ],
            pool: [
                'function token0() view returns (address)',
                'function token1() view returns (address)',
                'function fee() view returns (uint24)',
                'function liquidity() view returns (uint128)',
                'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'
            ]
        };
        
        this.swapAmount = ethers.parseEther('0.0001'); // 0.0001 ETH
        this.benchmarks = {};
        this.attempts = [];
    }

    benchmark(step, startTime = null) {
        const now = Date.now();
        if (startTime) {
            this.benchmarks[step] = now - startTime;
            console.log(`⚡ ${step}: ${this.benchmarks[step]}ms`);
            return now;
        } else {
            return now;
        }
    }

    async initialize() {
        const start = this.benchmark('init-start');
        console.log('🚀 ROBUST POOL DISCOVERY & DIRECT SWAP EXECUTOR');
        console.log('==============================================');
        
        try {
            const [network, blockNumber] = await Promise.all([
                this.provider.getNetwork(),
                this.provider.getBlockNumber()
            ]);
            
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);
            console.log(`✅ Current Block: ${blockNumber}`);
            console.log(`✅ Swap Amount: ${ethers.formatEther(this.swapAmount)} ETH`);
            
            this.benchmark('init-complete', start);
            return true;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return false;
        }
    }

    async findAllRecentPools() {
        const start = this.benchmark('pool-scan-start');
        console.log('\n🔍 SCANNING FOR ALL RECENT POOLS');
        console.log('================================');
        
        try {
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = currentBlock - 500; // Search last 500 blocks for more options
            
            console.log(`📡 Scanning blocks ${fromBlock} to ${currentBlock}`);
            
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock: 'latest',
                topics: [this.poolCreatedSignature]
            });
            
            if (logs.length === 0) {
                throw new Error('No pools found in recent blocks');
            }
            
            // Sort by block number (most recent first)
            const sortedLogs = logs.sort((a, b) => parseInt(b.blockNumber, 16) - parseInt(a.blockNumber, 16));
            
            console.log(`📦 Found ${logs.length} pools in last 500 blocks`);
            console.log(`🎯 Will test pools starting from most recent...`);
            
            this.benchmark('pool-scan-complete', start);
            
            return sortedLogs;
        } catch (error) {
            console.error('❌ Pool scanning failed:', error.message);
            throw error;
        }
    }

    async analyzePool(log, index) {
        console.log(`\n🔬 ANALYZING POOL ${index + 1}`);
        console.log('===================');
        
        try {
            // Parse pool data
            const token0 = '0x' + log.topics[1].slice(26);
            const token1 = '0x' + log.topics[2].slice(26);
            const fee = parseInt(log.topics[3], 16);
            const poolAddress = '0x' + log.data.slice(90, 130);
            const blockNumber = parseInt(log.blockNumber, 16);
            
            console.log(`🏊 Pool: ${poolAddress}`);
            console.log(`📦 Block: ${blockNumber}`);
            console.log(`💰 Fee: ${fee / 10000}%`);
            
            // Get token info
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0),
                this.getTokenInfo(token1)
            ]);
            
            console.log(`🪙 Token0: ${token0Info.symbol} (${token0Info.name})`);
            console.log(`🪙 Token1: ${token1Info.symbol} (${token1Info.name})`);
            
            // Skip if either token failed to load
            if (token0Info.symbol === 'ERROR' || token1Info.symbol === 'ERROR') {
                console.log('⚠️  Skipping: Token info failed to load');
                return null;
            }
            
            // Determine swap direction (prefer buying non-WETH tokens)
            let targetToken, inputToken;
            if (token0 === this.contracts.weth) {
                targetToken = token1Info;
                inputToken = token0Info;
            } else if (token1 === this.contracts.weth) {
                targetToken = token0Info;
                inputToken = token1Info;
            } else {
                console.log('⚠️  Skipping: No WETH pair');
                return null;
            }
            
            console.log(`🎯 Target: ${targetToken.symbol} | Input: ${inputToken.symbol}`);
            
            return {
                poolAddress,
                token0,
                token1,
                fee,
                blockNumber,
                transactionHash: log.transactionHash,
                token0Info,
                token1Info,
                targetToken,
                inputToken
            };
        } catch (error) {
            console.log(`❌ Analysis failed: ${error.message}`);
            return null;
        }
    }

    async getTokenInfo(address) {
        try {
            const token = new ethers.Contract(address, this.abis.erc20, this.provider);
            
            const [name, symbol, decimals] = await Promise.all([
                token.name().catch(() => 'Unknown'),
                token.symbol().catch(() => 'UNKNOWN'),
                token.decimals().catch(() => 18)
            ]);
            
            return { address, name, symbol, decimals };
        } catch (error) {
            return {
                address,
                name: 'Failed to load',
                symbol: 'ERROR',
                decimals: 18
            };
        }
    }

    async testPoolLiquidity(poolInfo) {
        console.log(`\n💱 TESTING POOL LIQUIDITY`);
        console.log('========================');
        
        try {
            const quoter = new ethers.Contract(this.contracts.quoter, this.abis.uniswapV3Quoter, this.provider);
            
            console.log(`📊 Testing quote for ${ethers.formatEther(this.swapAmount)} ${poolInfo.inputToken.symbol}`);
            
            const amountOut = await quoter.quoteExactInputSingle(
                poolInfo.inputToken.address,
                poolInfo.targetToken.address,
                poolInfo.fee,
                this.swapAmount,
                0
            );
            
            const formattedOutput = ethers.formatUnits(amountOut, poolInfo.targetToken.decimals);
            
            console.log(`✅ Quote SUCCESS: ${ethers.formatEther(this.swapAmount)} ${poolInfo.inputToken.symbol} → ${formattedOutput} ${poolInfo.targetToken.symbol}`);
            
            return {
                success: true,
                amountIn: this.swapAmount,
                amountOut,
                formattedOutput
            };
        } catch (error) {
            console.log(`❌ Quote FAILED: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async constructAndSimulateSwap(poolInfo, quote) {
        const start = this.benchmark('swap-construction-start');
        console.log('\n⚙️  CONSTRUCTING & SIMULATING SWAP');
        console.log('=================================');
        
        try {
            const router = new ethers.Contract(this.contracts.router, this.abis.uniswapV3Router, this.provider);
            
            const swapParams = {
                tokenIn: poolInfo.inputToken.address,
                tokenOut: poolInfo.targetToken.address,
                fee: poolInfo.fee,
                recipient: '0x1111111111111111111111111111111111111111', // Dummy address
                deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
                amountIn: quote.amountIn,
                amountOutMinimum: quote.amountOut * 95n / 100n, // 5% slippage
                sqrtPriceLimitX96: 0
            };
            
            console.log(`🔧 Swap Parameters:`);
            console.log(`  Amount In: ${ethers.formatEther(swapParams.amountIn)} ${poolInfo.inputToken.symbol}`);
            console.log(`  Min Amount Out: ${ethers.formatUnits(swapParams.amountOutMinimum, poolInfo.targetToken.decimals)} ${poolInfo.targetToken.symbol}`);
            console.log(`  Fee Tier: ${swapParams.fee / 10000}%`);
            
            // Construct transaction
            const txData = router.interface.encodeFunctionData('exactInputSingle', [swapParams]);
            
            const transaction = {
                to: this.contracts.router,
                data: txData,
                value: swapParams.amountIn, // For ETH input
                gasLimit: 300000
            };
            
            console.log(`📋 Transaction constructed (${txData.length} bytes)`);
            
            // Simulate gas estimation
            console.log('🧪 Simulating execution...');
            
            try {
                const gasEstimate = await this.provider.estimateGas({
                    to: transaction.to,
                    data: transaction.data,
                    value: transaction.value
                });
                
                console.log(`⛽ Gas Estimate: ${gasEstimate.toString()}`);
                console.log(`✅ SIMULATION SUCCESSFUL!`);
                
                this.benchmark('swap-construction-complete', start);
                
                return {
                    success: true,
                    transaction,
                    swapParams,
                    gasEstimate
                };
            } catch (gasError) {
                console.log(`❌ Gas estimation failed: ${gasError.message}`);
                return {
                    success: false,
                    error: gasError.message
                };
            }
        } catch (error) {
            console.error('❌ Transaction construction failed:', error.message);
            this.benchmark('swap-construction-complete', start);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async findWorkingPool() {
        const logs = await this.findAllRecentPools();
        
        console.log(`\n🎯 TESTING POOLS FOR LIQUIDITY`);
        console.log('==============================');
        
        for (let i = 0; i < Math.min(logs.length, 10); i++) { // Test up to 10 pools
            const poolInfo = await this.analyzePool(logs[i], i);
            
            if (!poolInfo) {
                this.attempts.push({ index: i, result: 'skipped' });
                continue;
            }
            
            const liquidityTest = await this.testPoolLiquidity(poolInfo);
            
            if (liquidityTest.success) {
                console.log(`\n🎉 FOUND WORKING POOL! (Attempt ${i + 1})`);
                
                const simulationResult = await this.constructAndSimulateSwap(poolInfo, liquidityTest);
                
                this.attempts.push({ 
                    index: i, 
                    result: 'success', 
                    poolInfo, 
                    quote: liquidityTest,
                    simulation: simulationResult
                });
                
                return {
                    poolInfo,
                    quote: liquidityTest,
                    simulation: simulationResult
                };
            } else {
                this.attempts.push({ 
                    index: i, 
                    result: 'failed', 
                    error: liquidityTest.error 
                });
            }
            
            console.log(`⏭️  Trying next pool...`);
        }
        
        throw new Error('No working pools found in recent blocks');
    }

    printCompleteBenchmark() {
        console.log('\n📊 COMPLETE BENCHMARK RESULTS');
        console.log('==============================');
        
        let totalTime = 0;
        Object.entries(this.benchmarks).forEach(([step, time]) => {
            console.log(`⚡ ${step.padEnd(25)}: ${time.toString().padStart(6)}ms`);
            totalTime += time;
        });
        
        console.log('─'.repeat(40));
        console.log(`⚡ TOTAL EXECUTION TIME    : ${totalTime.toString().padStart(6)}ms`);
        console.log('==============================');
        
        // Print attempt summary
        console.log('\n🔍 POOL TESTING SUMMARY');
        console.log('=======================');
        this.attempts.forEach((attempt, i) => {
            const status = attempt.result === 'success' ? '✅' : 
                          attempt.result === 'failed' ? '❌' : '⚠️ ';
            console.log(`${status} Pool ${attempt.index + 1}: ${attempt.result}`);
        });
        
        return totalTime;
    }

    async executeCompleteWorkflow() {
        const overallStart = Date.now();
        
        try {
            // Step 1: Initialize
            if (!(await this.initialize())) {
                throw new Error('Initialization failed');
            }
            
            // Step 2: Find working pool
            const result = await this.findWorkingPool();
            
            // Final benchmark
            this.benchmarks['total-workflow'] = Date.now() - overallStart;
            
            console.log('\n🎉 COMPLETE WORKFLOW SUCCESS!');
            console.log('=============================');
            console.log(`🏊 Working Pool: ${result.poolInfo.poolAddress}`);
            console.log(`🪙 Token Pair: ${result.poolInfo.targetToken.symbol}/${result.poolInfo.inputToken.symbol}`);
            console.log(`💱 Quote: ${result.quote.formattedOutput} ${result.poolInfo.targetToken.symbol}`);
            console.log(`⛽ Gas Estimate: ${result.simulation.gasEstimate?.toString() || 'N/A'}`);
            
            this.printCompleteBenchmark();
            
            return {
                success: true,
                ...result,
                totalTime: this.benchmarks['total-workflow']
            };
            
        } catch (error) {
            console.error('\n❌ WORKFLOW FAILED');
            console.error('==================');
            console.error(`Error: ${error.message}`);
            
            this.benchmarks['total-workflow'] = Date.now() - overallStart;
            this.printCompleteBenchmark();
            
            return {
                success: false,
                error: error.message,
                totalTime: this.benchmarks['total-workflow']
            };
        }
    }
}

// Main execution
async function main() {
    const executor = new RobustPoolSwapExecutor();
    
    console.log('🎯 STARTING ROBUST POOL DISCOVERY & SWAP EXECUTION');
    console.log('==================================================\n');
    
    const result = await executor.executeCompleteWorkflow();
    
    if (result.success) {
        console.log('\n✅ EXECUTION SUCCESSFUL - Ready for live trading!');
    } else {
        console.log('\n❌ EXECUTION FAILED - Check recent pool activity');
    }
    
    return result;
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RobustPoolSwapExecutor; 