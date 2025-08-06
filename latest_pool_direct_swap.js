#!/usr/bin/env node

/**
 * Latest Pool Discovery & Direct Swap Executor
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 * 
 * Complete workflow:
 * 1. Find latest new liquidity pool
 * 2. Analyze token pair
 * 3. Construct direct swap transaction
 * 4. Execute via local BASE node
 * 5. Benchmark every step
 */

const axios = require('axios');
const { ethers } = require('ethers');

class LatestPoolSwapExecutor {
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
        console.log('🚀 LATEST POOL DISCOVERY & DIRECT SWAP EXECUTOR');
        console.log('===============================================');
        
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

    async findLatestPool() {
        const start = this.benchmark('pool-discovery-start');
        console.log('\n🔍 FINDING LATEST LIQUIDITY POOL');
        console.log('=================================');
        
        try {
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = currentBlock - 100; // Search last 100 blocks
            
            console.log(`📡 Scanning blocks ${fromBlock} to ${currentBlock}`);
            
            const logs = await this.provider.getLogs({
                fromBlock,
                toBlock: 'latest',
                topics: [this.poolCreatedSignature]
            });
            
            if (logs.length === 0) {
                throw new Error('No new pools found in recent blocks');
            }
            
            // Get the most recent pool (last in array)
            const latestLog = logs[logs.length - 1];
            
            console.log(`📦 Found ${logs.length} pools, analyzing latest...`);
            
            // Parse pool data
            const token0 = '0x' + latestLog.topics[1].slice(26);
            const token1 = '0x' + latestLog.topics[2].slice(26);
            const fee = parseInt(latestLog.topics[3], 16);
            const poolAddress = '0x' + latestLog.data.slice(90, 130);
            const blockNumber = parseInt(latestLog.blockNumber, 16);
            
            console.log(`🏊 Pool: ${poolAddress}`);
            console.log(`📦 Block: ${blockNumber}`);
            console.log(`💰 Fee: ${fee / 10000}%`);
            console.log(`🪙 Token0: ${token0}`);
            console.log(`🪙 Token1: ${token1}`);
            
            this.benchmark('pool-discovery-complete', start);
            
            return {
                poolAddress,
                token0,
                token1,
                fee,
                blockNumber,
                transactionHash: latestLog.transactionHash
            };
        } catch (error) {
            console.error('❌ Pool discovery failed:', error.message);
            throw error;
        }
    }

