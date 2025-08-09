/**
 * NODE API OPERATIONS - Basic Usage Examples
 * Demonstrates core functionality of the BASE node API clients
 */

const BaseRPCClient = require('../rpc/base-rpc-client');
const BaseWebSocketClient = require('../websocket/base-websocket-client');

async function demonstrateRPCUsage() {
    console.log('🔗 BASE RPC Client Demo');
    console.log('========================');
    
    // Initialize RPC client
    const rpc = new BaseRPCClient({
        endpoint: 'http://localhost:8545',
        timeout: 5000,
        retries: 3
    });

    try {
        // Basic blockchain info
        console.log('\n📊 Blockchain Information:');
        const blockNumber = await rpc.getBlockNumber();
        const networkId = await rpc.getNetworkId();
        const gasPrice = await rpc.getGasPrice();
        
        console.log(`Current Block: ${blockNumber}`);
        console.log(`Network ID: ${networkId}`);
        console.log(`Gas Price: ${gasPrice} wei`);

        // Health check
        console.log('\n🏥 Health Check:');
        const health = await rpc.healthCheck();
        console.log(`Node Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        console.log(`Response Time: ${health.responseTime}ms`);
        console.log(`Peer Count: ${health.peerCount}`);

        // Get latest block details
        console.log('\n📦 Latest Block Details:');
        const latestBlock = await rpc.getBlock('latest', false);
        console.log(`Block Number: ${parseInt(latestBlock.number, 16)}`);
        console.log(`Transaction Count: ${latestBlock.transactions.length}`);
        console.log(`Gas Used: ${parseInt(latestBlock.gasUsed, 16)}`);

        // Batch request example
        console.log('\n📊 Batch Request Example:');
        const batchResults = await rpc.batchCall([
            { method: 'eth_blockNumber' },
            { method: 'net_peerCount' },
            { method: 'eth_gasPrice' }
        ]);
        
        console.log(`Batch Results:`, batchResults.map((result, i) => 
            `${i + 1}. ${result}`
        ));

        // Connection statistics
        console.log('\n📈 Connection Statistics:');
        const stats = rpc.getStats();
        console.log(`Success Rate: ${stats.successRate}`);
        console.log(`Total Requests: ${stats.totalRequests}`);
        console.log(`Total Failures: ${stats.totalFailures}`);

    } catch (error) {
        console.error('❌ RPC Demo Error:', error.message);
    }
}

async function demonstrateWebSocketUsage() {
    console.log('\n🌐 BASE WebSocket Client Demo');
    console.log('==============================');
    
    // Initialize WebSocket client
    const ws = new BaseWebSocketClient({
        endpoint: 'ws://localhost:8546',
        reconnectInterval: 5000,
        maxReconnectAttempts: 5
    });

    try {
        // Event listeners
        ws.on('connected', () => {
            console.log('✅ WebSocket connected successfully');
        });

        ws.on('disconnected', () => {
            console.log('❌ WebSocket disconnected');
        });

        ws.on('newBlock', (block) => {
            console.log(`📦 New Block: ${parseInt(block.number, 16)} with ${block.transactions.length} transactions`);
        });

        ws.on('log', (log) => {
            console.log(`📋 New Log: ${log.address} - ${log.topics[0]}`);
        });

        ws.on('error', (error) => {
            console.error('❌ WebSocket Error:', error.message);
        });

        // Connect
        await ws.connect();

        // Subscribe to new blocks
        console.log('\n📡 Setting up subscriptions...');
        const newHeadsSubscription = await ws.subscribeToNewHeads();
        console.log(`✅ Subscribed to new heads: ${newHeadsSubscription}`);

        // Subscribe to DEX events (common signatures)
        const dexSignatures = [
            '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9', // PairCreated
            '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118', // PoolCreated
        ];
        
        const dexSubscriptions = await ws.subscribeToDEXEvents(dexSignatures);
        console.log(`✅ Subscribed to ${dexSubscriptions.length} DEX event types`);

        // Health check
        console.log('\n🏥 WebSocket Health Check:');
        const health = await ws.healthCheck();
        console.log(`WebSocket Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
        console.log(`Active Subscriptions: ${health.activeSubscriptions}`);

        // Monitor for 30 seconds
        console.log('\n⏰ Monitoring for 30 seconds...');
        setTimeout(async () => {
            console.log('\n🛑 Stopping demo...');
            
            // Get final statistics
            const finalHealth = ws.getConnectionHealth();
            console.log('\n📊 Final Statistics:');
            console.log(`Messages Received: ${finalHealth.messagesReceived}`);
            console.log(`Messages Sent: ${finalHealth.messagesSent}`);
            console.log(`Reconnections: ${finalHealth.reconnections}`);
            
            // Cleanup
            await ws.unsubscribeAll();
            ws.disconnect();
            
            console.log('✅ Demo completed successfully');
            process.exit(0);
        }, 30000);

    } catch (error) {
        console.error('❌ WebSocket Demo Error:', error.message);
        process.exit(1);
    }
}

async function demonstrateRealTimeTrading() {
    console.log('\n🏪 Real-Time Trading Demo');
    console.log('==========================');
    
    const rpc = new BaseRPCClient();
    const ws = new BaseWebSocketClient();

    try {
        // Connect WebSocket
        await ws.connect();

        // Monitor for new DEX pool creation events
        const poolCreatedSignature = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
        
        await ws.subscribeToLogs({
            topics: [poolCreatedSignature]
        });

        console.log('🎯 Monitoring for new pool creation events...');

        ws.on('log', async (log) => {
            try {
                console.log('\n🚨 NEW POOL DETECTED!');
                console.log(`Contract: ${log.address}`);
                console.log(`Block: ${parseInt(log.blockNumber, 16)}`);
                console.log(`Transaction: ${log.transactionHash}`);
                
                // Get full transaction details
                const tx = await rpc.getTransaction(log.transactionHash);
                console.log(`From: ${tx.from}`);
                console.log(`Gas Price: ${parseInt(tx.gasPrice, 16)} wei`);
                
                // Get current gas price for comparison
                const currentGasPrice = await rpc.getGasPrice();
                console.log(`Current Gas Price: ${currentGasPrice} wei`);
                
                // Simulate trading decision
                const gasMultiplier = Number(currentGasPrice) * 2; // 2x current price
                console.log(`🚀 Would execute trade with gas: ${gasMultiplier} wei`);
                
            } catch (error) {
                console.error('❌ Error processing new pool:', error.message);
            }
        });

        // Run for 2 minutes
        setTimeout(() => {
            console.log('\n🛑 Trading demo completed');
            ws.disconnect();
            process.exit(0);
        }, 120000);

    } catch (error) {
        console.error('❌ Trading Demo Error:', error.message);
        process.exit(1);
    }
}

// Main execution
async function main() {
    console.log('🚀 BASE NODE API OPERATIONS - Demo Suite');
    console.log('==========================================');
    
    try {
        // Run demonstrations
        await demonstrateRPCUsage();
        await demonstrateWebSocketUsage();
        
        // Uncomment to run trading demo
        // await demonstrateRealTimeTrading();
        
    } catch (error) {
        console.error('❌ Demo Suite Error:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Graceful shutdown requested');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Graceful shutdown requested');
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = {
    demonstrateRPCUsage,
    demonstrateWebSocketUsage,
    demonstrateRealTimeTrading
};