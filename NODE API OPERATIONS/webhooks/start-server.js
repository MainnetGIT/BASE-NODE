#!/usr/bin/env node
/**
 * Start Webhook Server
 * Launch the BASE Network webhook infrastructure
 */

const WebhookServer = require('./webhook-server');
const path = require('path');

async function startWebhookInfrastructure() {
    console.log('🚀 STARTING BASE NETWORK WEBHOOK INFRASTRUCTURE');
    console.log('===============================================');
    
    try {
        // Configuration
        const config = {
            port: process.env.WEBHOOK_PORT || 3001,
            wsPort: process.env.WEBHOOK_WS_PORT || 3002,
            baseRPC: process.env.BASE_RPC_URL || 'http://localhost:8545',
            baseWS: process.env.BASE_WS_URL || 'ws://localhost:8546',
            dataDir: process.env.WEBHOOK_DATA_DIR || path.join(__dirname, 'webhook-data'),
            secretKey: process.env.WEBHOOK_SECRET_KEY,
            retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS) || 3,
            retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY) || 1000
        };

        console.log('📋 Configuration:');
        console.log(`   HTTP Port: ${config.port}`);
        console.log(`   WebSocket Port: ${config.wsPort}`);
        console.log(`   BASE RPC: ${config.baseRPC}`);
        console.log(`   BASE WebSocket: ${config.baseWS}`);
        console.log(`   Data Directory: ${config.dataDir}`);
        console.log(`   Retry Attempts: ${config.retryAttempts}`);
        console.log('');

        // Initialize webhook server
        const server = new WebhookServer(config);
        
        // Start the server
        await server.start();
        
        console.log('');
        console.log('✅ WEBHOOK INFRASTRUCTURE READY!');
        console.log('================================');
        console.log('');
        console.log('📡 API Endpoints:');
        console.log(`   Create Webhook:    POST   http://localhost:${config.port}/webhooks`);
        console.log(`   List Webhooks:     GET    http://localhost:${config.port}/webhooks`);
        console.log(`   Get Webhook:       GET    http://localhost:${config.port}/webhooks/:id`);
        console.log(`   Update Webhook:    PUT    http://localhost:${config.port}/webhooks/:id`);
        console.log(`   Delete Webhook:    DELETE http://localhost:${config.port}/webhooks/:id`);
        console.log(`   Test Webhook:      POST   http://localhost:${config.port}/webhooks/:id/test`);
        console.log(`   Health Check:      GET    http://localhost:${config.port}/health`);
        console.log(`   System Stats:      GET    http://localhost:${config.port}/stats`);
        console.log('');
        console.log('🌐 WebSocket:');
        console.log(`   Real-time Stream:  ws://localhost:${config.wsPort}`);
        console.log('');
        console.log('📖 Usage Examples:');
        console.log('   node webhook-examples.js    # Run comprehensive examples');
        console.log('   node webhook-client.js      # Use client library');
        console.log('');
        console.log('🔧 Environment Variables:');
        console.log('   WEBHOOK_PORT                # HTTP server port (default: 3001)');
        console.log('   WEBHOOK_WS_PORT            # WebSocket port (default: 3002)');
        console.log('   BASE_RPC_URL               # BASE RPC endpoint');
        console.log('   BASE_WS_URL                # BASE WebSocket endpoint');
        console.log('   WEBHOOK_DATA_DIR           # Data storage directory');
        console.log('   WEBHOOK_SECRET_KEY         # Webhook signing secret');
        console.log('   WEBHOOK_RETRY_ATTEMPTS     # Delivery retry attempts');
        console.log('   WEBHOOK_RETRY_DELAY        # Retry delay in ms');
        console.log('');
        console.log('🎯 Supported Event Types:');
        console.log('   - newBlocks          # New block notifications');
        console.log('   - newTransactions    # New transaction alerts');
        console.log('   - tokenTransfers     # ERC-20 transfer events');
        console.log('   - poolCreation       # DEX pool creation');
        console.log('   - addressActivity    # Specific address monitoring');
        console.log('');
        console.log('💡 Quick Test:');
        console.log(`   curl -X POST http://localhost:${config.port}/webhooks \\`);
        console.log('     -H "Content-Type: application/json" \\');
        console.log('     -d \'{"url":"https://your-app.com/webhook","events":["newBlocks"],"name":"Test Webhook"}\'');
        console.log('');
        console.log('🏆 Your webhook infrastructure is now running and ready to replace Alchemy!');

    } catch (error) {
        console.error('❌ Failed to start webhook infrastructure:', error.message);
        console.error('');
        console.error('🔧 Troubleshooting:');
        console.error('   1. Check if BASE node is running and accessible');
        console.error('   2. Verify RPC and WebSocket endpoints');
        console.error('   3. Ensure ports are not already in use');
        console.error('   4. Check network connectivity');
        console.error('   5. Verify file system permissions for data directory');
        
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down webhook infrastructure...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down webhook infrastructure...');
    process.exit(0);
});

// Start if called directly
if (require.main === module) {
    startWebhookInfrastructure();
}

module.exports = { startWebhookInfrastructure };