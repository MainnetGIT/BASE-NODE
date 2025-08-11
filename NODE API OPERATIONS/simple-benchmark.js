#!/usr/bin/env node
/**
 * Simple Performance Benchmark
 * Test accessible endpoints and measure performance
 */

const axios = require('axios');

class SimpleBenchmark {
    constructor() {
        this.endpoints = [
            { name: 'Your Private BASE Node', url: 'http://185.191.117.142:8545' },
            { name: 'Public BASE RPC', url: 'https://mainnet.base.org' },
            { name: 'Alchemy BASE Demo', url: 'https://base-mainnet.g.alchemy.com/v2/demo' },
            { name: 'MeowRPC BASE', url: 'https://base.meowrpc.com' }
        ];
        this.requestId = 1;
    }

    /**
     * Make RPC call with timing
     */
    async timedRpcCall(endpoint, method, params = []) {
        const payload = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: this.requestId++
        };

        const startTime = process.hrtime.bigint();
        
        try {
            const response = await axios.post(endpoint, payload, {
                timeout: 15000,
                headers: { 'Content-Type': 'application/json' }
            });

            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000; // Convert to ms

            if (response.data.error) {
                throw new Error(response.data.error.message);
            }

            return {
                success: true,
                duration: duration,
                result: response.data.result
            };
        } catch (error) {
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000;
            
            return {
                success: false,
                duration: duration,
                error: error.message
            };
        }
    }

    /**
     * Test a specific operation across all endpoints
     */
    async benchmarkOperation(name, method, params = [], iterations = 3) {
        console.log(`\n🔄 ${name}`);
        console.log('═'.repeat(60));
        
        const results = {};
        
        for (const endpoint of this.endpoints) {
            console.log(`\n📡 Testing ${endpoint.name}:`);
            console.log('─'.repeat(40));
            
            const times = [];
            let successCount = 0;
            let lastResult = null;
            
            for (let i = 0; i < iterations; i++) {
                const result = await this.timedRpcCall(endpoint.url, method, params);
                
                if (result.success) {
                    times.push(result.duration);
                    successCount++;
                    lastResult = result.result;
                    console.log(`   ✅ Run ${i + 1}: ${result.duration.toFixed(2)}ms`);
                } else {
                    console.log(`   ❌ Run ${i + 1}: FAILED - ${result.error}`);
                }
            }
            
            if (times.length > 0) {
                const avg = times.reduce((a, b) => a + b) / times.length;
                const min = Math.min(...times);
                const max = Math.max(...times);
                
                console.log(`   📊 Average: ${avg.toFixed(2)}ms | Min: ${min.toFixed(2)}ms | Max: ${max.toFixed(2)}ms`);
                console.log(`   🎯 Success Rate: ${successCount}/${iterations} (${(successCount/iterations*100).toFixed(1)}%)`);
                
                if (lastResult && typeof lastResult === 'string' && lastResult.length < 100) {
                    console.log(`   📄 Sample Result: ${lastResult}`);
                }
                
                results[endpoint.name] = {
                    average: avg,
                    min: min,
                    max: max,
                    successRate: successCount / iterations,
                    endpoint: endpoint.url
                };
            } else {
                console.log(`   💥 All requests failed`);
                results[endpoint.name] = {
                    average: null,
                    min: null,
                    max: null,
                    successRate: 0,
                    endpoint: endpoint.url
                };
            }
        }
        
        return results;
    }

    /**
     * Compare different data access methods
     */
    async benchmarkDataAccess() {
        console.log('⚡ BLOCKCHAIN DATA ACCESS PERFORMANCE BENCHMARK');
        console.log('=============================================');
        console.log(`🕐 Started: ${new Date().toISOString()}`);
        
        const allResults = {};
        
        // Test 1: Get Latest Block Number (Fastest operation)
        allResults.blockNumber = await this.benchmarkOperation(
            'Get Latest Block Number',
            'eth_blockNumber'
        );
        
        // Test 2: Get Network Chain ID
        allResults.chainId = await this.benchmarkOperation(
            'Get Chain ID',
            'eth_chainId'
        );
        
        // Test 3: Get Gas Price
        allResults.gasPrice = await this.benchmarkOperation(
            'Get Gas Price',
            'eth_gasPrice'
        );
        
        // Test 4: Get Latest Block Header
        allResults.blockHeader = await this.benchmarkOperation(
            'Get Latest Block Header',
            'eth_getBlockByNumber',
            ['latest', false]
        );
        
        // Test 5: Get Account Balance (WETH Contract)
        allResults.balance = await this.benchmarkOperation(
            'Get WETH Contract Balance',
            'eth_getBalance',
            ['0x4200000000000000000000000000000000000006', 'latest']
        );
        
        // Test 6: Contract Call (WETH Symbol)
        allResults.contractCall = await this.benchmarkOperation(
            'Contract Call (WETH Symbol)',
            'eth_call',
            [{
                to: '0x4200000000000000000000000000000000000006',
                data: '0x95d89b41' // symbol()
            }, 'latest']
        );
        
        // Test 7: Get Recent Logs (Most intensive)
        console.log(`\n🔄 Get Pool Creation Logs (Intensive Test)`);
        console.log('═'.repeat(60));
        
        // First get current block number for the logs test
        let currentBlock = null;
        for (const endpoint of this.endpoints) {
            const blockResult = await this.timedRpcCall(endpoint.url, 'eth_blockNumber');
            if (blockResult.success) {
                currentBlock = parseInt(blockResult.result, 16);
                break;
            }
        }
        
        if (currentBlock) {
            const fromBlock = '0x' + (currentBlock - 100).toString(16);
            
            allResults.logs = await this.benchmarkOperation(
                'Get Pool Creation Logs (100 blocks)',
                'eth_getLogs',
                [{
                    fromBlock: fromBlock,
                    toBlock: 'latest',
                    address: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', // Uniswap V2 Factory
                    topics: ['0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9']
                }]
            );
        } else {
            console.log('❌ Could not get current block number for logs test');
        }
        
        return allResults;
    }

    /**
     * Generate performance report
     */
    generateReport(results) {
        console.log('\n🏆 PERFORMANCE BENCHMARK REPORT');
        console.log('===============================');
        
        // Find fastest endpoint for each operation
        const rankings = {};
        
        for (const [operation, endpointResults] of Object.entries(results)) {
            console.log(`\n📊 ${operation.toUpperCase()}:`);
            
            // Sort endpoints by average response time
            const sortedEndpoints = Object.entries(endpointResults)
                .filter(([name, data]) => data.average !== null)
                .sort(([,a], [,b]) => a.average - b.average);
            
            if (sortedEndpoints.length > 0) {
                rankings[operation] = sortedEndpoints[0][0]; // Fastest endpoint
                
                sortedEndpoints.forEach(([name, data], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '   ';
                    console.log(`${medal} ${name}: ${data.average.toFixed(2)}ms (${(data.successRate*100).toFixed(1)}% success)`);
                });
                
                // Show performance difference
                if (sortedEndpoints.length > 1) {
                    const fastest = sortedEndpoints[0][1].average;
                    const slowest = sortedEndpoints[sortedEndpoints.length - 1][1].average;
                    const speedup = slowest / fastest;
                    console.log(`   🚀 Fastest is ${speedup.toFixed(2)}x faster than slowest`);
                }
            } else {
                console.log('   ❌ All endpoints failed for this operation');
            }
        }
        
        // Overall performance summary
        console.log('\n🎯 OVERALL PERFORMANCE RANKINGS:');
        console.log('================================');
        
        const endpointScores = {};
        
        // Calculate average performance across all operations
        for (const [operation, endpointResults] of Object.entries(results)) {
            for (const [endpointName, data] of Object.entries(endpointResults)) {
                if (data.average !== null) {
                    if (!endpointScores[endpointName]) {
                        endpointScores[endpointName] = { totalTime: 0, operations: 0, successRate: 0 };
                    }
                    endpointScores[endpointName].totalTime += data.average;
                    endpointScores[endpointName].operations += 1;
                    endpointScores[endpointName].successRate += data.successRate;
                }
            }
        }
        
        // Calculate averages and rank
        const finalRankings = Object.entries(endpointScores)
            .map(([name, scores]) => ({
                name,
                avgTime: scores.totalTime / scores.operations,
                avgSuccessRate: scores.successRate / scores.operations,
                operations: scores.operations
            }))
            .sort((a, b) => a.avgTime - b.avgTime);
        
        finalRankings.forEach((endpoint, index) => {
            const medal = index === 0 ? '🏆' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
            console.log(`${medal} ${endpoint.name}:`);
            console.log(`   Average Response Time: ${endpoint.avgTime.toFixed(2)}ms`);
            console.log(`   Success Rate: ${(endpoint.avgSuccessRate * 100).toFixed(1)}%`);
            console.log(`   Operations Completed: ${endpoint.operations}`);
        });
        
        // Recommendations
        console.log('\n💡 RECOMMENDATIONS:');
        console.log('===================');
        
        if (finalRankings.length > 0) {
            const fastest = finalRankings[0];
            const slowest = finalRankings[finalRankings.length - 1];
            
            console.log(`✅ Use "${fastest.name}" for best performance (${fastest.avgTime.toFixed(2)}ms avg)`);
            
            if (fastest.name.includes('Private')) {
                console.log('🔒 Your private node shows excellent performance - leverage this advantage!');
                console.log('🚀 Consider implementing connection pooling for even better performance');
                console.log('💡 Use direct database access for bulk operations when possible');
            }
            
            if (slowest.avgTime / fastest.avgTime > 2) {
                console.log(`⚠️ Avoid "${slowest.name}" - it's ${(slowest.avgTime / fastest.avgTime).toFixed(2)}x slower`);
            }
            
            console.log('\n🔧 Performance Optimization Tips:');
            console.log('• Implement request caching for repeated queries');
            console.log('• Use WebSocket connections for real-time data');
            console.log('• Batch multiple RPC calls when possible');
            console.log('• Monitor endpoint health and implement failover');
            console.log('• Consider local node deployment for critical applications');
        }
    }

    /**
     * Run complete benchmark
     */
    async runBenchmark() {
        try {
            const results = await this.benchmarkDataAccess();
            this.generateReport(results);
            
            console.log('\n✅ Benchmark completed successfully!');
            console.log(`📅 Completed: ${new Date().toISOString()}`);
            
            return results;
        } catch (error) {
            console.error('\n❌ Benchmark failed:', error.message);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const benchmark = new SimpleBenchmark();
    
    benchmark.runBenchmark().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = SimpleBenchmark;