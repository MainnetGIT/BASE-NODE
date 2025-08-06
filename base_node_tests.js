#!/usr/bin/env node

/**
 * BASE Network Node Health & Slot Tests
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet - Chain ID 8453)
 * Metrics: http://localhost:7300
 * WebSocket: ws://localhost:8546
 */

const axios = require('axios');
const WebSocket = require('ws');

class BaseNodeTester {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.wsUrl = 'ws://localhost:8546';
        this.metricsUrl = 'http://localhost:7300';
        this.requestId = 1;
        this.results = {
            health: {},
            slots: {},
            performance: {}
        };
    }

    async makeRpcCall(method, params = []) {
        try {
            const start = Date.now();
            const response = await axios.post(this.rpcUrl, {
                jsonrpc: '2.0',
                method,
                params,
                id: this.requestId++
            }, {
                timeout: 10000,
                headers: { 'Content-Type': 'application/json' }
            });
            
            const duration = Date.now() - start;
            
            if (response.data.error) {
                throw new Error(`RPC Error: ${response.data.error.message}`);
            }
            
            return {
                result: response.data.result,
                duration,
                success: true
            };
        } catch (error) {
            return {
                error: error.message,
                duration: Date.now() - Date.now(),
                success: false
            };
        }
    }

    async testHealth() {
        console.log('🔍 Running BASE Node Health Tests...\n');
        
        // Test 1: Chain ID
        console.log('1. Testing Chain ID...');
        const chainId = await this.makeRpcCall('eth_chainId');
        if (chainId.success) {
            const id = parseInt(chainId.result, 16);
            console.log(`   ✅ Chain ID: ${id} (${chainId.result}) - ${id === 8453 ? 'BASE Mainnet' : 'Unknown Chain'}`);
            console.log(`   ⏱️  Response time: ${chainId.duration}ms`);
            this.results.health.chainId = { id, hex: chainId.result, duration: chainId.duration };
        } else {
            console.log(`   ❌ Chain ID failed: ${chainId.error}`);
            this.results.health.chainId = { error: chainId.error };
        }

        // Test 2: Network Version
        console.log('\n2. Testing Network Version...');
        const netVersion = await this.makeRpcCall('net_version');
        if (netVersion.success) {
            console.log(`   ✅ Network Version: ${netVersion.result}`);
            console.log(`   ⏱️  Response time: ${netVersion.duration}ms`);
            this.results.health.netVersion = { version: netVersion.result, duration: netVersion.duration };
        } else {
            console.log(`   ❌ Network Version failed: ${netVersion.error}`);
            this.results.health.netVersion = { error: netVersion.error };
        }

        // Test 3: Peer Count
        console.log('\n3. Testing Peer Count...');
        const peerCount = await this.makeRpcCall('net_peerCount');
        if (peerCount.success) {
            const peers = parseInt(peerCount.result, 16);
            console.log(`   ✅ Peer Count: ${peers} (${peerCount.result})`);
            console.log(`   ⏱️  Response time: ${peerCount.duration}ms`);
            this.results.health.peerCount = { count: peers, hex: peerCount.result, duration: peerCount.duration };
        } else {
            console.log(`   ❌ Peer Count failed: ${peerCount.error}`);
            this.results.health.peerCount = { error: peerCount.error };
        }

        // Test 4: Sync Status
        console.log('\n4. Testing Sync Status...');
        const syncing = await this.makeRpcCall('eth_syncing');
        if (syncing.success) {
            if (syncing.result === false) {
                console.log(`   ✅ Node is fully synced`);
                this.results.health.syncing = { status: 'synced', duration: syncing.duration };
            } else {
                console.log(`   ⚠️  Node is syncing:`, syncing.result);
                this.results.health.syncing = { status: 'syncing', data: syncing.result, duration: syncing.duration };
            }
            console.log(`   ⏱️  Response time: ${syncing.duration}ms`);
        } else {
            console.log(`   ❌ Sync Status failed: ${syncing.error}`);
            this.results.health.syncing = { error: syncing.error };
        }
    }

    async testSlots() {
        console.log('\n🎰 Running BASE Node Slot/Block Tests...\n');
        
        // Test 1: Latest Block Number
        console.log('1. Testing Latest Block Number...');
        const blockNumber = await this.makeRpcCall('eth_blockNumber');
        if (blockNumber.success) {
            const blockNum = parseInt(blockNumber.result, 16);
            console.log(`   ✅ Latest Block: ${blockNum} (${blockNumber.result})`);
            console.log(`   ⏱️  Response time: ${blockNumber.duration}ms`);
            this.results.slots.latestBlock = { number: blockNum, hex: blockNumber.result, duration: blockNumber.duration };
        } else {
            console.log(`   ❌ Latest Block failed: ${blockNumber.error}`);
            this.results.slots.latestBlock = { error: blockNumber.error };
            return; // Can't continue without block number
        }

        // Test 2: Latest Block Details
        console.log('\n2. Testing Latest Block Details...');
        const latestBlock = await this.makeRpcCall('eth_getBlockByNumber', ['latest', false]);
        if (latestBlock.success && latestBlock.result) {
            const block = latestBlock.result;
            console.log(`   ✅ Block Hash: ${block.hash}`);
            console.log(`   ✅ Block Number: ${parseInt(block.number, 16)}`);
            console.log(`   ✅ Block Timestamp: ${new Date(parseInt(block.timestamp, 16) * 1000).toISOString()}`);
            console.log(`   ✅ Transaction Count: ${parseInt(block.transactionCount || '0x0', 16)}`);
            console.log(`   ✅ Gas Used: ${parseInt(block.gasUsed, 16).toLocaleString()}`);
            console.log(`   ✅ Gas Limit: ${parseInt(block.gasLimit, 16).toLocaleString()}`);
            console.log(`   ⏱️  Response time: ${latestBlock.duration}ms`);
            
            this.results.slots.latestBlockDetails = {
                hash: block.hash,
                number: parseInt(block.number, 16),
                timestamp: parseInt(block.timestamp, 16),
                txCount: parseInt(block.transactionCount || '0x0', 16),
                gasUsed: parseInt(block.gasUsed, 16),
                gasLimit: parseInt(block.gasLimit, 16),
                duration: latestBlock.duration
            };
        } else {
            console.log(`   ❌ Latest Block Details failed: ${latestBlock.error || 'No result'}`);
            this.results.slots.latestBlockDetails = { error: latestBlock.error || 'No result' };
        }

        // Test 3: Previous Block
        console.log('\n3. Testing Previous Block...');
        const blockNum = parseInt(blockNumber.result, 16);
        const prevBlockHex = '0x' + (blockNum - 1).toString(16);
        const prevBlock = await this.makeRpcCall('eth_getBlockByNumber', [prevBlockHex, false]);
        if (prevBlock.success && prevBlock.result) {
            console.log(`   ✅ Previous Block: ${parseInt(prevBlock.result.number, 16)}`);
            console.log(`   ✅ Previous Block Hash: ${prevBlock.result.hash}`);
            console.log(`   ⏱️  Response time: ${prevBlock.duration}ms`);
            this.results.slots.previousBlock = {
                number: parseInt(prevBlock.result.number, 16),
                hash: prevBlock.result.hash,
                duration: prevBlock.duration
            };
        } else {
            console.log(`   ❌ Previous Block failed: ${prevBlock.error || 'No result'}`);
            this.results.slots.previousBlock = { error: prevBlock.error || 'No result' };
        }

        // Test 4: Block Range Test (last 5 blocks)
        console.log('\n4. Testing Block Range (last 5 blocks)...');
        const blockRange = [];
        for (let i = 0; i < 5; i++) {
            const testBlockNum = blockNum - i;
            const testBlockHex = '0x' + testBlockNum.toString(16);
            const testBlock = await this.makeRpcCall('eth_getBlockByNumber', [testBlockHex, false]);
            if (testBlock.success && testBlock.result) {
                blockRange.push({
                    number: testBlockNum,
                    hash: testBlock.result.hash,
                    timestamp: parseInt(testBlock.result.timestamp, 16),
                    duration: testBlock.duration
                });
            }
        }
        
        if (blockRange.length === 5) {
            console.log(`   ✅ Successfully retrieved last 5 blocks`);
            console.log(`   📊 Block range: ${blockRange[4].number} to ${blockRange[0].number}`);
            console.log(`   ⏱️  Average response time: ${(blockRange.reduce((sum, b) => sum + b.duration, 0) / 5).toFixed(1)}ms`);
            this.results.slots.blockRange = { blocks: blockRange };
        } else {
            console.log(`   ❌ Block range test failed: only got ${blockRange.length}/5 blocks`);
            this.results.slots.blockRange = { error: `Only retrieved ${blockRange.length}/5 blocks`, blocks: blockRange };
        }
    }

    async testPerformance() {
        console.log('\n⚡ Running Performance Tests...\n');
        
        // Test 1: Multiple rapid calls
        console.log('1. Testing Rapid Fire Requests (10x eth_blockNumber)...');
        const start = Date.now();
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(this.makeRpcCall('eth_blockNumber'));
        }
        
        const results = await Promise.all(promises);
        const totalTime = Date.now() - start;
        const successful = results.filter(r => r.success).length;
        const avgTime = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        
        console.log(`   ✅ Completed ${successful}/10 requests in ${totalTime}ms`);
        console.log(`   📊 Average per request: ${avgTime.toFixed(1)}ms`);
        console.log(`   📊 Requests per second: ${(10000 / totalTime).toFixed(1)}`);
        
        this.results.performance.rapidFire = {
            totalRequests: 10,
            successful,
            totalTime,
            avgTime,
            rps: 10000 / totalTime
        };
    }

    async testWebSocket() {
        console.log('\n🔌 Testing WebSocket Connection...');
        
        return new Promise((resolve) => {
            try {
                const ws = new WebSocket(this.wsUrl);
                let connected = false;
                
                const timeout = setTimeout(() => {
                    if (!connected) {
                        console.log('   ❌ WebSocket connection timeout');
                        ws.close();
                        resolve(false);
                    }
                }, 5000);
                
                ws.on('open', () => {
                    connected = true;
                    clearTimeout(timeout);
                    console.log('   ✅ WebSocket connected successfully');
                    
                    // Test subscription
                    ws.send(JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_subscribe',
                        params: ['newHeads'],
                        id: 1
                    }));
                });
                
                ws.on('message', (data) => {
                    const message = JSON.parse(data.toString());
                    if (message.result) {
                        console.log(`   ✅ Subscription ID: ${message.result}`);
                        ws.close();
                        resolve(true);
                    }
                });
                
                ws.on('error', (error) => {
                    console.log(`   ❌ WebSocket error: ${error.message}`);
                    clearTimeout(timeout);
                    resolve(false);
                });
                
                ws.on('close', () => {
                    clearTimeout(timeout);
                    if (!connected) {
                        console.log('   ❌ WebSocket connection failed');
                        resolve(false);
                    }
                });
                
            } catch (error) {
                console.log(`   ❌ WebSocket test failed: ${error.message}`);
                resolve(false);
            }
        });
    }

    async testMetrics() {
        console.log('\n📊 Testing Metrics Endpoint...');
        
        try {
            const start = Date.now();
            const response = await axios.get(this.metricsUrl, { timeout: 5000 });
            const duration = Date.now() - start;
            
            if (response.status === 200) {
                const metrics = response.data;
                const lines = metrics.split('\n').filter(line => line && !line.startsWith('#'));
                console.log(`   ✅ Metrics endpoint accessible`);
                console.log(`   📊 Total metrics: ${lines.length}`);
                console.log(`   ⏱️  Response time: ${duration}ms`);
                
                // Look for key metrics
                const keyMetrics = ['op_node_default_up', 'process_cpu_seconds_total', 'process_resident_memory_bytes'];
                keyMetrics.forEach(metric => {
                    const found = lines.find(line => line.startsWith(metric));
                    if (found) {
                        console.log(`   ✅ Found ${metric}: ${found.split(' ')[1]}`);
                    }
                });
                
                this.results.performance.metrics = {
                    accessible: true,
                    totalMetrics: lines.length,
                    duration
                };
                
                return true;
            }
        } catch (error) {
            console.log(`   ❌ Metrics test failed: ${error.message}`);
            this.results.performance.metrics = { error: error.message };
            return false;
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📋 BASE NODE TEST REPORT');
        console.log('='.repeat(80));
        
        console.log('\n🏥 HEALTH STATUS:');
        console.log(`   Chain ID: ${this.results.health.chainId?.id || 'FAILED'}`);
        console.log(`   Network: ${this.results.health.netVersion?.version || 'FAILED'}`);
        console.log(`   Peers: ${this.results.health.peerCount?.count || 'FAILED'}`);
        console.log(`   Sync Status: ${this.results.health.syncing?.status || 'FAILED'}`);
        
        console.log('\n🎰 BLOCK/SLOT STATUS:');
        console.log(`   Latest Block: ${this.results.slots.latestBlock?.number || 'FAILED'}`);
        console.log(`   Block Details: ${this.results.slots.latestBlockDetails ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Previous Block: ${this.results.slots.previousBlock ? 'SUCCESS' : 'FAILED'}`);
        console.log(`   Block Range: ${this.results.slots.blockRange?.blocks?.length || 0}/5 blocks`);
        
        console.log('\n⚡ PERFORMANCE:');
        if (this.results.performance.rapidFire) {
            console.log(`   Rapid Fire: ${this.results.performance.rapidFire.successful}/10 (${this.results.performance.rapidFire.avgTime.toFixed(1)}ms avg)`);
        }
        console.log(`   Metrics: ${this.results.performance.metrics?.accessible ? 'ACCESSIBLE' : 'FAILED'}`);
        
        console.log('\n' + '='.repeat(80));
        
        // Save results to file
        require('fs').writeFileSync('base_node_test_results.json', JSON.stringify(this.results, null, 2));
        console.log('💾 Full results saved to: base_node_test_results.json');
    }

    async runAllTests() {
        console.log('🚀 Starting BASE Network Node Tests');
        console.log(`📡 RPC Endpoint: ${this.rpcUrl}`);
        console.log(`🔌 WebSocket: ${this.wsUrl}`);
        console.log(`📊 Metrics: ${this.metricsUrl}`);
        console.log('⏰ ' + new Date().toISOString());
        console.log('='.repeat(80));
        
        await this.testHealth();
        await this.testSlots();
        await this.testPerformance();
        await this.testWebSocket();
        await this.testMetrics();
        
        this.generateReport();
    }
}

// Main execution
if (require.main === module) {
    const tester = new BaseNodeTester();
    tester.runAllTests()
        .then(() => {
            console.log('\n✅ All tests completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Test suite failed:', error.message);
            process.exit(1);
        });
}

module.exports = BaseNodeTester; 