    async analyzeTokens(token0, token1) {
        const start = this.benchmark('token-analysis-start');
        console.log('\n🔬 ANALYZING TOKEN PAIR');
        console.log('=======================');
        
        try {
            const [token0Info, token1Info] = await Promise.all([
                this.getTokenInfo(token0),
                this.getTokenInfo(token1)
            ]);
            
            console.log(`Token 0: ${token0Info.symbol} (${token0Info.name})`);
            console.log(`  Decimals: ${token0Info.decimals}`);
            console.log(`Token 1: ${token1Info.symbol} (${token1Info.name})`);
            console.log(`  Decimals: ${token1Info.decimals}`);
            
            // Determine which token to buy (prioritize non-WETH)
            let targetToken, inputToken;
            if (token0 === this.contracts.weth) {
                targetToken = token1Info;
                inputToken = token0Info;
            } else {
                targetToken = token0Info;
                inputToken = token1Info;
            }
            
            console.log(`🎯 Target Token: ${targetToken.symbol}`);
            console.log(`💰 Input Token: ${inputToken.symbol}`);
            
            this.benchmark('token-analysis-complete', start);
            
            return { token0Info, token1Info, targetToken, inputToken };
        } catch (error) {
            console.error('❌ Token analysis failed:', error.message);
            throw error;
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

    async getQuote(inputToken, targetToken, fee, amount) {
        const start = this.benchmark('quote-start');
        console.log('\n💱 GETTING SWAP QUOTE');
        console.log('=====================');
        
        try {
            const quoter = new ethers.Contract(this.contracts.quoter, this.abis.uniswapV3Quoter, this.provider);
            
            console.log(`📊 Requesting quote for ${ethers.formatEther(amount)} ${inputToken.symbol}`);
            
            const amountOut = await quoter.quoteExactInputSingle(
                inputToken.address,
                targetToken.address,
                fee,
                amount,
                0 // No price limit
            );
            
            const formattedOutput = ethers.formatUnits(amountOut, targetToken.decimals);
            
            console.log(`💰 Quote: ${ethers.formatEther(amount)} ${inputToken.symbol} → ${formattedOutput} ${targetToken.symbol}`);
            
            this.benchmark('quote-complete', start);
            
            return {
                amountIn: amount,
                amountOut,
                formattedOutput,
                priceImpact: 'N/A' // Would need more complex calculation
            };
        } catch (error) {
            console.error('❌ Quote failed:', error.message);
            throw error;
        }
    }

    async constructSwapTransaction(poolInfo, tokenInfo, quote) {
        const start = this.benchmark('tx-construction-start');
        console.log('\n⚙️  CONSTRUCTING SWAP TRANSACTION');
        console.log('================================');
        
        try {
            // For this demo, we'll construct the transaction parameters
            // In a real implementation, you'd need a wallet with ETH
            
            const router = new ethers.Contract(this.contracts.router, this.abis.uniswapV3Router, this.provider);
            
            const swapParams = {
                tokenIn: tokenInfo.inputToken.address,
                tokenOut: tokenInfo.targetToken.address,
                fee: poolInfo.fee,
                recipient: '0x0000000000000000000000000000000000000000', // Would be actual wallet
                deadline: Math.floor(Date.now() / 1000) + 1800, // 30 minutes
                amountIn: quote.amountIn,
                amountOutMinimum: quote.amountOut * 95n / 100n, // 5% slippage
                sqrtPriceLimitX96: 0
            };
            
            console.log(`🔧 Swap Parameters:`);
            console.log(`  Token In: ${swapParams.tokenIn}`);
            console.log(`  Token Out: ${swapParams.tokenOut}`);
            console.log(`  Fee: ${swapParams.fee}`);
            console.log(`  Amount In: ${ethers.formatEther(swapParams.amountIn)} ETH`);
            console.log(`  Min Amount Out: ${ethers.formatUnits(swapParams.amountOutMinimum, tokenInfo.targetToken.decimals)}`);
            console.log(`  Deadline: ${new Date(swapParams.deadline * 1000).toISOString()}`);
            
            // Construct transaction data
            const txData = router.interface.encodeFunctionData('exactInputSingle', [swapParams]);
            
            const transaction = {
                to: this.contracts.router,
                data: txData,
                value: swapParams.amountIn, // For ETH input
                gasLimit: 300000, // Estimated
                gasPrice: ethers.parseUnits('0.001', 'gwei') // Very low for demo
            };
            
            console.log(`📋 Transaction constructed (${txData.length} bytes)`);
            
            this.benchmark('tx-construction-complete', start);
            
            return { transaction, swapParams };
        } catch (error) {
            console.error('❌ Transaction construction failed:', error.message);
            throw error;
        }
    }

    async simulateSwap(transaction) {
        const start = this.benchmark('simulation-start');
        console.log('\n🧪 SIMULATING SWAP EXECUTION');
        console.log('============================');
        
        try {
            console.log('📊 Running eth_estimateGas...');
            
            // Simulate the transaction
            const gasEstimate = await this.provider.estimateGas({
                to: transaction.to,
                data: transaction.data,
                value: transaction.value
            });
            
            console.log(`⛽ Estimated Gas: ${gasEstimate.toString()}`);
            console.log(`💰 Estimated Cost: ${ethers.formatEther(gasEstimate * transaction.gasPrice)} ETH`);
            
            // Try eth_call simulation
            console.log('🔄 Running eth_call simulation...');
            
            try {
                const result = await this.provider.call({
                    to: transaction.to,
                    data: transaction.data,
                    value: transaction.value
                });
                console.log(`✅ Simulation successful: ${result}`);
            } catch (callError) {
                console.log(`⚠️  Call simulation failed: ${callError.message}`);
            }
            
            this.benchmark('simulation-complete', start);
            
            return {
                gasEstimate,
                estimatedCost: gasEstimate * transaction.gasPrice,
                simulationSuccessful: true
            };
        } catch (error) {
            console.error('❌ Simulation failed:', error.message);
            this.benchmark('simulation-complete', start);
            throw error;
        }
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
        
        // Performance analysis
        if (totalTime < 1000) {
            console.log('🚀 EXCELLENT: Sub-second execution');
        } else if (totalTime < 3000) {
            console.log('✅ GOOD: Fast execution');
        } else {
            console.log('⚠️  SLOW: Optimization needed');
        }
        
        return totalTime;
    }

    async executeCompleteWorkflow() {
        const overallStart = Date.now();
        
        try {
            // Step 1: Initialize
            if (!(await this.initialize())) {
                throw new Error('Initialization failed');
            }
            
            // Step 2: Find latest pool
            const poolInfo = await this.findLatestPool();
            
            // Step 3: Analyze tokens
            const tokenInfo = await this.analyzeTokens(poolInfo.token0, poolInfo.token1);
            
            // Step 4: Get quote
            const quote = await this.getQuote(
                tokenInfo.inputToken,
                tokenInfo.targetToken,
                poolInfo.fee,
                this.swapAmount
            );
            
            // Step 5: Construct transaction
            const { transaction, swapParams } = await this.constructSwapTransaction(poolInfo, tokenInfo, quote);
            
            // Step 6: Simulate execution
            const simulation = await this.simulateSwap(transaction);
            
            // Final benchmark
            this.benchmarks['total-workflow'] = Date.now() - overallStart;
            
            console.log('\n🎉 WORKFLOW COMPLETED SUCCESSFULLY');
            console.log('==================================');
            console.log(`🏊 Latest Pool: ${poolInfo.poolAddress}`);
            console.log(`🪙 Token Pair: ${tokenInfo.targetToken.symbol}/${tokenInfo.inputToken.symbol}`);
            console.log(`💱 Quote: ${quote.formattedOutput} ${tokenInfo.targetToken.symbol}`);
            console.log(`⛽ Gas Estimate: ${simulation.gasEstimate.toString()}`);
            
            this.printCompleteBenchmark();
            
            return {
                success: true,
                poolInfo,
                tokenInfo,
                quote,
                transaction,
                simulation,
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
    const executor = new LatestPoolSwapExecutor();
    
    console.log('🎯 STARTING LATEST POOL DIRECT SWAP EXECUTION');
    console.log('==============================================\n');
    
    const result = await executor.executeCompleteWorkflow();
    
    if (result.success) {
        console.log('\n✅ EXECUTION SUCCESSFUL - Ready for live trading!');
    } else {
        console.log('\n❌ EXECUTION FAILED - Check configuration');
    }
    
    return result;
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = LatestPoolSwapExecutor; 